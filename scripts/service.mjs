#!/usr/bin/env node
import { fork, spawn } from "node:child_process";
import { mkdirSync, openSync, existsSync, realpathSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { createServer as createControlServer, createConnection } from "node:net";
import { createHash } from "node:crypto";
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
export const npmRun = (execute, args, cwd = root, capture = false) => {
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

export function controlPath(address, cwd = root) {
  const id = createHash("sha256").update(`${realpathSync(cwd)}:${new URL(address).port}`).digest("hex").slice(0, 24);
  return process.platform === "win32" ? `\\\\.\\pipe\\axiom-${id}` : join(tmpdir(), `axiom-${id}.sock`);
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
  let child, restartTimer, restarting = false, stopping = false, failures = 0, startedAt = 0;
  // 只在 worker 已退出时提供兜底停止；健康 worker 仍走 HTTP 的任务/保存检查。
  const socketPath = controlPath(address);
  const control = createControlServer((socket) => {
    socket.on("error", () => {});
    socket.setTimeout(5000, () => socket.destroy());
    socket.once("data", (data) => {
      if (data.toString() !== "stop\n") { socket.destroy(); return; }
      if (restarting || (child && child.exitCode === null && child.signalCode === null)) {
        socket.end(JSON.stringify({ error: "服务进程仍在运行或重启，请等待就绪后重试；未强制终止任务。" }));
        return;
      }
      stopping = true;
      clearTimeout(restartTimer);
      socket.end(JSON.stringify({ service: "axiom", pid: process.pid }), () => {
        control.close(() => process.exit(0));
      });
    });
  });
  if (process.platform !== "win32" && existsSync(socketPath)) {
    const active = await new Promise((resolve, reject) => {
      const probe = createConnection(socketPath);
      probe.on("connect", () => { probe.destroy(); resolve(true); });
      probe.on("error", (error) => error.code === "ECONNREFUSED" ? resolve(false) : reject(error));
    });
    if (active) throw new Error("当前安装已有守护进程运行");
    await rm(socketPath, { force: true });
  }
  await new Promise((resolve, reject) => {
    control.once("error", reject);
    control.listen(socketPath, resolve);
  });
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
      if (stopping) { control.close(() => process.exit(code || 0)); return; }
      if (Date.now() - startedAt > 30000) failures = 0;
      const delay = Math.min(1000 * 2 ** failures++, 10000);
      console.error(`服务进程意外退出（code ${code ?? "signal"}），${delay}ms 后自动重启`);
      restartTimer = setTimeout(() => start(), delay);
    });
    child.on("message", (message) => {
      if (message?.type === "service.shutdown" && !stopping && !restarting) {
        stopping = true;
        void stopChild().catch((error) => { console.error(error); process.exitCode = 1; });
        return;
      }
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
    clearTimeout(restartTimer);
    void stopChild().then(() => control.close(() => process.exit(0))).catch((error) => { console.error(error); process.exitCode = 1; });
  });
  start();
  console.log(`服务运行中：${address}（日志 ${join(logDir, "service.log")}，Ctrl+C 停止）`);
}
// npm 全局 bin 在类 Unix 系统是符号链接，argv[1] 需取 realpath 再比对
const invoked = (() => { try { return realpathSync(process.argv[1] ?? ""); } catch { return ""; } })();
export async function stopService(address = `http://127.0.0.1:${Number(process.env.AXIOM_PORT ?? 4319)}`) {
  let response;
  let status;
  try {
    response = await fetch(`${address}/service/stop`, { method: "POST", signal: AbortSignal.timeout(5000) });
  } catch {
    status = await new Promise((resolve, reject) => {
      const socket = createConnection(controlPath(address));
      socket.on("connect", () => socket.write("stop\n"));
      let text = "";
      socket.setTimeout(5000, () => socket.destroy(new Error("守护进程响应超时")));
      socket.on("data", (data) => { text += data; });
      socket.on("error", (error) => {
        if (["ENOENT", "ECONNREFUSED"].includes(error.code)) resolve(null);
        else reject(error);
      });
      socket.on("end", () => { try { resolve(JSON.parse(text)); } catch { reject(new Error("守护进程响应无效")); } });
    });
    if (!status) { console.log("服务未运行（未发现当前安装版的守护进程）。"); return; }
    if (status.error) throw new Error(status.error);
  }
  if (response) {
    const text = await response.text();
    if (!response.ok) throw new Error(`停止失败：${text || response.status}（旧版本需先升级并完整重启一次）`);
    status = JSON.parse(text);
  }
  if (status.service !== "axiom" || !Number.isInteger(status.pid) || status.pid <= 0)
    throw new Error("停止响应无效，无法确认守护进程状态");
  const deadline = Date.now() + 65000;
  while (true) {
    try { process.kill(status.pid, 0); }
    catch (error) { if (error.code === "ESRCH") break; throw error; }
    if (Date.now() >= deadline) throw new Error("停止超时；未强杀进程，请查看 service.log");
    await new Promise((done) => setTimeout(done, 200));
  }
  console.log("服务与守护进程已退出；保存异常请查看 service.log。");
}
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url))) {
  const [command, ...extra] = process.argv.slice(2);
  if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
  if (extra.length || (command && !["stop", "uninstall"].includes(command))) {
    console.error("用法：axiom [stop|uninstall]"); process.exitCode = 1;
  } else {
    await (command === "uninstall" ? import("./uninstall.mjs").then((m) => m.uninstall()) : command === "stop" ? stopService() : supervise()).catch((error) => {
      console.error(error.message); process.exitCode = 1;
    });
  }
}
