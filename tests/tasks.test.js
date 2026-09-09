import test from "node:test";
import assert from "node:assert/strict";
import { Tasks } from "../src/tasks.js";
import { delegationTools } from "../src/tools.js";

function fixture() {
  const agents = [];
  const events = [];
  const tasks = new Tasks(
    async () => {
      let finish;
      const agent = {
        subscribe: () => () => {},
        prompt: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        result: () => {
          if (agent.fail) throw new Error("failed");
          return "result";
        },
        abort: async () => finish?.(),
        dispose: () => {
          agent.disposed = true;
        },
        finish: () => finish(),
      };
      agents.push(agent);
      return agent;
    },
    (event) => events.push(event),
  );
  return { tasks, agents, events };
}

test("delegate starts parallel work; read waits, preserves results and reports partial failure", async () => {
  const { tasks, agents } = fixture();
  const [delegate, read] = delegationTools(tasks);
  const response = await delegate.execute("", {
    tasks: [{ task: "a" }, { task: "b" }],
  });
  const { taskIds } = JSON.parse(response.content[0].text);
  assert.equal(agents.length, 2);
  assert.deepEqual(
    (await tasks.read(taskIds, false)).map((j) => j.status),
    ["running", "running"],
  );
  let done = false;
  const waiting = read.execute("", { taskIds }).then((value) => {
    done = true;
    return value;
  });
  agents[0].finish();
  await new Promise(setImmediate);
  assert.equal(done, false);
  agents[1].fail = true;
  agents[1].finish();
  const results = JSON.parse((await waiting).content[0].text);
  assert.deepEqual(
    results.map((j) => j.status),
    ["completed", "failed"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(await tasks.read(taskIds))),
    results,
  );
  assert(agents.every((a) => a.disposed));
  await assert.rejects(fixture().tasks.read(taskIds), /Unknown task/);
});

test("cancellation settles all children and interrupted reads do not cancel tasks", async () => {
  const { tasks, agents } = fixture();
  const ids = tasks.start(["a", "b"]);
  await new Promise(setImmediate);
  const controller = new AbortController();
  const reading = tasks.read(ids, true, controller.signal);
  controller.abort();
  await assert.rejects(reading);
  assert.equal((await tasks.read(ids, false))[0].status, "running");
  await tasks.cancel();
  assert.deepEqual(
    (await tasks.read(ids)).map((j) => j.status),
    ["cancelled", "cancelled"],
  );
  assert(agents.every((a) => a.disposed));
});
