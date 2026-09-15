import test from "node:test";
import assert from "node:assert/strict";
import { Sessions } from "../src/sessions.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const until = async (check) => {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail("notification deadline exceeded");
};

test("cancel_task preserves siblings and delivers its persisted result after the parent settles", async () => {
  const mains = [], children = [];
  const factory = async (tools) => {
    let finish;
    const agent = {
      tools, calls: [], aborts: 0,
      config: () => ({ model: "test/model" }), subscribe: () => () => {},
      prompt(text) { this.calls.push(text); return new Promise((resolve) => { finish = resolve; }); },
      result: () => "done", dispose: async () => {}, finish: () => finish?.(),
      async abort() { this.aborts++; finish?.(); },
    };
    (tools.length ? mains : children).push(agent);
    return agent;
  };
  factory.catalog = () => [{ key: "test/model" }];
  const root = await mkdtemp(join(tmpdir(), "axiom-cancel-notify-"));
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    await sessions.prompt(id, "parent work");
    const [target, sibling] = item.tasks.start(["cancel me", "keep working"]);
    await until(() => children.length === 2 && children.every((child) => child.calls.length));
    const tool = mains[0].tools.find((tool) => tool.name === "cancel_task");
    assert.ok(tool, "the main agent receives the registered tool");
    await tool.execute("cancel-call", { taskId: target });
    assert.equal(children[0].aborts, 1);
    assert.equal(children[1].aborts, 0);
    assert.equal(mains[0].aborts, 0);
    assert.equal(item.tasks.jobs.get(sibling).status, "running");
    assert.equal(mains[0].calls.length, 1, "the cancellation tool does not await a new parent turn");
    const saved = sessions.store.getSession(id).tasks.find((job) => job.id === target);
    assert.equal(saved.status, "cancelled");
    assert.ok(saved.resultId);
    assert.equal(saved.notified, false);
    mains[0].finish();
    await until(() => mains[0].calls.length === 2);
    const notices = JSON.parse(mains[0].calls[1].split("\n").at(-1));
    assert.equal(notices.length, 1);
    assert.equal(notices[0].taskId, target);
    assert.equal(item.tasks.read(target, notices[0].resultId).status, "cancelled");
    mains[0].finish();
    await until(() => !item.notifying && item.status === "idle");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
