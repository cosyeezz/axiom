import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRepairConfig, saveRepairConfig, readRepairConfig, preparePiRepair, runPiRepair, recordPiRepair, runPiProcess } from "../scripts/pi-repair.mjs";
const config = { provider: "openai", model: "custom/model", thinking: "high" };
test("Pi 修复配置严格校验且持久保存", async () => {
  for (const bad of [null, [], { ...config, extra: true }, { ...config, model: "x & echo bad" }, { ...config, thinking: "invalid" }])
    assert.throws(() => validateRepairConfig(bad));
  const home = await mkdtemp(join(tmpdir(), "repair-config-"));
  try {
    assert.equal(await readRepairConfig(home), null);
    await saveRepairConfig(home, config);
    assert.deepEqual(await readRepairConfig(home), config);
  } finally { await rm(home, { recursive: true, force: true }); }
});
test("独立 Pi 路径、提示词初始化、参数传递及真实核验记录", async () => {
  const dir = await mkdtemp(join(tmpdir(), "repair-run-"));
  const root = join(dir, "install"), home = join(dir, "home"), npmRoot = join(dir, "global");
  try {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs/service-repair-prompt.md"), "# 常见故障\n不要删除数据库\n");
    await assert.rejects(preparePiRepair({ root, home, npmRoot, config }), /全局 Pi/);
    const entry = join(npmRoot, "@earendil-works/pi-coding-agent/dist/cli.js");
    await mkdir(join(npmRoot, "@earendil-works/pi-coding-agent/dist"), { recursive: true });
    await writeFile(entry, "");
    const prepared = await preparePiRepair({ root, home, npmRoot, config });
    const report = await runPiRepair(prepared, { root, log: "MODULE_NOT_FOUND", execute: async (path, args, options) => {
      assert.equal(path, entry);
      assert.equal(options.cwd, root);
      assert.match(options.input, /不要删除数据库/);
      assert.match(options.input, /MODULE_NOT_FOUND/);
      assert.equal(args[args.indexOf("--provider") + 1], "openai");
      assert.equal(args[args.indexOf("--model") + 1], "custom/model");
      assert.equal(args[args.indexOf("--thinking") + 1], "high");
      assert.ok(args.includes("--no-context-files"));
      return "验证导入通过，secret-token";
    } });
    await recordPiRepair(prepared.memory, { operationId: "test", ready: false, report, error: "实例未就绪", redactions: [["secret-token", "***"]] });
    const saved = await readFile(prepared.memory, "utf8");
    assert.match(saved, /未确认恢复成功/);
    assert.doesNotMatch(saved, /secret-token/);
    await preparePiRepair({ root, home, npmRoot, config });
    assert.equal(await readFile(prepared.memory, "utf8"), saved, "不会覆盖历史经验");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("真实独立子进程：stdin 提示词、日志和非零退出", async () => {
  const dir = await mkdtemp(join(tmpdir(), "repair-process-"));
  try {
    const entry = join(dir, "fake.mjs");
    await writeFile(entry, "let text=''; for await (const part of process.stdin) text+=part; console.log(text); process.exitCode=Number(process.argv[2] || 0);\n");
    assert.match(await runPiProcess(entry, [], { cwd: dir, input: "诊断数据" }), /诊断数据/);
    await assert.rejects(runPiProcess(entry, ["2"], { cwd: dir, input: "失败" }), /退出码 2/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
