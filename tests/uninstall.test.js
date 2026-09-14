import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { npmRun } from "../scripts/service.mjs";
import { spawnSync } from "node:child_process";
import { uninstall } from "../scripts/uninstall.mjs";

test("uninstall verifies target, stops, disables autostart, then removes only Axiom", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-uninstall-"));
  const root = join(dir, "@cosyeezz", "axiom");
  await mkdir(root, { recursive: true });
  try {
    const calls = [];
    const execute = async (...args) => { calls.push(args); return dir; };
    await uninstall({ npm: npmRun, root, cwd: dir, execute, stop: async () => calls.push("stop"), disable: async () => calls.push("disable") });
    assert.match(JSON.stringify(calls[0]), /root/);
    assert.equal(calls[1], "stop");
    assert.equal(calls[2], "disable");
    assert.match(JSON.stringify(calls[3]), /uninstall.*-g.*@cosyeezz\/axiom/);
    assert.equal(calls.length, 4);
    const busy = [];
    await assert.rejects(uninstall({ npm: npmRun, root, cwd: dir, execute: async () => dir,
      stop: async () => { throw new Error("busy"); }, disable: async () => busy.push("disabled") }), /busy/);
    assert.deepEqual(busy, []);
    await assert.rejects(uninstall({ npm: npmRun, root: dir, cwd: dir, execute: async () => dir,
      stop: async () => assert.fail("must not stop another instance") }), /拒绝卸载/);
    await assert.rejects(uninstall({ npm: npmRun, root, cwd: dir, execute: async () => dir,
      stop: async () => {}, disable: async () => { throw new Error("disable failed"); } }), /disable failed/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// 真实 CLI 入口；无效 npm 保证不触碰全局安装、自启或用户数据。
test("uninstall CLI reaches npm instead of deadlocking module evaluation", () => {
  const result = spawnSync(process.execPath, ["scripts/service.mjs", "uninstall"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 60000,
    env: { ...process.env, AXIOM_NPM: "axiom-test-npm-does-not-exist" },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /unsettled top-level await/);
  assert.match(result.stderr, /axiom-test-npm-does-not-exist|cmd.exe/i);
});
