import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compactionDefaults } from "../src/protocol.js";
import { Sessions } from "../src/sessions.js";

test("保存默认压缩配置直推已加载会话，不等重启；单会话失败不影响保存", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-compaction-push-"));
  const factory = () => {};
  factory.catalog = () => [{ key: "p/main", levels: ["off", "high"] }, { key: "p/summary", levels: ["off"] }];
  const sessions = new Sessions(factory, join(dir, "defaults.json"));
  const pushed = [];
  const fake = (id, model, fail = false) => {
    const item = {
      id, loaded: true, status: "idle", configuring: false,
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
    sessions.items.set("cold", { id: "cold", loaded: false, agent: null }); // 未加载：不碰
    const compaction = { ...compactionDefaults, enabled: true, model: "p/summary", tokenThreshold: 50000 };
    await sessions.configureDefaults(dir, { compaction });

    assert.equal(pushed.length, 1);
    assert.equal(pushed[0].id, "live");
    assert.equal(pushed[0].model, "p/main"); // configure 必须带原模型，不能隐式改模型
    assert.deepEqual(pushed[0].compaction, compaction);
    assert.deepEqual(sessions.getDefaults().compaction, compaction); // 单会话报错不回滚默认值

    // 不带 compaction 的保存不应骚扰已加载会话
    pushed.length = 0;
    await sessions.configureDefaults(dir, { thinking: "high" });
    assert.equal(pushed.length, 0);
  } finally {
    sessions.items.clear(); // 假会话不具备完整 remove 契约，本例只测推送循环
    await sessions.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("defaults persist in SQLite, restore after restart and serialize partial updates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-defaults-"));
  const path = join(dir, "defaults.json");
  const factory = () => {};
  factory.catalog = () => [{ key: "a/b" }];
  let restored;
  try {
    const sessions = new Sessions(factory, path);
    await sessions.loadDefaults();
    await Promise.all([
      sessions.configureDefaults(dir, { model: "a/b" }),
      sessions.configureDefaults(dir, { thinking: "high", subagentCapabilities: "inherit" }),
    ]);
    restored = new Sessions(factory, path);
    await restored.loadDefaults();
    assert.deepEqual(restored.getDefaults(), sessions.getDefaults());
    assert.equal(restored.getDefaults().model, "a/b");
    // 校验失败的保存不影响库与内存值
    await assert.rejects(sessions.configureDefaults(dir, { model: "missing" }));
    assert.equal(sessions.getDefaults().model, "a/b");
    // 库是权威：事后篡改/损坏遗留 JSON 文件不再影响读取（迁移完成后 JSON 非权威）
    await sessions.database.set("defaults", "defaults", { model: "a/b", thinking: "off" });
    assert.equal(restored.getDefaults().thinking, "high");
    await sessions.close();
  } finally {
    await restored?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
