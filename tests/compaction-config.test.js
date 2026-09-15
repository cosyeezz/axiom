import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, compactionDefaults } from "../src/protocol.js";
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
    await assert.rejects(sessions.configure(id, { model: "p/main", compaction: { ...config, thinking: "high" } }), /thinking/);
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
    assert.equal(restored.snapshot(id).messages[0].entryId, "m1");
    assert.deepEqual(restored.snapshot(id).config.compaction, config);
  } finally {
    await sessions.close();
    await restored?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("restored sessions pick up the latest default compaction; other selection survives restart", async () => {
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
    // 保存默认值即推给已加载会话：压缩配置是全局的，不再等重启才生效
    assert.deepEqual(sessions.snapshot(id).config.compaction, latest);
    restored = new Sessions(factory, defaultsPath, storagePath);
    await restored.loadDefaults();
    await restored.load();
    await restored.ensureLoaded(id);
    // 重启后：恢复会话同样用最新默认压缩配置，其余配置不变
    assert.deepEqual(restored.snapshot(id).config.compaction, latest);
    assert.equal(restored.snapshot(id).config.model, "p/main");
    assert.equal(restored.snapshot(id).config.thinking, "off");
    assert.equal(restored.snapshot(id).config.queueType, "steer");
  } finally {
    await sessions.close();
    await restored?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("删除目录配置后该目录已加载会话立即回落全局压缩配置，其他目录不受影响", async () => {
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
    // 删掉 a 的目录配置：a 的已加载会话立即回落全局压缩配置，其余配置与 b 的会话都不动
    await sessions.deleteDefaults(a);
    assert.deepEqual(sessions.snapshot(idA).config.compaction, globalCompaction);
    assert.equal(sessions.snapshot(idA).config.model, "p/a");
    assert.deepEqual(sessions.snapshot(idB).config.compaction, compactionB);
  } finally {
    await sessions.close();
    await rm(dir, { recursive: true, force: true });
  }
});
