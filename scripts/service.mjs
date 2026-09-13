#!/usr/bin/env node
import { fork, spawn } from "node:child_process";
import { mkdirSync, openSync, existsSync, realpathSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { createServer as createControlServer, createConnection } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { dirname, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "../src/database.js";
import { npmSpec, commitFile, validateCommit } from "../src/update.js";
import { createMaintState, sanitize } from "./maint-state.mjs";
import { startMaintServer } from "./maint-server.mjs";

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
// 安装实例标签：安装根 realpath + 端口。控制管道与维护状态存储键共用，
// 保证同一安装（同 root+port）只有一份状态，不同安装/端口（如旧 dev 守护）互不混写。
export function installTag(address, cwd = root) {
  return createHash("sha256").update(`${realpathSync(cwd)}:${new URL(address).port}`).digest("hex").slice(0, 24);
}
export function controlPath(address, cwd = root) {
  const id = installTag(address, cwd);
  return process.platform === "win32" ? `\\\\.\\pipe\\axiom-${id}` : join(tmpdir(), `axiom-${id}.sock`);
}
// 提交校验读 stage/package-lock.json 的 resolved（git 依赖恒带 40hex 提交，npm 9–11 都写）；
// npm≤10 的 _resolved 仅作旧包回退。两者都拿不到则显式失败，不猜。
const stagedSha = async (stage) => {
  const read = (path, pick) =>
    readFile(path, "utf8")
      .then((text) => pick(JSON.parse(text))?.match(/#([0-9a-f]{40})$/i)?.[1]?.toLowerCase())
      .catch(() => undefined);
  return (await read(join(stage, "package-lock.json"),
    (lock) => lock.packages?.["node_modules/@cosyeezz/axiom"]?.resolved))
    ?? (await read(join(stage, "node_modules", "@cosyeezz", "axiom", "package.json"), (pkg) => pkg._resolved));
};
// 关键 SDK 必须真的可加载：换入前在暂存目录内 import 验证，防“装完但启动即挂”。
async function verifySdkImport(dir, execute, entry = "verify-import.mjs") {
  await writeFile(join(dir, entry), "await import('@earendil-works/pi-coding-agent');\n");
  await execute(process.execPath, [entry], dir);
}

// update 三段式：prepare 在服务仍在时把目标提交装进独立暂存目录并双重校验（提交 SHA + SDK 导入），
// 完全不碰在用安装；swap 必须在 worker 停止后执行（备份旧包 → 载入 staged 包与依赖）；
// commit 只在新实例 ready 后执行（写 commit 记录、删备份）。ready 失败 → rollback 旧包原样拉起。
// 所有依赖随包私有部署，不覆盖全局共享依赖；旧包与其依赖一同备份。
export async function prepareUpdate(sha, execute = run, cwd = root) {
  sha = validateCommit(sha);
  const globalRoot = (await npmRun(execute, ["root", "-g"], cwd, true)).trim();
  const target = join(globalRoot, "@cosyeezz", "axiom");
  if (!globalRoot || !existsSync(target) || realpathSync(target) !== realpathSync(cwd))
    throw new Error(`npm 全局安装目录与当前服务不一致：目标 ${target}；当前 ${realpathSync(cwd)}。请使用启动本服务的 Node/npm 环境更新。`);
  const stage = join(cwd, "..", `.axiom-update-${process.pid}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await writeFile(join(stage, "package.json"), JSON.stringify({ dependencies: { "@cosyeezz/axiom": `${npmSpec}#${sha}` } }));
  await npmRun(execute, ["install", `${npmSpec}#${sha}`], stage);
  const staged = join(stage, "node_modules", "@cosyeezz", "axiom");
  const installed = await stagedSha(stage);
  if (installed !== sha)
    throw new Error(`安装校验失败：期望 ${sha.slice(0, 7)}，实际 ${installed ? installed.slice(0, 7) : "未知提交"}`);
  await verifySdkImport(staged, execute);
  return stage;
}
export async function swapUpdate(stage, cwd = root, execute = run) {
  const globalRoot = (await npmRun(execute, ["root", "-g"], cwd, true)).trim();
  const parent = join(globalRoot, "@cosyeezz");
  const target = join(parent, "axiom");
  if (!globalRoot || !existsSync(target) || realpathSync(target) !== realpathSync(cwd))
    throw new Error("切换前全局安装目录校验失败，未更改安装");
  // 备份/暂存一律放包目录之外（父目录）：包目录自身要被 rename，内部路径会导致 EBUSY/自嵌套。
  const backup = join(cwd, "..", ".axiom-package-backup");
  if (existsSync(backup)) throw new Error(`备份目录已存在，请检查后手动恢复：${backup}`);
  // 完整包先复制到同卷暂存名，再原子 rename 成包目录；Windows 下目录被占用时 rename 显式失败（worker 已停，若仍被外物占用则明确报错而非覆盖一半）。
  // 注意与 prepareUpdate 的 stage（.axiom-update-<pid>）区分开，否则上方 rm 会误删整个 stage。
  const incoming = join(parent, `.axiom-incoming-${process.pid}`);
  await rm(incoming, { recursive: true, force: true });
  await cp(join(stage, "node_modules", "@cosyeezz", "axiom"), incoming, { recursive: true });
  // npm 本地安装会提升依赖到 stage/node_modules；归入新包的私有 node_modules，回滚才能完整。
  for (const entry of await readdir(join(stage, "node_modules"), { withFileTypes: true })) {
    if (entry.name === "@cosyeezz" || entry.name === ".bin" || entry.name === ".package-lock.json") continue;
    await cp(join(stage, "node_modules", entry.name), join(incoming, "node_modules", entry.name), { recursive: true });
  }
  await verifySdkImport(incoming, execute);
  const hadPackage = existsSync(target);
  if (hadPackage) await rename(target, backup);
  try {
    await rename(incoming, target);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    if (hadPackage) await rename(backup, target);
    throw error;
  }
}
export async function commitUpdate(stage, cwd = root) {
  const sha = validateCommit(await stagedSha(stage));
  await writeFile(join(cwd, commitFile), `${sha}\n`);
  await rm(join(cwd, "..", ".axiom-package-backup"), { recursive: true, force: true });
  await rm(stage, { recursive: true, force: true });
}
export async function rollbackUpdate(cwd = root, execute = run) {
  const globalRoot = (await npmRun(execute, ["root", "-g"], cwd, true)).trim();
  const target = join(globalRoot, "@cosyeezz", "axiom"), backup = join(cwd, "..", ".axiom-package-backup");
  if (!existsSync(backup)) throw new Error("无备份可回滚");
  await rm(target, { recursive: true, force: true });
  await rename(backup, target);
}
// 兼容导出：一次性完成三段（供不需要围绕停服窗口编排的调用方）。
export async function update(sha, execute = run, cwd = root) {
  const stage = await prepareUpdate(sha, execute, cwd);
  await swapUpdate(stage, cwd, execute);
  await commitUpdate(stage, cwd);
}

// rebuild 三段式：prepare 在服务仍在时把依赖装进独立暂存目录并验证 SDK（不碰在用 node_modules）；
// swap 在 worker 停止后换入；build 由调用方在 swap 后执行；commit 在新实例 ready 后删备份。
export async function prepareRebuild(cwd = root, execute = run) {
  const stage = join(cwd, `.axiom-stage-${process.pid}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await writeFile(join(stage, "package.json"), await readFile(join(cwd, "package.json")));
  await writeFile(join(stage, "package-lock.json"), await readFile(join(cwd, "package-lock.json")));
  await npmRun(execute, ["ci"], stage);
  await verifySdkImport(stage, execute);
  return stage;
}
export async function swapRebuild(stage, cwd = root) {
  const modules = join(cwd, "node_modules"), backup = join(cwd, ".node_modules-backup");
  if (existsSync(backup)) throw new Error(`备份目录已存在，请检查后手动恢复：${backup}`);
  const saved = existsSync(modules);
  if (saved) await rename(modules, backup);
  try { await rename(join(stage, "node_modules"), modules); }
  catch (error) {
    if (saved) await rename(backup, modules);
    throw error;
  }
}
export async function commitRebuild(stage, cwd = root) {
  await rm(join(cwd, ".node_modules-backup"), { recursive: true, force: true });
  await rm(stage, { recursive: true, force: true });
}
export async function rollbackRebuild(cwd = root) {
  const modules = join(cwd, "node_modules"), backup = join(cwd, ".node_modules-backup");
  if (!existsSync(backup)) throw new Error("无备份可回滚");
  await rm(modules, { recursive: true, force: true });
  await rename(backup, modules);
}
export async function rebuild(cwd = root, execute = run) {
  const stage = await prepareRebuild(cwd, execute);
  await swapRebuild(stage, cwd);
  try { await npmRun(execute, ["run", "build", "--if-present"], cwd); }
  catch (error) { await rollbackRebuild(cwd); throw error; }
  await commitRebuild(stage, cwd);
}

const READY_TIMEOUT_MS = Number(process.env.AXIOM_READY_TIMEOUT_MS ?? 60000);

export async function supervise() {
  if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
  process.env.PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH || ""}`;
  const port = Number(process.env.AXIOM_PORT ?? 4319);
  const address = `http://127.0.0.1:${port}`;
  // 已有服务在跑就不起第二个守护进程（避免端口抢占与互相拉起）
  const alive = await fetch(`${address}/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);
  if (alive) { console.log(`服务已在运行：${address}`); return; }
  const logDir = process.env.AXIOM_HOME || join(homedir(), ".axiom");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "service.log");
  const log = openSync(logPath, "a");
  output = ["ignore", log, log];
  const workerLog = createWriteStream(logPath, { flags: "a" });
  const token = randomBytes(32).toString("hex");
  // 维护状态入 SQLite（与业务共用 AXIOM_HOME/axiom.db），按安装实例（root+port 哈希，与控制管道同源）
  // 以 key 隔离：并存的旧 dev 守护与当前守护各写各的，绝不共享状态。
  // 旧 service-state JSON 仅首次启动读一次作迁移源（保留不删，数据库此后是唯一权威）。
  // 证据不依赖共享的 service.log：worker stdio 管道分实例抓取进各自状态；token/安装路径/用户目录脱敏。
  const database = new Database(join(logDir, "axiom.db"));
  const stateFile = join(logDir, `service-state-${installTag(address)}.json`);
  // 错误与环境变量一律先脱敏：AXIOM_SERVICE_ERROR 会经 service.status 原样到达页面，禁止暴露路径/源码位置。
  const redactions = [[token, "***"], [realpathSync(root), "<install>"], [logDir, "<home>"], [homedir(), "<home>"]];
  const state = await createMaintState({ database, key: `state-${installTag(address)}`, legacyFile: stateFile, redactions });
  // 连接生命周期：所有退出路径（信号/管道停止/worker 退出停止）先冲刷状态、关库、关控制管道再退。
  const exit = (code) => { try { database.close(); } catch {} control.close(() => process.exit(code)); };
  // 崩溃重试终态（同 systemd StartLimitBurst/PM2 max_restarts）：连续崩溃达上限后停止自动重启，
  // 恢复走维护入口 POST /recover；worker 稳定运行超 30s 重置计数（稳定窗口）。
  const maxCrashRetries = Number(process.env.AXIOM_MAX_CRASH_RETRIES ?? 5);
  const crashBackoffMs = Number(process.env.AXIOM_CRASH_BACKOFF_MS ?? 1000); // ponytail: 测试/内网可调；默认 1s 指数退避封顶 10s
  let child, restartTimer, restarting = false, stopping = false, failures = 0, startedAt = 0, instanceId = null, readyWaiter = null;
  const workerAlive = () => Boolean(child) && child.exitCode === null && child.signalCode === null;
  const newOperationId = () => `m-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  // 准备阶段失败且 worker 仍存活：通知其解锁 stopping 继续服务（worker 侧 app.resume）。
  const resume = () => { if (workerAlive()) child.send({ type: "service.resume" }, () => {}); };
  // worker 已退出时的恢复写操作：仅允许在无存活 worker 时执行，串行由 restarting 保证。
  function recover(mode) {
    if (workerAlive()) return { code: 409, error: "worker 仍在运行；请通过页面重启，活动任务需先在页面停止" };
    if (restarting || stopping) return { code: 409, error: "维护操作已在进行或守护进程正在停止" };
    restarting = true;
    const operationId = newOperationId();
    void state.begin(operationId, mode);
    setTimeout(() => { void runOp(mode, undefined, operationId).catch((error) => { console.error(error); process.exitCode = 1; }); }, 0);
    return { operationId };
  }
  const maintenance = await startMaintServer({
    state, token,
    origins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    recover, redactions,
  });
  // 只在 worker 已退出时提供兜底停止；健康 worker 仍走 HTTP 的任务/保存检查。
  const socketPath = controlPath(address);
  const control = createControlServer((socket) => {
    socket.on("error", () => {});
    socket.setTimeout(5000, () => socket.destroy());
    socket.once("data", (data) => {
      if (data.toString() !== "stop\n") { socket.destroy(); return; }
      if (restarting || workerAlive()) {
        socket.end(JSON.stringify({ error: "服务进程仍在运行或维护中；必须通过业务端口检查活动任务后停止。" }));
        return;
      }
      stopping = true;
      clearTimeout(restartTimer);
      socket.end(JSON.stringify({ service: "axiom", pid: process.pid }), () => {
        void state.flush().then(() => exit(0));
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
  function spawnWorker(error = "") {
    if (stopping) return null;
    if (workerAlive()) throw new Error("旧 worker 尚未退出，拒绝重复启动");
    startedAt = Date.now();
    instanceId = randomBytes(6).toString("hex");
    state.setWorker(instanceId);
    void state.phase("starting");
    child = fork(join(root, "src/main.js"), [], {
      cwd: root,
      env: {
        ...process.env, AXIOM_SERVICE_ERROR: error, AXIOM_INSTANCE_ID: instanceId,
        AXIOM_MAINTENANCE_URL: maintenance.url, AXIOM_MAINTENANCE_TOKEN: token,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
    });
    // 有界证据：worker 输出进 service.log 的同时保留脱敏尾部到状态文件。
    for (const stream of ["stdout", "stderr"])
      child[stream].setEncoding("utf8").on("data", (text) => { workerLog.write(text); state.appendLog(text); });
    child.on("error", (error) => { console.error(error); process.exitCode = 1; });
    child.on("message", onMessage);
    child.on("exit", (code) => {
      readyWaiter?.resolve(false);
      state.data.ready = false;
      state.appendLog(`worker 退出（${code ?? "signal"}）\n`);
      if (restarting) return;
      if (stopping) { void state.flush().then(() => exit(code || 0)); return; }
      if (Date.now() - startedAt > 30000) failures = 0;
      if (failures >= maxCrashRetries) {
        const message = `worker 连续崩溃已达上限（${maxCrashRetries} 次自动重试），守护进程进入终态，不再自动重启；可通过维护入口 POST /recover 恢复`;
        console.error(message);
        void state.fail(message);
        return;
      }
      const delay = Math.min(crashBackoffMs * 2 ** failures++, 10000);
      console.error(`服务进程意外退出（code ${code ?? "signal"}），${delay}ms 后自动重启`);
      restartTimer = setTimeout(() => { if (!restarting && !stopping) spawnWorker(); }, delay);
    });
    // 就绪双信号：IPC service.ready（instanceId 匹配）为主，/health 的 instanceId 兜底探测；
    // 闭包固定本 worker 的 instanceId，避免串扰下一个 worker；超时判失败但不杀进程（迟到 ready 仍会更新状态）。
    const workerInstance = instanceId;
    return new Promise((resolveReady) => {
      let probe;
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(deadline); clearInterval(probe); readyWaiter = null; resolveReady(value);
      };
      const deadline = setTimeout(() => finish(false), READY_TIMEOUT_MS);
      readyWaiter = { resolve: finish };
      probe = setInterval(async () => {
        if (!workerAlive() || instanceId !== workerInstance) return finish(false);
        try {
          const health = await fetch(`${address}/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json());
          if (health.instanceId === workerInstance && instanceId === workerInstance && workerAlive()) {
            await state.workerReady(workerInstance, health.version);
            finish(true);
          }
        } catch {}
      }, 1000);
      probe.unref?.();
    });
  }
  function onMessage(message) {
    if (message?.type === "service.ready") {
      if (message.instanceId === instanceId) {
        void state.workerReady(instanceId, message.version);
        readyWaiter?.resolve(true);
      } else state.appendLog("收到 instanceId 不匹配的 service.ready，已忽略\n");
      return;
    }
    if (message?.type === "service.shutdown" && !stopping && !restarting) {
      stopping = true;
      void stopChild().catch((error) => { console.error(error); process.exitCode = 1; });
      return;
    }
    if (message?.type !== "service.restart") return;
    const requestId = message.requestId ?? null;
    const reject = (error) => child.send({ type: "service.rejected", requestId, error }, () => {});
    if (restarting || stopping) { reject(restarting ? "维护操作已在进行，请等待完成" : "服务正在停止"); return; }
    const mode = message.mode;
    const invalid = !["quick", "rebuild", "update"].includes(mode) ||
      (mode === "update" && !/^[0-9a-f]{40}$/i.test(message.sha ?? ""));
    if (invalid) {
      reject("无效的维护请求");
      resume(); // 参数错误不会触发任何操作，worker 可能已置 stopping，立即解锁
      return;
    }
    restarting = true;
    const operationId = newOperationId();
    void state.begin(operationId, mode);
    // Allow the WebSocket acknowledgment to flush before closing the worker.
    child.send({ type: "service.accepted", requestId, operationId }, () => {});
    setTimeout(() => { void runOp(mode, message.sha, operationId).catch((error) => { console.error(error); process.exitCode = 1; }); }, 150);
  }
  async function runOp(mode, sha, operationId) {
    try {
      clearTimeout(restartTimer);
      failures = 0; // 恢复/维护路径重新起算崩溃重试
      let stage, swapped = false;
      try {
        if (mode === "update") { state.phase("preparing"); stage = await prepareUpdate(sha, run); }
        else if (mode === "rebuild") { state.phase("preparing"); stage = await prepareRebuild(root, run); }
        state.phase("stopping");
        const code = await stopChild();
        // 停止退出码非 0（保存/收尾失败）：绝不继续切换，保留旧代码与依赖。
        if (code !== 0) throw new Error(`worker 停止退出码 ${code ?? "信号"}；为保会话数据已取消切换`);
        if (mode === "update") { state.phase("swapping"); await swapUpdate(stage, root, run); swapped = true; }
        if (mode === "rebuild") {
          state.phase("swapping");
          await swapRebuild(stage, root);
          swapped = true;
          state.phase("building");
          await npmRun(run, ["run", "build", "--if-present"], root);
        }
      } catch (cause) {
        console.error(cause);
        if (swapped) {
          try { await rollbackRebuild(root); }
          catch (error) { await state.fail(`${cause.message}；恢复旧依赖失败：${error.message}`); return; }
        }
        await state.fail(cause);
        if (workerAlive()) resume();
        else await spawnWorker(sanitize(cause.message, redactions));
        return;
      }
      // starting 阶段由 spawnWorker 统一记录，此处不再重复。
      const ready = await spawnWorker("");
      if (ready) {
        // 备份保留到新实例就绪才清理；此前任何失败都可回滚。
        if (mode === "update") await commitUpdate(stage, root);
        if (mode === "rebuild") await commitRebuild(stage, root);
        void state.succeed();
      } else {
        let note = "维护后新实例未就绪";
        // 超时不等于进程已退出。先优雅停止，确认退出后才回滚；不能同时启动第二个 worker。
        if (workerAlive()) {
          try {
            const code = await stopChild();
            if (code !== 0) throw new Error(`停止退出码 ${code}`);
          } catch (error) {
            await state.fail(`${note}；停止未确认，保留当前安装与备份：${error.message}`);
            return;
          }
        }
        try {
          if (mode === "update") await rollbackUpdate(root, run);
          if (mode === "rebuild") await rollbackRebuild(root);
          note += "，已回滚旧版本";
        } catch (error) {
          await state.fail(`${note}，回滚失败：${error.message}`);
          return;
        }
        console.error(note);
        await state.fail(note);
        await spawnWorker(sanitize(note, redactions));
      }
    } catch (error) {
      await state.fail(error);
      if (workerAlive()) resume();
    } finally { restarting = false; }
  }
  function stopChild() {
    return new Promise((done, fail) => {
      if (!workerAlive()) return done(0);
      // Do not force-kill: session persistence must finish before dependencies change.
      const timer = setTimeout(() => fail(new Error("服务停止超时；未执行切换，请检查 service.log")), 60000);
      child.once("exit", (code) => { clearTimeout(timer); done(code); });
      child.send({ type: "service.stop" }, (error) => {
        if (error) { clearTimeout(timer); fail(error); }
      });
    });
  }
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    stopping = true;
    clearTimeout(restartTimer);
    void stopChild()
      .then(() => state.flush())
      .then(() => exit(0))
      .catch((error) => { console.error(error); process.exitCode = 1; });
  });
  spawnWorker();
  console.log(`服务运行中：${address}（日志 ${logPath}，Ctrl+C 停止）`);
}
// npm 全局 bin 在类 Unix 系统是符号链接，argv[1] 需取 realpath 再比对
const invoked = (() => { try { return realpathSync(process.argv[1] ?? ""); } catch { return ""; } })();
export async function stopService(address = `http://127.0.0.1:${Number(process.env.AXIOM_PORT ?? 4319)}`) {
  let status = null;
  // HTTP 的拒绝是终态，绝不能回落管道绕过活动任务检查。仅网络不可达时探测无 worker 的守护。
  const response = await fetch(`${address}/service/stop`, { method: "POST", signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (response) {
    const text = await response.text();
    if (!response.ok) throw new Error(`停止失败：${text || response.status}`);
    status = JSON.parse(text);
  }
  if (!status) {
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
    if (status?.error) throw new Error(status.error);
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
  if (!extra.length && ["help", "--help", "-h"].includes(command)) {
    console.log(`用法：axiom [help|stop|uninstall]

  axiom            启动后台服务（默认 http://127.0.0.1:4319）
  axiom help       显示帮助（也支持 --help、-h）
  axiom stop       安全停止服务及守护进程，不取消登录自启
  axiom uninstall  停止服务、取消自启并卸载 Axiom

停止时有运行任务会拒绝操作，超时不会强杀。
卸载保留 Pi、~/.pi 配置和 ~/.axiom 会话数据。
可通过 AXIOM_PORT 指定端口。`);
  } else if (extra.length || (command && !["stop", "uninstall"].includes(command))) {
    console.error("用法：axiom [help|stop|uninstall]（运行 axiom help 查看说明）"); process.exitCode = 1;
  } else {
    if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
    await (command === "uninstall" ? import("./uninstall.mjs").then((m) => m.uninstall({ execute: run, stop: stopService, npm: npmRun })) : command === "stop" ? stopService() : supervise()).catch((error) => {
      console.error(error.message); process.exitCode = 1;
    });
  }
}
