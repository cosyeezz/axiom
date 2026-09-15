import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const script = new URL("../docs/perf-long-conversation/profile-current-hotspots.mjs", import.meta.url);

// 从真实脚本源码里抠出判据实现来跑（不复制逻辑，脚本改了这里就跟着改）
function realCrossCheck() {
  const line = readFileSync(script, "utf8").split("\n").find((l) => l.startsWith("const crossCheckDurs"));
  assert.ok(line, "profile 脚本必须仍用 crossCheckDurs 做交叉核对");
  const context = {};
  vm.runInNewContext(`${line}\nthis.crossCheckDurs = crossCheckDurs;`, context);
  return context.crossCheckDurs;
}

test("cross-check compares durations order-independently and keeps caller arrays untouched", () => {
  const crossCheckDurs = realCrossCheck();
  // 页面按时间、trace 按时长降序：同样的任务集合换个顺序必须通过
  assert.equal(crossCheckDurs([120, 60, 80], [120, 80, 60]), true);
  assert.equal(crossCheckDurs([60], [60]), true);
  assert.equal(crossCheckDurs([60], [62]), true, "2ms 采样/取整误差在容差内");
  assert.equal(crossCheckDurs([], []), true);
  // 任一侧多一条：即使多出来的那条与已有值相近也必须失败
  assert.equal(crossCheckDurs([60, 80], [80, 60, 61]), false);
  assert.equal(crossCheckDurs([60, 61, 80], [80, 60]), false);
  // 数量相等但逐项差 > 2ms：必须失败
  assert.equal(crossCheckDurs([60], [63]), false);
  assert.equal(crossCheckDurs([60, 80], [60, 83]), false);
  assert.equal(crossCheckDurs([10, 20], [11, 23]), false);
  // 重复时长按「次数」计：不能折叠成集合，也不能让一条页面 longtask 被反复匹配
  assert.equal(crossCheckDurs([10, 10], [10]), false);
  assert.equal(crossCheckDurs([10, 20], [11, 11]), false, "trace 两条都只能匹配到同一条页面 longtask");
  assert.equal(crossCheckDurs([10, 10, 30], [11, 11, 31]), true);
  assert.equal(crossCheckDurs([10, 10, 30], [11, 30, 30]), false);
  // 排序只动副本：落盘的原始顺序不能被打乱
  const page = [120, 60, 80], trace = [120, 80, 60];
  crossCheckDurs(page, trace);
  assert.deepEqual(page, [120, 60, 80]);
  assert.deepEqual(trace, [120, 80, 60]);
});
test("profile report keeps mismatched evidence but returns failure", () => {
  const source = readFileSync(script, "utf8");
  const start = source.indexOf("  out.verification = ");
  const end = source.indexOf("\n} catch (error)", start);
  assert.ok(start >= 0 && end > start);
  for (const matched of [false, true]) {
    const written = [], logs = [];
    const context = {
      out: { summary: { crossCheckAllMatched: matched }, runs: { measured: [] } },
      fs: { mkdirSync() {}, writeFileSync: (...args) => written.push(args) },
      path: { dirname: () => "." }, OUT_JSON: "result.json", rawDir: "raw",
      process: {}, console: { log: (value) => logs.push(JSON.parse(value)) },
    };
    vm.runInNewContext(source.slice(start, end), context);
    assert.equal(context.out.verification.passed, matched);
    assert.equal(logs[0].ok, matched);
    assert.equal(context.process.exitCode, matched ? undefined : 1);
    assert.equal(written.length, 1, "failed cross-check remains available for diagnosis");
    assert.equal(written[0][2].flag, "wx");
  }
});
test("profile CLI refuses existing evidence and invalid runs before opening a database or browser", () => {
  const dir = mkdtempSync(join(tmpdir(), "axiom-profile-cli-"));
  try {
    const output = join(dir, "existing.json");
    writeFileSync(output, "original evidence");
    const args = [fileURLToPath(script), "--db", join(dir, "missing.db"), "--session", "test", "--playwright", "missing", "--json", output];
    for (const [extra, expected] of [[[], /refusing to overwrite/], [["--runs", "0"], /positive integer/]]) {
      const result = spawnSync(process.execPath, [...args, ...extra], { encoding: "utf8", timeout: 10000 });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
      assert.equal(readFileSync(output, "utf8"), "original evidence");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
