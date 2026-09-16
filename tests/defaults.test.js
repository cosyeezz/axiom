import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compactionDefaults } from "../src/protocol.js";
import { Sessions } from "../src/sessions.js";

test("保存默认压缩配置只直推同一工作目录的已加载会话，不等重启；单会话失败不影响保存", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "axiom-compaction-push-")));
  const factory = () => {};
  factory.catalog = () => [{ key: "p/main", levels: ["off", "high"] }, { key: "p/summary", levels: ["off"] }];
  const sessions = new Sessions(factory, join(dir, "defaults.json"));
  const pushed = [];
  const fake = (id, model, fail = false, cwd = dir) => {
    const item = {
      id, cwd, loaded: true, status: "idle", configuring: false,
      agent: {
        config: () => ({ model }),
        abort: async () => {},
        dispose: async () => {},
        configure: async (value) => {
          if (fail) throw new Error("Unsupported compaction thinking level");
          pushed.push({ id, ...value });
          return value;
        },
      },
    };
    sessions.items.set(id, item);
    return item;
  };
  try {
    await sessions.loadDefaults();
    fake("live", "p/main");
    fake("broken", "p/main", true); // 模拟模型不支持新思考等级
    fake("elsewhere", "p/main", false, join(dir, "other")); // 其他工作目录
    sessions.items.set("cold", { id: "cold", cwd: dir, loaded: false, agent: null }); // 未加载：不碰
    const compaction = { ...compactionDefaults, enabled: true, model: "p/summary", tokenThreshold: 50000 };
    await sessions.configureDefaults(dir, { compaction });

    assert.equal(pushed.length, 1);
    assert.equal(pushed[0].id, "live");
    assert.equal(pushed[0].model, "p/main"); // configure 必须带原模型，不能隐式改模型
    assert.deepEqual(pushed[0].compaction, compaction);
    assert.deepEqual((await sessions.workspaceDefaults(dir)).compaction, compaction); // 单会话报错不回滚默认值

    // 不带 compaction 的保存不应骚扰已加载会话
    pushed.length = 0;
    await sessions.configureDefaults(dir, { thinking: "high" });
    assert.equal(pushed.length, 0);

    // 全局配置只推给没有目录配置的会话
    pushed.length = 0;
    await sessions.configureDefaults(undefined, { compaction });
    assert.deepEqual(pushed.map((entry) => entry.id), ["elsewhere"]);
  } finally {
    sessions.items.clear(); // 假会话不具备完整 remove 契约，本例只测推送循环
    await sessions.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("工作目录默认配置独立持久化：目录优先、全局兜底、可列出与删除回落", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-defaults-"));
  const path = join(dir, "defaults.json");
  const a = join(dir, "a"), b = join(dir, "b");
  await mkdir(a);
  await mkdir(b);
  const factory = () => {};
  factory.catalog = () => [{ key: "a/b" }];
  let sessions, restored, third;
  try {
    sessions = new Sessions(factory, path);
    await sessions.loadDefaults();
    // 不带 cwd = 全局兜底；带 cwd = 该目录独立配置
    await sessions.configureDefaults(undefined, { model: "a/b", thinking: "low" });
    assert.equal(sessions.getDefaults().thinking, "low");
    await sessions.configureDefaults(a, { model: "a/b", thinking: "high" });
    assert.deepEqual(sessions.listDefaults(), { workspaces: [await realpath(a)] });
    assert.equal((await sessions.workspaceDefaults(a)).thinking, "high");
    assert.equal((await sessions.workspaceDefaults(b)).thinking, "low", "未配置目录回落全局");
    assert.equal(sessions.getDefaults().thinking, "low", "目录保存不改全局");
    // 校验失败的保存不影响库与内存值
    await assert.rejects(sessions.configureDefaults(a, { model: "missing" }));
    assert.equal((await sessions.workspaceDefaults(a)).thinking, "high");
    assert.deepEqual(sessions.listDefaults(), { workspaces: [await realpath(a)] });
    await sessions.close();

    // 重启后：目录配置与全局兜底都还在
    restored = new Sessions(factory, path);
    await restored.loadDefaults();
    assert.equal(restored.getDefaults().thinking, "low");
    assert.equal((await restored.workspaceDefaults(a)).thinking, "high");
    assert.equal((await restored.workspaceDefaults(b)).thinking, "low");
    // 删除目录配置 → 该目录立即回落全局，且库里删干净（重启不复活）
    assert.deepEqual(await restored.deleteDefaults(a), { deleted: true, cwd: await realpath(a) });
    assert.equal((await restored.workspaceDefaults(a)).thinking, "low");
    assert.deepEqual(restored.listDefaults(), { workspaces: [] });
    await restored.close();

    third = new Sessions(factory, path);
    await third.loadDefaults();
    assert.deepEqual(third.listDefaults(), { workspaces: [] });
    assert.equal((await third.workspaceDefaults(a)).thinking, "low");
  } finally {
    await third?.close();
    await restored?.close();
    await sessions?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("目录模型配置互相隔离，删除目录配置后回落全局；落库失败不改内存", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-defaults-model-"));
  const path = join(dir, "defaults.json");
  const a = join(dir, "a"), b = join(dir, "b");
  await mkdir(a);
  await mkdir(b);
  const factory = async (_tools, selected) => {
    const { memory, executionContext, shouldPause, ...configuration } = selected;
    let config = { thinking: "off", ...configuration };
    return {
      config: () => config,
      configure: async (value) => (config = { ...config, ...value }),
      subscribe: () => () => {},
      prompt: async () => {},
      result: () => "ok",
      abort: async () => {},
      dispose: () => {},
    };
  };
  factory.catalog = () => [{ key: "p/global" }, { key: "p/a" }, { key: "p/b" }];
  let sessions, restored, third;
  try {
    sessions = new Sessions(factory, path);
    await sessions.loadDefaults();
    await sessions.configureDefaults(undefined, { model: "p/global" });
    await sessions.configureDefaults(a, { model: "p/a" });
    await sessions.configureDefaults(b, { model: "p/b" });
    // 各目录各用各的模型：新建会话按目录取，互不串用；目录保存不改全局
    assert.equal((await sessions.workspaceDefaults(a)).model, "p/a");
    assert.equal((await sessions.workspaceDefaults(b)).model, "p/b");
    assert.equal(sessions.getDefaults().model, "p/global", "目录保存不改全局");
    const inA = await sessions.create(a), inB = await sessions.create(b);
    assert.equal(sessions.snapshot(inA).config.model, "p/a");
    assert.equal(sessions.snapshot(inB).config.model, "p/b");

    // 落库失败：保存/删除都不改内存，也不丢原配置
    const { set, delete: removeKey } = sessions.database;
    sessions.database.set = () => { throw new Error("disk full"); };
    await assert.rejects(sessions.configureDefaults(a, { model: "p/global" }), /disk full/);
    assert.equal((await sessions.workspaceDefaults(a)).model, "p/a");
    sessions.database.set = set;
    sessions.database.delete = () => { throw new Error("disk full"); };
    await assert.rejects(sessions.deleteDefaults(a), /disk full/);
    assert.equal((await sessions.workspaceDefaults(a)).model, "p/a");
    assert.equal(sessions.listDefaults().workspaces.length, 2);
    sessions.database.delete = removeKey;
    await sessions.close();

    // 重启后目录配置与归属都还在
    restored = new Sessions(factory, path);
    await restored.loadDefaults();
    assert.equal((await restored.workspaceDefaults(a)).model, "p/a");
    assert.equal((await restored.workspaceDefaults(b)).model, "p/b");
    // 删除目录配置：只回落该目录，别的目录与全局不动
    assert.deepEqual(await restored.deleteDefaults(a), { deleted: true, cwd: await realpath(a) });
    assert.equal((await restored.workspaceDefaults(a)).model, "p/global");
    assert.equal((await restored.workspaceDefaults(b)).model, "p/b");
    assert.equal(restored.getDefaults().model, "p/global");
    assert.deepEqual(restored.listDefaults(), { workspaces: [await realpath(b)] });
    await restored.close();

    third = new Sessions(factory, path);
    await third.loadDefaults();
    assert.equal((await third.workspaceDefaults(a)).model, "p/global", "删除后重启不复活");
    assert.equal((await third.workspaceDefaults(b)).model, "p/b");
  } finally {
    await third?.close();
    await restored?.close();
    await sessions?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
