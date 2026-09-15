// 失败启动登记回归（长对话性能调研采集脚本）。
//
// 背景：profile-current-hotspots.mjs / paired-first-screen.mjs 的 startServer 在 spawn 后、
// await 健康检查之前就必须登记进程（spawnedServer = proc / procs.push(proc)）；否则
// 「启动失败 + stopServer 也失败」时外层 finally 拿不到进程，只能保留测量锁。
//
// 本测试用 node:vm 直接执行两脚本里的真实 startServer / stopServer，注入假 spawn 进程、
// 假 fs fd、失败 fetch、假时钟与微任务定时器；不启动任何真实进程或服务。
// 断言的是可观测的登记行为（不是源码正则）。末尾一条承重变异：内存删除登记行后同一场景
// 必须不再保有进程，证明上面的断言确实拦得住回归。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DIR = new URL("../docs/perf-long-conversation/", import.meta.url);

const SCRIPTS = [
  {
    label: "profile-current-hotspots",
    file: fileURLToPath(new URL("profile-current-hotspots.mjs", DIR)),
    registration: "spawnedServer = proc;",
    get: (sandbox) => sandbox.spawnedServer,
    retained: (sandbox) => (sandbox.spawnedServer === undefined ? 0 : 1),
  },
  {
    label: "paired-first-screen",
    file: fileURLToPath(new URL("paired-first-screen.mjs", DIR)),
    registration: "procs.push(proc);",
    get: (sandbox) => sandbox.procs[0],
    retained: (sandbox) => sandbox.procs.length,
  },
];

// 按花括号配平切出真实的 `async function <name>(...) {...}`，跳过字符串与注释。
function extractFunction(source, name) {
  const head = `async function ${name}(`;
  const start = source.indexOf(head);
  assert.ok(start >= 0, `源码中找不到 ${head}`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      const eol = source.indexOf("\n", i + 2);
      if (eol < 0) break;
      i = eol;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2) + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < source.length; i++) {
        if (source[i] === "\\") i++;
        else if (source[i] === ch) break;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`花括号不配平: ${name}`);
}

function dropLine(source, marker) {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.includes(marker));
  assert.ok(index >= 0, `变异目标缺失: ${marker}`);
  lines.splice(index, 1);
  return lines.join("\n");
}

function fakeProc({ exitCode = null } = {}) {
  return {
    pid: 424242,
    exitCode,
    signalCode: null,
    kills: 0,
    killSetsExit: false,
    handlers: {},
    on(type, cb) { this.handlers[type] = cb; return this; },
    kill() { this.kills++; if (this.killSetsExit) this.exitCode = 0; return true; },
  };
}

let timerSeq = 0;

function harness({ file, proc, fetchImpl, spawnThrows = false, mutateMarker = null }) {
  let source = fs.readFileSync(file, "utf8");
  if (mutateMarker) source = dropLine(source, mutateMarker);

  const timers = new Set();
  const closed = [];
  let clock = 0;
  const sandbox = {
    spawn() { if (spawnThrows) throw new Error("spawn ENOENT (stub)"); return proc; },
    fs: { openSync: () => 7, closeSync: (fd) => closed.push(fd) },
    process: { execPath: "/usr/bin/node" },
    path: { join: (...parts) => parts.join("/") },
    REPO: "/repo",
    fetch: fetchImpl,
    AbortSignal: { timeout: () => undefined },
    Date: { now: () => (clock += 1000) }, // 假时钟：让 30s 健康检查期限在微任务内到期，不真等
    setTimeout: (fn) => {
      const id = ++timerSeq;
      timers.add(id);
      queueMicrotask(() => { if (timers.delete(id)) fn(); });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    sleep: () => Promise.resolve(), // stopServer 的轮询等待
    spawnedServer: undefined,
    procs: [],
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(
    `${extractFunction(source, "startServer")}\n${extractFunction(source, "stopServer")}`,
    context,
    { filename: file },
  );
  return {
    sandbox,
    proc,
    closed,
    startServer: vm.runInContext("startServer", context),
    stopServer: vm.runInContext("stopServer", context),
    pendingTimers: () => timers.size,
    cleanup: () => { for (const id of [...timers]) sandbox.clearTimeout(id); },
  };
}

const failingFetch = () => Promise.reject(new Error("ECONNREFUSED (stub)"));

for (const script of SCRIPTS) {
  test(`${script.label}: 启动失败且 stopServer 拒绝后，假进程仍登记、外层可重试清理`, async () => {
    const proc = fakeProc();
    const h = harness({ file: script.file, proc, fetchImpl: failingFetch });
    try {
      const error = await h.startServer("/repo", "/home", 4321).then(() => null, (e) => e);
      assert.ok(error, "健康检查失败必须让 startServer 拒绝");
      assert.match(error.message, /did not become healthy/);
      assert.match(error.message, /server cleanup: .*did not exit after kill/, "stopServer 的拒绝必须并入错误上报");
      assert.ok(proc.kills > 0, "内层已尝试 kill");
      assert.equal(script.get(h.sandbox), proc, "失败后登记仍须指向同一个假进程");
      assert.equal(script.retained(h.sandbox), 1);
      assert.deepEqual(h.closed, [7], "日志 fd 必须在 finally 关闭");

      // 外层 finally 用同一登记重试清理：kill 生效后必须能收尾
      proc.killSetsExit = true;
      await h.stopServer(script.get(h.sandbox));
      assert.equal(proc.exitCode, 0);
    } finally {
      h.cleanup();
      assert.equal(h.pendingTimers(), 0, "测试结束不得残留定时器");
    }
  });

  test(`${script.label}: 进程已 exit 时也先登记再失败`, async () => {
    const proc = fakeProc({ exitCode: 0 });
    let fetched = 0;
    const h = harness({ file: script.file, proc, fetchImpl: () => { fetched++; return Promise.resolve({ ok: true }); } });
    try {
      const error = await h.startServer("/repo", "/home", 4321).then(() => null, (e) => e);
      assert.ok(error, "已退出进程必须让 startServer 拒绝");
      assert.match(error.message, /exited 0/);
      assert.doesNotMatch(error.message, /server cleanup/, "已退出的进程无需清理");
      assert.equal(fetched, 0, "exitCode 判定在健康检查之前");
      assert.equal(script.get(h.sandbox), proc);
    } finally {
      h.cleanup();
      assert.equal(h.pendingTimers(), 0);
    }
  });

  test(`${script.label}: 承重变异——内存删除登记行后同一失败场景不再保有进程`, async () => {
    const proc = fakeProc();
    const h = harness({ file: script.file, proc, fetchImpl: failingFetch, mutateMarker: script.registration });
    try {
      const error = await h.startServer("/repo", "/home", 4321).then(() => null, (e) => e);
      assert.ok(error, "去掉登记不影响失败本身");
      assert.equal(script.retained(h.sandbox), 0, "无登记 → 外层 finally 无处可清理（正是上面断言拦住的行为）");
    } finally {
      h.cleanup();
      assert.equal(h.pendingTimers(), 0);
    }
  });
}

test("spawn 抛错时仍关闭日志 fd，且不留下无法清理的登记", async () => {
  for (const script of SCRIPTS) {
    const h = harness({ file: script.file, proc: fakeProc(), fetchImpl: failingFetch, spawnThrows: true });
    try {
      const error = await h.startServer("/repo", "/home", 4321).then(() => null, (e) => e);
      assert.match(error.message, /spawn ENOENT/);
      assert.deepEqual(h.closed, [7], `${script.label}: openSync 的 fd 必须被 closeSync`);
      assert.equal(script.retained(h.sandbox), 0, `${script.label}: spawn 未成功前不登记`);
    } finally {
      h.cleanup();
      assert.equal(h.pendingTimers(), 0);
    }
  }
});
