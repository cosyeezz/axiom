import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

test("draft snapshot precedes startup; concurrent loading starts once; empty drafts never persist", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-background-"));
  let ready, calls = 0;
  const gate = new Promise(resolve => { ready = resolve; });
  const factory = async () => {
    calls++;
    await gate;
    return { config: () => ({ model: "test/one", thinking: "off" }),
      subscribe: () => () => {}, dispose: async () => {}, abort: async () => {} };
  };
  factory.catalog = () => [{ key: "test/one" }];
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root, { model: "test/one" }, undefined, true);
    assert.equal(calls, 0);
    assert.equal(sessions.snapshot(id).config.model, "test/one");
    assert.equal(sessions.store.hasSession(id), false);
    const first = sessions.ensureLoaded(id), second = sessions.ensureLoaded(id);
    await new Promise(setImmediate);
    assert.equal(sessions.snapshot(id).sessionId, id);
    ready();
    assert.equal(await first, await second);
    assert.equal(calls, 1);
    assert.equal(sessions.store.hasSession(id), false);
    await sessions.persist(sessions.get(id));
    assert.equal(sessions.store.hasSession(id), false);
    await sessions.remove(id, false);
    assert.equal(sessions.store.hasSession(id), false);
  } finally { ready(); await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("first user event persists session, not empty configuration or rename", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-first-message-"));
  const factory = async () => ({ config: () => ({ model: "test/one" }),
    subscribe: () => () => {}, dispose: async () => {}, abort: async () => {} });
  factory.catalog = () => [{ key: "test/one" }];
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    await sessions.rename(id, "草稿");
    assert.equal(sessions.store.hasSession(id), false);
    const item = sessions.get(id);
    item.emit({ type: "agent.message.end", agentId: "main", data: {
      message: { role: "user", content: "第一条消息" }, entryId: "u1" } });
    await sessions.persist(item);
    assert.equal(sessions.store.hasSession(id), true);
    assert.equal(sessions.store.getSession(id).title, "草稿");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
