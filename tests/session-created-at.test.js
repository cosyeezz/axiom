import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

const factory = async () => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {},
  prompt: async () => {},
  result: () => "ok",
  abort: async () => {},
  dispose: async () => {},
});
factory.catalog = () => [{ key: "test/one" }];

test("createdAt 稳定：重命名/发消息不变，落盘后恢复，老记录回退 updatedAt", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-created-at-"));
  try {
    const sessions = new Sessions(factory, undefined, join(root, "storage"));
    const id = await sessions.create(root);
    const created = sessions.list().find((s) => s.id === id).createdAt;
    assert.ok(Number.isFinite(created));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await sessions.rename(id, "renamed");
    await sessions.prompt(id, "hello");
    assert.equal(sessions.list().find((s) => s.id === id).createdAt, created);
    await sessions.close();

    // 落盘恢复：重启后 createdAt 不变。
    const reloaded = new Sessions(factory, undefined, join(root, "storage"));
    await reloaded.load();
    assert.equal(reloaded.list().find((s) => s.id === id).createdAt, created);

    // 老记录没有 createdAt，回退 updatedAt 兜底。
    const oldId = await reloaded.create(root, {}, { id: "old", title: "old", updatedAt: 12345, messages: [], selection: {} });
    assert.equal(reloaded.list().find((s) => s.id === oldId).createdAt, 12345);
    await reloaded.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
