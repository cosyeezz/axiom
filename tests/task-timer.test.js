import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

// 每轮至少 12ms，保证每个运行段的累计时长可观测。
const factory = async () => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {},
  prompt: () => new Promise((resolve) => setTimeout(resolve, 12)),
  result: () => "ok",
  abort: async () => {},
  dispose: async () => {},
});
factory.catalog = () => [{ key: "test/one" }];

const state = (sessions, id) => sessions.list().find((s) => s.id === id);
const settle = async (sessions, id) => {
  for (let i = 0; i < 200; i++) {
    const session = state(sessions, id);
    if (!session.runningSince) return session;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("任务未在预期时间内结束");
};

test("任务计时：执行中计时、停止后定格、再次执行继续累加并落盘", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-task-timer-"));
  try {
    const storage = join(root, "storage");
    const sessions = new Sessions(factory, undefined, storage);
    const id = await sessions.create(root);
    assert.deepEqual([state(sessions, id).elapsedMs, state(sessions, id).runningSince], [0, null]);

    await sessions.prompt(id, "first");
    assert.ok(state(sessions, id).runningSince > 0, "执行中应开始计时");
    const first = await settle(sessions, id);
    assert.ok(first.elapsedMs > 0, "停止后应定格累计用时");

    await sessions.prompt(id, "second");
    const second = await settle(sessions, id);
    assert.ok(second.elapsedMs > first.elapsedMs, "再次执行应继续累加，不清零");
    await sessions.close();

    const reloaded = new Sessions(factory, undefined, storage);
    await reloaded.load();
    assert.equal(state(reloaded, id).elapsedMs, second.elapsedMs, "累计用时随会话落盘并在恢复后保留");
    await reloaded.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
