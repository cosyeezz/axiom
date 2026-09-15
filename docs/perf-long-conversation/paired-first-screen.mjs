// 同机成对（baseline c7cf8a5 / current 工作树）首屏与切换测量 —— 长对话性能调研·独立复核轮
//
// 与旧脚本 docs/perf-long-conversation/measure.mjs 的关键差别（完成判据）：
//   - 旧脚本 ready() = waitForFunction(工具记录 > 300).catch(()=>{})，会吞掉超时，
//     可能在后台仍在分片渲染时就读数；本脚本改为「#output 子树静默 quietMs 无任何
//     DOM 变更」作为完成事件，硬超时直接抛错，再静默 1.5s 复核计数不变量是否漂移。
//   - 另外用 WebSocket 直接 session.attach 取服务端真实 state.messages 数当地面真值，
//     并断言 baseline/current 两实例渲染出的 DOM 计数完全一致（同一真实会话的完整重建）。
//
// 隔离：源库只读打开，VACUUM INTO 出每个版本的独立副本；会话 JSONL 复制进副本 home，
// 并把副本库的 session_file 指向副本；不对原库启动服务；会话原文不入仓库（只记哈希）。
//
// 用法：
//   node paired-first-screen.mjs \
//     --repo <worktree 路径>                    # current = 该工作树（含未提交修改）
//     --baseline-commit c7cf8a5
//     --db <源 axiom.db>  --session <长会话 id> --short <短会话 id>
//     --runs 3 --json <输出 json 路径>
//     [--playwright <playwright/index.mjs>] [--chromium <chrome.exe>] [--keep]
//
// 依赖：node:sqlite（Node >=22.13）、Playwright、Chromium 可执行文件。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { acquireMeasureLock } from "./measure-lock.mjs";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const has = (name) => argv.includes(`--${name}`);

const REPO = path.resolve(arg("repo", process.cwd()));
const BASELINE_COMMIT = arg("baseline-commit", "c7cf8a5");
const SRC_DB = arg("db") ? path.resolve(arg("db")) : undefined;
const LONG = arg("session");
const SHORT = arg("short");
const RUNS = Number(arg("runs", 3));
const OUT_JSON = arg("json") ? path.resolve(arg("json")) : undefined;
const PW = process.env.PLAYWRIGHT_PATH || arg("playwright");
const CHROMIUM = process.env.CHROMIUM_EXE || arg("chromium");
const KEEP = has("keep");

if (!SRC_DB || !LONG || !SHORT || !PW || !OUT_JSON) throw new Error("need --db <axiom.db> --session <id> --short <id> --json <out.json> [--playwright <index.mjs>]");
if (!Number.isInteger(RUNS) || RUNS < 1) throw new Error("--runs must be a positive integer");
if (fs.existsSync(OUT_JSON)) throw new Error(`refusing to overwrite existing result: ${OUT_JSON}`);
const FAIL_JSON = OUT_JSON.replace(/\.json$/, ".failed.json");

const QUIET_MS = 700;          // #output 子树静默窗口：无任何 DOM 变更即视为重建完成
const HARD_TIMEOUT_MS = 60000; // 完成事件硬超时（超时抛错，不吞）
const STABLE_RECHECK_MS = 1500;// 完成后追加静默复核窗口
const CLOSE_LIMIT_MS = 15000;  // browser.close() 的等待上限（超时按清理失败上报，不算关闭成功）
const LOCK_DIR = path.join(os.tmpdir(), "axiom-perf-measure.lock");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const readOrNull = (f) => { try { return fs.readFileSync(f); } catch { return null; } };

// ---------- 代码根（两个版本各自的 src/public，共用原 node_modules） ----------
function materializeCurrent(root) {
  for (const dir of ["src", "public"]) {
    for (const name of fs.readdirSync(path.join(REPO, dir))) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.copyFileSync(path.join(REPO, dir, name), path.join(root, dir, name));
    }
  }
  fs.copyFileSync(path.join(REPO, "package.json"), path.join(root, "package.json"));
}
function materializeBaseline(root) {
  const files = execFileSync("git", ["-C", REPO, "ls-tree", "-r", "--name-only", BASELINE_COMMIT, "--", "src", "public", "package.json"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  for (const f of files) {
    const buf = execFileSync("git", ["-C", REPO, "show", `${BASELINE_COMMIT}:${f}`], { maxBuffer: 64 * 1024 * 1024 });
    fs.mkdirSync(path.join(root, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), buf);
  }
}
function linkNodeModules(root) {
  const target = fs.realpathSync(path.join(REPO, "node_modules"));
  fs.symlinkSync(target, path.join(root, "node_modules"), "junction");
}

// ---------- 隔离 home（副本库 + 副本 JSONL） ----------
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
  const copies = {};
  for (const { id, jsonlSrc } of sessions) {
    const wsDir = path.basename(path.dirname(jsonlSrc));
    const copy = path.join(homeDir, "workspaces", wsDir, path.basename(jsonlSrc));
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.copyFileSync(jsonlSrc, copy);
    db.prepare("UPDATE sessions SET session_file = ? WHERE id = ?").run(copy, id);
    copies[id] = copy;
  }
  db.close();
  return { homeDir, destDb, copies };
}

// ---------- 服务进程 ----------
async function startServer(root, homeDir, port) {
  const log = fs.openSync(path.join(homeDir, "server.log"), "a");
  let proc;
  try {
    proc = spawn(process.execPath, ["src/main.js"], {
      cwd: root,
      env: { ...process.env, AXIOM_HOME: homeDir, AXIOM_PORT: String(port), AXIOM_CWD: "F:/Axiom" },
      stdio: ["ignore", log, log],
    });
    procs.push(proc); // Register before awaiting health, including failed startup.
  } finally { fs.closeSync(log); }
  let spawnError;
  proc.on("error", (error) => { spawnError = error; });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (proc.exitCode !== null) throw new Error(`server ${root} exited ${proc.exitCode}`);
      try {
        const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) return { proc, base };
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`server on ${port} did not become healthy`);
  } catch (error) {
    try { await stopServer(proc); }
    catch (stopError) { error = new Error(`${error.message}; server cleanup: ${stopError.message}`); }
    throw error;
  }
}

// ---------- 地面真值：WS session.attach 取服务端真实 state ----------
// 自建 WS 登记：close() 只是发起关闭，不等于已关闭；确认只能靠 'close' 事件（或已是 CLOSED）。
const openSockets = new Set();
function attachGroundTruth(base, sessionId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${new URL(base).host}/ws`, ["axiom"]);
    openSockets.add(ws); // 外层 finally 据此等待确认；未确认则保锁
    let timer = null;
    let settled = false;
    // 唯一收口：所有路径（成功 / 拒绝 / JSON 异常 / ws 错误 / 提前 close / 超时）都清定时器 + 发起关闭。
    // 事件回调里的一切异常都转成 reject，绝不从回调抛出。
    const finalize = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      timer = null;
      try { ws.close(); } catch {}
      if (error) reject(error); else resolve(value);
    };
    ws.onerror = () => finalize(new Error("ws error"));
    // 提前断开：既从登记表移除（已确认关闭），又判为失败
    ws.onclose = () => { openSockets.delete(ws); finalize(new Error("ws closed before ground truth response")); };
    timer = setTimeout(() => finalize(new Error("attach ground truth timeout")), 30000);
    ws.onopen = () => {
      try { ws.send(JSON.stringify({ id: "gt", type: "session.attach", sessionId })); }
      catch (error) { finalize(new Error(`attach send failed: ${error.message}`)); }
    };
    ws.onmessage = ({ data }) => {
      try {
        let m;
        try { m = JSON.parse(data); }
        catch (error) { return finalize(new Error(`ground truth response is not JSON: ${error.message}`)); }
        if (m?.type !== "response" || m.id !== "gt") return;
        if (!m.ok) return finalize(new Error(String(m.error)));
        const messages = m.data?.messages || [];
        const roles = {};
        for (const x of messages) roles[x.message?.role] = (roles[x.message?.role] || 0) + 1;
        // 尾部内容探针：取最后一条 user 消息里最长的无空白片段（只用于在页内做包含断言，原文不落盘）。
        const textOf = (message) => typeof message?.content === "string" ? message.content
          : (message?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join(" ");
        let snippet = "";
        for (let i = messages.length - 1; i >= 0 && !snippet; i--) {
          if (messages[i].message?.role !== "user") continue;
          const token = textOf(messages[i].message).split(/\s+/).sort((a, b) => b.length - a.length)[0] || "";
          if (token.length >= 8) snippet = token.slice(0, 24);
        }
        finalize(null, { messages: messages.length, roles, tasks: (m.data?.tasks || []).length, live: Object.keys(m.data?.live || {}).length, tailSnippet: snippet, tailSnippetSha256: snippet ? sha256(snippet) : null });
      } catch (error) { finalize(new Error(`ground truth processing failed: ${error.message}`)); }
    };
  });
}

// ---------- 页面探针 ----------
const INIT = (opts) => {
  const p = (window.__perf = {
    longTaskEntries: [], firstMs: null, lastMs: null, lastDomMutationMs: null,
    mutations: 0, added: 0, settled: false, settledAtMs: null, phaseStart: 0,
  });
  window.__snap = () => ({
    firstOutputMs: p.firstMs,
    lastOutputMs: p.lastMs,
    lastDomMutationMs: p.lastDomMutationMs,
    settledAtMs: p.settledAtMs,
    mutations: p.mutations,
    addedNodes: p.added,
    nodes: document.getElementsByTagName("*").length,
    outputChildren: document.getElementById("output").children.length,
    messages: document.querySelectorAll("#output article.message").length,
    toolRecords: document.querySelectorAll("details.tool-record").length,
    callGroups: document.querySelectorAll("details.call-group").length,
    longTaskEntries: p.longTaskEntries.slice(),
    longTasks: p.longTaskEntries.map((t) => t.dur),
  });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) p.longTaskEntries.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
    }).observe({ entryTypes: ["longtask"] });
  } catch {}
  let quietTimer;
  const arm = () => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      p.settled = true;
      p.settledAtMs = Math.round(performance.now());
    }, opts.quietMs);
  };
  window.__resetPerf = (phaseStart) => {
    p.firstMs = null; p.lastMs = null; p.lastDomMutationMs = null;
    p.mutations = 0; p.added = 0; p.settled = false; p.settledAtMs = null;
    p.phaseStart = Math.round(phaseStart ?? performance.now());
    p.resetAt = Math.round(performance.now());
    p.longTaskEntries.length = 0;
    arm();
  };
  const attach = () => {
    const out = document.getElementById("output");
    if (!out) return;
    // 直接子节点：与旧脚本 firstOutputMs/lastOutputMs 口径一致
    new MutationObserver((records) => {
      const t = performance.now();
      for (const r of records) if (r.addedNodes.length) { p.added += r.addedNodes.length; if (p.firstMs === null) p.firstMs = Math.round(t); }
      p.mutations++;
      p.lastMs = Math.round(t);
      p.lastDomMutationMs = Math.round(t);
      arm();
    }).observe(out, { childList: true });
    // 子树：只用于完成判据（静默窗口）
    new MutationObserver((records) => {
      const t = performance.now();
      p.mutations += records.length;
      p.lastDomMutationMs = Math.round(t);
      arm();
    }).observe(out, { childList: true, subtree: true });
    arm();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attach);
  else attach();
};

const waitSettled = (page) =>
  page.waitForFunction(() => window.__perf?.settled === true, null, { timeout: HARD_TIMEOUT_MS }); // 超时抛错，不吞

// 语义计数（重建完整性）：版本间/运行间必须完全一致。
const countsKey = (s) => JSON.stringify([s.outputChildren, s.messages, s.toolRecords, s.callGroups]);
// 全量快照（静默复核）：同一页内必须逐字节稳定。
const fullKey = (s) => JSON.stringify([s.nodes, s.outputChildren, s.messages, s.toolRecords, s.callGroups, s.lastDomMutationMs]);
const phaseLongMax = (r) => {
  const done = r.longTaskEntries.filter((t) => t.start <= (r.settledAtMs ?? Infinity));
  return done.length ? Math.max(...done.map((t) => t.dur)) : 0;
};

const assertEq = (label, a, b) => {
  if (a !== b) throw new Error(`verification failed: ${label}: ${a} !== ${b}`);
};

// ---------- 主流程 ----------
// 端口动态取空闲（避免与同机其他代理/服务撞端口）
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
// 自建 socket 的退出确认：close() 不算确认，必须等到 'close' 事件（或已经 CLOSED）
async function closeSocket(ws, ms) {
  if (ws.readyState === ws.CLOSED) { openSockets.delete(ws); return; }
  await withLimit(new Promise((resolve) => {
    ws.addEventListener("close", resolve, { once: true });
    try { ws.close(); } catch {}
  }), ms, "socket close");
  openSockets.delete(ws);
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

const procs = [];
let browser, srv, releaseLock, tmp;

try {
  // 参数已校验、输出不存在：进入任何临时副本创建之前取全局测量锁
  releaseLock = acquireMeasureLock(OUT_JSON, LOCK_DIR);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-paired-first-screen-"));
  console.error(`[paired-first-screen] temp: ${tmp}`);
  const codeRoots = { baseline: path.join(tmp, "code-baseline"), current: path.join(tmp, "code-current") };
  const homes = { baseline: path.join(tmp, "home-baseline"), current: path.join(tmp, "home-current") };

  // 样本来源（只读源库定位 JSONL）
  const src = new DatabaseSync(SRC_DB, { readOnly: true });
  const row = src.prepare("SELECT session_file, title FROM sessions WHERE id = ?").get(LONG);
  const shortRow = src.prepare("SELECT session_file FROM sessions WHERE id = ?").get(SHORT);
  src.close();
  if (!row?.session_file || !fs.existsSync(row.session_file)) throw new Error("long session JSONL missing (blocked)");
  if (!shortRow?.session_file || !fs.existsSync(shortRow.session_file)) throw new Error("short session JSONL missing (blocked)");

  fs.mkdirSync(codeRoots.current, { recursive: true });
  fs.mkdirSync(codeRoots.baseline, { recursive: true });
  materializeCurrent(codeRoots.current);
  materializeBaseline(codeRoots.baseline);
  linkNodeModules(codeRoots.current);
  linkNodeModules(codeRoots.baseline);
  buildHome(homes.current, SRC_DB, [{ id: LONG, jsonlSrc: row.session_file }, { id: SHORT, jsonlSrc: shortRow.session_file }]);
  buildHome(homes.baseline, SRC_DB, [{ id: LONG, jsonlSrc: row.session_file }, { id: SHORT, jsonlSrc: shortRow.session_file }]);

  const srcDbInfo = fs.statSync(SRC_DB);
  const jsonlSha = sha256(fs.readFileSync(row.session_file));

  const ports = { baseline: await freePort(), current: await freePort() };
  srv = {};
  for (const v of ["baseline", "current"]) {
    const started = await startServer(codeRoots[v], homes[v], ports[v]);
    srv[v] = started.base;
  }

  const gt = { baseline: await attachGroundTruth(srv.baseline, LONG), current: await attachGroundTruth(srv.current, LONG) };
  assertEq("ground truth messages baseline=current", gt.baseline.messages, gt.current.messages);
  assertEq("ground truth roles baseline=current", JSON.stringify(gt.baseline.roles), JSON.stringify(gt.current.roles));
  const gtShort = await attachGroundTruth(srv.baseline, SHORT);

  const pwMod = await import(PW.startsWith("file:") ? PW : pathToFileURL(PW).href);
  const { chromium } = pwMod.default || pwMod;
  browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

  const out = {
    scene: "同机成对首屏/切换：c7cf8a5 与工作树未提交版本，交替各 3 次",
    generatedAt: new Date().toISOString(),
    completionCriterion: {
      rule: `#output 子树在 ${QUIET_MS}ms 内无任何 DOM 变更即判为重建完成；硬超时 ${HARD_TIMEOUT_MS}ms 直接抛错（旧脚本的 .catch(()=>{}) 吞超时已移除）`,
      postCheck: `完成后追加 ${STABLE_RECHECK_MS}ms 静默并复核计数不变量；并断言 baseline/current 两实例 DOM 计数完全一致`,
      note: "firstOutputMs = #output 首次新增子节点（可见消息输出）；longTasks = 渲染阶段 [phaseStart, settledAtMs] 内的 longtask",
    },
    provenance: {
      repo: REPO,
      baselineCommit: BASELINE_COMMIT,
      current: "worktree working tree (uncommitted)",
      codeSha256: {},
      sourceDb: { path: SRC_DB, bytes: srcDbInfo.size, mtimeMs: Math.round(srcDbInfo.mtimeMs) },
      longSession: { id: LONG, jsonlSha256: jsonlSha, jsonlBytes: fs.statSync(row.session_file).size },
      shortSession: { id: SHORT, jsonlBytes: fs.statSync(shortRow.session_file).size, groundTruth: { messages: gtShort.messages, roles: gtShort.roles } },
      isolation: "VACUUM INTO 副本库 + JSONL 副本，session_file 指向副本；源库只读打开",
      sampleTextInRepo: false,
    },
    groundTruth: { baseline: { messages: gt.baseline.messages, roles: gt.baseline.roles, tasks: gt.baseline.tasks, live: gt.baseline.live, tailSnippetSha256: gt.baseline.tailSnippetSha256 }, current: { messages: gt.current.messages, roles: gt.current.roles, tasks: gt.current.tasks, live: gt.current.live } },
    env: null,
    runs: { firstScreen: [], switch: [] },
  };
  for (const v of ["baseline", "current"]) {
    const f = path.join(codeRoots[v], "public", "app.js");
    out.provenance.codeSha256[v] = { appJs: sha256(fs.readFileSync(f)), markdownJs: sha256(fs.readFileSync(path.join(codeRoots[v], "public", "markdown.js"))) };
  }

  const ensureHealthy = async (v) => {
    const r = await fetch(`${srv[v]}/health`).catch(() => null);
    if (!r?.ok) throw new Error(`${v} server is not healthy before navigation (blocked)`);
  };

  const measureFirstScreen = async (v) => {
    await ensureHealthy(v);
    const page = await browser.newPage();
    await page.addInitScript(INIT, { quietMs: QUIET_MS });
    const t0 = Date.now();
    await page.goto(`${srv[v]}/#session=${LONG}`, { waitUntil: "load" });
    await waitSettled(page);
    if (out.env === null) out.env = await page.evaluate(() => ({ ua: navigator.userAgent, hw: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? null, viewport: [innerWidth, innerHeight] }));
    const r = await page.evaluate((scene) => ({ scene, ...window.__snap(), phaseStartMs: window.__perf.phaseStart }), "firstScreen");
    if (r.firstOutputMs === null) throw new Error(`${v} firstScreen: no visible output ever (blocked)`);
    const tailFound = await page.evaluate((s) => !s || document.body.textContent.includes(s), gt.baseline.tailSnippet);
    r.tailContentFound = tailFound;
    const k1 = fullKey(r);
    await page.waitForTimeout(STABLE_RECHECK_MS);
    const after = await page.evaluate(() => window.__snap());
    assertEq(`firstScreen ${v} stability`, k1, fullKey(after));
    await page.close();
    return { version: v, wallMs: Date.now() - t0, ...r, stableRecheck: { ...after, longTaskEntries: undefined, longTasks: undefined } };
  };

  const measureSwitch = async (v) => {
    await ensureHealthy(v);
    const page = await browser.newPage();
    await page.addInitScript(INIT, { quietMs: QUIET_MS });
    await page.goto(`${srv[v]}/#session=${SHORT}`, { waitUntil: "load" });
    await waitSettled(page);
    await page.waitForTimeout(500);
    const clickAt = await page.evaluate(() => { window.__resetPerf(performance.now()); return Math.round(performance.now()); });
    const t0 = Date.now();
    await page.click(`[data-session-id="${LONG}"] .session-item`);
    await waitSettled(page);
    const r = await page.evaluate((scene) => ({ scene, ...window.__snap() }), "switch");
    if (r.firstOutputMs === null) throw new Error(`${v} switch: no visible output after click (blocked)`);
    const tailFound = await page.evaluate((s) => !s || document.body.textContent.includes(s), gt.baseline.tailSnippet);
    r.tailContentFound = tailFound;
    r.completionFromClickMs = r.lastDomMutationMs - clickAt;
    r.settledFromClickMs = r.settledAtMs - clickAt;
    const k1 = fullKey(r);
    await page.waitForTimeout(STABLE_RECHECK_MS);
    const after = await page.evaluate(() => window.__snap());
    assertEq(`switch ${v} stability`, k1, fullKey(after));
    await page.close();
    return { version: v, clickToWallMs: Date.now() - t0, clickAtMs: clickAt, ...r, stableRecheck: { ...after, longTaskEntries: undefined, longTasks: undefined } };
  };

  for (let i = 0; i < RUNS; i++) {
    const order = i % 2 === 0 ? ["baseline", "current"] : ["current", "baseline"];
    for (const v of order) out.runs.firstScreen.push(await measureFirstScreen(v));
  }
  for (let i = 0; i < RUNS; i++) {
    const order = i % 2 === 0 ? ["baseline", "current"] : ["current", "baseline"];
    for (const v of order) out.runs.switch.push(await measureSwitch(v));
  }

  // 交叉核对：两版本渲染结果必须完全一致（同一真实会话的完整重建）
  for (const scene of ["firstScreen", "switch"]) {
    const by = { baseline: [], current: [] };
    for (const r of out.runs[scene]) by[r.version].push(r);
    const b = countsKey(by.baseline[0]);
    for (const r of by.baseline) assertEq(`${scene} baseline run stability`, b, countsKey(r));
    for (const r of by.current) assertEq(`${scene} baseline=current counts`, b, countsKey(r));
  }
  out.verification = {
    passed: true,
    semanticCountsIdenticalAcrossVersions: true,
    semanticCountsIdenticalAcrossRuns: true,
    nodeCountDelta: Object.fromEntries(["firstScreen", "switch"].map((scene) => {
      const b = out.runs[scene].find((r) => r.version === "baseline");
      const c = out.runs[scene].find((r) => r.version === "current");
      return [scene, c.nodes - b.nodes];
    })),
    expectedFromGroundTruthMessages: gt.baseline.messages,
    tailContentCheck: { rule: "服务端 attach 的最后一条 user 消息最长片段（内存中传递，不落盘）作为辅助诊断：是否出现在页面文本中", snippetSha256: gt.baseline.tailSnippetSha256, foundFirstScreen: out.runs.firstScreen.map((r) => r.tailContentFound), foundSwitch: out.runs.switch.map((r) => r.tailContentFound) },
    domMessageCards: out.runs.firstScreen[0].messages,
    note: `语义计数（outputChildren/messages/toolRecords/callGroups）在 ${RUNS}×2 次运行间完全一致，且追加 ${STABLE_RECHECK_MS}ms 静默后全量快照不变`,
  };

  out.summary = {
    firstScreen: ["baseline", "current"].map((v) => {
      const rs = out.runs.firstScreen.filter((r) => r.version === v);
      return {
        version: v,
        firstOutputMs: rs.map((r) => r.firstOutputMs),
        firstOutputMsAvg: Math.round(rs.reduce((a, r) => a + r.firstOutputMs, 0) / rs.length),
        completionMs: rs.map((r) => r.lastDomMutationMs),
        settledAtMs: rs.map((r) => r.settledAtMs),
        maxLongTaskMs: rs.map((r) => Math.max(0, ...r.longTasks)),
        maxLongTaskRenderMs: rs.map(phaseLongMax),
        wallMs: rs.map((r) => r.wallMs),
        nodes: rs[0].nodes, outputChildren: rs[0].outputChildren, messages: rs[0].messages,
        toolRecords: rs[0].toolRecords, callGroups: rs[0].callGroups,
      };
    }),
    switch: ["baseline", "current"].map((v) => {
      const rs = out.runs.switch.filter((r) => r.version === v);
      return {
        version: v,
        firstOutputMs: rs.map((r) => r.firstOutputMs),
        completionMs: rs.map((r) => r.lastDomMutationMs),
        settledAtMs: rs.map((r) => r.settledAtMs),
        maxLongTaskMs: rs.map((r) => Math.max(0, ...r.longTasks)),
        maxLongTaskRenderMs: rs.map(phaseLongMax),
        completionFromClickMs: rs.map((r) => r.completionFromClickMs),
        settledFromClickMs: rs.map((r) => r.settledFromClickMs),
        clickToWallMs: rs.map((r) => r.clickToWallMs),
        nodes: rs[0].nodes, outputChildren: rs[0].outputChildren, messages: rs[0].messages,
        toolRecords: rs[0].toolRecords, callGroups: rs[0].callGroups,
      };
    }),
  };

  out.thresholds = {
    target: { firstOutputMs: 1171, maxLongTaskMs: 200, originalBaseline: "docs/perf-long-conversation/first-screen.json（保留未改动）" },
    firstScreen: Object.fromEntries(
      out.summary.firstScreen.map((s) => [s.version, {
        firstOutputMsAvg: s.firstOutputMsAvg,
        firstOutputAchieved: s.firstOutputMsAvg <= 1171,
        maxLongTaskRenderMs: Math.max(...s.maxLongTaskRenderMs),
        maxLongTaskAchieved: Math.max(...s.maxLongTaskRenderMs) < 200,
      }])),
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1), { flag: "wx" });
  console.log(JSON.stringify({ ok: true, out: OUT_JSON, summary: out.summary, thresholds: out.thresholds }, null, 1));
} catch (error) {
  const failure = { ok: false, error: String(error?.message || error), stack: String(error?.stack || "") };
  try {
    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(FAIL_JSON, JSON.stringify(failure, null, 1), { flag: "wx" }); // 不覆盖既有失败记录
  } catch (writeError) { failure.failureRecord = `not written (${FAIL_JSON}): ${writeError.code || writeError.message}`; }
  console.error(JSON.stringify(failure, null, 1));
  process.exitCode = 1;
} finally {
  // 锁只能在「浏览器 + 自己起的服务」都已确认退出后释放；任一步清理失败则保留锁并报错
  const cleanupErrors = [];
  // 先确认自建 socket 真实关闭（此时服务还在，握手能走完）；未确认即算清理失败 → 保锁
  for (const ws of [...openSockets]) {
    try { await closeSocket(ws, CLOSE_LIMIT_MS); }
    catch (error) { cleanupErrors.push(`ws close: ${error.message}`); }
  }
  let browserClosed = true;
  if (browser) {
    try { await withLimit(browser.close(), CLOSE_LIMIT_MS, "browser.close"); }
    catch (error) { browserClosed = false; cleanupErrors.push(`browser.close: ${error.message}`); }
  }
  for (const p of procs) {
    try { await stopServer(p); }
    catch (error) { cleanupErrors.push(error.message); }
  }
  if (browserClosed && !cleanupErrors.length) {
    try { releaseLock?.(); }
    catch (error) { cleanupErrors.push(`release lock: ${error.message}`); }
  } else {
    cleanupErrors.push(`measurement lock kept: ${LOCK_DIR}（确认进程已退出后手动删除）`);
  }
  if (cleanupErrors.length) { process.exitCode = 1; console.error(`[paired-first-screen] cleanup incomplete: ${cleanupErrors.join("; ")}`); }
  if (!KEEP && tmp && !cleanupErrors.length) { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }
  else if (tmp) console.error(`kept temp: ${tmp}`);
}
