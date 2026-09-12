import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uninstall } from "../scripts/uninstall.mjs";

test("uninstall verifies target, stops, disables autostart, then removes only Axiom", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-uninstall-"));
  const root = join(dir, "@myworkbench", "axiom");
  await mkdir(root, { recursive: true });
  try {
    const calls = [];
    const execute = async (...args) => { calls.push(args); return dir; };
    await uninstall({ root, cwd: dir, execute, stop: async () => calls.push("stop"), disable: async () => calls.push("disable") });
    assert.match(JSON.stringify(calls[0]), /root/);
    assert.equal(calls[1], "stop");
    assert.equal(calls[2], "disable");
    assert.match(JSON.stringify(calls[3]), /uninstall.*-g.*@myworkbench\/axiom/);
    assert.equal(calls.length, 4);
    const busy = [];
    await assert.rejects(uninstall({ root, cwd: dir, execute: async () => dir,
      stop: async () => { throw new Error("busy"); }, disable: async () => busy.push("disabled") }), /busy/);
    assert.deepEqual(busy, []);
    await assert.rejects(uninstall({ root: dir, cwd: dir, execute: async () => dir,
      stop: async () => assert.fail("must not stop another instance") }), /拒绝卸载/);
    await assert.rejects(uninstall({ root, cwd: dir, execute: async () => dir,
      stop: async () => {}, disable: async () => { throw new Error("disable failed"); } }), /disable failed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
