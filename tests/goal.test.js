import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.js";
import { GOAL_MAX_SEGMENTS, Goal, createGoalStore, parseGoalMarkers, stripGoalMarkers } from "../src/goal.js";

const ROUND = "<axiom_round_finished>";
const GOAL = "<axiom_goal_finished>";

const PLAN = {
  objective: "让线上服务稳定",
  constraints: ["不改数据库结构", "禁止重启线上服务"],
  acceptance: ["线上接口返回 200"],
  rounds: [{ title: "修崩溃", objective: "修复启动崩溃", acceptance: ["启动不再崩溃"] }],
};
const PLAN2 = {
  objective: "改成离线优先",
  constraints: ["不引入新依赖"],
  acceptance: ["离线可用"],
  rounds: [{ title: "离线模式", objective: "实现离线读写", acceptance: ["断网可用"] }],
};
const PLAN_MULTI = {
  objective: PLAN.objective,
  constraints: [...PLAN.constraints],
  acceptance: [...PLAN.acceptance],
  rounds: [
    { title: "修崩溃", objective: "修复启动崩溃", acceptance: ["启动不再崩溃"] },
    { title: "加监控", objective: "补上接口监控", acceptance: ["监控面板可见 200 比例"] },
  ],
};

const make = ({ store = createGoalStore(), sessionId = "s1", messages = [] } = {}) => {
  const events = [];
  const goal = new Goal({ sessionId, store, emit: (event) => events.push(event), messageCount: () => messages.length });
  return { goal, store, events, messages };
};

const asst = (text, index = 0, extra = {}) => ({ message: { role: "assistant", content: [{ type: "text", text }], ...extra }, index });
const toolText = (outcome) => JSON.parse(outcome.content[0].text);
const call = (tool, input) => tool.execute("call", input).then(toolText);

// 跑到「执行中」：澄清 -> 提交计划 -> 确认。
const runningGoal = ({ store = createGoalStore(), messages = [], plan = PLAN } = {}) => {
  const ctx = make({ store, messages });
  ctx.goal.action("enter");
  ctx.goal.submitPlan(plan);
  ctx.goal.action("confirm");
  return ctx;
};

// 跑到「验证中」：在跑一轮后收到完成标记。
const verifyingGoal = ({ store = createGoalStore(), messages = [{ role: "assistant" }], plan = PLAN } = {}) => {
  const ctx = runningGoal({ store, messages, plan });
  ctx.goal.onReply(asst(`修好了\n${ROUND}`, messages.length - 1));
  return ctx;
};

const evidenceTool = (goal, results) => goal.verificationTool({ evidence: () => results });

test("标记严格解析：只有独立成行的裸标记有效", () => {
  assert.deepEqual(parseGoalMarkers(`干完了\n${ROUND}`), { roundFinished: true, goalFinished: false });
  assert.deepEqual(parseGoalMarkers(`  ${GOAL}  `), { roundFinished: false, goalFinished: true });
  assert.deepEqual(parseGoalMarkers(`干完了\n${ROUND}\n${GOAL}`), { roundFinished: true, goalFinished: true });
});

test("标记严格解析：带内文、闭合标签、行内出现、大小写不符都不算", () => {
  const rejected = [
    `${ROUND}一句话总结</axiom_round_finished>`,
    `<axiom_round_finished>干完了</axiom_round_finished>`,
    `<axiom_round_finished>干完了`,
    `本轮完成${ROUND}`,
    `<AXIOM_ROUND_FINISHED>`,
    `<axiom_round_finished >`,
  ];
  for (const text of rejected)
    assert.deepEqual(parseGoalMarkers(text), { roundFinished: false, goalFinished: false }, text);
});

test("标记解析：代码围栏内的标记不算，strip 保留围栏内容", () => {
  const text = ["说明", "```", ROUND, "```", ROUND].join("\n");
  assert.deepEqual(parseGoalMarkers(text), { roundFinished: true, goalFinished: false });
  const stripped = stripGoalMarkers(text);
  assert.equal(stripped, ["说明", "```", ROUND, "```"].join("\n"));
  assert.equal(stripGoalMarkers("正文\n"), "正文\n");
});

test("标记解析：波浪线围栏、更长围栏、信息串围栏与未闭合围栏都屏蔽标记", () => {
  assert.deepEqual(parseGoalMarkers(["说明", "~~~", ROUND, "~~~"].join("\n")), { roundFinished: false, goalFinished: false });
  assert.deepEqual(parseGoalMarkers(["说明", "~~~~", ROUND, "~~~~", ROUND].join("\n")), { roundFinished: true, goalFinished: false });
  // 更长的开围栏不会被更短的围栏行闭合
  assert.deepEqual(parseGoalMarkers(["````", ROUND, "```", ROUND, "````"].join("\n")), { roundFinished: false, goalFinished: false });
  assert.deepEqual(parseGoalMarkers(["```js", ROUND, "```", ROUND].join("\n")), { roundFinished: true, goalFinished: false });
  assert.deepEqual(parseGoalMarkers(["   ```", ROUND, "   ```", ROUND].join("\n")), { roundFinished: true, goalFinished: false });
  // 未闭合围栏：后续全部视为代码
  assert.deepEqual(parseGoalMarkers(["```", ROUND].join("\n")), { roundFinished: false, goalFinished: false });
});

test("标记解析：四空格/Tab 缩进代码里的标记不算，strip 只删真正的信号行", () => {
  assert.deepEqual(parseGoalMarkers(`说明\n    ${ROUND}`), { roundFinished: false, goalFinished: false });
  assert.deepEqual(parseGoalMarkers(`说明\n\t${ROUND}`), { roundFinished: false, goalFinished: false });
  assert.deepEqual(parseGoalMarkers(`说明\n    ${ROUND}\n${ROUND}`), { roundFinished: true, goalFinished: false });
  const text = `说明\n    ${ROUND}\n${ROUND}`;
  assert.equal(stripGoalMarkers(text), `说明\n    ${ROUND}`);
});

test("strip：模型补的闭合标签与空标签对都不留在展示文本里", () => {
  // 空标签对不算信号（不放宽防伪造口径），但展示文本里不能留下标签原文
  assert.deepEqual(parseGoalMarkers(`完成\n${ROUND}</axiom_round_finished>`), { roundFinished: false, goalFinished: false });
  assert.equal(stripGoalMarkers(`完成\n${ROUND}</axiom_round_finished>`), "完成");
  assert.equal(stripGoalMarkers(`完成\n${ROUND}\n</axiom_round_finished>`), "完成");
  assert.equal(stripGoalMarkers(`完成\n</axiom_goal_finished>`), "完成");
  assert.equal(stripGoalMarkers(`${ROUND}干完了`), "干完了");
  // 行内代码里的标记是在讨论协议，原样保留
  assert.equal(stripGoalMarkers(`结束时输出 \`${ROUND}\` 即可`), `结束时输出 \`${ROUND}\` 即可`);
});

test("轮次小结取正文首行：记忆标签、答复标签与完成标记都不落进小结", () => {
  const { goal } = runningGoal();
  const text = [
    "<title>接口修复</title>",
    "过程说明：先看日志，再改超时。",
    "",
    "<axiom_answer>",
    "修好了，接口恢复 200",
    "细节写进 devlog。",
    "</axiom_answer>",
    "",
    ROUND,
  ].join("\n");
  goal.onReply(asst(text, 3));
  assert.equal(goal.snapshot().rounds[0].summary, "修好了，接口恢复 200");
  const plain = runningGoal();
  plain.goal.onReply(asst(`修好了\n${ROUND}`, 3));
  assert.equal(plain.goal.snapshot().rounds[0].summary, "修好了");
});

test("验证提示：还有未收尾的轮次时不要求整体完成标记", async () => {
  const bash = (id) => ({ toolCallId: id, toolName: "bash", isError: false });
  const { goal } = runningGoal({ plan: PLAN_MULTI });
  goal.onReply(asst(`第 1 轮做完了\n${ROUND}`, 3));
  assert.equal(goal.snapshot().phase, "verifying");
  const outcome = await call(evidenceTool(goal, [bash("call_1"), bash("call_2")]), {
    criteria: [
      { criterion: "启动不再崩溃", toolCallId: "call_1" },
      { criterion: "线上接口返回 200", toolCallId: "call_2" },
    ],
  });
  assert.equal(outcome.ready, true);
  assert.equal(outcome.completable, false); // 第 2 轮还没跑，轮次未收尾
  const prompt = goal.context();
  assert.doesNotMatch(prompt, /证据已齐：在回复最后单独一行输出 <axiom_goal_finished>/);
  assert.match(prompt, /本轮证据已齐[\s\S]*<axiom_round_finished>/);
});

test("证据门：整体验收证据也要本轮新鲜，陈旧证据不算整体已齐", async () => {
  const plan = {
    objective: PLAN.objective,
    constraints: [],
    acceptance: ["线上接口返回 200"],
    rounds: [
      { title: "第一轮", objective: "修复崩溃", acceptance: ["启动不再崩溃"] },
      { title: "第二轮", objective: "补监控", acceptance: ["监控面板可见 200 比例"] },
    ],
  };
  const bash = (id) => ({ toolCallId: id, toolName: "bash", isError: false });
  const { goal } = runningGoal({ plan });
  goal.onReply(asst(`第 1 轮完成\n${ROUND}`, 3));
  const first = await call(evidenceTool(goal, [bash("call_1"), bash("call_2")]), {
    criteria: [
      { criterion: "启动不再崩溃", toolCallId: "call_1" },
      { criterion: "线上接口返回 200", toolCallId: "call_2" },
    ],
  });
  assert.equal(first.accepted, true);
  goal.onReply(asst(`进下一轮\n${ROUND}`, 4));
  assert.equal(goal.snapshot().currentRound, 1);
  goal.onReply(asst(`第 2 轮完成\n${ROUND}`, 5));
  assert.equal(goal.snapshot().phase, "verifying");
  // 本轮证据补齐，但整体验收的证据还是第 1 轮的 -> 整体不算已齐
  const stale = await call(evidenceTool(goal, [bash("call_3")]), {
    criteria: [{ criterion: "监控面板可见 200 比例", toolCallId: "call_3" }],
  });
  assert.equal(stale.ready, true);
  assert.deepEqual(stale.missingGoal, ["线上接口返回 200"]);
  assert.equal(stale.completable, false);
  goal.onReply(asst(`整体完成\n${GOAL}`, 6));
  assert.equal(goal.snapshot().phase, "verifying");
  // 在最后一轮重新验证整体标准后才能完成
  const fresh = await call(evidenceTool(goal, [bash("call_4")]), {
    final: true,
    criteria: [{ criterion: "线上接口返回 200", toolCallId: "call_4" }],
  });
  assert.equal(fresh.completable, true);
  goal.onReply(asst(`整体完成\n${GOAL}`, 7));
  assert.equal(goal.snapshot().phase, "completed");
});

test("无目标会话：snapshot/context 为 null，两个工具调用都被拒绝", async () => {
  const { goal, events } = make();
  assert.equal(goal.active, false);
  assert.equal(goal.snapshot(), null);
  assert.equal(goal.context(), null);
  assert.deepEqual(events, []);
  await assert.rejects(call(goal.planTool(), PLAN), /普通会话未启用目标模式/);
  await assert.rejects(call(evidenceTool(goal, []), { criteria: [{ criterion: "x", toolCallId: "y" }] }), /普通会话未启用目标模式/);
});

test("enter/confirm 前禁止跳过：未提交计划不能确认，非法计划被 schema 拒绝", () => {
  const { goal } = make();
  assert.throws(() => goal.action("confirm"), /普通会话未启用目标模式/);
  goal.action("enter");
  assert.equal(goal.snapshot().phase, "clarifying");
  assert.throws(() => goal.action("confirm"), /只有已提交计划的目标可以确认/);
  assert.throws(() => goal.action("enter"), /已存在进行中的目标/);
  assert.throws(() => goal.submitPlan({ ...PLAN, rounds: [] }), /至少|min/i);
  assert.throws(() => goal.submitPlan({ ...PLAN, 多余字段: 1 }), /Unrecognized|key/i);
  assert.throws(() => goal.action("上传"), /未知的目标操作/);
});

test("澄清 -> 计划 -> 确认：进入执行并记录轮次下标", () => {
  const messages = [{ role: "user" }, { role: "user" }, { role: "user" }, { role: "user" }];
  const { goal, events } = runningGoal({ messages });
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "running");
  assert.equal(snapshot.currentRound, 0);
  assert.equal(snapshot.rounds.length, 1);
  assert.equal(snapshot.rounds[0].status, "running");
  assert.equal(snapshot.rounds[0].startMessage, 4);
  assert.equal(snapshot.rounds[0].endMessage, null);
  assert.equal(events.at(-1).type, "goal");
  assert.ok(goal.context().includes(ROUND));
});

test("最终回复缺标记：只催促，不推进，也不自动开下一轮", () => {
  const { goal } = runningGoal();
  goal.onReply(asst("还在做", 0));
  goal.onReply(asst("继续做", 1));
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "running");
  assert.equal(snapshot.rounds.length, 1);
  assert.equal(snapshot.rounds[0].status, "running");
  assert.equal(snapshot.rounds[0].endMessage, null);
  assert.match(goal.context(), /没有检测到/);
});

test("轮次标记：进入验证而不是直接开始下一轮", () => {
  const { goal } = runningGoal();
  goal.onReply(asst(`修好了\n${ROUND}`, 3));
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "verifying");
  assert.equal(snapshot.rounds.length, 1);
  assert.equal(snapshot.rounds[0].status, "done");
  assert.equal(snapshot.rounds[0].endMessage, 3);
  assert.equal(snapshot.rounds[0].summary, "修好了");
  assert.match(goal.context(), /goal_evidence/);
});

test("完成标记只触发验证：证据门未过时不会 complete", async () => {
  const { goal } = runningGoal();
  goal.onReply(asst(`都做完了\n${GOAL}`, 1));
  assert.equal(goal.snapshot().phase, "verifying");
  assert.notEqual(goal.snapshot().phase, "completed");
  const outcome = await call(evidenceTool(goal, []), { criteria: [{ criterion: "启动不再崩溃", toolCallId: "call_1" }] });
  assert.equal(outcome.accepted, false);
  assert.equal(goal.snapshot().phase, "verifying");
});

test("证据门：伪造 toolCallId 被服务端拒绝", async () => {
  const results = [{ toolCallId: "call_1", toolName: "bash", isError: false }];
  const { goal } = verifyingGoal();
  const outcome = await call(evidenceTool(goal, results), { criteria: [{ criterion: "启动不再崩溃", toolCallId: "编造的 id" }] });
  assert.equal(outcome.accepted, false);
  assert.match(outcome.invalid[0].reason, /不在本轮真实工具结果里/);
  assert.equal(goal.evidence().length, 0);
});

test("证据门：目标工具自身结果、失败调用、标准不匹配都被拒绝", async () => {
  const results = [
    { toolCallId: "self", toolName: "goal_evidence", isError: false },
    { toolCallId: "cancel", toolName: "cancel_task", isError: false },
    { toolCallId: "bad", toolName: "bash", isError: true },
    { toolCallId: "ok", toolName: "bash", isError: false },
  ];
  const { goal } = verifyingGoal();
  const outcome = await call(evidenceTool(goal, results), {
    criteria: [
      { criterion: "启动不再崩溃", toolCallId: "self" },
      { criterion: "启动不再崩溃", toolCallId: "bad" },
      { criterion: "根本没这条标准", toolCallId: "ok" },
      { criterion: "启动不再崩溃", toolCallId: "ok", tool: "别名" },
      { criterion: "启动不再崩溃", toolCallId: "cancel" },
    ],
  });
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.invalid.length, 5);
  assert.match(outcome.invalid[0].reason, /不能作为验收证据/);
  assert.match(outcome.invalid[1].reason, /失败/);
  assert.match(outcome.invalid[2].reason, /验收标准/);
  assert.match(outcome.invalid[3].reason, /工具名不符/);
  assert.match(outcome.invalid[4].reason, /不能作为验收证据/);
});

test("证据门：工具只记录证据不推进状态，最终回复的轮次标记才进下一轮", async () => {
  const results = [{ toolCallId: "call_1", toolName: "bash", isError: false }];
  const { goal } = verifyingGoal({ plan: PLAN_MULTI });
  const outcome = await call(evidenceTool(goal, results), { criteria: [{ criterion: "启动不再崩溃", toolCallId: "call_1" }] });
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.ready, true);
  assert.equal(outcome.nextRound, undefined); // 工具不再推进轮次
  assert.equal(goal.evidence().length, 1);
  const parked = goal.snapshot();
  assert.equal(parked.phase, "verifying");
  assert.equal(parked.currentRound, 0);
  assert.equal(parked.rounds[0].status, "done");
  // 独占一行的最终标记才是唯一推进入口
  goal.onReply(asst(`本轮完成\n${ROUND}`, 4));
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "running");
  assert.equal(snapshot.currentRound, 1);
  assert.equal(snapshot.rounds.length, 2);
  assert.equal(snapshot.rounds[0].status, "done");
  assert.equal(snapshot.rounds[1].status, "running");
});

test("证据门：同名验收标准的证据不能跨轮复用", async () => {
  const plan = {
    objective: "让线上服务稳定",
    constraints: [],
    acceptance: ["线上接口返回 200"],
    rounds: [
      { title: "第一轮", objective: "修复崩溃", acceptance: ["线上接口返回 200"] },
      { title: "第二轮", objective: "补监控", acceptance: ["线上接口返回 200"] },
    ],
  };
  const bash = (id) => ({ toolCallId: id, toolName: "bash", isError: false });
  const { goal } = verifyingGoal({ plan });
  // 第 1 轮：提交证据，工具只记录
  const first = await call(evidenceTool(goal, [bash("call_1")]), { criteria: [{ criterion: "线上接口返回 200", toolCallId: "call_1" }] });
  assert.equal(first.accepted, true);
  assert.equal(first.ready, true);
  assert.equal(goal.evidence()[0].round, 0);
  goal.onReply(asst(`第 1 轮完成\n${ROUND}`, 4)); // -> 第 2 轮
  assert.equal(goal.snapshot().currentRound, 1);
  assert.equal(goal.snapshot().phase, "running");
  goal.onReply(asst(`第 2 轮完成\n${ROUND}`, 5)); // -> 第 2 轮等证据
  assert.equal(goal.snapshot().phase, "verifying");
  // 第 1 轮的同名证据（round=0）不算第 2 轮，标准重新变回待补
  assert.match(goal.context(), /本轮待补验收[\s\S]*- 线上接口返回 200/);
  const fresh = await call(evidenceTool(goal, [bash("call_2")]), { criteria: [{ criterion: "线上接口返回 200", toolCallId: "call_2" }] });
  assert.equal(fresh.accepted, true);
  assert.equal(fresh.ready, true);
  assert.equal(goal.evidence()[0].round, 1);
});

test("提前的整体标记不永久堵死轮次推进：后续轮次标记 + 本轮证据齐仍能进下一轮", async () => {
  const bash = { toolCallId: "call_1", toolName: "bash", isError: false };
  const { goal } = runningGoal({ plan: PLAN_MULTI });
  // 第 1 轮就提前声称整体完成（整体证据未齐、第 2 轮还没跑）-> 停在验证，不 completed
  goal.onReply(asst(`第 1 轮做完了\n${GOAL}`, 3));
  assert.equal(goal.snapshot().phase, "verifying");
  // 补齐本轮证据后，后续回复里的轮次标记必须能推进到第 2 轮
  const outcome = await call(evidenceTool(goal, [bash]), { criteria: [{ criterion: "启动不再崩溃", toolCallId: "call_1" }] });
  assert.equal(outcome.ready, true);
  goal.onReply(asst(`本轮完成\n${ROUND}`, 4));
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "running");
  assert.equal(snapshot.currentRound, 1);
  assert.equal(snapshot.rounds[0].status, "done");
  assert.equal(snapshot.rounds[1].status, "running");
  // 提前声明没有绕过整体门：第 2 轮没证据时整体标记仍停在验证
  goal.onReply(asst(`整体完成\n${GOAL}`, 5));
  assert.equal(goal.snapshot().phase, "verifying");
});

test("轮次标记：最后一轮的标记不造幻影轮次，停在验证等整体标记", async () => {
  const results = [{ toolCallId: "call_1", toolName: "bash", isError: false }];
  const { goal } = verifyingGoal();
  await call(evidenceTool(goal, results), { criteria: [{ criterion: "启动不再崩溃", toolCallId: "call_1" }] });
  goal.onReply(asst(`本轮完成\n${ROUND}`, 4));
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "verifying");
  assert.equal(snapshot.currentRound, 0);
  assert.equal(snapshot.rounds.length, 1);
  assert.equal(snapshot.rounds[0].status, "done");
  // 整体证据未齐时整体标记也停验证，不产生多余轮次
  goal.onReply(asst(`都做完了\n${GOAL}`, 5));
  assert.equal(goal.snapshot().phase, "verifying");
  assert.equal(goal.snapshot().rounds.length, 1);
  assert.equal(goal.context() !== null, true);
});

test("证据门：整体证据齐 + 最终回复的整体标记才 completed", async () => {
  const results = [
    { toolCallId: "call_1", toolName: "bash", isError: false },
    { toolCallId: "call_2", toolName: "read", isError: false },
  ];
  const { goal } = verifyingGoal();
  const partial = await call(evidenceTool(goal, results), { criteria: [{ criterion: "启动不再崩溃", toolCallId: "call_1" }] });
  assert.equal(partial.accepted, true);
  assert.equal(partial.completable, false);
  goal.onReply(asst(`都做完了\n${GOAL}`, 5)); // 声明整体完成，但整体证据未齐 -> 停在验证
  assert.equal(goal.snapshot().phase, "verifying");
  assert.notEqual(goal.snapshot().phase, "completed");
  const outcome = await call(evidenceTool(goal, results), {
    final: true,
    criteria: [{ criterion: "线上接口返回 200", toolCallId: "call_2" }],
  });
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.completable, true);
  assert.equal(outcome.completed, undefined); // 工具只报证据门，不宣布完成
  assert.equal(goal.snapshot().phase, "verifying");
  goal.onReply(asst(`整体完成\n${GOAL}`, 7));
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "completed");
  assert.equal(snapshot.rounds.every((round) => round.status === "done"), true);
  assert.equal(goal.context(), null);
});

test("pauseAtSafePoint：没有完成标记也能暂停并记录小结", async () => {
  const { goal } = runningGoal();
  const snapshot = goal.pauseAtSafePoint({ summary: "做到一半先停" });
  assert.equal(snapshot.phase, "paused");
  assert.equal(snapshot.pendingAction, null);
  assert.equal(snapshot.rounds[0].summary, "做到一半先停");
  assert.equal(snapshot.resumePhase, undefined);
  goal.action("resume");
  assert.equal(goal.snapshot().phase, "running");
});

test("pauseAtSafePoint：子任务未收尾时暂停不落定", () => {
  const { goal } = runningGoal();
  goal.action("pause");
  const blocked = goal.pauseAtSafePoint({ tasks: [{ status: "running" }] });
  assert.equal(blocked.phase, "pausing");
  assert.equal(blocked.pendingAction.type, "pause");
  const settled = goal.pauseAtSafePoint({ tasks: [{ status: "done" }] });
  assert.equal(settled.phase, "paused");
  assert.equal(settled.pendingAction, null);
});

test("whenSettled：安全点落定后才 resolve", async () => {
  const { goal } = runningGoal();
  goal.action("pause");
  const settled = goal.whenSettled();
  assert.equal(goal.snapshot().phase, "pausing");
  goal.settle();
  const snapshot = await settled;
  assert.equal(snapshot.phase, "paused");
});

test("adjust：改总体目标后重新规划，历史轮次保留为存档", () => {
  const { goal } = runningGoal();
  goal.action("adjust", "改成离线优先");
  assert.equal(goal.snapshot().phase, "adjusting");
  const snapshot = goal.settle();
  assert.equal(snapshot.phase, "clarifying");
  assert.match(snapshot.objective, /改成离线优先/);
  assert.equal(snapshot.rounds[0].status, "skipped");
  assert.equal(snapshot.rounds[0].endMessage, 0);
  goal.submitPlan(PLAN2);
  assert.equal(goal.snapshot().rounds.length, 2);
  assert.equal(goal.snapshot().currentRound, 1);
  goal.action("confirm");
  assert.equal(goal.snapshot().phase, "running");
  assert.equal(goal.snapshot().rounds[1].status, "running");
});

test("restart：进入重新规划，历史轮次保留为存档", () => {
  const { goal } = runningGoal();
  goal.action("restart");
  assert.equal(goal.snapshot().phase, "adjusting");
  const snapshot = goal.settle();
  assert.equal(snapshot.phase, "clarifying");
  assert.equal(snapshot.rounds.length, 1);
  assert.equal(snapshot.rounds[0].status, "skipped");
  goal.submitPlan(PLAN);
  assert.equal(goal.snapshot().rounds.length, 2);
  assert.equal(goal.snapshot().rounds[0].status, "skipped");
});

test("fail：预算/失败持久暂停，freeze 后仍是暂停态", () => {
  const { goal } = runningGoal();
  const snapshot = goal.fail("预算耗尽");
  assert.equal(snapshot.phase, "paused");
  assert.equal(snapshot.pendingAction, null);
  assert.equal(goal.failure().reason, "预算耗尽");
  assert.match(snapshot.progress, /预算耗尽/);
  const frozen = goal.freeze();
  assert.equal(frozen.phase, "paused");
  assert.equal(goal.failure().reason, "预算耗尽");
});

test("段数上限：自动执行段到达上限自动 fail", () => {
  const store = createGoalStore();
  store.save("s1", {
    phase: "ready",
    objective: "目标",
    constraints: [],
    acceptance: ["标准"],
    rounds: [{ title: "第 1 轮", objective: "做事", acceptance: ["子标准"], status: "pending", summary: "", startMessage: null, endMessage: null }],
    currentRound: 0,
    progress: "",
    pendingAction: null,
    segments: GOAL_MAX_SEGMENTS,
  });
  const goal = new Goal({ sessionId: "s1", store });
  goal.action("confirm");
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "paused");
  assert.equal(snapshot.rounds[0].status, "pending");
  assert.match(goal.failure().reason, new RegExp(String(GOAL_MAX_SEGMENTS)));
});

test("契约对象键固定，事件形状为 {type:'goal', goal}", () => {
  const { goal, events } = runningGoal();
  assert.deepEqual(Object.keys(goal.snapshot()), [
    "phase", "objective", "constraints", "acceptance", "rounds", "currentRound", "progress", "failure", "execution", "pendingAction",
  ]);
  assert.equal(goal.snapshot().failure, null);
  assert.deepEqual(Object.keys(goal.snapshot().rounds[0]), [
    "title", "objective", "acceptance", "status", "summary", "startMessage", "endMessage",
  ]);
  for (const event of events) {
    assert.equal(event.type, "goal");
    assert.ok("goal" in event);
  }
});

test("goal_progress：六字段落盘进 snapshot/context，且不推进阶段", async () => {
  const { goal } = runningGoal();
  const before = goal.snapshot();
  const outcome = await call(goal.progressTool(), {
    completed: "修好了",
    remaining: "补监控",
    checks: "跑了单测",
    blockers: "无",
    next: "提交",
    artifacts: "src/goal.js",
  });
  assert.deepEqual(outcome, { saved: true });
  const after = goal.snapshot();
  assert.equal(after.phase, before.phase);
  assert.equal(after.phase, "running");
  assert.equal(after.currentRound, before.currentRound);
  assert.equal(after.rounds[0].status, "running");
  const { at, round, ...fields } = after.execution;
  assert.equal(typeof at, "number");
  assert.equal(round, 0);
  assert.deepEqual(fields, {
    completed: "修好了",
    remaining: "补监控",
    checks: "跑了单测",
    blockers: "无",
    next: "提交",
    artifacts: "src/goal.js",
  });
  assert.match(goal.context(), /补监控/);
  assert.match(goal.context(), /src\/goal\.js/);
});

test("goal_progress：缺字段、多余字段、超长内容都被拒绝且不落盘", async () => {
  const { goal } = runningGoal();
  const tool = goal.progressTool();
  const full = { completed: "", remaining: "", checks: "", blockers: "", next: "", artifacts: "" };
  const { next, ...missing } = full;
  await assert.rejects(call(tool, missing));
  await assert.rejects(call(tool, { ...full, 多余: "x" }));
  await assert.rejects(call(tool, { ...full, completed: "x".repeat(6001) }));
  assert.equal(goal.snapshot().execution, null);
  assert.equal(goal.snapshot().phase, "running");
});

test("exit：空闲阶段（澄清/待确认/已暂停）直接退出，清掉记录并广播 goal:null", () => {
  const { goal, store, events } = make();
  goal.action("enter");
  assert.equal(goal.snapshot().phase, "clarifying");
  assert.equal(goal.exit(), null);
  assert.equal(goal.active, false);
  assert.equal(goal.snapshot(), null);
  assert.equal(goal.context(), null);
  assert.equal(store.load("s1"), null);
  assert.deepEqual(events.at(-1), { type: "goal", goal: null });
  // 退出后回到普通会话语义：目标工具被拒绝，但可以重新进入目标模式
  assert.throws(() => goal.action("pause"), /普通会话未启用目标模式/);
  goal.action("enter", "新目标");
  assert.equal(goal.snapshot().objective, "新目标");

  // 待确认阶段：计划已提交但无在飞工作，同样可以退出
  const ready = make();
  ready.goal.action("enter");
  ready.goal.submitPlan(PLAN);
  assert.equal(ready.goal.snapshot().phase, "ready");
  assert.equal(ready.goal.action("exit"), null);
  assert.equal(ready.store.load("s1"), null);

  // 已暂停：空闲且无排队动作，允许退出
  const paused = make();
  paused.goal.action("enter");
  paused.goal.action("pause");
  assert.equal(paused.goal.snapshot().phase, "paused");
  assert.equal(paused.goal.action("exit"), null);
  assert.equal(paused.goal.active, false);
});

test("exit：在飞阶段（running/verifying/pausing/adjusting）拒绝，暂停落定后才放行", () => {
  const running = runningGoal().goal;
  assert.throws(() => running.action("exit"), /请先暂停并在安全点落定后再退出/);
  assert.equal(running.snapshot().phase, "running", "被拒绝的退出不得改变状态");

  const verifying = verifyingGoal().goal;
  assert.throws(() => verifying.exit(), /请先暂停并在安全点落定后再退出/);

  const adjusting = runningGoal().goal;
  adjusting.action("adjust", "改成离线优先");
  assert.equal(adjusting.snapshot().phase, "adjusting");
  assert.equal(adjusting.snapshot().pendingAction.type, "adjust");
  assert.throws(() => adjusting.exit(), /请先暂停并在安全点落定后再退出/);
  // 调整落定回到澄清（无在飞工作）后可退出
  assert.equal(adjusting.settle({ tasks: [] }).phase, "clarifying");
  assert.equal(adjusting.exit(), null);

  const pausing = runningGoal().goal;
  pausing.action("pause");
  assert.equal(pausing.snapshot().phase, "pausing");
  assert.throws(() => pausing.exit(), /请先暂停并在安全点落定后再退出/);
  // 子任务还在飞：安全点未到，退出继续被拒
  assert.equal(pausing.settle({ tasks: [{ status: "running" }] }).phase, "pausing");
  assert.throws(() => pausing.exit(), /请先暂停并在安全点落定后再退出/);
  assert.equal(pausing.settle({ tasks: [] }).phase, "paused");
  assert.equal(pausing.exit(), null);
  assert.equal(pausing.snapshot(), null);
});

test("remove：清理记录并广播 goal:null", () => {
  const { goal, events } = runningGoal();
  goal.remove();
  assert.equal(goal.snapshot(), null);
  assert.deepEqual(events.at(-1), { type: "goal", goal: null });
});

test("内存态：无 DB 也能跑完整轮（证据齐 + 最终整体标记）", async () => {
  const results = [
    { toolCallId: "call_1", toolName: "bash" },
    { toolCallId: "call_2", toolName: "bash" },
  ];
  const { goal } = verifyingGoal();
  const outcome = await call(evidenceTool(goal, results), {
    final: true,
    criteria: [
      { criterion: "启动不再崩溃", toolCallId: "call_1" },
      { criterion: "线上接口返回 200", toolCallId: "call_2" },
    ],
  });
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.completable, false); // 未声明整体完成，工具不会自行完成
  assert.notEqual(goal.snapshot().phase, "completed");
  goal.onReply(asst(`整体完成\n${GOAL}`, 2));
  assert.equal(goal.snapshot().phase, "completed");
});

test("SQLite 持久化：单独 goals 表跨实例恢复", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-goal-"));
  try {
    const path = join(dir, "axiom.db");
    const database = new Database(path);
    const store = createGoalStore(database);
    const { goal } = runningGoal({ store });
    goal.action("pause");
    goal.settle();
    assert.equal(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'goals'").get().name,
      "goals",
    );
    const reopened = new Database(path);
    const revived = new Goal({ sessionId: "s1", store: createGoalStore(reopened) });
    const snapshot = revived.snapshot();
    assert.equal(snapshot.phase, "paused");
    assert.equal(snapshot.objective, PLAN.objective);
    assert.equal(snapshot.rounds[0].status, "running");
    assert.deepEqual(snapshot.acceptance, PLAN.acceptance);
    revived.remove();
    assert.equal(createGoalStore(reopened).load("s1"), null);
    reopened.close();
    database.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("noteToolResult：无 provider 时用外层喂的真实工具结果核验，工具不推进", async () => {
  const { goal } = verifyingGoal();
  goal.noteToolResult({ phase: "start", toolCallId: "call_1", toolName: "bash" });
  const early = await call(goal.verificationTool(), { criteria: [{ criterion: "启动不再崩溃", toolCallId: "call_1" }] });
  assert.equal(early.accepted, false);
  assert.equal(goal.evidence().length, 0);
  goal.noteToolResult({ phase: "end", toolCallId: "call_1", toolName: "bash", isError: false });
  const outcome = await call(goal.verificationTool(), { criteria: [{ criterion: "启动不再崩溃", toolCallId: "call_1" }] });
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.ready, true);
  assert.equal(outcome.nextRound, undefined);
  assert.equal(goal.snapshot().phase, "verifying");
});

test("goal_block：必须给出阻塞原因，登记后持久暂停且不标记完成", async () => {
  const { goal } = runningGoal();
  await assert.rejects(call(goal.blockTool(), { reason: "   " }), /at least 1|too_small/i);
  await assert.rejects(call(goal.blockTool(), {}), /Required|invalid_type/i);
  assert.equal(goal.snapshot().phase, "running"); // 非法输入不改变状态
  const reason = "缺少线上环境的只读凭据，需要用户提供";
  const outcome = await call(goal.blockTool(), { reason: `  ${reason}  ` });
  assert.deepEqual(outcome, { paused: true, reason });
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "paused");
  assert.notEqual(snapshot.phase, "completed");
  assert.equal(snapshot.pendingAction, null);
  assert.equal(snapshot.failure.reason, reason);
  assert.equal(goal.failure().reason, reason);
  assert.match(goal.context(), /已暂停/);
  assert.ok(goal.context().includes(reason));
  // 暂停后完成标记不会唤醒，必须手动 resume
  goal.onReply(asst(`做完了\n${GOAL}`, 1));
  assert.equal(goal.snapshot().phase, "paused");
});

test("goal_block：普通会话调用被拒绝", async () => {
  const { goal } = make();
  await assert.rejects(call(goal.blockTool(), { reason: "缺权限" }), /普通会话未启用目标模式/);
});

test("每个活跃阶段的 context 都带完整目标/约束/验收基准", () => {
  const builders = {
    ready: () => { const { goal } = make(); goal.action("enter"); goal.submitPlan(PLAN); return goal; },
    running: () => runningGoal().goal,
    verifying: () => verifyingGoal().goal,
    pausing: () => { const { goal } = runningGoal(); goal.action("pause"); return goal; },
    paused: () => { const { goal } = runningGoal(); goal.action("pause"); goal.settle(); return goal; },
    adjusting: () => { const { goal } = runningGoal(); goal.action("adjust", "改成离线优先"); return goal; },
  };
  for (const [phase, build] of Object.entries(builders)) {
    const goal = build();
    assert.equal(goal.snapshot().phase, phase, `${phase}: 阶段不符`);
    const ctx = goal.context();
    assert.ok(ctx.includes(PLAN.objective), `${phase}: 缺整体目标`);
    assert.ok(ctx.includes(JSON.stringify(PLAN.constraints)), `${phase}: 约束不是完整数组`);
    for (const constraint of PLAN.constraints) assert.ok(ctx.includes(constraint), `${phase}: 缺约束 ${constraint}`);
    for (const standard of PLAN.acceptance) assert.ok(ctx.includes(standard), `${phase}: 缺整体验收 ${standard}`);
    assert.ok(ctx.includes(JSON.stringify(goal.snapshot())), `${phase}: 缺最新 Goal 状态基准`);
  }
  // 澄清阶段尚无计划：只保证用户目标在上下文里
  const { goal: clarifying } = make();
  clarifying.action("enter", PLAN.objective);
  assert.equal(clarifying.snapshot().phase, "clarifying");
  assert.ok(clarifying.context().includes(PLAN.objective));
  assert.equal(clarifying.snapshot().constraints.length, 0);
});

test("重启恢复：running 落定为暂停并要求手动恢复，不自动唤醒", () => {
  const store = createGoalStore();
  const { goal } = runningGoal({ store });
  assert.equal(goal.snapshot().phase, "running");
  const revived = new Goal({ sessionId: "s1", store });
  const snapshot = revived.snapshot();
  assert.equal(snapshot.phase, "paused");
  assert.equal(snapshot.pendingAction, null);
  assert.match(snapshot.failure.reason, /服务已重启/);
  assert.equal(snapshot.rounds[0].status, "running");
  assert.ok(revived.context().includes(snapshot.failure.reason));
  // 暂停态不接受完成标记，不会自动继续
  revived.onReply(asst(`修好了\n${ROUND}`, 1));
  assert.equal(revived.snapshot().phase, "paused");
  assert.equal(revived.snapshot().currentRound, 0);
  assert.equal(revived.snapshot().rounds[0].status, "running");
  // 手动恢复后继续在跑的同一轮
  revived.action("resume");
  assert.equal(revived.snapshot().phase, "running");
  assert.equal(revived.snapshot().currentRound, 0);
  assert.equal(revived.failure(), null);
});

test("重启恢复：verifying 落定为暂停，手动恢复回到验证阶段", () => {
  const store = createGoalStore();
  const { goal } = verifyingGoal({ store });
  assert.equal(goal.snapshot().phase, "verifying");
  const revived = new Goal({ sessionId: "s1", store });
  const snapshot = revived.snapshot();
  assert.equal(snapshot.phase, "paused");
  assert.match(snapshot.failure.reason, /服务已重启/);
  assert.equal(snapshot.rounds[0].status, "done");
  revived.action("resume");
  assert.equal(revived.snapshot().phase, "verifying");
  assert.equal(revived.failure(), null);
});

test("重启恢复：pausing 落定为暂停且不写重启原因", () => {
  const store = createGoalStore();
  const { goal } = runningGoal({ store });
  goal.action("pause");
  const revived = new Goal({ sessionId: "s1", store });
  const snapshot = revived.snapshot();
  assert.equal(snapshot.phase, "paused");
  assert.equal(snapshot.failure, null);
});

test("restart：已完成的目标也能重启为重新规划，历史轮次保留为存档", async () => {
  const { goal } = verifyingGoal();
  const results = [
    { toolCallId: "call_1", toolName: "bash", isError: false },
    { toolCallId: "call_2", toolName: "read", isError: false },
  ];
  await call(evidenceTool(goal, results), {
    criteria: [
      { criterion: "启动不再崩溃", toolCallId: "call_1" },
      { criterion: "线上接口返回 200", toolCallId: "call_2" },
    ],
  });
  goal.onReply(asst(`整体完成\n${GOAL}`, 3));
  assert.equal(goal.snapshot().phase, "completed");
  assert.equal(goal.context(), null);
  goal.action("restart", "换方向重来");
  const snapshot = goal.snapshot();
  assert.equal(snapshot.phase, "clarifying");
  assert.equal(snapshot.rounds.length, 1);
  assert.equal(snapshot.rounds[0].status, "done");
  assert.equal(snapshot.failure, null);
  // 重启后重新规划：历史轮次保留，新计划追加在后面
  goal.submitPlan(PLAN2);
  assert.equal(goal.snapshot().rounds.length, 2);
  assert.equal(goal.snapshot().rounds[0].status, "done");
  goal.action("confirm");
  assert.equal(goal.snapshot().phase, "running");
  assert.equal(goal.snapshot().rounds[1].status, "running");
});

test("settlePending：adjust/restart 同样要等子任务收尾后才落定", () => {
  const adjust = runningGoal().goal;
  adjust.action("adjust", "改成离线优先");
  const blockedAdjust = adjust.settle({ tasks: [{ status: "running" }] });
  assert.equal(blockedAdjust.phase, "adjusting");
  assert.equal(blockedAdjust.pendingAction.type, "adjust");
  assert.equal(adjust.settle({ tasks: [{ status: "done" }] }).phase, "clarifying");

  const restart = runningGoal().goal;
  restart.action("restart");
  const blockedRestart = restart.settle({ tasks: [{ status: "starting" }] });
  assert.equal(blockedRestart.phase, "adjusting");
  assert.equal(blockedRestart.pendingAction.type, "restart");
  assert.equal(restart.settle({ tasks: [] }).phase, "clarifying");

  const pause = runningGoal().goal;
  pause.action("pause");
  assert.equal(pause.pauseAtSafePoint({ tasks: [{ status: "running" }] }).phase, "pausing");
  assert.equal(pause.pauseAtSafePoint({ tasks: [{ status: "starting" }] }).phase, "pausing");
});
