import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

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
