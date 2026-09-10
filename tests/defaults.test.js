import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

test("defaults persist atomically, restore after restart and serialize partial updates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-defaults-"));
  const path = join(dir, "defaults.json");
  const factory = () => {};
  factory.catalog = () => [{ key: "a/b" }];
  try {
    const sessions = new Sessions(factory, path);
    await sessions.loadDefaults();
    await Promise.all([
      sessions.configureDefaults(dir, { model: "a/b" }),
      sessions.configureDefaults(dir, { thinking: "high", subagentCapabilities: "inherit" }),
    ]);
    const restored = new Sessions(factory, path);
    await restored.loadDefaults();
    assert.deepEqual(restored.getDefaults(), sessions.getDefaults());
    assert.equal(restored.getDefaults().model, "a/b");
    const before = await readFile(path, "utf8");
    await assert.rejects(sessions.configureDefaults(dir, { model: "missing" }));
    assert.equal(await readFile(path, "utf8"), before);
    await writeFile(path, "broken json");
    await assert.rejects(restored.loadDefaults(), /读取失败/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
