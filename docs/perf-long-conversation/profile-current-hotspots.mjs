// 当前版本长会话首屏加载 —— Chromium CPU profile 热点定位（长对话性能调研·profile 轮）
//
// 目的：定位 current（工作树未提交版本）长会话首屏加载中 400ms 级阻塞的真实调用栈，
//       用采样证据区分 beginSnapshot / placeSnapshotMessage→renderMessage(Markdown) /
//       finishSnapshot / 非 JS 的 layout，而不是凭源码推定。
//
// 隔离方式复用 paired-first-screen.mjs：源库只读 VACUUM INTO 副本 + JSONL 复制进副本 home，
// session_file 指向副本；只对隔离副本启服务；会话原文不落盘。
// 原始 profile / trace 可能含私有上下文（脚本 URL 等），一律只写临时目录；仓库只落热点汇总。
//
// 采集（同一次导航同时开 profile + trace，保证两者时间轴可比）：
//   - CDP Profiler.start（100µs 采样）：JS 自身时间与调用链
//   - CDP Tracing（devtools.timeline,toplevel）：主线程 RunTask / Layout / UpdateLayoutTree / ParseHTML / FunctionCall
//   两者的时间戳都在 Chromium TimeTicks(µs) 域：profile.startTime + Σ timeDeltas 直接与 trace ts 对齐。
//   因此「哪个阻塞任务里耗时多少、属于哪个 JS 函数」是按同一时钟切片，而非按墙钟估算。
//   另有一次只开「强制同步布局探针」的运行：拦截 Element.prototype.scrollHeight/clientHeight/offsetHeight
//   的 getter（仅测试侧注入，不改产品代码），按调用点累计 >1ms 的同步布局耗时。
//
// 用法：
//   node profile-current-hotspots.mjs --repo <worktree> --db <axiom.db> --session <id> \
//     --playwright <playwright-core/index.mjs> [--chromium <chrome.exe>] \
//     [--runs 2] [--json docs/perf-long-conversation/profile-current-hotspots.json]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { acquireMeasureLock } from "./measure-lock.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const REPO = path.resolve(arg("repo", process.cwd()));
const SRC_DB = arg("db") ? path.resolve(arg("db")) : undefined;
const LONG = arg("session");
const RUNS = Number(arg("runs", 2));
const OUT_JSON = path.resolve(arg("json", "docs/perf-long-conversation/profile-current-hotspots.json"));
const PW = process.env.PLAYWRIGHT_PATH || arg("playwright");
const CHROMIUM = process.env.CHROMIUM_EXE || arg("chromium");

if (!SRC_DB || !LONG || !PW) throw new Error("need --db <axiom.db> --session <id> --playwright <index.mjs>");
if (!Number.isInteger(RUNS) || RUNS < 1) throw new Error("--runs must be a positive integer");
if (fs.existsSync(OUT_JSON)) throw new Error(`refusing to overwrite existing result: ${OUT_JSON}`);

const QUIET_MS = 700;
const HARD_TIMEOUT_MS = 60000;
const CLOSE_LIMIT_MS = 15000;      // browser.close() 的等待上限（超时按清理失败上报，不算关闭成功）
const LOCK_DIR = path.join(os.tmpdir(), "axiom-perf-measure.lock");
const STABLE_RECHECK_MS = 1500;
const BLOCKING_TASK_MS = 50; // trace 里主线程顶层 RunTask ≥50ms 视为阻塞任务（= PerformanceObserver longtask 口径的下限）
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
// 交叉核对判据：页面 longtask 按发生时间登记、trace 阻塞任务按时长降序，顺序本就不同，
// 因此只比「时长的多重集」——两副本各自升序后严格等长且逐项 ≤2ms（重复时长按次数计，不能折叠或复用）。
// 只排序副本，调用方的原始数组（要落盘的那份）顺序不变。
const crossCheckDurs = (pageDurs, traceDurs) => { const a = [...pageDurs].sort((x, y) => x - y), b = [...traceDurs].sort((x, y) => x - y); return a.length === b.length && a.every((ms, i) => Math.abs(ms - b[i]) <= 2); };

// ---------- 隔离准备（与 paired-first-screen.mjs 同口径） ----------
function materializeCurrent(root) {
  for (const dir of ["src", "public"]) {
    for (const name of fs.readdirSync(path.join(REPO, dir))) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.copyFileSync(path.join(REPO, dir, name), path.join(root, dir, name));
    }
  }
  fs.copyFileSync(path.join(REPO, "package.json"), path.join(root, "package.json"));
}
function linkNodeModules(root) {
  fs.symlinkSync(fs.realpathSync(path.join(REPO, "node_modules")), path.join(root, "node_modules"), "junction");
}
function buildHome(homeDir, srcDb, sessions) {
  fs.mkdirSync(homeDir, { recursive: true });
  const destDb = path.join(homeDir, "axiom.db");
  const src = new DatabaseSync(srcDb, { readOnly: true });
  src.exec(`VACUUM INTO '${destDb.replaceAll("'", "''")}'`);
  src.close();
  const srcHome = path.dirname(srcDb);
  for (const f of ["defaults.json", "models.compat.json", "models-store.json", "remote.json"]) {
    const from = path.join(srcHome, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(homeDir, f));
  }
  const db = new DatabaseSync(destDb);
  for (const { id, jsonlSrc } of sessions) {
    const copy = path.join(homeDir, "workspaces", path.basename(path.dirname(jsonlSrc)), path.basename(jsonlSrc));
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.copyFileSync(jsonlSrc, copy);
    db.prepare("UPDATE sessions SET session_file = ? WHERE id = ?").run(copy, id);
  }
  db.close();
}
async function startServer(root, homeDir, port) {
  const log = fs.openSync(path.join(homeDir, "server.log"), "a");
  let proc;
  try {
    proc = spawn(process.execPath, ["src/main.js"], {
      cwd: root, env: { ...process.env, AXIOM_HOME: homeDir, AXIOM_PORT: String(port), AXIOM_CWD: REPO },
      stdio: ["ignore", log, log],
    });
    spawnedServer = proc; // Keep failed startups reachable by outer cleanup.
  } finally { fs.closeSync(log); }
  let spawnError;
  proc.on("error", (error) => { spawnError = error; });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (proc.exitCode !== null) throw new Error(`server exited ${proc.exitCode}`);
      try {
        const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) return { proc, base };
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error("server did not become healthy");
  } catch (error) {
    try { await stopServer(proc); }
    catch (stopError) { error = new Error(`${error.message}; server cleanup: ${stopError.message}`); }
    throw error;
  }
}
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
});

// 清理等待设上限：超时抛错上报，绝不把超时当成功（不用 process.exit / 全局超时）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withLimit(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); }),
  ]);
}
// 只 kill 自己 spawn 的 PID，并有限轮询等待其真实退出；未退出即失败
async function stopServer(proc, attempts = 2, polls = 20, pollMs = 250) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  const gone = () => proc.exitCode !== null || proc.signalCode !== null;
  for (let a = 0; a < attempts && !gone(); a++) {
    proc.kill();
    for (let i = 0; i < polls && !gone(); i++) await sleep(pollMs);
  }
  if (!gone()) throw new Error(`server pid ${proc.pid} did not exit after kill`);
}

// ---------- 页面探针（完成判据 + longtask，与成对脚本同口径） ----------
const INIT = (opts) => {
  const p = (window.__perf = { longTaskEntries: [], settled: false, settledAtMs: null, firstMs: null, lastDomMutationMs: null, mutations: 0 });
  window.__snap = () => ({
    firstOutputMs: p.firstMs, lastDomMutationMs: p.lastDomMutationMs, settledAtMs: p.settledAtMs,
    nodes: document.getElementsByTagName("*").length,
    outputChildren: document.getElementById("output").children.length,
    messages: document.querySelectorAll("#output article.message").length,
    longTaskEntries: p.longTaskEntries.slice(),
  });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) p.longTaskEntries.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }); }).observe({ entryTypes: ["longtask"] });
  } catch {}
  let quiet;
  const arm = () => { clearTimeout(quiet); quiet = setTimeout(() => { p.settled = true; p.settledAtMs = Math.round(performance.now()); }, opts.quietMs); };
  const attach = () => {
    const out = document.getElementById("output");
    if (!out) return;
    new MutationObserver((rs) => {
      const t = performance.now();
      for (const r of rs) if (r.addedNodes.length && p.firstMs === null) p.firstMs = Math.round(t);
      p.mutations++; p.lastDomMutationMs = Math.round(t); arm();
    }).observe(out, { childList: true, subtree: true });
    arm();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attach); else attach();
};
const waitSettled = (page) => page.waitForFunction(() => window.__perf?.settled === true, null, { timeout: HARD_TIMEOUT_MS });

// 强制同步布局探针（仅测试侧拦截 DOM getter，不改产品代码），只记录 >1ms 的读值
const INIT_FORCED = () => {
  const rec = (window.__forced = { slowMs: 0, sites: {}, slowest: [] });
  const parse = (stack) => {
    for (const line of String(stack).split("\n").slice(1, 8)) {
      const m = /at\s+([^(\s]*?)\s*\((.+?):(\d+):(\d+)\)/.exec(line) || /at\s+(.+?):(\d+):(\d+)$/.exec(line);
      if (!m) continue;
      const file = m[2] || m[1];
      const name = m[3] ? (m[1] || "(anonymous)") : "(anonymous)";
      const lineNo = m[3] ? m[3] : m[2];
      const base = /([^/\\]+\.js)/.exec(file);
      if (base) return `${name} ${base[1]}:${lineNo}`;
    }
    return "(stack-unavailable)";
  };
  for (const prop of ["scrollHeight", "clientHeight", "offsetHeight"]) {
    const d = Object.getOwnPropertyDescriptor(Element.prototype, prop);
    if (!d?.get) continue;
    Object.defineProperty(Element.prototype, prop, {
      ...d,
      get() {
        const t = performance.now();
        const v = d.get.call(this);
        const dt = performance.now() - t;
        if (dt > 1) {
          const site = `${parse(new Error().stack)} [${prop}]`;
          const e = rec.sites[site] || (rec.sites[site] = { ms: 0, calls: 0, maxMs: 0 });
          e.ms += dt; e.calls++; e.maxMs = Math.max(e.maxMs, dt);
          rec.slowMs += dt;
          rec.slowest.push({ site, ms: +dt.toFixed(1), atMs: Math.round(t) });
          rec.slowest.sort((a, b) => b.ms - a.ms).length = 8;
        }
        return v;
      },
    });
  }
};

// ---------- trace 聚合（主线程） ----------
const MAIN_NAMES = ["ThreadControllerImpl::RunTask", "RunPostTaskCallback", "FireAnimationFrame", "FunctionCall", "Layout", "UpdateLayoutTree", "ParseHTML", "PrePaint", "Paint", "Layerize", "EventDispatch", "TimerFire", "MinorGC", "MajorGC", "Receive mojo message", "SimpleWatcher::OnHandleReady"];
function analyzeTrace(events) {
  const thread = new Map(events.filter((e) => e.ph === "M" && e.name === "thread_name").map((e) => [`${e.pid}:${e.tid}`, e.args?.name]));
  const X = events.filter((e) => e.ph === "X" && typeof e.dur === "number");
  // 渲染进程主线程 = CrRendererMain（取 X 事件总时长最大的那个同 tid 实例，避免多进程重名）
  const durByTid = new Map();
  for (const e of X) { const k = `${e.pid}:${e.tid}`; durByTid.set(k, (durByTid.get(k) || 0) + e.dur); }
  const mainTids = [...durByTid.entries()].filter(([k]) => thread.get(k) === "CrRendererMain").sort((a, b) => b[1] - a[1]);
  if (!mainTids.length) throw new Error("trace: no CrRendererMain thread found (blocked)");
  const mainTid = mainTids[0][0];
  const M = X.filter((e) => `${e.pid}:${e.tid}` === mainTid).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const commit = M.find((e) => e.name === "CommitLoad");
  const totals = {};
  for (const e of M) if (MAIN_NAMES.includes(e.name)) totals[e.name] = (totals[e.name] || 0) + e.dur;
  const ms = (o) => o && Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1000).toFixed(1)]));
  // 顶层 RunTask（不被其它 RunTask 包住）
  const runTasks = M.filter((e) => e.name === "ThreadControllerImpl::RunTask");
  const topLevel = runTasks.filter((e) => !runTasks.some((o) => o !== e && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur && o.dur > e.dur));
  const blocking = topLevel.filter((e) => e.dur >= BLOCKING_TASK_MS * 1000)
    .sort((a, b) => b.dur - a.dur)
    .map((e) => {
      const inside = {};
      for (const o of M) if (o !== e && o.ts >= e.ts && o.ts + o.dur <= e.ts + e.dur && MAIN_NAMES.includes(o.name)) inside[o.name] = (inside[o.name] || 0) + o.dur;
      // 只保留可直接归因的项（GC 各阶段等噪声去掉）
      for (const k of Object.keys(inside)) if (!["RunPostTaskCallback", "FireAnimationFrame", "FunctionCall", "Layout", "UpdateLayoutTree", "ParseHTML", "PrePaint", "Paint", "Layerize", "EventDispatch", "TimerFire", "Receive mojo message", "SimpleWatcher::OnHandleReady", "MajorGC", "MinorGC"].includes(k)) delete inside[k];
      const fnCalls = M.filter((o) => o.name === "FunctionCall" && o.ts >= e.ts && o.ts + o.dur <= e.ts + e.dur)
        .sort((a, b) => b.dur - a.dur).slice(0, 6)
        .map((o) => `${o.args?.data?.functionName || "(anonymous)"} ${String(o.args?.data?.url || "").split("/").pop()}:${(o.args?.data?.lineNumber ?? -1) + 1} ${(o.dur / 1000).toFixed(1)}ms`);
      return { ts: e.ts, durMs: +(e.dur / 1000).toFixed(1), fromCommitMs: commit ? +((e.ts - commit.ts) / 1000).toFixed(0) : null, compositionMs: ms(inside), topFunctionCalls: fnCalls };
    });
  return { commitTs: commit?.ts ?? null, mainThreadTotalsMs: ms(totals), blockingTasks: blocking };
}

// ---------- profile 聚合（采样点按 TimeTicks 绝对时间切窗） ----------
const IDLE_NAMES = new Set(["(idle)", "(root)", ""]);
const NATIVE_NAMES = new Set(["(program)", "(garbage collector)"]);
const PHASE_NAMES = [
  ["beginSnapshot", new Set(["beginSnapshot", "snapshot"])],
  ["placeSnapshotMessage→renderMessage/Markdown", new Set(["placeSnapshotMessage", "renderMessage", "renderMarkdown", "flush", "paint", "draw", "card", "toolState", "applyEvent"])],
  ["finishSnapshot", new Set(["finishSnapshot"])],
  ["drainSnapshotQueue", new Set(["drainSnapshotQueue"])],
];
const POST_RAF = (f) => f.file === "app.js" && f.line === 2293; // finishSnapshot 尾部 rAF 回调
const phaseOfStack = (chain) => {
  for (const f of chain) {
    if (f.name === "beginSnapshot" || f.name === "snapshot") return "beginSnapshot";
    for (const [phase, names] of PHASE_NAMES) if (names.has(f.name)) return phase;
    if ((f.name === "resizePrompt" || f.name === "resizePrompt@rAF") && chain.some(POST_RAF)) return "finishSnapshot-post-rAF(scroll+resizePrompt)";
    if (POST_RAF(f)) return "finishSnapshot-post-rAF(scroll+resizePrompt)";
  }
  return "outside-snapshot";
};

function analyzeProfile(profile, { blockingTasks = [] } = {}) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const frame = (id) => {
    const cf = byId.get(id)?.callFrame || { functionName: "(unknown)", url: "", lineNumber: -1 };
    const name = cf.functionName || (cf.url ? "(anonymous)" : "(?)");
    const file = cf.url ? cf.url.split("?")[0].split("/").pop() : "";
    return { name, file, line: cf.lineNumber >= 0 ? cf.lineNumber + 1 : null, id: `${name} @ ${file}:${cf.lineNumber + 1}` };
  };
  const cache = new Map();
  const chain = (id) => { if (!cache.has(id)) { const out = []; for (let c = id; c !== undefined && out.length < 40; c = parent.get(c)) out.push(frame(c)); cache.set(id, out); } return cache.get(id); };

  const n = profile.samples.length;
  const self = new Map();
  const absTs = new Float64Array(n);
  let acc = profile.startTime;
  let endTs = acc;
  for (let i = 0; i < n; i++) { const d = profile.timeDeltas[i] || 0; acc += d; absTs[i] = acc; }
  endTs = acc;

  const windowStats = (fromTs, toTs, limit) => {
    const agg = new Map();
    const phases = {};
    let winUs = 0, idleUs = 0, nativeUs = 0;
    for (let i = 0; i < n; i++) {
      if (absTs[i] < fromTs || absTs[i] >= toTs) continue;
      const us = profile.timeDeltas[i] || 0;
      const id = profile.samples[i];
      const f = frame(id);
      winUs += us;
      if (f.file === "" && IDLE_NAMES.has(f.name)) idleUs += us;
      if (f.file === "" && NATIVE_NAMES.has(f.name)) nativeUs += us;
      const cur = agg.get(id) || { us: 0, hits: 0 };
      cur.us += us; cur.hits++; agg.set(id, cur);
      const ph = phaseOfStack(chain(id));
      phases[ph] = (phases[ph] || 0) + us;
    }
    const activeUs = winUs - idleUs;
    const hotspots = [...agg.entries()].sort((a, b) => b[1].us - a[1].us).slice(0, limit).map(([id, v]) => {
      const f = frame(id);
      return {
        fn: f.name, file: f.file, line: f.line,
        selfMs: +(v.us / 1000).toFixed(1), samples: v.hits,
        shareOfWindowPct: winUs ? +((v.us / winUs) * 100).toFixed(1) : 0,
        shareOfActivePct: activeUs ? +((v.us / activeUs) * 100).toFixed(1) : 0,
        stack: chain(id).slice(0, 8).map((x) => `${x.name}(${x.file}:${x.line ?? "?"})`),
      };
    });
    const ms = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1000).toFixed(1)]));
    return {
      samples: [...agg.values()].reduce((a, b) => a + b.hits, 0),
      windowMs: +(winUs / 1000).toFixed(1),
      idleMs: +(idleUs / 1000).toFixed(1),
      activeMs: +(activeUs / 1000).toFixed(1),
      nativeProgramMs: +(nativeUs / 1000).toFixed(1),
      phaseActiveMs: ms(phases),
      hotspots,
    };
  };

  const perBlockingTask = blockingTasks.map((t) => ({
    traceTaskMs: t.durMs,
    fromCommitMs: t.fromCommitMs,
    traceCompositionMs: t.compositionMs,
    traceTopFunctionCalls: t.topFunctionCalls,
    profile: windowStats(t.ts, t.ts + t.durMs * 1000, 6),
  }));
  return { samples: n, profileDurationMs: +((endTs - profile.startTime) / 1000).toFixed(1), perBlockingTask, wholeWindow: windowStats(0, Infinity, 10) };
}

// ---------- 主流程 ----------
let browser, proc, spawnedServer, releaseLock, tmp, rawDir;
const out = {
  scene: "current（工作树未提交版本）长会话首屏加载 —— Chromium CPU profile 热点定位",
  generatedAt: new Date().toISOString(),
  method: {
    capture: "同一次导航同时开 CDP Profiler（100µs 采样）与 CDP Tracing（devtools.timeline,toplevel）；两者时间戳同属 Chromium TimeTicks(µs) 域，采样点按 trace 任务区间直接切片",
    completion: "#output 子树静默 700ms 判完成，硬超时 60s，完成后 +1.5s 复核计数不变量",
    blockingTask: `主线程顶层 ThreadControllerImpl::RunTask ≥ ${BLOCKING_TASK_MS}ms（与 PerformanceObserver longtask 同量级口径）`,
    forcedLayoutProbe: "额外一次运行：拦截 Element.prototype.scrollHeight/clientHeight/offsetHeight 的 getter（测试侧注入），按调用点累计 >1ms 的同步布局耗时",
    phaseRule: PHASE_NAMES.map(([name, set]) => `${name} ← ${[...set].join("/")}`).concat("finishSnapshot-post-rAF ← app.js:2293 rAF 回调 / resizePrompt"),
    caveat: "采样与 tracing 本身有开销，绝对耗时会略高于无观测时的成对测量值；占比与调用链结论不受影响",
  },
  provenance: { repo: REPO, sourceDb: SRC_DB, longSessionId: LONG, isolation: "VACUUM INTO 副本库 + JSONL 副本，session_file 指向副本；源库只读打开", rawArtifactsLocation: null, sampleTextInRepo: false },
  env: null,
  runs: { measured: [], forcedLayout: null },
};

try {
  // 参数已校验、输出不存在：进入任何临时副本创建之前取全局测量锁
  releaseLock = acquireMeasureLock(OUT_JSON, LOCK_DIR);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-profile-current-"));
  console.error(`[profile-current] temp(root): ${tmp}`);
  const codeRoot = path.join(tmp, "code-current");
  const home = path.join(tmp, "home-current");
  rawDir = path.join(tmp, "raw-profiles");
  fs.mkdirSync(rawDir, { recursive: true });
  out.provenance.rawArtifactsLocation = rawDir;

  const src = new DatabaseSync(SRC_DB, { readOnly: true });
  const row = src.prepare("SELECT session_file FROM sessions WHERE id = ?").get(LONG);
  src.close();
  if (!row?.session_file || !fs.existsSync(row.session_file)) throw new Error("long session JSONL missing (blocked)");

  fs.mkdirSync(codeRoot, { recursive: true });
  materializeCurrent(codeRoot);
  linkNodeModules(codeRoot);
  buildHome(home, SRC_DB, [{ id: LONG, jsonlSrc: row.session_file }]);
  out.provenance.longSessionJsonl = { sha256: sha256(fs.readFileSync(row.session_file)), bytes: fs.statSync(row.session_file).size };
  out.provenance.codeSha256 = {
    appJs: sha256(fs.readFileSync(path.join(codeRoot, "public", "app.js"))),
    markdownJs: sha256(fs.readFileSync(path.join(codeRoot, "public", "markdown.js"))),
    streamRendererJs: sha256(fs.readFileSync(path.join(codeRoot, "public", "stream-renderer.js"))),
  };

  const port = await freePort();
  const started = await startServer(codeRoot, home, port);
  proc = started.proc;
  const base = started.base;

  const pwMod = await import(PW.startsWith("file:") ? PW : pathToFileURL(PW).href);
  const { chromium } = pwMod.default || pwMod;
  browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

  const loadOnce = async ({ trace, forced, label }) => {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
    if (!r?.ok) throw new Error("isolated server not healthy (blocked)");
    const page = await browser.newPage();
    await page.addInitScript(INIT, { quietMs: QUIET_MS });
    if (forced) await page.addInitScript(INIT_FORCED);
    const client = await page.context().newCDPSession(page);
    const traceEvents = [];
    if (trace) {
      client.on("Tracing.dataCollected", ({ value }) => traceEvents.push(...value));
      await client.send("Tracing.start", { categories: "devtools.timeline,toplevel", transferMode: "ReportEvents" });
    }
    await client.send("Profiler.enable");
    await client.send("Profiler.setSamplingInterval", { interval: 100 });
    await client.send("Profiler.start");
    const t0 = Date.now();
    await page.goto(`${base}/#session=${LONG}`, { waitUntil: "load" });
    await waitSettled(page);
    const snap = await page.evaluate(() => ({ ...window.__snap(), ua: navigator.userAgent, hw: navigator.hardwareConcurrency }));
    const wallMs = Date.now() - t0;
    const { profile: prof } = await client.send("Profiler.stop");
    fs.writeFileSync(path.join(rawDir, `${label}.cpuprofile`), JSON.stringify(prof));
    let traceResult = null;
    if (trace) {
      const done = new Promise((res) => client.once("Tracing.tracingComplete", res));
      await client.send("Tracing.end");
      await done;
      fs.writeFileSync(path.join(rawDir, `${label}.trace.json`), JSON.stringify(traceEvents));
      traceResult = analyzeTrace(traceEvents);
    }
    const analyzed = analyzeProfile(prof, { blockingTasks: traceResult?.blockingTasks || [] });
    const forcedData = forced ? await page.evaluate(() => {
      const f = window.__forced || { slowMs: 0, sites: {}, slowest: [] };
      return {
        forcedLayoutSlowMs: +f.slowMs.toFixed(1),
        sites: Object.fromEntries(Object.entries(f.sites).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8).map(([k, v]) => [k, { ms: +v.ms.toFixed(1), calls: v.calls, maxMs: +v.maxMs.toFixed(1) }])),
        slowest: f.slowest.slice(0, 5),
      };
    }) : null;
    const before = JSON.stringify([snap.nodes, snap.outputChildren, snap.messages]);
    await page.waitForTimeout(STABLE_RECHECK_MS);
    const after = await page.evaluate(() => window.__snap());
    if (before !== JSON.stringify([after.nodes, after.outputChildren, after.messages])) throw new Error("unstable after settle");
    if (snap.firstOutputMs === null) throw new Error("no visible output (blocked)");
    // 交叉核对：trace 阻塞任务与页面 longtask 应一一对应（顺序无关，见 crossCheckDurs）
    const lts = snap.longTaskEntries.map((t) => t.dur);
    const tts = (traceResult?.blockingTasks || []).map((t) => t.durMs);
    const crossCheckMatched = crossCheckDurs(lts, tts);
    await page.close();
    return {
      wallMs, snap: { firstOutputMs: snap.firstOutputMs, lastDomMutationMs: snap.lastDomMutationMs, settledAtMs: snap.settledAtMs, nodes: snap.nodes, outputChildren: snap.outputChildren, messages: snap.messages, longTaskEntries: snap.longTaskEntries },
      ua: snap.ua, hw: snap.hw, profile: analyzed, trace: traceResult, forced: forcedData,
      crossCheck: { pageLongTaskDurs: lts, traceBlockingTaskDurs: tts, matched: crossCheckMatched },
    };
  };

  for (let i = 0; i < RUNS; i++) {
    const r = await loadOnce({ trace: true, label: `run-${i + 1}` });
    if (!out.env) out.env = { ua: r.ua, hardwareConcurrency: r.hw };
    out.runs.measured.push({ run: i + 1, wallMs: r.wallMs, ...r.snap, profile: r.profile, trace: r.trace, crossCheck: r.crossCheck });
    const bt = r.profile.perBlockingTask;
    console.error(`[profile-current] run ${i + 1}: longtasks=${JSON.stringify(r.snap.longTaskEntries.map((t) => `${t.start}+${t.dur}`))} trace tasks=${JSON.stringify(r.trace.blockingTasks.map((t) => t.durMs))} matched=${r.crossCheck.matched}`);
    for (const t of bt.slice(0, 3)) console.error(`    task ${t.traceTaskMs}ms(+${t.fromCommitMs}ms commit): active=${t.profile.activeMs} native=${t.profile.nativeProgramMs} phase=${JSON.stringify(t.profile.phaseActiveMs)} top=${t.profile.hotspots[0] ? t.profile.hotspots[0].fn + " " + t.profile.hotspots[0].selfMs + "ms/" + t.profile.hotspots[0].shareOfActivePct + "%" : "-"}`);
  }

  const fp = await loadOnce({ trace: false, forced: true, label: "forced" });
  out.runs.forcedLayout = { wallMs: fp.wallMs, ...fp.snap, ...fp.forced };
  console.error(`[profile-current] forced-layout run: slowForcedReads=${out.runs.forcedLayout.forcedLayoutSlowMs}ms sites=${JSON.stringify(Object.keys(out.runs.forcedLayout.sites))}`);

  // 汇总：以「trace 与页面 longtask 对齐」的运行的 profile 为主证据
  const allTasks = out.runs.measured.flatMap((r) => r.profile.perBlockingTask.map((t) => ({ run: r.run, ...t })));
  const biggest = allTasks.reduce((a, b) => (b.profile.activeMs > a.profile.activeMs ? b : a));
  out.summary = {
    crossCheckAllMatched: out.runs.measured.every((r) => r.crossCheck.matched),
    pageLongTasks: out.runs.measured.map((r) => ({ run: r.run, longTasks: r.longTaskEntries })),
    blockingTasksByRun: out.runs.measured.map((r) => ({ run: r.run, tasks: r.profile.perBlockingTask.map((t) => ({ ms: t.traceTaskMs, fromCommitMs: t.fromCommitMs, activeMs: t.profile.activeMs, nativeProgramMs: t.profile.nativeProgramMs, phaseActiveMs: t.profile.phaseActiveMs, top3: t.profile.hotspots.slice(0, 3).map((h) => `${h.fn}(${h.file}:${h.line}) ${h.selfMs}ms/${h.shareOfActivePct}%`) })) })),
    biggestTask: { run: biggest.run, traceTaskMs: biggest.traceTaskMs, fromCommitMs: biggest.fromCommitMs, traceCompositionMs: biggest.traceCompositionMs, traceTopFunctionCalls: biggest.traceTopFunctionCalls, profile: biggest.profile },
    forcedLayoutSites: out.runs.forcedLayout.sites,
    wholeWindowTop: out.runs.measured.map((r) => ({ run: r.run, hotspots: r.profile.wholeWindow.hotspots.slice(0, 6), phaseActiveMs: r.profile.wholeWindow.phaseActiveMs })),
  };
  out.verification = { passed: out.summary.crossCheckAllMatched, stableRecheck: "每次运行后 +1.5s 计数快照不变", counts: out.runs.measured.map((r) => [r.nodes, r.outputChildren, r.messages]) };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1), { flag: "wx" });
  if (!out.verification.passed) process.exitCode = 1;
  console.log(JSON.stringify({ ok: out.verification.passed, out: OUT_JSON, rawDir, summary: out.summary }, null, 1));
} catch (error) {
  const fail = { ok: false, error: String(error?.message || error), stack: String(error?.stack || "") };
  console.error(JSON.stringify(fail, null, 1));
  process.exitCode = 1;
} finally {
  // 锁只能在「浏览器 + 自己起的服务」都已确认退出后释放；任一步清理失败则保留锁并报错
  const cleanupErrors = [];
  let browserClosed = true;
  if (browser) {
    try { await withLimit(browser.close(), CLOSE_LIMIT_MS, "browser.close"); }
    catch (error) { browserClosed = false; cleanupErrors.push(`browser.close: ${error.message}`); }
  }
  try { await stopServer(spawnedServer); }
  catch (error) { cleanupErrors.push(error.message); }
  if (browserClosed && !cleanupErrors.length) {
    try { releaseLock?.(); }
    catch (error) { cleanupErrors.push(`release lock: ${error.message}`); }
  } else {
    cleanupErrors.push(`measurement lock kept: ${LOCK_DIR}（确认进程已退出后手动删除）`);
  }
  if (cleanupErrors.length) { process.exitCode = 1; console.error(`[profile-current] cleanup incomplete: ${cleanupErrors.join("; ")}`); }
  if (rawDir) console.error(`[profile-current] raw (temp, 未入库): ${rawDir}`);
}
