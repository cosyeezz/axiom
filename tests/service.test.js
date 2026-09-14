import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { createMaintState, sanitize } from "../scripts/maint-state.mjs";
import { startMaintServer } from "../scripts/maint-server.mjs";
import { Database } from "../src/database.js";
import { installTag, homeDir } from "../scripts/service.mjs";

// 轮询上限只为了“卡死时报错而不是永久 hang”，不是性能断言：空机器上这些检查 1~2s 就过，
// 负载高时（多文件并行 + 外部进程）同一流程可能慢 10 倍以上，故给到 60s 避免假失败。
const until = async (check, timeout = 60000, step = 80) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error("until 超时");
    await new Promise((done) => setTimeout(done, step));
  }
};
const readMaybe = async (path) => { try { return await readFile(path, "utf8"); } catch { return null; } };
const killTree = (pid) => pid && new Promise((done) => {
  if (process.platform === "win32") {
    const p = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    p.once("close", done); p.once("error", done);
  } else { try { process.kill(pid, "SIGKILL"); } catch {} done(); }
});
// 更新测试要求 daemon root === npm 全局包目录，因此 npm 布局把工作区建为 base/@cosyeezz/axiom。
const buildWorkspace = async (npm = false) => {
  const base = await mkdtemp(join(tmpdir(), "axiom-svc-"));
  const root = npm ? join(base, "@cosyeezz", "axiom") : base;
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "axiom", version: "0.0.0", private: true }));
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
  for (const name of ["service.mjs", "maint-state.mjs", "maint-server.mjs"])
    await writeFile(join(root, "scripts", name), await readFile(new URL(`../scripts/${name}`, import.meta.url)));
  for (const name of ["update.js", "database.js"])
    await writeFile(join(root, "src", name), await readFile(new URL(`../src/${name}`, import.meta.url)));
  return { base, root, home: npm ? join(base, "home") : join(root, "home") };
};
// 通用假 worker：写 workers/maint-env/workerPid，ready（instanceId 匹配 env），消费 requests 文件里的 restart 请求，
// service.stop 按 stop-exit 退出码退出；crash/recover-flag 文件驱动崩溃终态与恢复分支。
const WORKER = `
const fs = require('node:fs');
process.on('uncaughtException', (e) => { fs.writeFileSync('worker-error', String((e && e.stack) || e)); process.exit(1); });
// Windows 杀软/并发读取会让写入与 rename 瞬时 EPERM/EBUSY（与 src/pi-model-storage.js 同一风险）：
// 启动期文件操作有限次退避重试。不重试就会在此抛出 → worker 以 code 1 退出 → 守护进程按崩溃重启，
// 多出一个实例，让"恢复后 worker 数"这类断言随机失败。
const retry = (op) => { for (let i = 0; ; i++) { try { return op(); } catch (e) {
  if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1)); } } };
retry(() => fs.writeFileSync('workers', String((parseInt(fs.existsSync('workers') ? fs.readFileSync('workers', 'utf8') : '0', 10) || 0) + 1)));
retry(() => fs.writeFileSync('maint-env.tmp', JSON.stringify({ url: process.env.AXIOM_MAINTENANCE_URL || '', token: process.env.AXIOM_MAINTENANCE_TOKEN || '', instanceId: process.env.AXIOM_INSTANCE_ID || '' })));
retry(() => fs.renameSync('maint-env.tmp', 'maint-env'));
retry(() => fs.writeFileSync('workerPid', String(process.pid)));
process.on('message', (m) => {
  if (m.type === 'service.stop') { const code = fs.existsSync('stop-exit') ? fs.readFileSync('stop-exit', 'utf8').trim() : '0'; fs.writeFileSync('stopped', code); process.exit(parseInt(code, 10)); }
  if (m.type === 'service.resume') fs.writeFileSync('resumed', 'yes');
  if (m.type === 'service.accepted') fs.writeFileSync('accepted-' + m.requestId, String(m.operationId));
  if (m.type === 'service.rejected') fs.writeFileSync('rejected-' + m.requestId, String(m.error || ''));
});
if (Number(process.env.AXIOM_PORT)) require('node:http').createServer((req, res) => {
  if (req.url !== '/service/stop') { res.writeHead(404); return res.end(); }
  if (fs.existsSync('busy')) { res.writeHead(409); return res.end('活动任务'); }
  res.writeHead(202); res.end(JSON.stringify({ service: 'axiom', pid: process.ppid }));
  process.send({ type: 'service.shutdown' });
}).listen(Number(process.env.AXIOM_PORT), '127.0.0.1');
const ready = () => {
  if (fs.existsSync('node_modules/staged') && process.env.FAKE_START_RESULT === 'timeout') return;
  process.send({ type: 'service.ready', instanceId: process.env.AXIOM_INSTANCE_ID, version: 'test' });
};
if (fs.existsSync('crash') || (fs.existsSync('crash-replacement') && Number(fs.readFileSync('workers', 'utf8')) > 1)) process.exit(1);
if (!fs.existsSync('sent')) {
  fs.writeFileSync('sent', 'yes');
  const lines = fs.existsSync('requests') ? fs.readFileSync('requests', 'utf8').split('\\n').filter(Boolean) : [];
  ready();
  for (const line of lines) process.send(JSON.parse(line));
} else {
  ready();
}
setInterval(() => {}, 1000);
`;
const startDaemon = (root, extra = {}) =>
  // --foreground：axiom 无参数现在是后台启动（脱离终端），测试要的是可直接观测的前台守护。
  spawn(process.execPath, [join(root, "scripts", "service.mjs"), "--foreground"], {
    // cwd 放包目录之外：Windows 下进程 cwd 会锁住目录，update 的原子 rename 要求包目录可换名。
    cwd: join(root, ".."), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, AXIOM_PORT: "0", AXIOM_HOME: join(root, "home"), ...extra },
  });
const startTest = async (root, { requests, touch = [], env = {} } = {}) => {
  await writeFile(join(root, "src", "main.js"), WORKER);
  if (requests) await writeFile(join(root, "requests"), requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
  for (const [name, body] of touch) await writeFile(join(root, name), body);
  const child = startDaemon(root, env);
  child.stderr.on("data", (d) => console.error("[daemon]", String(d).trim()));
  await until(async () => (await readMaybe(join(root, "maint-env"))) !== null);
  return child;
};
const maintEnv = async (root) => JSON.parse(await readFile(join(root, "maint-env"), "utf8"));
const getStatus = async (root) => {
  const env = await maintEnv(root);
  const res = await fetch(`${env.url}/status`, { headers: { Authorization: `Bearer ${env.token}` } });
  return res.json();
};
// 维护状态已入 SQLite：按安装实例键直读 axiom.db（与守护进程并行连接，WAL+busy_timeout 兼容多连接）。
const stateOf = async (root, home = join(root, "home")) => {
  const db = new Database(join(home, "axiom.db"));
  const state = db.get("maint", `state-${installTag("http://127.0.0.1:0", root)}`);
  db.close();
  assert.ok(state, "维护状态已入库");
  return state;
};
const teardown = async (base, child) => {
  const workerPid = parseInt(await readMaybe(join(base, "workerPid")) ?? "0", 10);
  await killTree(workerPid || child?.pid);
  await killTree(child?.pid);
  // taskkill 返回不等于子进程已释放句柄：Windows 下 axiom.db-shm 仍可能被占着（EBUSY），用 rm 自带重试等到释放。
  await rm(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
};
// 假 npm：install → 在 stage 组装带 _resolved/package-lock/SDK 桩的完整包；ci → stage 依赖+SDK 桩；run build → 标记。
const NPM_FAKE = `
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
const say = (t) => process.stdout.write(t + "\\n");
const sdkStub = (dir) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", type: "module", main: "index.mjs" }));
  writeFileSync(join(dir, "index.mjs"), "export const sdk = true;\\n");
};
if (cmd === "root" && rest.includes("-g")) { say(process.env.FAKE_GLOBAL_ROOT || ""); process.exit(0); }
if (cmd === "install") {
  if (process.env.FAKE_INSTALL_RESULT === "fail") process.exit(1);
  const sha = ((rest.find((a) => a.startsWith("github:")) ?? "").match(/#([0-9a-f]{40})$/i) ?? [])[1] ?? "";
  if (!sha) process.exit(2);
  const stage = process.cwd();
  rmSync(join(stage, "node_modules"), { recursive: true, force: true });
  const pkg = join(stage, "node_modules", "@cosyeezz", "axiom");
  sdkStub(join(pkg, "node_modules", "@earendil-works", "pi-coding-agent"));
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@cosyeezz/axiom", version: "9.0.0", _resolved: "github:cosyeezz/axiom#" + sha }));
  writeFileSync(join(stage, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/@cosyeezz/axiom": { resolved: "github:cosyeezz/axiom#" + sha } } }));
  writeFileSync(join(stage, "node_modules", "dep-new"), "dep\\n");
  // npm -g 装的是完整包：把现包 scripts/src 复制进 staged，换名后新 worker 才有入口。
  for (const part of ["scripts", "src"]) cpSync(join(process.env.FAKE_GLOBAL_ROOT, "@cosyeezz", "axiom", part), join(pkg, part), { recursive: true });
  if (process.env.FAKE_SERVED && !existsSync("stopped")) writeFileSync(process.env.FAKE_SERVED, "yes");
  process.exit(0);
}
if (cmd === "ci") {
  const stage = process.cwd();
  rmSync(join(stage, "node_modules"), { recursive: true, force: true });
  sdkStub(join(stage, "node_modules", "@earendil-works", "pi-coding-agent"));
  writeFileSync(join(stage, "node_modules", "staged"), "yes\\n");
  process.exit(0);
}
if (cmd === "run") { writeFileSync(join(process.cwd(), "build-called"), "yes\\n"); process.exit(process.env.FAKE_BUILD_RESULT === "fail" ? 1 : 0); }
process.exit(3);
`;
const installNpmShim = async (base) => {
  const dir = join(base, "scripts");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "npm-fake.mjs"), NPM_FAKE);
  if (process.platform === "win32") {
    await writeFile(join(dir, "npm.cmd"), "@echo off\r\nnode \"%~dp0npm-fake.mjs\" %*\r\n");
    return join(dir, "npm.cmd");
  }
  const sh = join(dir, "npm");
  await writeFile(sh, "#!/bin/sh\nexec node \"$(dirname \"$0\")/npm-fake.mjs\" \"$@\"\n");
  await chmod(sh, 0o755);
  return sh;
};
const A40 = "a".repeat(40), B40 = "b".repeat(40);

test("stop CLI waits for graceful worker exit then confirms daemon is gone", async () => {
  const { base, root } = await buildWorkspace();
  const port = String(30000 + Math.floor(Math.random() * 20000));
  const child = await startTest(root, { env: { AXIOM_PORT: port } });
  try {
    await writeFile(join(root, 'busy'), '1');
    const rejected = spawn(process.execPath, [join(root, 'scripts', 'service.mjs'), 'stop'], {
      cwd: root, stdio: 'ignore', env: { ...process.env, AXIOM_PORT: port },
    });
    assert.equal((await once(rejected, 'exit'))[0], 1, 'HTTP 409 不能绕过任务检查');
    assert.equal(await readMaybe(join(root, 'stopped')), null);
    await rm(join(root, 'busy'));
    const cli = spawn(process.execPath, [join(root, "scripts", "service.mjs"), "stop"], {
      cwd: root, stdio: "ignore", env: { ...process.env, AXIOM_PORT: port, AXIOM_HOME: join(root, "home") },
    });
    const [code] = await once(cli, "exit");
    assert.equal(code, 0);
    assert.equal(await readMaybe(join(root, "stopped")), "0");
    await until(async () => { try { process.kill(child.pid, 0); return false; } catch (e) { return e.code === "ESRCH"; } });
  } finally { await teardown(base, child); }
});

test("quick restart stops worker gracefully and starts a ready replacement", async () => {
  const { base, root, home } = await buildWorkspace();
  const child = await startTest(root, { requests: [{ type: "service.restart", mode: "quick", requestId: "q1" }] });
  try {
    await until(async () => (await readMaybe(join(root, "accepted-q1"))) !== null);
    await until(async () => (await getStatus(root)).status === "succeeded");
    assert.ok(parseInt(await readFile(join(root, "workers"), "utf8"), 10) >= 2);
    assert.equal(await readMaybe(join(root, "stopped")), "0");
    assert.deepEqual((await stateOf(root)).phases.map((p) => p.phase), ["stopping", "starting", "ready"]);
  } finally { await teardown(base, child); }
});

test("busy restart is rejected without resume and never unlocks the running op", async () => {
  const { base, root } = await buildWorkspace();
  const child = await startTest(root, {
    requests: [
      { type: "service.restart", mode: "quick", requestId: "r1" },
      { type: "service.restart", mode: "quick", requestId: "r2" },
    ],
  });
  try {
    await until(async () => (await readMaybe(join(root, "accepted-r1"))) !== null);
    const rejected = await until(async () => await readMaybe(join(root, "rejected-r2")));
    assert.ok(rejected.includes("维护操作已在进行"));
    await until(async () => (await getStatus(root)).status === "succeeded");
    assert.equal(await readMaybe(join(root, "resumed")), null, "busy 拒绝不补 resume");
  } finally { await teardown(base, child); }
});

test("invalid restart params are rejected and always paired with resume", async () => {
  const { base, root, home } = await buildWorkspace();
  const child = await startTest(root, { requests: [{ type: "service.restart", mode: "update", requestId: "s1", sha: "zz" }] });
  try {
    const rejected = await until(async () => await readMaybe(join(root, "rejected-s1")));
    await until(async () => (await readMaybe(join(root, "resumed"))) !== null);
    assert.ok(rejected.includes("无效"));
    assert.equal(parseInt(await readFile(join(root, "workers"), "utf8"), 10), 1);
    assert.equal((await getStatus(root)).status, "idle");
    assert.equal((await readdir(root)).some((f) => f.startsWith(".axiom-update-")), false);
  } finally { await teardown(base, child); }
});

test("crash retries reach terminal state then POST /recover brings service back", async () => {
  const { base, root, home } = await buildWorkspace();
  const child = await startTest(root, { touch: [["crash", "1"]], env: { AXIOM_CRASH_BACKOFF_MS: "30", AXIOM_MAX_CRASH_RETRIES: "2" } });
  try {
    await until(async () => (await getStatus(root)).status === "failed");
    assert.equal(parseInt(await readFile(join(root, "workers"), "utf8"), 10), 3);
    const failed = await stateOf(root);
    assert.ok(/\/recover/.test(failed.error));
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(parseInt(await readFile(join(root, "workers"), "utf8"), 10), 3, "终态后不再自动重启");
    await rm(join(root, "crash"));
    await writeFile(join(root, "recover-flag"), "1");
    const env = await maintEnv(root);
    const res = await fetch(`${env.url}/recover`, {
      method: "POST", headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "quick" }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.accepted, true);
    await until(async () => (await getStatus(root)).status === "succeeded");
    assert.equal(parseInt(await readFile(join(root, "workers"), "utf8"), 10), 4);
  } finally { await teardown(base, child); }
});

test("staged update: verify-commit, swap after clean stop, commit only after ready", async () => {
  const { base, root, home } = await buildWorkspace(true);
  const npm = await installNpmShim(base);
  // 预置：目标目录即 daemon root（realpath 校验通过），旧版本 A40。
  await mkdir(join(base, "node_modules"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@cosyeezz/axiom", version: "8.0.0", _resolved: `github:cosyeezz/axiom#${A40}` }));
  const child = await startTest(root, {
    requests: [{ type: "service.restart", mode: "update", requestId: "u1", sha: B40 }],
    env: { AXIOM_NPM: npm, AXIOM_HOME: join(base, "home"), FAKE_GLOBAL_ROOT: base, FAKE_SERVED: join(base, "served-during-install") },
  });
  try {
    await until(async () => (await readMaybe(join(root, "accepted-u1"))) !== null);
    await until(async () => (await readMaybe(join(base, "served-during-install"))) !== null);
    await until(async () => (await readMaybe(join(root, ".axiom-commit")))?.trim() === B40);
    await until(async () => (await getStatus(root)).status === "succeeded");
    assert.equal(JSON.parse(await readFile(join(root, "package.json"), "utf8"))._resolved, `github:cosyeezz/axiom#${B40}`);
    assert.equal(existsSync(join(base, "@cosyeezz", ".axiom-package-backup")), false, "ready 后备份清理");
    assert.equal((await readdir(join(base, "@cosyeezz"))).some((f) => f.startsWith(".axiom-update-")), false, "暂存目录清理");
    assert.equal(await readMaybe(join(root, "node_modules", "dep-new")), "dep\n", "新依赖位于包私有目录");
    assert.equal(await readMaybe(join(base, "node_modules", "dep-new")), null, "不改共享全局依赖");
    // 换代证明由 _resolved==B40 + .axiom-commit + status succeeded 承担；swap 后新包根全新，workers 计数不跨包累计。
    assert.deepEqual((await stateOf(root, join(base, "home"))).phases.map((p) => p.phase),
      ["preparing", "stopping", "swapping", "starting", "ready"]);
  } finally { await teardown(base, child); }
});

test("update install failure leaves running install untouched and resumes worker", async () => {
  const { base, root, home } = await buildWorkspace(true);
  const npm = await installNpmShim(base);
  const child = await startTest(root, {
    requests: [{ type: "service.restart", mode: "update", requestId: "u2", sha: B40 }],
    env: { AXIOM_NPM: npm, AXIOM_HOME: join(base, "home"), FAKE_GLOBAL_ROOT: base, FAKE_INSTALL_RESULT: "fail" },
  });
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "@cosyeezz/axiom", version: "8.0.0", _resolved: `github:cosyeezz/axiom#${A40}` }));
    await until(async () => (await readMaybe(join(root, "accepted-u2"))) !== null);
    await until(async () => (await getStatus(root)).status === "failed");
    const state = await stateOf(root, join(base, "home"));
    assert.equal(state.phase, "preparing");
    assert.ok(/exited 1/.test(state.error));
    assert.equal(await readMaybe(join(root, "resumed")), "yes", "worker 存活 → resume");
    assert.equal(parseInt(await readFile(join(root, "workers"), "utf8"), 10), 1);
    assert.equal(JSON.parse(await readFile(join(root, "package.json"), "utf8"))._resolved, `github:cosyeezz/axiom#${A40}`, "在用安装未被触碰");
    assert.equal(existsSync(join(root, ".axiom-package-backup")), false);
    assert.equal(existsSync(join(root, ".axiom-commit")), false);
  } finally { await teardown(base, child); }
});

test("rebuild cancels swap when worker stop exits non-zero", async () => {
  const { base, root, home } = await buildWorkspace();
  const npm = await installNpmShim(base);
  const child = await startTest(root, {
    requests: [{ type: "service.restart", mode: "rebuild", requestId: "rb1" }],
    touch: [["stop-exit", "3"]],
    env: { AXIOM_NPM: npm, AXIOM_HOME: join(base, "home") },
  });
  try {
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(join(root, "node_modules", "old-marker"), "1");
    await until(async () => (await getStatus(root)).status === "failed");
    assert.ok(/退出码/.test((await stateOf(root, join(base, "home"))).error));
    assert.equal(existsSync(join(root, ".node_modules-backup")), false);
    assert.equal(existsSync(join(root, "build-called")), false);
    assert.equal(await readMaybe(join(root, "node_modules", "old-marker")), "1", "依赖原样保留");
    // failed 先落盘，之后才 fork 恢复 worker；等待真实 ready，不能把维护失败当恢复已完成。
    await until(async () => (await getStatus(root)).ready && await readMaybe(join(root, "workers")) === "2");
    assert.equal(parseInt(await readFile(join(root, "workers"), "utf8"), 10), 2, "旧代码拉起恢复服务");
  } finally { await teardown(base, child); }
});

test("rebuild with leftover backup refuses before stopping the healthy worker", async () => {
  const { base, root } = await buildWorkspace();
  await mkdir(join(root, '.node_modules-backup'));
  await writeFile(join(root, '.node_modules-backup', 'keep'), 'preserved');
  const child = await startTest(root, {
    requests: [{ type: 'service.restart', mode: 'rebuild', requestId: 'leftover' }],
  });
  try {
    await until(async () => await readMaybe(join(root, 'resumed')));
    const state = await getStatus(root);
    assert.equal(state.status, 'failed');
    assert.equal(state.ready, true);
    assert.equal(state.phase, 'preparing');
    assert.match(state.error, /备份目录已存在/);
    assert.equal(await readMaybe(join(root, 'stopped')), null);
    assert.equal(await readMaybe(join(root, 'workers')), '1');
    assert.equal(await readMaybe(join(root, '.node_modules-backup', 'keep')), 'preserved');
    assert.equal((await readdir(root)).some((name) => name.startsWith('.axiom-stage-')), false);
  } finally { await teardown(base, child); }
});

test("failed maintenance replacement resumes bounded crash retries instead of staying silently offline", async () => {
  const { base, root } = await buildWorkspace();
  const npm = await installNpmShim(base);
  const child = await startTest(root, {
    requests: [{ type: 'service.restart', mode: 'rebuild', requestId: 'failed-recovery' }],
    touch: [['stop-exit', '3'], ['crash-replacement', '1']],
    env: { AXIOM_NPM: npm, AXIOM_CRASH_BACKOFF_MS: '30', AXIOM_MAX_CRASH_RETRIES: '2' },
  });
  try {
    await until(async () => /连续崩溃已达上限/.test((await getStatus(root)).error ?? ''));
    const workers = await readMaybe(join(root, 'workers'));
    assert.equal(Number(workers), 5, 'original + failed recovery + bounded retry sequence');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await readMaybe(join(root, 'workers')), workers);
    assert.equal((await getStatus(root)).ready, false);
  } finally { await teardown(base, child); }
});

test("rebuild happy path: stage, swap after stop, build once, commit after ready", async () => {
  const { base, root, home } = await buildWorkspace();
  const npm = await installNpmShim(base);
  const child = await startTest(root, {
    requests: [{ type: "service.restart", mode: "rebuild", requestId: "rb2" }],
    env: { AXIOM_NPM: npm, AXIOM_HOME: join(base, "home") },
  });
  try {
    await until(async () => (await readMaybe(join(root, "accepted-rb2"))) !== null);
    await until(async () => (await getStatus(root)).status === "succeeded");
    assert.equal(await readMaybe(join(root, "node_modules", "staged")), "yes\n");
    assert.equal(existsSync(join(root, "build-called")), true);
    assert.equal(existsSync(join(root, ".node_modules-backup")), false, "ready 后备份清理");
    assert.equal((await readdir(root)).some((f) => f.startsWith(".axiom-stage-")), false);
    assert.deepEqual((await stateOf(root, join(base, "home"))).phases.map((p) => p.phase),
      ["preparing", "stopping", "swapping", "building", "starting", "ready"]);
  } finally { await teardown(base, child); }
});

for (const failure of ['build', 'timeout']) test(`rebuild ${failure} failure restores old dependencies before recovery`, async () => {
  const { base, root } = await buildWorkspace();
  const npm = await installNpmShim(base);
  await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'node_modules', 'old-marker'), 'preserved');
  let child;
  try {
    child = await startTest(root, {
      requests: [{ type: 'service.restart', mode: 'rebuild', requestId: 'rollback' }],
      env: { AXIOM_NPM: npm, AXIOM_READY_TIMEOUT_MS: '400',
        FAKE_BUILD_RESULT: failure === 'build' ? 'fail' : '',
        FAKE_START_RESULT: failure === 'timeout' ? 'timeout' : '' },
    });
    await until(async () => { const s = await getStatus(root); return s.status === 'failed' && s.ready; });
    assert.equal(await readMaybe(join(root, 'node_modules', 'old-marker')), 'preserved');
    assert.equal(existsSync(join(root, 'node_modules', 'staged')), false);
    assert.equal(existsSync(join(root, '.node_modules-backup')), false);
    assert.equal(Number(await readMaybe(join(root, 'workers'))), failure === 'build' ? 2 : 3);
  } finally { await teardown(base, child); }
});

test("maintenance HTTP: auth trio, preflight, strict body, recover guard", async () => {
  const { base, root, home } = await buildWorkspace();
  const child = await startTest(root);
  try {
    const { url, token } = await maintEnv(root);
    const get = (o = {}) => fetch(`${url}/status`, { headers: { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.origin ? { Origin: o.origin } : {}) } });
    assert.equal((await get({ token: "x".repeat(64) })).status, 404);
    assert.equal((await get({})).status, 404);
    assert.equal((await get({ token, origin: "http://evil.example" })).status, 404);
    const hostile = await new Promise((done) => {
      const req = request(url, { headers: { Host: "evil:9", Authorization: `Bearer ${token}` }, timeout: 30000 }, (res) => { res.resume(); res.on("end", () => done(res.statusCode)); });
      // “timeout” 不自带 error：不主动 destroy 就会挂在这里等到整个用例超时。
      req.on("timeout", () => req.destroy());
      req.on("error", () => done(0)); req.end();
    });
    assert.equal(hostile, 404, "Host 不精确 → 404");
    const pre = await fetch(`${url}/status`, { method: "OPTIONS", headers: { Origin: url } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), url);
    assert.equal((await fetch(`${url}/nope`, { headers: { Authorization: `Bearer ${token}` } })).status, 404);
    assert.equal((await getStatus(root)).ready, true);
    assert.ok((await stateOf(root)).ready, "维护状态已持久化入库");
    const recover = (body, type = "application/json") => fetch(`${url}/recover`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, ...(type ? { "Content-Type": type } : {}) }, body,
    });
    assert.equal((await recover(JSON.stringify({ mode: "quick" }))).status, 409, "worker 存活 → 409");
    assert.equal((await recover(JSON.stringify(["quick"]))).status, 400, "数组 body 拒绝");
    assert.equal((await recover(JSON.stringify({ mode: "quick", extra: 1 }))).status, 400, "多余键拒绝");
    assert.equal((await recover(JSON.stringify({ mode: "nope" }))).status, 400);
    assert.equal((await recover(JSON.stringify({ mode: "quick" }), "text/plain")).status, 404, "content-type 必须 JSON");
  } finally { await teardown(base, child); }
});

test("maint-state: SQLite 权威存储——旧 JSON 幂等迁移、重启恢复、实例隔离、失败可见", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-state-"));
  const dbPath = join(dir, "axiom.db");
  const legacy = join(dir, "service-state-test.json");
  const redactions = [["tokensecret", "***"], [dir, "<install>"]];
  let clock = 100;
  const now = () => ++clock;
  try {
    // 迁移：旧 JSON（running 现场）读入 → interrupted、读盘即脱敏、源文件保留。
    await writeFile(legacy, JSON.stringify({
      pid: 1, instanceId: "old", ready: true,
      operation: "update", operationId: "m-1", status: "running", phase: "swapping",
      phases: [{ phase: "stopping", at: 1 }, { phase: "swapping", at: 2 }],
      startedAt: 5, updatedAt: 6, error: null, log: `tokensecret crash at ${dir}\\src\\x.js\n`,
    }));
    let db = new Database(dbPath);
    let s = await createMaintState({ database: db, key: "state-a", legacyFile: legacy, redactions, now });
    assert.equal(s.data.status, "interrupted");
    assert.equal(s.data.operation, "update", "最近操作保留");
    assert.equal(s.data.startedAt, 5, "startedAt 保留");
    assert.ok(s.data.error.includes("中断"));
    assert.deepEqual(s.data.phases.map((p) => p.phase), ["stopping", "swapping", "boot"]);
    assert.ok(!s.data.log.includes("tokensecret") && !s.data.log.includes(dir), "读取即脱敏");
    assert.equal(s.data.instanceId, null);
    await s.begin("m-2", "quick");
    assert.deepEqual(s.data.phases, [], "begin 清空阶段时间线");
    s.appendLog(`Authorization: Bearer tokensecret at ${dir}\\src\\y.js`);
    await s.fail(new Error(`boom at ${dir}\\src\\z.js`));
    assert.equal(s.data.status, "failed");
    assert.ok(s.data.error.includes("<install>") && !s.data.error.includes(`${dir}\\src`));
    db.close();
    // 重启：从库恢复；旧 JSON 即使被改写也不再读（数据库权威，条目存在即迁移闸门）。
    await writeFile(legacy, JSON.stringify({ status: "running", operation: "poison", log: `tokensecret ${dir}` }));
    db = new Database(dbPath);
    s = await createMaintState({ database: db, key: "state-a", legacyFile: legacy, redactions, now });
    assert.equal(s.data.status, "failed", "重启后从库恢复最近结果");
    assert.equal(s.data.operation, "quick");
    assert.ok(!s.data.log.includes("tokensecret") && !s.data.log.includes(`${dir}\\src`));
    // 独立实例：同库不同 key 互不读写。
    const other = await createMaintState({ database: db, key: "state-b", legacyFile: join(dir, "service-state-other.json"), redactions, now });
    assert.equal(other.data.status, "idle", "另一实例全新状态");
    assert.equal(s.data.status, "failed", "实例间互不串扰");
    // 失败可见：连接已关 → 落库失败显式记 persistenceError 并打日志，不静默。
    const errorSpy = t.mock.method(console, "error", () => {});
    db.close();
    await s.flush();
    assert.match(s.data.persistenceError, /未能保存/);
    assert.ok(errorSpy.mock.calls.some((c) => /落盘失败/.test(String(c.arguments[0]))), "持久化错误可见");
    errorSpy.mock.restore();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("sanitize handles auth headers with any separator", () => {
  const out = sanitize('authorization="SuperSecretValue1" bearer=SuperSecretValue2', [["SuperSecretValue1", "***"], ["SuperSecretValue2", "***"]]);
  assert.ok(!out.includes("SuperSecretValue"));
  assert.ok(out.includes("***"));
});

test("maint-server: strict object body and recover failures map to 400/409/500", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-msrv-"));
  const server = await startMaintServer({
    state: { data: { hello: 1 } }, token: "t".repeat(64), redactions: [["C:\\secret", "<x>"]],
    // mode 只接受 quick/rebuild；用调用序号驱动 409 → 500 → 202 三种结果。
    recover: (mode) => {
      n += 1;
      if (n === 1) return { error: "busy" };
      if (n === 2) throw new Error("kaboom C:\\secret");
      return { operationId: "m-1" };
    },
  });
  let n = 0;
  try {
    const call = (path, body, extra = {}) => fetch(`${server.url}${path}`, {
      headers: { Authorization: `Bearer ${"t".repeat(64)}`, "Content-Type": "application/json", ...extra },
      ...(body === undefined ? {} : { method: "POST", body }),
    });
    assert.equal((await call("/status")).status, 200);
    assert.equal((await call("/recover", JSON.stringify({ mode: "quick" }))).status, 409, "recover 返回 error → 409");
    const boom = await call("/recover", JSON.stringify({ mode: "quick" }));
    assert.equal(boom.status, 500);
    const text = await boom.text();
    assert.ok(text.includes("<x>") && !text.includes("C:\\secret"), "500 报文脱敏");
    const ok = await call("/recover", JSON.stringify({ mode: "quick" }));
    assert.deepEqual(await ok.json(), { accepted: true, mode: "quick", operationId: "m-1" });
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("homeDir 解析为绝对路径：相对 AXIOM_HOME 下 supervisor 与 worker 不得操作不同库文件", () => {
  const saved = process.env.AXIOM_HOME;
  const cwd = process.cwd();
  try {
    process.env.AXIOM_HOME = "./relhome";
    // supervisor 按自己的 cwd 打开 axiom.db，worker 以 cwd:root fork 后按 root 打开——
    // 相对路径会让两个进程写进两个库（维护状态与会话/设置分叉），且 sanitize 白名单用相对
    // 路径匹配不到日志里的绝对路径，/status 会泄漏本机路径。
    assert.equal(isAbsolute(homeDir()), true, `homeDir 必须是绝对路径，实际 ${homeDir()}`);
    assert.equal(homeDir(), resolve(cwd, "relhome"));
    process.env.AXIOM_HOME = resolve(cwd, "abshome");
    assert.equal(homeDir(), resolve(cwd, "abshome"), "绝对路径保持不变");
  } finally {
    if (saved === undefined) delete process.env.AXIOM_HOME;
    else process.env.AXIOM_HOME = saved;
  }
});

test("维护状态坏行不阻断启动：损坏值与 JSON null 都按全新状态重建并告警", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-state-bad-"));
  const database = new Database(join(dir, "axiom.db"));
  try {
    const errorSpy = t.mock.method(console, "error", () => {});
    const fresh = await createMaintState({ database, key: "state-fresh", legacyFile: join(dir, "none.json") });
    // 坏 JSON：单行损坏不该让守护进程永久起不来（需人工清库才能恢复）。
    database.prepare("INSERT INTO store (namespace, key, value) VALUES ('maint', 'state-bad', 'secret-must-not-leak{')").run();
    const broken = await createMaintState({ database, key: "state-bad", legacyFile: join(dir, "none.json") });
    assert.equal(broken.data.status, "idle", "坏行按全新状态重建");
    assert.deepEqual(broken.data.phases, fresh.data.phases, "与全新状态完全同形");
    assert.equal(broken.data.phase, fresh.data.phase);
    assert.ok(errorSpy.mock.calls.some((call) => /维护状态/.test(String(call.arguments[0]))), "坏行必须有可见告警");
    for (const call of errorSpy.mock.calls)
      assert.equal(String(call.arguments[0]).includes("secret-must-not-leak"), false, "告警不得携带原文片段");
    // JSON null / 非对象：restore 直接展开会抛 TypeError。
    database.set("maint", "state-null", null);
    const nulled = await createMaintState({ database, key: "state-null", legacyFile: join(dir, "none.json") });
    assert.equal(nulled.data.status, "idle");
    database.set("maint", "state-scalar", 42);
    const scalar = await createMaintState({ database, key: "state-scalar", legacyFile: join(dir, "none.json") });
    assert.equal(scalar.data.status, "idle");
    // 覆盖后自愈：坏行已被本次会话的合法快照取代。
    assert.ok(database.get("maint", "state-bad"), "坏行落库自愈");
    errorSpy.mock.restore();
  } finally {
    database.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("第二个守护进程启动失败必须退出：不留僵死进程占着库连接与随机端口", async () => {
  const { base, root } = await buildWorkspace();
  let first;
  try {
    first = await startTest(root);
    // 同一安装再起一个：控制套接字已被占用 → 抛「已有守护进程运行」。抛错前若不关掉 maint
    // server 与数据库连接，已 listen 的 HTTP 句柄会一直持有事件循环，进程永不退出。
    const second = startDaemon(root);
    let out = "";
    second.stderr.on("data", (chunk) => { out += chunk; });
    second.stdout.on("data", (chunk) => { out += chunk; });
    const exited = await Promise.race([
      once(second, "exit").then(([code]) => code ?? "signal"),
      new Promise((resolve) => setTimeout(() => resolve("HANG"), 20000)),
    ]);
    if (exited === "HANG") await killTree(second.pid);
    assert.notEqual(exited, "HANG", `第二个守护进程必须退出，实际仍在运行；输出：${out.slice(-500)}`);
    assert.notEqual(exited, 0, "启动失败必须非零退出码");
    assert.match(out, /已有守护进程运行|EADDRINUSE/i);
  } finally { await teardown(base, first); }
});

test("service.log 不泄漏维护 token；POSIX 下权限收紧到 0600", async () => {
  const { base, root, home } = await buildWorkspace();
  let child;
  try {
    // 假 worker 把 token 原样打到 stdout：守护进程把 worker 输出写进共享 service.log，
    // 不脱敏就等于把维护凭证明文落盘（数据库文件是 0600，日志却是 0644，口径不一致）。
    await writeFile(join(root, "src", "main.js"), `
const fs = require('node:fs');
fs.writeFileSync('maint-env.tmp', JSON.stringify({ url: process.env.AXIOM_MAINTENANCE_URL || '', token: process.env.AXIOM_MAINTENANCE_TOKEN || '', instanceId: process.env.AXIOM_INSTANCE_ID || '' }));
fs.renameSync('maint-env.tmp', 'maint-env');
fs.writeFileSync('workerPid', String(process.pid));
console.log('worker boot token=' + process.env.AXIOM_MAINTENANCE_TOKEN);
process.on('message', (m) => { if (m.type === 'service.stop') process.exit(0); });
process.send({ type: 'service.ready', instanceId: process.env.AXIOM_INSTANCE_ID, version: 'test' });
setInterval(() => {}, 1000);
`);
    child = startDaemon(root);
    child.stderr.on("data", (d) => console.error("[daemon]", String(d).trim()));
    await until(async () => (await readMaybe(join(root, "maint-env"))) !== null);
    const { token } = await maintEnv(root);
    assert.ok(token, "前提：worker 已拿到 token");
    const logPath = join(home, "service.log");
    await until(async () => (await readMaybe(logPath))?.includes("worker boot"));
    const log = await readMaybe(logPath);
    assert.equal(log.includes(token), false, "service.log 不得包含维护 token 明文");
    if (process.platform !== "win32") {
      const { mode } = await stat(logPath);
      assert.equal(mode & 0o777, 0o600, `service.log 权限应为 0600，实际 ${(mode & 0o777).toString(8)}`);
    }
  } finally { await teardown(base, child); }
});
