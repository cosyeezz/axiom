import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

function factoryFixture() {
  const mains = [], children = [];
  const factory = async (tools) => {
    let finish;
    const agent = {
      calls: [], config: () => ({ model: "test/model" }),
      subscribe: () => () => {},
      prompt(text) { this.calls.push(text); return new Promise((resolve) => { finish = resolve; }); },
      enqueue() { throw new Error("system notifications must not enter withdrawable queues"); },
      result: () => "done", dispose: async () => {},
      finish: () => finish?.(), abort: async () => finish?.(),
    };
    (tools.length ? mains : children).push(agent);
    return agent;
  };
  factory.catalog = () => [{ key: "test/model" }];
  return { factory, mains, children };
}
const tick = () => new Promise(setImmediate);
async function until(check) {
  for (let i = 0; i < 500; i++) { if (check()) return; await new Promise((resolve) => setTimeout(resolve, 2)); }
  assert.fail("notification deadline exceeded");
}

test("completion is persisted, batched after parent settles, and credentials survive reload", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-notify-"));
  const { factory, mains, children } = factoryFixture();
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  let restored;
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    await sessions.prompt(id, "parent work");
    const ids = item.tasks.start(["a", "b"]);
    await tick();
    children.forEach((agent) => agent.finish());
    await Promise.all(ids.map((id) => item.tasks.jobs.get(id).done));
    await tick();
    assert.equal(mains[0].calls.length, 1, "running parent is not interrupted");
    const disk = JSON.parse(await readFile(join(item.storageDir, `${id}.json`), "utf8"));
    assert(disk.tasks.every((job) => job.resultId && !job.notified));
    mains[0].finish();
    await until(() => mains[0].calls.length === 2);
    const notices = JSON.parse(mains[0].calls[1].split("\n").at(-1));
    assert.equal(notices.length, 2);
    for (const notice of notices) assert.equal(item.tasks.read(notice.taskId, notice.resultId).text, "done");
    mains[0].finish();
    await until(() => !item.notifying && item.status === "idle");
    await tick();
    assert.equal(mains[0].calls.length, 2, "no notification polling loop");
    await sessions.close();
    const next = factoryFixture();
    restored = new Sessions(next.factory, undefined, join(root, "storage"));
    await restored.load();
    await tick();
    assert.equal(next.mains[0].calls.length, 0, "delivered notifications do not replay");
    assert.equal(restored.get(id).tasks.read(notices[0].taskId, notices[0].resultId).text, "done");
  } finally { await restored?.close(); await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("idle completion wakes parent; cancel suppresses wakeups until next user prompt", async () => {
  const { factory, mains, children } = factoryFixture();
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    const item = sessions.get(id);
    item.tasks.start(["a"]);
    await tick(); children[0].finish();
    await until(() => mains[0].calls.length === 1);
    assert.match(mains[0].calls[0], /resultId/);
    mains[0].finish();
    await until(() => !item.notifying && item.status === "idle");
    item.tasks.start(["b"]);
    await tick();
    await sessions.cancel(id);
    await tick();
    assert.equal(mains[0].calls.length, 1);
    await sessions.prompt(id, "continue");
    mains[0].finish();
    await until(() => mains[0].calls.length === 3);
    mains[0].finish();
    await until(() => !item.notifying && item.status === "idle");
  } finally { await sessions.close(); }
});

test("undelivered persisted notification replays on restart; save failure never triggers parent", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-notify-replay-"));
  const first = factoryFixture();
  const sessions = new Sessions(first.factory, undefined, join(root, "storage"));
  let restored;
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    await sessions.prompt(id, "busy");
    const [taskId] = item.tasks.start(["child"]);
    await tick(); first.children[0].finish();
    await item.tasks.jobs.get(taskId).done;
    await sessions.close();
    const file = join(item.storageDir, `${id}.json`);
    const saved = JSON.parse(await readFile(file, "utf8"));
    saved.tasks.push({ id: "legacy-running", task: "old task", status: "running" });
    await writeFile(file, JSON.stringify(saved));
    const next = factoryFixture();
    restored = new Sessions(next.factory, undefined, join(root, "storage"));
    await restored.load();
    await until(() => next.mains[0].calls.length === 1);
    const legacy = restored.get(id).tasks.jobs.get("legacy-running");
    assert.equal(restored.get(id).tasks.read(legacy.id, legacy.resultId).status, "cancelled");
    assert.match(next.mains[0].calls[0], /resultId/);
    await restored.cancel(id);
    await until(() => !restored.get(id).notifying);
    assert.equal(restored.get(id).tasks.jobs.get(taskId).notified, false, "cancelled notification run is not acknowledged");
    const record = restored.get(id);
    record.notificationsPaused = false;
    record.tasks.jobs.get(taskId).notified = false;
    restored.persist = async () => { throw new Error("disk full"); };
    await assert.rejects(restored.deliverTaskNotifications(record), /disk full/);
    assert.equal(next.mains[0].calls.length, 1);
    restored.persist = Sessions.prototype.persist;
  } finally { await restored?.close(); await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
