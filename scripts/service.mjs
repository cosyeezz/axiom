#!/usr/bin/env node
import { fork, spawn } from "node:child_process";
import { mkdirSync, openSync, existsSync, realpathSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { npmSpec, commitFile, validateCommit } from "../src/update.js";

const root = fileURLToPath(new URL("..", import.meta.url));
let output = "inherit";
export function run(command, args, cwd = root, capture = false) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: capture ? ["ignore", "pipe", "pipe"] : output, windowsHide: true });
    let stdout = "", stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8").on("data", (text) => { stdout += text; });
      child.stderr.setEncoding("utf8").on("data", (text) => { stderr += text; });
    }
    child.once("error", fail);
    child.once("close", (code) => code === 0 ? done(stdout) : fail(new Error(`${command} exited ${code}${stderr ? `: ${stderr.trim()}` : ""}`)));
  });
}
// Windows 的 npm 是 .cmd 垫片，必须经 cmd 包装；参数仅用固定字面量和经过白名单校验的 SHA。AXIOM_NPM 可指定 npm 可执行文件（测试注入假 npm）
const npmRun = (execute, args, cwd = root, capture = false) => {
  const npm = process.env.AXIOM_NPM || "npm";
  return process.platform === "win32"
    ? execute(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `${npm} ${args.join(" ")}`], cwd, capture)
    : execute(npm, args, cwd, capture);
};
// 固定完整 SHA，避免同版本号/浮动分支导致 npm 复用旧包；成功后才记录提交。
export async function update(sha, execute = run, cwd = root) {
  sha = validateCommit(sha);
  const runningRoot = realpathSync(cwd);
  const verifyTarget = async () => {
    const globalRoot = (await npmRun(execute, ["root", "-g"], cwd, true)).trim();
    const target = join(globalRoot, "@myworkbench", "axiom");
    if (!globalRoot || !existsSync(target) || realpathSync(target) !== runningRoot)
      throw new Error(`npm 全局安装目录与当前服务不一致：目标 ${target}；当前 ${runningRoot}。请使用启动本服务的 Node/npm 环境更新。`);
  };
  await verifyTarget();
  await npmRun(execute, ["install", "-g", `${npmSpec}#${sha}`], cwd);
  await verifyTarget();
  await writeFile(join(cwd, commitFile), `${sha}\n`);
}

export async function rebuild(cwd = root, execute = run) {
  const modules = join(cwd, "node_modules"), backup = join(cwd, ".node_modules-backup");
  if (existsSync(backup)) throw new Error(`备份目录已存在，请检查后手动恢复：${backup}`);
  const saved = existsSync(modules);
  if (saved) await rename(modules, backup);
  const npm = (args) => npmRun(execute, args, cwd);
  try {
    await npm(["ci"]);
    await npm(["run", "build", "--if-present"]);
  } catch (error) {
    await rm(modules, { recursive: true, force: true });
    if (saved) await rename(backup, modules);
    throw error;
  }
  if (saved) await rm(backup, { recursive: true, force: true });
}

export async function supervise() {
  if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
  process.env.PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH || ""}`;
  const address = `http://127.0.0.1:${Number(process.env.AXIOM_PORT ?? 4319)}`;
  // 已有服务在跑就不起第二个守护进程（避免端口抢占与互相拉起）
  const alive = await fetch(`${address}/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);
  if (alive) { console.log(`服务已在运行：${address}`); return; }
  const logDir = process.env.AXIOM_HOME || join(homedir(), ".axiom");
  mkdirSync(logDir, { recursive: true });
  const log = openSync(join(logDir, "service.log"), "a");
  output = ["ignore", log, log];
  let child, restarting = false, stopping = false, failures = 0, startedAt = 0;
  const start = (error = "") => {
    if (stopping) return;
    startedAt = Date.now();
    child = fork(join(root, "src/main.js"), [], {
      cwd: root, env: { ...process.env, AXIOM_SERVICE_ERROR: error },
      stdio: ["ignore", log, log, "ipc"], windowsHide: true,
    });
    child.on("error", (error) => { console.error(error); process.exitCode = 1; });
    child.on("exit", (code) => {
      if (restarting) return;
      if (stopping) process.exit(code || 0);
      if (Date.now() - startedAt > 30000) failures = 0;
      const delay = Math.min(1000 * 2 ** failures++, 10000);
      console.error(`服务进程意外退出（code ${code ?? "signal"}），${delay}ms 后自动重启`);
      setTimeout(() => start(), delay);
    });
    child.on("message", (message) => {
      if (message?.type !== "service.restart" || !["quick", "rebuild", "update"].includes(message.mode) || restarting || stopping) return;
      restarting = true;
      // Allow the WebSocket acknowledgment to flush before closing the worker.
      setTimeout(async () => {
        try {
          // 更新先装后停；npm 原地安装非原子，失败后的重启是尽力恢复，不保证旧文件完整。
          if (message.mode === "update") {
            // ponytail: 只更新代码与依赖，监督进程自身仍是旧代码，子进程即刻生效；完全换血等下次登录自启
            try { await update(message.sha, run); }
            catch (cause) {
              console.error(`更新失败：${cause.message}`);
              // 重启旧服务以解除已接受更新时的 stopping 状态，并把失败原因带回页面。
              await stopChild();
              if (!stopping) start(`更新失败：${cause.message}`);
              return;
            }
          }
          await stopChild();
          let error = "";
          if (message.mode === "rebuild") {
            try { await rebuild(); }
            catch (cause) { error = `重建失败：${cause.message}`; console.error(error); }
          }
          if (!stopping) { failures = 0; start(error); }
        } catch (error) { console.error(error); process.exitCode = 1; }
        finally { restarting = false; }
      }, 150);
    });
  };
  function stopChild() {
    return new Promise((done, fail) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      // Do not force-kill: session persistence must finish before dependencies change.
      const timer = setTimeout(() => fail(new Error("服务停止超时；未执行安装，请检查 service.log")), 60000);
      child.once("exit", () => { clearTimeout(timer); done(); });
      child.send({ type: "service.stop" }, (error) => {
        if (error) { clearTimeout(timer); fail(error); }
      });
    });
  }
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    stopping = true;
    void stopChild().catch((error) => { console.error(error); process.exitCode = 1; });
  });
  start();
  console.log(`服务运行中：${address}（日志 ${join(logDir, "service.log")}，Ctrl+C 停止）`);
}
// npm 全局 bin 在类 Unix 系统是符号链接，argv[1] 需取 realpath 再比对
const invoked = (() => { try { return realpathSync(process.argv[1] ?? ""); } catch { return ""; } })();
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url))) supervise();
