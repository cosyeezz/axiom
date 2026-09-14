import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("CLI help and aliases exit without starting a service; invalid arguments fail", () => {
  for (const args of [["help"], ["--help"], ["-h"], ["unknown"], ["help", "extra"]]) {
    const result = spawnSync(process.execPath, ["scripts/service.mjs", ...args], {
      cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 60000,
      env: { ...process.env, AXIOM_PORT: "invalid" },
    });
    assert.equal(result.error, undefined);
    const valid = args.length === 1 && args[0] !== "unknown";
    assert.equal(result.status, valid ? 0 : 1, result.stderr);
    assert.match(valid ? result.stdout : result.stderr, /axiom.*help/);
    if (valid) {
      assert.match(result.stdout, /axiom stop/);
      assert.match(result.stdout, /axiom uninstall/);
      assert.match(result.stdout, /axiom --foreground/);
      assert.match(result.stdout, /卸载保留 Pi/);
      assert.equal(result.stderr, "");
    }
  }
});

const cli = (args, env = {}) =>
  spawnSync(process.execPath, ["scripts/service.mjs", ...args], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 60000,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });

test("--foreground 后跟多余参数按用法错误退出，不启动服务", () => {
  const result = cli(["--foreground", "extra"], { AXIOM_PORT: "invalid" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /用法：axiom/);
});

// axiom 无参数现在会后台启动：配置错误必须快速报错退出，绝不能因为读 stdin 而悬挂。
test("axiom 无参数时 AXIOM_PORT 非法就早报错退出，不派生进程也不等输入", () => {
  const result = cli([], { AXIOM_PORT: "invalid", AXIOM_HOME: join(tmpdir(), "axiom-cli-nostart") });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /AXIOM_PORT 无效/);
});
