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
      abort: async () => finish?.(),
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
  const response = await delegate.execute("", { tasks: [{ task: "a" }, { task: "b" }] });
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
