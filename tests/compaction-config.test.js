import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, compactionDefaults, resolveCompaction } from "../src/protocol.js";
import { Sessions } from "../src/sessions.js";

test("compaction config validates OR thresholds and rejects unsafe/unsupported settings", () => {
  const base = { id: "1", type: "session.defaults.configure" };
  for (const patch of [{}, { enabled: true }, { enabled: true, tokenThreshold: null }, { enabled: true, percentThreshold: null }])
    assert(command.safeParse({ ...base, compaction: { ...compactionDefaults, ...patch } }).success);
  for (const patch of [
    { enabled: true, tokenThreshold: null, percentThreshold: null },
    { tokenThreshold: 0 }, { tokenThreshold: 1.5 }, { percentThreshold: 101 },
    { percentThreshold: -1 }, { keepRecentTokens: 0 }, { thinking: "invalid" }, { tools: ["bash"] },
  ]) assert.equal(command.safeParse({ ...base, compaction: { ...compactionDefaults, ...patch } }).success, false);
});

test("compaction adapts valid preferences without mutating defaults or accepting invalid input", () => {
  for (const [levels, expected] of [[["low", "high"], "low"], [["off"], "off"]]) {
    const input = { ...compactionDefaults, thinking: "max" };
    assert.equal(resolveCompaction(input, levels).thinking, expected);
    assert.equal(input.thinking, "max");
  }
  assert.equal(resolveCompaction(undefined, ["low", "high"]).thinking, "low");
  assert.equal(resolveCompaction({ ...compactionDefaults, thinking: "high" }, ["low", "high"]).thinking, "high");
  assert.throws(() => resolveCompaction({ ...compactionDefaults, thinking: "invalid" }, ["off"]));
  assert.throws(() => resolveCompaction(undefined, []), /没有可用/);
});

test("compaction settings, message IDs and successful records survive restart; failed config is atomic", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-compaction-"));
  const selections = [];
  const factory = async (_tools, selection) => {
    selections.push(selection);
    let config = { model: "p/main", thinking: "off", compaction: { ...compactionDefaults }, ...selection };
    delete config.memory;
    delete config.executionContext;
    delete config.shouldPause;
    return {
      config: () => config, configure: async (value) => (config = { ...config, ...value }),
      historyEntries: () => [{ id: "m1", type: "message", message: { role: "user", content: "old" } }],
      compactions: () => [],
      subscribe: () => () => {}, abort: async () => {}, dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "p/main", levels: ["off", "high"] }, { key: "p/summary", levels: ["off"] }];
  const defaultsPath = join(dir, "defaults.json");
  const storagePath = join(dir, "sessions");
  const sessions = new Sessions(factory, defaultsPath, storagePath);
  const config = { ...compactionDefaults, enabled: true, model: "p/summary", tokenThreshold: 50000 };
  let restored;
  try {
    await sessions.configureDefaults(dir, { compaction: config });
    const id = await sessions.create(dir);
    assert.deepEqual(selections[0].compaction, config);
    assert.equal(sessions.validateCompaction({ ...config, thinking: "high" }, "p/main").thinking, "off");
    await assert.rejects(sessions.configure(id, { model: "p/main", compaction: { ...config, thinking: "invalid" } }));
    assert.deepEqual(sessions.snapshot(id).config.compaction, config);
    await assert.rejects(sessions.configureDefaults(dir, { compaction: { ...config, model: "missing" } }), /compaction model/);
    const item = sessions.get(id);
    item.emit({ type: "agent.message.end", data: { entryId: "m1", message: { role: "user", content: "old" } } });
    const record = { id: "c1", summary: "summary", progress: { title: "确认配置", description: "验证压缩配置保存与恢复。" }, firstKeptEntryId: "m2", compactedMessageIds: ["m1"], tokensBefore: 50000, estimatedTokensAfter: 20000 };
    item.emit({ type: "agent.compaction", data: record });
    item.emit({ type: "agent.compaction", data: record });
    await item.saving;
    restored = new Sessions(factory, defaultsPath, storagePath);
    await restored.loadDefaults();
    await restored.load();
    await restored.ensureLoaded(id);
    assert.deepEqual((await restored.workspaceDefaults(dir)).compaction, config);
    assert.deepEqual(restored.snapshot(id).compactions, [record]);
    // 被摘要折叠的消息随快照下发精简版（带 compacted 标记）；完整原文点开摘要卡时按 compactionId 取。
    const lite = restored.snapshot(id).messages.find((entry) => entry.entryId === "m1");
    assert.equal(lite?.compacted, true);
    const segment = await restored.compactionMessages(id, "c1");
    assert.deepEqual(segment.messages.map((entry) => entry.entryId), ["m1"]);
    assert.deepEqual(restored.snapshot(id).config.compaction, config);
  } finally {
    await sessions.close();
    await restored?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("session compaction remains independent of later default changes and survives restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-compaction-"));
  const selections = [];
  const factory = async (_tools, selection) => {
    selections.push(selection);
    let config = { model: "p/main", thinking: "off", compaction: { ...compactionDefaults }, ...selection };
    delete config.memory;
    delete config.executionContext;
    delete config.shouldPause;
    return {
      config: () => config, configure: async (value) => (config = { ...config, ...value }),
      historyEntries: () => [], compactions: () => [],
      subscribe: () => () => {}, abort: async () => {}, dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "p/main", levels: ["off", "high"] }];
  const defaultsPath = join(dir, "defaults.json");
  const storagePath = join(dir, "sessions");
  const sessions = new Sessions(factory, defaultsPath, storagePath);
  const old = { ...compactionDefaults, enabled: true, tokenThreshold: 42000 };
  const latest = { ...compactionDefaults, enabled: true, tokenThreshold: 60000 };
  let restored;
  try {
    await sessions.configureDefaults(dir, { compaction: old });
    const id = await sessions.create(dir, { model: "p/main", thinking: "off" });
    await sessions.configureDefaults(dir, { compaction: latest });
    assert.deepEqual(sessions.snapshot(id).config.compaction, old, "默认值不覆盖当前会话");
    const next = await sessions.create(dir, { model: "p/main" });
    assert.deepEqual(sessions.snapshot(next).config.compaction, latest, "新会话采用最新默认值");
    restored = new Sessions(factory, defaultsPath, storagePath);
    await restored.loadDefaults();
    await restored.load();
    await restored.ensureLoaded(id);
    assert.deepEqual(restored.snapshot(id).config.compaction, old, "恢复后仍保留会话配置");
    assert.equal(restored.snapshot(id).config.model, "p/main");
    assert.equal(restored.snapshot(id).config.thinking, "off");
    assert.equal(restored.snapshot(id).config.queueType, "steer");
  } finally {
    await sessions.close();
    await restored?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("删除目录默认配置只影响新会话，不覆盖已有会话", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-compaction-"));
  const a = join(dir, "a"), b = join(dir, "b");
  await mkdir(a);
  await mkdir(b);
  const factory = async (_tools, selection) => {
    let config = { thinking: "off", compaction: { ...compactionDefaults }, ...selection };
    delete config.memory;
    delete config.executionContext;
    delete config.shouldPause;
    return {
      config: () => config, configure: async (value) => (config = { ...config, ...value }),
      historyEntries: () => [], compactions: () => [],
      subscribe: () => () => {}, abort: async () => {}, dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "p/global" }, { key: "p/a" }, { key: "p/b" }, { key: "p/summary" }];
  const sessions = new Sessions(factory, join(dir, "defaults.json"), join(dir, "sessions"));
  const globalCompaction = { ...compactionDefaults, enabled: true, model: "p/summary", tokenThreshold: 30000 };
  const compactionA = { ...compactionDefaults, enabled: true, tokenThreshold: 45000 };
  const compactionB = { ...compactionDefaults, enabled: true, tokenThreshold: 90000 };
  try {
    await sessions.configureDefaults(undefined, { model: "p/global", compaction: globalCompaction });
    await sessions.configureDefaults(a, { model: "p/a", compaction: compactionA });
    await sessions.configureDefaults(b, { model: "p/b", compaction: compactionB });
    const idA = await sessions.create(a), idB = await sessions.create(b);
    assert.deepEqual(sessions.snapshot(idA).config.compaction, compactionA);
    assert.deepEqual(sessions.snapshot(idB).config.compaction, compactionB);
    await sessions.deleteDefaults(a);
    assert.deepEqual(sessions.snapshot(idA).config.compaction, compactionA);
    const next = await sessions.create(a);
    assert.deepEqual(sessions.snapshot(next).config.compaction, globalCompaction);
    assert.equal(sessions.snapshot(idA).config.model, "p/a");
    assert.deepEqual(sessions.snapshot(idB).config.compaction, compactionB);
  } finally {
    await sessions.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("session.compaction.cancel：协议校验 + 未加载会话安全返回 + 透传到 agent", async () => {
  // 协议：sessionId 必填，runId 可选且有长度上限（前端可能带着陈旧 id 来）
  const base = { id: "1", type: "session.compaction.cancel" };
  assert.ok(command.safeParse({ ...base, sessionId: "s1" }).success);
  assert.ok(command.safeParse({ ...base, sessionId: "s1", runId: "run-1" }).success);
  for (const patch of [{}, { sessionId: "" }, { sessionId: "s1", runId: "" }, { sessionId: "s1", runId: "x".repeat(257) }, { sessionId: "s1", extra: 1 }])
    assert.equal(command.safeParse({ ...base, ...patch }).success, false);

  const dir = await mkdtemp(join(tmpdir(), "axiom-compaction-"));
  const calls = [];
  const factory = async (_tools, selection) => {
    let config = { model: "p/main", thinking: "off", compaction: { ...compactionDefaults }, ...selection };
    for (const key of ["memory", "executionContext", "shouldPause"]) delete config[key];
    return {
      config: () => config, configure: async (value) => (config = { ...config, ...value }),
      historyEntries: () => [], compactions: () => [],
      cancelCompaction: (runId) => { calls.push(runId); return { cancelled: true, reason: null, status: { status: "cancelled", runId, runs: [] } }; },
      subscribe: () => () => {}, abort: async () => {}, dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "p/main", levels: ["off"] }];
  const sessions = new Sessions(factory, join(dir, "defaults.json"), join(dir, "sessions"));
  try {
    const id = await sessions.create(dir);
    assert.deepEqual(await sessions.cancelCompaction(id, "run-1"), { cancelled: true, reason: null, status: { status: "cancelled", runId: "run-1", runs: [] } });
    assert.deepEqual(calls, ["run-1"]);
    // 懒加载会话还没起 agent：不报错，只说明没取消
    const idle = await sessions.create(dir);
    sessions.get(idle).loaded = false;
    sessions.get(idle).agent = null;
    assert.deepEqual(await sessions.cancelCompaction(idle, "run-9"), { cancelled: false, reason: "not-loaded", status: null });
  } finally {
    await sessions.close();
    await rm(dir, { recursive: true, force: true });
  }
});
