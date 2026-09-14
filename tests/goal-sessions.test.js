import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

// Goal 模式接入 Sessions 的集成回归：只覆盖外层接线，不重复 goal.js 内部状态机。
// 用同 task-notifications.test.js 的 fake agent + SQLite 临时库模式。

const PLAN = {
  objective: "把构建时间降到 10s 内",
  constraints: ["不改公共 API"],
  acceptance: ["全量构建 < 10s"],
  rounds: [
    { title: "定位瓶颈", objective: "找出构建热点", acceptance: ["有火焰图"] },
    { title: "优化实现", objective: "改掉热点实现", acceptance: ["构建 < 10s"] },
  ],
};

// 主代理（传了工具）与子代理（无工具）分别入列；capture options 以便断言 executionContext/shouldPause 接线。
function factoryFixture() {
  const mains = [], children = [];
  const factory = async (tools, options = {}) => {
    let finish;
    const agent = {
      calls: [], tools, options, checkpoints: [], aborts: 0, resultText: "done",
      config: () => ({ model: "test/model" }),
      subscribe: () => () => {},
      prompt(text) { this.calls.push(text); return new Promise((resolve) => { finish = resolve; }); },
      enqueue() { throw new Error("system notifications must not enter withdrawable queues"); },
      result: () => agent.resultText,
      dispose: async () => {},
      finish: () => finish?.(),
      abort: async () => { agent.aborts += 1; finish?.(); },
      requestPause() { agent.pauseRequested = true; },
      checkpoint: async (summary) => { agent.checkpoints.push(summary); },
      resumable: () => false,
      canReask: () => false,
    };
    (tools.length ? mains : children).push(agent);
    return agent;
  };
  factory.catalog = () => [{ key: "test/model" }];
  return { factory, mains, children };
}

const tick = () => new Promise(setImmediate);
async function until(check, label = "condition") {
  for (let i = 0; i < 500; i++) { if (check()) return; await new Promise((resolve) => setTimeout(resolve, 2)); }
  assert.fail(`${label} deadline exceeded`);
}

// 普通一问：跑完不进入任何自动循环，方便后续在同会话内操作。
async function ordinary(sessions, id, text = "普通输入") {
  await sessions.prompt(id, text);
  await tick();
  sessions.get(id).agent.finish();
  await sessions.get(id).work;
  await until(() => sessions.get(id).status === "idle", "idle");
}

// /goal enter：提交计划、结束这道 run，停在 ready（不触发自动续跑）。
async function enterGoal(sessions, id, agent, text = "把构建时间降到 10s 内") {
  await sessions.prompt(id, `/goal ${text}`);
  await tick();
  const planTool = agent.tools.find((tool) => tool.name === "goal_plan");
  assert.ok(planTool, "会话应挂载 goal_plan 工具");
  await planTool.execute("plan-1", PLAN);
  agent.finish();
  await sessions.get(id).work;
  await until(() => sessions.get(id).status === "idle", "enter idle");
  return agent;
}

test("普通会话不自动续跑、不注入目标上下文", async () => {
  const { factory, mains } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    const item = sessions.get(id);
    await sessions.prompt(id, "只回答一次");
    await tick();
    assert.equal(mains.length, 1);
    assert.equal(typeof mains[0].options.executionContext, "function");
    assert.equal(mains[0].options.executionContext(), null, "普通会话上下文为 null");
    assert.equal(mains[0].options.shouldPause(), false, "普通会话永不在安全点暂停");
    assert.equal(item.goal.active, false);
    assert.equal(item.goal.context(), null);
    assert.equal(item.goal.snapshot(), null);
    // 普通会话只注册 Goal 工具，但必须列为 inactive，模型不能调用。
    for (const name of ["goal_plan", "goal_evidence", "goal_block", "goal_progress"])
      assert.ok(mains[0].options.inactiveTools.includes(name), `普通会话应禁用 ${name}`);
    mains[0].finish();
    await item.work;
    await until(() => item.status === "idle");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(mains[0].calls, ["只回答一次"], "普通会话不得自动续跑");
  } finally { await sessions.close(); }
});

test("/goal 在已有会话内进入目标模式，confirm 复用同一主代理", async () => {
  const { factory, mains } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    await ordinary(sessions, id, "先普通聊一句");
    const agent = mains[0];
    await sessions.prompt(id, "/goal 把构建时间降到 10s 内");
    await tick();
    assert.equal(mains.length, 1, "进入目标模式复用已有代理");
    assert.equal(agent.calls.length, 2);
    assert.match(agent.calls.at(-1), /Axiom Goal/);
    assert.equal(sessions.get(id).goal.snapshot().phase, "clarifying");
    assert.match(agent.options.executionContext(), /目标模式 · 澄清/);

    const planTool = agent.tools.find((tool) => tool.name === "goal_plan");
    await planTool.execute("plan-1", PLAN);
    assert.equal(sessions.get(id).goal.snapshot().phase, "ready");
    agent.finish();
    await sessions.get(id).work;
    await until(() => sessions.get(id).status === "idle");

    await sessions.goalAction(id, "confirm");
    assert.equal(sessions.get(id).goal.snapshot().phase, "running");
    assert.equal(sessions.get(id).status, "running");
    assert.equal(mains.length, 1, "confirm 仍在同一代理上运行");
    assert.equal(agent.calls.length, 3);
    assert.match(agent.calls.at(-1), /按已确认目标继续/);
    // running 阶段目标上下文按轮次注入
    assert.match(agent.options.executionContext(), /第 1\/2 轮/);
  } finally { await sessions.close(); }
});

test("pause 等待在飞主代理与子任务安全收尾，不 abort", async () => {
  const { factory, mains, children } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    const item = sessions.get(id);
    await ordinary(sessions, id, "先普通聊一句");
    await enterGoal(sessions, id, mains[0]);
    await sessions.goalAction(id, "confirm");
    const agent = mains[0];

    const [taskA, taskB] = item.tasks.start(["child a", "child b"]);
    await tick();
    const paused = await sessions.goalAction(id, "pause");
    assert.equal(paused.goal.pendingAction.type, "pause");
    assert.equal(item.goal.snapshot().phase, "pausing");
    assert.equal(agent.pauseRequested, true, "暂停请求应交给 SDK 安全点");
    const settled = item.goal.whenSettled();
    // 子任务在飞时直接调用新 API pauseAtSafePoint 不得落定
    assert.equal(item.goal.pauseAtSafePoint({ tasks: item.tasks.snapshot() }).phase, "pausing");

    agent.finish();
    await item.work;
    await tick();
    assert.equal(item.goal.snapshot().phase, "pausing", "主代理结束但子任务仍在飞，不得落定");
    assert.equal(agent.calls.length, 3, "暂停中不得自动续跑");

    children.forEach((child) => child.finish());
    await Promise.all([item.tasks.jobs.get(taskA).done, item.tasks.jobs.get(taskB).done]);
    await settled;
    assert.equal(item.goal.snapshot().phase, "paused");
    assert.equal(item.goal.snapshot().pendingAction, null);
    assert.equal(agent.aborts, 0, "安全暂停不得 abort");
    assert.equal(item.tasks.jobs.get(taskA).notified, false);
  } finally { await sessions.close(); }
});

test("暂停期间完成的子任务通知不得唤醒已暂停的 Goal", async () => {
  const { factory, mains, children } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    const item = sessions.get(id);
    await ordinary(sessions, id, "先普通聊一句");
    await enterGoal(sessions, id, mains[0]);
    await sessions.goalAction(id, "confirm");
    const agent = mains[0];
    const [taskId] = item.tasks.start(["child"]);
    await tick();
    await sessions.goalAction(id, "pause");
    const settled = item.goal.whenSettled();
    const callsBefore = agent.calls.length;

    agent.finish();
    await item.work;
    children[0].finish();
    await item.tasks.jobs.get(taskId).done;
    await settled;
    await tick();
    await tick();

    assert.equal(item.goal.snapshot().phase, "paused");
    assert.ok(!item.notifying, "暂停中不得进入通知投递");
    assert.equal(item.tasks.jobs.get(taskId).notified, false, "暂停期间通知不得被消费");
    assert.equal(agent.calls.length, callsBefore, "通知不得唤醒暂停中的主代理");

    // 直接投递也必须被目标阶段拦下（不能靠调用方自觉）。
    const queued = { id: "queued-task", task: "t", status: "completed", resultId: "result-1", notified: false };
    item.tasks.jobs.set(queued.id, queued);
    await sessions.deliverTaskNotifications(item);
    assert.equal(queued.notified, false);
    assert.equal(agent.calls.length, callsBefore);
  } finally { await sessions.close(); }
});

test("暂停的 Goal 阻止 session.retry / task.retry / 普通 prompt", async () => {
  const { factory, mains } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    const item = sessions.get(id);
    await ordinary(sessions, id, "先普通聊一句");
    await enterGoal(sessions, id, mains[0]);
    await sessions.goalAction(id, "confirm");
    const agent = mains[0];
    await sessions.goalAction(id, "pause");
    agent.finish();
    await item.work;
    await item.goal.whenSettled();
    await until(() => item.goal.snapshot().phase === "paused", "paused");

    await assert.rejects(sessions.retry(id), /Goal 已暂停或等待确认/, "session.retry 必须被暂停的 Goal 拦住");
    await assert.rejects(sessions.retryTask(id, "task-x"), /请先恢复 Goal/, "task.retry 必须被暂停的 Goal 拦住");
    await assert.rejects(sessions.prompt(id, "暂停后的普通输入"), /请使用专用恢复/, "暂停的 Goal 不接受普通 prompt");
    assert.equal(item.goal.snapshot().phase, "paused", "被阻止的操作不得改变目标状态");
    assert.equal(agent.calls.length, 3, "被阻止的操作不得启动新的 run");
  } finally { await sessions.close(); }
});

test("跨会话互不影响：只有进入 /goal 的会话受目标模式约束", async () => {
  const { factory, mains } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const a = await sessions.create();
    const b = await sessions.create();
    await ordinary(sessions, a, "a 普通输入");
    await ordinary(sessions, b, "b 普通输入");
    await enterGoal(sessions, a, mains[0]);
    await sessions.goalAction(a, "confirm");
    await sessions.goalAction(a, "pause");
    mains[0].finish();
    await sessions.get(a).work;
    await sessions.get(a).goal.whenSettled();
    await until(() => sessions.get(a).goal.snapshot().phase === "paused", "a paused");

    assert.equal(sessions.snapshot(a).goal.phase, "paused");
    assert.equal(sessions.snapshot(b).goal, null, "B 会话无目标");
    assert.equal(mains[1].options.executionContext(), null, "普通会话不得注入目标上下文");
    assert.notEqual(sessions.goalStore.load(a), null);
    assert.equal(sessions.goalStore.load(b), null);

    // B 不受 A 的暂停影响，仍可正常执行
    assert.equal(sessions.get(b).notificationsPaused, false);
    await sessions.prompt(b, "b 继续执行");
    assert.equal(sessions.get(b).status, "running");
    mains[1].finish();
    await sessions.get(b).work;
    await until(() => sessions.get(b).status === "idle");
    assert.equal(sessions.get(b).goal.active, false);
  } finally { await sessions.close(); }
});

// —— 双轮端到端：标记 -> 验证 -> 证据门 -> 下一轮/完成 ——

// 模拟真实工具结果进入会话历史（goal_evidence 的证据源就是 item.messages 里的 toolResult）。
function injectToolResult(item, toolCallId, toolName = "bash") {
  item.messages.push({ agentId: "main", message: {
    role: "toolResult", toolCallId, toolName, isError: false, content: [{ type: "text", text: `${toolName} ok` }],
  } });
}

// 等本次自动续跑起来，写入模型的最终回复正文，等 run 收尾并等本轮结果被 advanceGoal 消费：
// 默认等下一段自动续跑已启动；completes: true 时等目标完成（最后一轮不再自动续跑）。
async function reply(sessions, id, agent, text, { completes = false } = {}) {
  const item = sessions.get(id);
  await until(() => item.status === "running", "run started");
  agent.resultText = text;
  agent.finish();
  await item.work;
  await until(
    completes ? () => item.goal.snapshot().phase === "completed" : () => item.status === "running",
    completes ? "goal completed" : "next run started",
  );
}

const evidenceBody = (result) => JSON.parse(result.content[0].text);

test("双轮目标端到端：标记先验证、证据门放行下一轮并 checkpoint、整体证据齐才完成", async () => {
  const { factory, mains } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    const item = sessions.get(id);
    await ordinary(sessions, id, "先普通聊一句");
    const agent = mains[0];
    await enterGoal(sessions, id, agent);
    await sessions.goalAction(id, "confirm");
    assert.equal(item.goal.snapshot().phase, "running");
    assert.equal(item.goal.snapshot().currentRound, 0);

    // 第 1 轮：只有完成标记、没有任何工具证据 -> 停在验证，不开下一轮。
    await reply(sessions, id, agent, "瓶颈已定位\n<axiom_round_finished>");
    await until(() => item.goal.snapshot().phase === "verifying", "verifying round 1");
    assert.equal(item.goal.snapshot().currentRound, 0, "缺证据不得进入下一轮");
    assert.equal(item.goal.snapshot().rounds[0].status, "done");
    assert.equal(agent.checkpoints.length, 0, "同轮验证不写 checkpoint");
    assert.match(agent.calls.at(-1), /自动续跑/, "验证阶段仍由自动续跑驱动");

    // 注入真实工具结果，再用 goal_evidence 引用它：证据门通过、只放行、不直接推进。
    injectToolResult(item, "tool-flame");
    const evidenceTool = agent.tools.find((tool) => tool.name === "goal_evidence");
    assert.ok(evidenceTool, "会话应挂载 goal_evidence 工具");
    const fingerprint = await evidenceTool.execute("ev-1", { criteria: [{ criterion: "有火焰图", toolCallId: "tool-flame" }] });
    const gate1 = evidenceBody(fingerprint);
    assert.equal(gate1.accepted, true, "真实 toolResult 引用应通过核验");
    assert.equal(gate1.ready, true);
    assert.equal(item.goal.snapshot().phase, "verifying", "goal_evidence 只记证据，不推进状态");

    // 证据齐 + 轮次标记 -> 进入第 2 轮，轮次切换写 checkpoint。
    await reply(sessions, id, agent, "第 1 轮完成\n<axiom_round_finished>");
    await until(() => item.goal.snapshot().currentRound === 1, "round 2 started");
    assert.equal(item.goal.snapshot().phase, "running");
    assert.equal(item.goal.snapshot().rounds[0].status, "done");
    assert.equal(agent.checkpoints.length, 1, "轮次切换必须写 checkpoint");
    assert.match(agent.checkpoints[0], /第 2\/2 轮/, "checkpoint 应携带新轮次上下文");

    // 第 2 轮：整体完成标记但没有证据 -> 不得完成，退回验证。
    await reply(sessions, id, agent, "构建已优化\n<axiom_goal_finished>");
    await until(() => item.goal.snapshot().phase === "verifying", "verifying round 2");
    assert.equal(item.goal.snapshot().rounds[1].status, "done");

    // 只补轮次证据就宣布整体完成 -> 整体验收仍缺证据，不得完成。
    injectToolResult(item, "tool-build");
    const roundGate = evidenceBody(await evidenceTool.execute("ev-2", { criteria: [{ criterion: "构建 < 10s", toolCallId: "tool-build" }] }));
    assert.equal(roundGate.accepted, true);
    assert.equal(roundGate.ready, true);
    assert.equal(roundGate.completable, false, "整体验收未齐时不可完成");
    await reply(sessions, id, agent, "第 2 轮验收已交\n<axiom_goal_finished>");
    await until(() => item.goal.snapshot().phase === "verifying", "verifying overall");
    assert.notEqual(item.goal.snapshot().phase, "completed", "缺整体证据不得完成");

    // 补齐整体证据 + 最终标记 -> 所有轮次 done 且整体证据齐，才真正完成。
    injectToolResult(item, "tool-timing", "bash");
    const finalGate = evidenceBody(await evidenceTool.execute("ev-3", { criteria: [{ criterion: "全量构建 < 10s", toolCallId: "tool-timing" }] }));
    assert.equal(finalGate.accepted, true);
    assert.equal(finalGate.completable, true);
    const callsBefore = agent.calls.length;
    await reply(sessions, id, agent, "整体目标达成\n<axiom_goal_finished>", { completes: true });

    const done = item.goal.snapshot();
    assert.equal(done.currentRound, 1);
    assert.deepEqual(done.rounds.map((round) => round.status), ["done", "done"]);
    assert.equal(done.pendingAction, null);
    assert.match(done.progress, /2\/2 轮/, "完成后进度应为 2/2");
    assert.equal(item.goal.context(), null, "完成后不再注入目标上下文");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(agent.calls.length, callsBefore, "完成后不得自动续跑");
  } finally { await sessions.close(); }
});

test("重启后持久暂停优先：pausing 落盘为 paused 并阻止续跑", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-goal-sessions-"));
  const first = factoryFixture();
  const sessions = new Sessions(first.factory, undefined, join(root, "storage"));
  let restored;
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    await ordinary(sessions, id, "先普通聊一句");
    await enterGoal(sessions, id, first.mains[0]);
    await sessions.goalAction(id, "confirm");
    await sessions.goalAction(id, "pause");
    assert.equal(item.goal.snapshot().phase, "pausing", "主代理在飞时只登记暂停");
    assert.equal(item.goal.snapshot().pendingAction.type, "pause");

    await sessions.close(); // 停机 freeze：pausing 归一化为 paused 并落盘

    const next = factoryFixture();
    restored = new Sessions(next.factory, undefined, join(root, "storage"));
    await restored.load();
    await restored.ensureLoaded(id);
    const goal = restored.get(id).goal.snapshot();
    assert.equal(goal.phase, "paused", "重启后停在持久暂停态");
    assert.equal(goal.pendingAction, null);

    await assert.rejects(restored.prompt(id, "恢复前的普通输入"), /请使用专用恢复/);
    await assert.rejects(restored.retry(id), /Goal 已暂停或等待确认/);

    await restored.goalAction(id, "resume");
    assert.equal(restored.get(id).goal.snapshot().phase, "running");
    next.mains[0].finish();
    await restored.get(id).work;
    await until(() => restored.get(id).status === "idle");
  } finally { await restored?.close(); await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

 test("单独 /goal 只开启任务状态，下一条消息保存目标并等待计划确认", async () => {
  const { factory, mains } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    await sessions.prompt(id, "/goal");
    const item = sessions.get(id), agent = mains[0];
    assert.equal(item.status, "idle");
    assert.equal(item.goal.snapshot().phase, "clarifying");
    assert.equal(item.goal.snapshot().objective, "");
    assert.equal(agent.calls.length, 0);
    await sessions.prompt(id, "把构建时间降到 10s 内");
    await tick();
    assert.equal(item.goal.snapshot().objective, "把构建时间降到 10s 内");
    assert.equal(agent.calls.length, 1);
    assert.ok(agent.options.executionContext().includes("把构建时间降到 10s 内"));
    await agent.tools.find((tool) => tool.name === "goal_plan").execute("plan-1", PLAN);
    agent.finish();
    await item.work;
    await tick();
    assert.equal(item.goal.snapshot().phase, "ready");
    assert.equal(agent.calls.length, 1, "确认前不自动执行");
  } finally { await sessions.close(); }
});
