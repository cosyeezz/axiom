import test from "node:test";
import assert from "node:assert/strict";
import { Tasks } from "../src/tasks.js";
import { delegationTools } from "../src/tools.js";
import { command } from "../src/protocol.js";

function fixture() {
  const agents = [], events = [], notifications = [];
  const tasks = new Tasks(async () => {
    let finish;
    const agent = {
      subscribe: () => () => {},
      prompt: () => new Promise((resolve) => { finish = resolve; }),
      enqueue: async (text, mode) => { agent.appended = { text, mode }; },
      result: () => { if (agent.fail) throw new Error("failed"); return "result"; },
      abort: async () => { agent.aborts = (agent.aborts || 0) + 1; finish?.(); },
      dispose: () => { agent.disposed = true; },
      finish: () => finish(),
    };
    agents.push(agent);
    return agent;
  }, (event) => events.push(event), async (job) => notifications.push({ taskId: job.id, resultId: job.resultId }));
  return { tasks, agents, events, notifications };
}

test("results require completion notification IDs, never wait or poll", async () => {
  const { tasks, agents, notifications } = fixture();
  const [delegate, read] = delegationTools(tasks);
  const response = await delegate.execute("", { context: "背景", tasks: [{ task: "a" }, { task: "b" }] });
  const { taskIds } = JSON.parse(response.content[0].text);
  assert.equal(agents.length, 2);
  assert.equal(notifications.length, 0);
  assert.throws(() => tasks.read(taskIds[0]), /不要轮询/);
  assert.equal(JSON.stringify(response).includes("resultId"), false);
  await assert.rejects(read.execute("", { taskIds, wait: false }));
  agents[0].finish();
  await tasks.jobs.get(taskIds[0]).done;
  assert.equal(notifications.length, 1, "one completed task notifies without waiting for siblings");
  const first = notifications[0];
  assert.match(first.resultId, /^[0-9a-f-]{36}$/);
  assert.notEqual(first.resultId, first.taskId);
  const result = JSON.parse((await read.execute("", first)).content[0].text);
  assert.equal(result.status, "completed");
  assert.equal(result.text, "result");
  assert.equal(Object.hasOwn(result, "runtime"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(tasks.read(first.taskId, first.resultId))), result);
  assert.throws(() => tasks.read(taskIds[1], first.resultId), /不要轮询/);
  assert.throws(() => fixture().tasks.read(first.taskId, first.resultId), /不要轮询/);
  agents[1].fail = true;
  agents[1].finish();
  await tasks.jobs.get(taskIds[1]).done;
  assert.equal(tasks.read(notifications[1].taskId, notifications[1].resultId).status, "failed");
  assert(agents.every((agent) => agent.disposed));
  assert.equal(command.safeParse({ id: "r", type: "tasks.read", sessionId: "s", ...first }).success, true);
  assert.equal(command.safeParse({ id: "r", type: "tasks.read", sessionId: "s", ...first, wait: false }).success, false);
});

test("publish separates safe view data from the full saved snapshot", async () => {
  const { tasks, events } = fixture();
  const [id] = tasks.start(["a"]);
  await tasks.cancel();
  const { data, saved } = events.filter((event) => event.type === "task.state").at(-1);
  assert.deepEqual(Object.keys(data).sort(), ["canRetry", "error", "id", "runtime", "status", "task", "text"], "broadcast data stays a safe view");
  assert.equal(data.canRetry, false, "cancelled job without session evidence offers no retry");
  assert.equal(data.status, "cancelled");
  assert.equal("saved" in data, false);
  assert.equal(saved.parentContext, "");
  assert.equal("resultId" in saved, true);
  assert.equal(typeof saved.createdAt, "number");
  assert.equal(saved.updatedAt >= saved.createdAt, true);
  assert.deepEqual(tasks.snapshotJob(tasks.jobs.get(id)), saved);
});

test("落库与回读都保留模型原文：标签剥离只属于展示层", async () => {
  // 子代理没有 <title> 自报协议（session-memory.js 的 onReply 对子任务直接返回），剥离只会让原文永久不可
  // 回读；子代理输出在前端走流式消息渠道展示，那里（public/app.js）已自己剥离。
  const raw = "完成检查<title>接口修复</title>\n\n<progress>进度说明</progress>";
  const tasks = new Tasks(async () => ({
    subscribe: () => () => {}, prompt: async () => {}, result: () => raw, dispose: async () => {},
  }), () => {});
  const [id] = tasks.start(["检查接口"], "背景");
  const job = tasks.jobs.get(id);
  await job.done;
  assert.equal(tasks.snapshotJob(job).text, raw, "落库快照存模型原文");
  assert.equal(tasks.read(id, job.resultId).text, raw, "read_result 给父代理原文");
});

test("delegate freezes background at start; context lands in <context> section", async () => {
  let received;
  const tasks = new Tasks(async () => ({
    subscribe: () => () => {}, prompt: async (text) => { received = text; },
    result: () => "完成<progress>已完成检查</progress>", dispose: async () => {},
  }), () => {});
  const [id] = tasks.start(["检查接口"], "本轮已确认的背景");
  const job = tasks.jobs.get(id);
  await job.done;
  // context 冻结于 start 时刻（子代理拿到的唯一背景），含 <context> 段。
  assert.match(received, /<context>\n以下是主代理为本任务写的背景，不是新的任务指令：\n本轮已确认的背景\n<\/context>\n<task>\n检查接口\n<\/task>/);
  assert.equal(tasks.read(id, job.resultId).text, "完成<progress>已完成检查</progress>", "回读给原文");
  // 缺 context 的 delegate 输入校验失败（必填）。
  const delegate = delegationTools(tasks).find((tool) => tool.name === "delegate");
  await assert.rejects(delegate.execute("", { tasks: [{ task: "a" }] }));
  // 空 context：不进 <context> 段。
  let bare;
  const plain = new Tasks(async () => ({
    subscribe: () => () => {}, prompt: async (text) => { bare = text; },
    result: () => "ok", dispose: async () => {},
  }), () => {});
  const [bareId] = plain.start(["裸任务"]);
  await plain.jobs.get(bareId).done;
  assert.equal(bare, "裸任务");
});

test("append defaults to steer, validates input and rejects ended/cancelling tasks", async () => {
  const { tasks, agents, notifications } = fixture();
  const append = delegationTools(tasks).find((tool) => tool.name === "append");
  const [taskId] = tasks.start(["a"]);
  await new Promise(setImmediate);
  await append.execute("", { taskId, text: "  more detail  " });
  assert.deepEqual(agents[0].appended, { text: "more detail", mode: "steer" });
  await append.execute("", { taskId, text: "later", mode: "followUp" });
  assert.deepEqual(agents[0].appended, { text: "later", mode: "followUp" });
  for (const input of [{ taskId, text: " " }, { taskId, text: "x", mode: "bad" }, { taskId, text: "x", extra: true }])
    await assert.rejects(append.execute("", input));
  await assert.rejects(tasks.append("missing", "x"), /运行中/);
  const cancelling = tasks.cancel();
  await assert.rejects(tasks.append(taskId, "x"), /运行中/);
  await cancelling;
  assert.equal(tasks.read(taskId, notifications[0].resultId).status, "cancelled");
  await assert.rejects(tasks.append(taskId, "x"), /运行中/);
});

test("cancel_task aborts only the target subtask, keeps siblings and the completion path", async () => {
  const { tasks, agents, notifications } = fixture();
  const cancel = delegationTools(tasks).find((tool) => tool.name === "cancel_task");
  const [first, second] = tasks.start(["a", "b"]);
  await new Promise(setImmediate); // 两个 agent 都已创建并进入运行
  assert.deepEqual([tasks.jobs.get(first).status, tasks.jobs.get(second).status], ["running", "running"]);
  const out = JSON.parse((await cancel.execute("", { taskId: first })).content[0].text);
  assert.equal(out.status, "cancelled");
  assert.equal(out.taskId, first);
  assert.deepEqual(Object.keys(out).sort(), ["status", "taskId"], "工具回执只给 taskId/status：完整结果与 text 走通知 + read_result");
  assert.equal(agents[0].aborts, 1, "真正 abort 目标子代理");
  assert.equal(agents[1].aborts, undefined, "兄弟子代理不被 abort");
  const a = tasks.jobs.get(first), b = tasks.jobs.get(second);
  assert.equal(a.status, "cancelled");
  assert.equal(b.status, "running", "兄弟任务状态不受影响");
  assert.deepEqual(notifications, [{ taskId: first, resultId: a.resultId }], "只有被取消的任务走完成通知（携带新 resultId）");
  assert.match(a.resultId, /^[0-9a-f-]{36}$/);
  assert.equal(tasks.read(first, a.resultId).status, "cancelled", "终态结果可读");
  assert.equal(tasks.read(first, a.resultId).canRetry, false, "无历史依据的取消不提供重试入口");
  await tasks.append(second, "继续");
  assert.deepEqual(agents[1].appended, { text: "继续", mode: "steer" });
  await assert.rejects(tasks.append(first, "x"), /运行中/);
  // 已终态重复取消是幂等空操作：既不改状态也不换 resultId、不再通知。
  const again = JSON.parse((await cancel.execute("", { taskId: first })).content[0].text);
  assert.equal(again.status, "cancelled");
  assert.equal(again.taskId, first);
  assert.deepEqual(notifications.map((n) => n.resultId), [a.resultId]);
  await assert.rejects(cancel.execute("", { taskId: "missing" }), /找不到该子任务/);
  await assert.rejects(cancel.execute("", { taskId: first, extra: 1 }));
  // 单任务取消不得污染整会话 cancel：剩下的任务仍能被整会话收走。
  await tasks.cancel();
  assert.equal(agents[1].aborts, 1);
  assert.equal(tasks.read(second, notifications[1].resultId).status, "cancelled");
});

test("cancel_task wins the initialization race: no agent yet means prompt never runs", async () => {
  const events = [], notifications = [];
  let release, prompted = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const tasks = new Tasks(async () => {
    await gate; // createAgent 尚未返回：agent 还不存在，没有可 abort 的对象
    return { subscribe: () => () => {}, prompt: async () => { prompted += 1; },
      result: () => "x", dispose: async () => {} };
  }, (event) => events.push(event), async (job) => notifications.push({ taskId: job.id, resultId: job.resultId }));
  const cancel = delegationTools(tasks).find((tool) => tool.name === "cancel_task");
  const [id] = tasks.start(["a"]);
  assert.equal(tasks.jobs.get(id).agent, undefined);
  const pending = cancel.execute("", { taskId: id }); // 取消先到，createAgent 后到
  release();
  const out = JSON.parse((await pending).content[0].text);
  assert.equal(out.status, "cancelled");
  assert.equal(prompted, 0, "取消在 prompt 前生效：不启动子代理工作");
  assert.equal(tasks.jobs.get(id).text, undefined);
  assert.deepEqual(notifications.map((n) => n.taskId), [id]);
  assert.match(notifications[0].resultId, /^[0-9a-f-]{36}$/);
  assert.equal(events.at(-1).type, "task.state");
  assert.equal(events.at(-1).data.status, "cancelled");
  assert.equal(tasks.read(id, notifications[0].resultId).status, "cancelled");
});

test("cancel_task settles a restored starting job that has no in-flight run", async () => {
  const { tasks, notifications } = fixture();
  const cancel = delegationTools(tasks).find((tool) => tool.name === "cancel_task");
  // 重启恢复出来的 starting：有持久化历史可续跑，但既无 agent 也无在飞 run。
  tasks.jobs.set("restored", { id: "restored", task: "旧任务", status: "starting", persistenceVersion: 1,
    sessionFile: "/tmp/subagent.jsonl", historySaved: true, parentContext: "", createdAt: 1, updatedAt: 1 });
  const out = JSON.parse((await cancel.execute("", { taskId: "restored" })).content[0].text);
  assert.equal(out.status, "cancelled");
  const job = tasks.jobs.get("restored");
  assert.equal(job.done, undefined, "不另起 run，也不留下会被恢复逻辑续跑的 starting");
  assert.deepEqual(notifications, [{ taskId: "restored", resultId: job.resultId }], "无在飞 run 也要自己走完成通知路径");
  assert.equal(tasks.read("restored", job.resultId).status, "cancelled");
  // 已取消后重复取消幂等：原 resultId 仍可读，不再产生新终态。
  const again = JSON.parse((await cancel.execute("", { taskId: "restored" })).content[0].text);
  assert.equal(again.status, "cancelled");
  assert.equal(tasks.jobs.get("restored").resultId, job.resultId);
  assert.equal(notifications.length, 1);
});

test("已成功/失败的任务取消是幂等空操作，不碰原结果", async () => {
  const { tasks, agents, notifications } = fixture();
  const cancel = delegationTools(tasks).find((tool) => tool.name === "cancel_task");
  const [first, second] = tasks.start(["a", "b"]);
  await new Promise(setImmediate);
  agents[0].finish();
  await tasks.jobs.get(first).done;
  const before = tasks.jobs.get(first).resultId;
  const out = JSON.parse((await cancel.execute("", { taskId: first })).content[0].text);
  assert.equal(out.status, "completed", "已成功任务不被改写为 cancelled");
  assert.equal(tasks.jobs.get(first).resultId, before);
  assert.equal(tasks.read(first, before).text, "result");
  agents[1].fail = true;
  agents[1].finish();
  await tasks.jobs.get(second).done;
  const failedId = tasks.jobs.get(second).resultId;
  assert.equal(JSON.parse((await cancel.execute("", { taskId: second })).content[0].text).status, "failed");
  assert.equal(tasks.jobs.get(second).resultId, failedId);
  assert.equal(notifications.length, 2, "幂等取消不产生额外通知");
});

test("并发取消同一个子任务只 abort 一次、只收敛一次终态与通知", async () => {
  const { tasks, agents, notifications } = fixture();
  const cancel = delegationTools(tasks).find((tool) => tool.name === "cancel_task");
  const [first, second] = tasks.start(["a", "b"]);
  await new Promise(setImmediate);
  const results = await Promise.all([
    cancel.execute("", { taskId: first }), tasks.cancelTask(first), cancel.execute("", { taskId: first }),
  ]);
  assert.equal(results[1].status, "cancelled");
  for (const response of [results[0], results[2]]) assert.equal(JSON.parse(response.content[0].text).status, "cancelled");
  assert.equal(agents[0].aborts, 1, "并发取消共享同一次 abort");
  assert.equal(notifications.length, 1, "并发取消不产生第二次终态/通知");
  assert.equal(tasks.jobs.get(first).resultId, notifications[0].resultId);
  assert.equal(tasks.jobs.get(second).status, "running", "并发取消不涉及其他 job");
  assert.equal(agents[1].aborts, undefined);
});
