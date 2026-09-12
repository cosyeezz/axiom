import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("CLI help and aliases exit without starting a service; invalid arguments fail", () => {
  for (const args of [["help"], ["--help"], ["-h"], ["unknown"], ["help", "extra"]]) {
    const result = spawnSync(process.execPath, ["scripts/service.mjs", ...args], {
      cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 5000,
      env: { ...process.env, AXIOM_PORT: "invalid" },
    });
    assert.equal(result.error, undefined);
    const valid = args.length === 1 && args[0] !== "unknown";
    assert.equal(result.status, valid ? 0 : 1, result.stderr);
    assert.match(valid ? result.stdout : result.stderr, /axiom.*help/);
    if (valid) {
      assert.match(result.stdout, /axiom stop/);
      assert.match(result.stdout, /axiom uninstall/);
      assert.match(result.stdout, /卸载保留 Pi/);
      assert.equal(result.stderr, "");
    }
  }
});
