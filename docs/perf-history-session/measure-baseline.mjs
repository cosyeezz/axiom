// 长会话性能采集（假源隔离夹具，无任何用户数据）：baseline / current 两种口径。
//
// 口径与配套文件：
//   - 夹具：make-fake-home.mjs 生成的隔离 home（1831 条假消息长会话 + 20 条短会话，
//     确定性伪随机，逐次运行字节级一致）。全程不读写 ~/.axiom、不连网、不调用模型。
//   - 代码（--mode baseline，默认）：用 `git show <baseline-commit>:src/...` 把基线版本
//     物化到临时目录，工作树里未提交的改造代码不参与测量；node_modules 用 junction 复用。
//   - 代码（--mode current）：直接用当前 worktree 的代码跑服务（含未提交改动），
//     provenance 记录 HEAD/脏文件清单/被服务文件逐文件 sha256 与合并 digest。
//     同一夹具、同一探针、同一串行约束，因此与 baseline.json 逐项可比。
//   current 模式额外采集（baseline 模式默认关闭，用 --switch-rounds/--reading-checks 打开）：
//     1) 反复会话切换（长⇄短，真实侧栏点击）的 DOM/堆/长任务趋势；
//     2) 历史翻页（上一页/下一页/最新消息）的定位、游标边界与 DOM 有界性检查。
//   均为串行：同一时刻只起一个实例、只开一页。
//   - 探针/完成判据沿用 docs/perf-long-conversation/paired-first-screen.mjs：
//     #output 子树静默 quietMs 无任何 DOM 变更 = 首屏完成，硬超时抛错（不吞超时），
//     完成后追加静默窗口复核全量快照不漂移。
//   - 串行：同一时刻只起一个实例、只开一个页面。
//
// 用法：
//   node docs/perf-history-session/measure-baseline.mjs \
//     --repo <worktree 路径> --baseline-commit ab52936 --runs 3 \
//     --out docs/perf-history-session/baseline.json \
//     [--playwright <playwright/index.js>] [--chromium <chrome.exe>] [--keep]
//
//   node docs/perf-history-session/measure-baseline.mjs --mode current --repo <worktree>
//     [--runs 3] [--switch-rounds 3] [--page-rounds 2] [--out after.json]
//
// 输出：单个 JSON（已存在则拒绝覆盖，失败写 <out>.failed.json）。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import { pathToFileURL, fileURLToPath } from "node:url";
import { buildFakeHome, LONG_ID, SHORT_ID, LONG_MESSAGES } from "./make-fake-home.mjs";
import { acquireMeasureLock } from "../perf-long-conversation/measure-lock.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

const REPO = path.resolve(arg("repo", path.join(HERE, "..", "..")));
const MODE = arg("mode", "baseline");
const CURRENT = MODE === "current";
const COMMIT = arg("baseline-commit", "ab52936");
const RUNS = Number(arg("runs", 3));
const OUT = path.resolve(arg("out", path.join(HERE, CURRENT ? "after.json" : "baseline.json")));
// current 模式默认附带切换趋势与翻页检查；baseline 模式保持原行为（不打开）。
const SWITCH_ROUNDS = Number(arg("switch-rounds", CURRENT ? 3 : 0));
const PAGE_ROUNDS = Number(arg("page-rounds", CURRENT ? 2 : 0));
const READING_CHECKS = has("reading-checks") || PAGE_ROUNDS > 0;
const KEEP = has("keep");
const CHROMIUM = process.env.CHROMIUM_EXE || arg("chromium");
const QUIET_MS = 700;
const HARD_TIMEOUT_MS = 60000;
const STABLE_RECHECK_MS = 1500;
const LOCK_DIR = path.join(os.tmpdir(), "axiom-perf-measure.lock");
const FAIL = OUT.replace(/\.json$/, ".failed.json");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];

function withLimit(promise, ms, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms); }),
  ]);
}

// 查找可用的 chromium 可执行文件（playwright 版本要求的 build 可能未安装，退到已装 cache 或系统浏览器）
function findChromium() {
  if (CHROMIUM) return CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  if (fs.existsSync(root)) {
    const builds = fs.readdirSync(root).filter((d) => d.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const b of builds) for (const rel of ["chrome-win64/chrome.exe", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      const p = path.join(root, b, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  for (const p of [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) if (fs.existsSync(p)) return p;
  return undefined;
}

// 查找可用的 playwright 入口（全局 @playwright/mcp 自带一份）
function findPlaywright() {
  const explicit = process.env.PLAYWRIGHT_PATH || arg("playwright");
  if (explicit) return path.resolve(explicit);
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, "npm/node_modules/@playwright/mcp/node_modules"),
    path.join(os.homedir(), ".npm-global/lib/node_modules/@playwright/mcp/node_modules"),
    path.join(REPO, "node_modules"),
  ].filter(Boolean);
  for (const root of roots) for (const pkg of ["playwright", "playwright-core"]) {
    for (const entry of ["index.js", "index.mjs"]) {
      const p = path.join(root, pkg, entry);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error("playwright not found: pass --playwright <playwright/index.js>");
}

// ---------- 当前工作树代码指纹（不物化：直接跑 worktree 里的代码） ----------
// porcelain 行的路径：X 与 Y 两列状态 + 至少一个空格，直接砍前两列再 trim 最稳。
const pathOf = (line) => line.slice(2).trim();
function workingTreeProvenance() {
  const tracked = execFileSync("git", ["-C", REPO, "ls-files", "src", "public", "package.json"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const status = execFileSync("git", ["-C", REPO, "status", "--porcelain", "--", "src", "public", "package.json"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const untracked = status.filter((l) => l.startsWith("??")).map(pathOf);
  const files = [...new Set([...tracked, ...untracked])].filter((f) => fs.existsSync(path.join(REPO, f)));
  const hashes = files.map((f) => `${f}:${sha256(fs.readFileSync(path.join(REPO, f)))}`).sort();
  const byPath = Object.fromEntries(hashes.map((l) => l.split(/:(?=[0-9a-f]{64}$)/)));
  return {
    head: execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirtyPaths: status.map(pathOf),
    codeFiles: files.length,
    codeDigest: sha256(hashes.join("\n")),
    appJs: byPath["public/app.js"],
    sessionsJs: byPath["src/sessions.js"],
    sessionHistoryJs: byPath["src/session-history.js"] ?? null,
  };
}

// ---------- 基线代码物化（不改工作树、不建 worktree） ----------
function materializeBaseline(root) {
  const files = execFileSync("git", ["-C", REPO, "ls-tree", "-r", "--name-only", COMMIT, "--", "src", "public", "package.json"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  if (!files.length) throw new Error(`commit ${COMMIT} has no src/public in ${REPO}`);
  for (const f of files) {
    const buf = execFileSync("git", ["-C", REPO, "show", `${COMMIT}:${f}`, "--"], { maxBuffer: 64 * 1024 * 1024 });
    fs.mkdirSync(path.join(root, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), buf);
  }
  const target = fs.realpathSync(path.join(REPO, "node_modules"));
  fs.symlinkSync(target, path.join(root, "node_modules"), "junction");
  return files.length;
}

// ---------- 服务进程（只 kill 自己 spawn 的 PID） ----------
async function startServer(root, home, port) {
  const log = fs.openSync(path.join(home, "server.log"), "a");
  let proc;
  try {
    proc = spawn(process.execPath, ["src/main.js"], {
      cwd: root,
      env: { ...process.env, AXIOM_HOME: home, AXIOM_PORT: String(port), AXIOM_CWD: path.join(home, "workspace"), PI_CODING_AGENT_DIR: path.join(home, "fake-agent"), PI_OFFLINE: "1" },
      stdio: ["ignore", log, log],
    });
    procs.push(proc);
  } finally { fs.closeSync(log); }
  let spawnError;
  proc.on("error", (e) => { spawnError = e; });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (proc.exitCode !== null) throw new Error(`server exited early (${proc.exitCode}), see ${path.join(home, "server.log")}`);
    try { if ((await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) })).ok) return { proc, base }; } catch {}
    await sleep(400);
  }
  throw new Error("server did not become healthy in 30s");
}

async function stopServer(proc, polls = 20, pollMs = 250) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  const gone = () => proc.exitCode !== null || proc.signalCode !== null;
  for (let a = 0; a < 2 && !gone(); a++) { proc.kill(); for (let i = 0; i < polls && !gone(); i++) await sleep(pollMs); }
  if (!gone()) throw new Error(`server pid ${proc.pid} did not exit`);
}

// ---------- 地面真值：WS session.attach 数服务端真实消息条数 ----------
function serverMessageCount(base, sessionId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${new URL(base).host}/ws`, ["axiom"]);
    let settled = false, timer = null;
    const done = (err, v) => { if (settled) return; settled = true; clearTimeout(timer); try { ws.close(); } catch {} err ? reject(new Error(err)) : resolve(v); };
    ws.onerror = () => done("ws error");
    ws.onclose = () => done("ws closed before response");
    timer = setTimeout(() => done("attach timeout"), 30000);
    ws.onopen = () => { try { ws.send(JSON.stringify({ id: "gt", type: "session.attach", sessionId })); } catch (e) { done(`send failed: ${e.message}`); } };
    ws.onmessage = ({ data }) => {
      let m; try { m = JSON.parse(data); } catch { return; }
      if (m?.type !== "response" || m.id !== "gt") return;
      if (!m.ok) return done(String(m.error));
      const msgs = m.data?.messages || [];
      const roles = {};
      for (const x of msgs) roles[x.message?.role] = (roles[x.message?.role] || 0) + 1;
      done(null, { messages: msgs.length, roles });
    };
  });
}

// ---------- 页面探针（与 paired-first-screen.mjs 同口径） ----------
const INIT = (opts) => {
  const p = (window.__perf = { longTaskEntries: [], firstMs: null, lastMs: null, lastDomMutationMs: null, mutations: 0, added: 0, settled: false, settledAtMs: null, phaseStart: 0, settleSeq: 0 });
  const heap = () => { try { window.gc?.(); } catch {} return performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null; };
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
    heapMB: heap(),
    heapMBSampled: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    longTaskEntries: p.longTaskEntries.slice(),
    longTasks: p.longTaskEntries.map((t) => t.dur),
  });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) p.longTaskEntries.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }); }).observe({ entryTypes: ["longtask"] }); } catch {}
  let quiet;
  // settled 每次变更后归 false、静默一轮后再置 true 并 +settleSeq：翻页/切换等多次静默期可分别等待。
  const arm = () => { clearTimeout(quiet); quiet = setTimeout(() => { p.settled = true; p.settleSeq++; p.settledAtMs = Math.round(performance.now()); }, opts.quietMs); };
  const attach = () => {
    const out = document.getElementById("output");
    if (!out) return;
    new MutationObserver((recs) => {
      const t = performance.now();
      for (const r of recs) if (r.addedNodes.length) { p.added += r.addedNodes.length; if (p.firstMs === null) p.firstMs = Math.round(t); }
      p.mutations++; p.lastMs = Math.round(t); p.lastDomMutationMs = Math.round(t); p.settled = false; arm();
    }).observe(out, { childList: true });
    new MutationObserver((recs) => { p.mutations += recs.length; p.lastDomMutationMs = Math.round(performance.now()); p.settled = false; arm(); }).observe(out, { childList: true, subtree: true });
    arm();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attach); else attach();
};

const countsKey = (s) => JSON.stringify([s.outputChildren, s.messages, s.toolRecords, s.callGroups]);
const fullKey = (s) => JSON.stringify([countsKey(s), s.nodes, s.lastDomMutationMs]);
const phaseLongMax = (r) => {
  const done = r.longTaskEntries.filter((t) => t.start <= (r.settledAtMs ?? Infinity));
  return done.length ? Math.max(...done.map((t) => t.dur)) : 0;
};

const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
});

// ---------- 单步测量：点击/导航 → 等到下一次静默 → 快照 + 漂移复核 ----------
const settleSince = (page, seq) => page.waitForFunction((n) => (window.__perf?.settleSeq ?? 0) > n, seq, { timeout: HARD_TIMEOUT_MS });
const sidebarItem = (page, id) => page.locator(`.session-row[data-session-id="${id}"] .session-item`);
const onSession = (page, id) => page.evaluate((s) => document.querySelector(`.session-row[data-session-id="${s}"] .session-item`)?.getAttribute("aria-current") === "page", id);

async function step(page, action, label) {
  const before = await page.evaluate(() => ({ t: performance.now(), seq: window.__perf.settleSeq, mutations: window.__perf.mutations, added: window.__perf.added }));
  await action();
  await settleSince(page, before.seq);
  const snap = await page.evaluate((b) => {
    const s = window.__snap();
    const lt = window.__perf.longTaskEntries.filter((e) => e.start >= b.t);
    return {
      ...s,
      mutationsInStep: s.mutations - b.mutations,
      addedNodesInStep: s.addedNodes - b.added,
      maxLongTaskInStepMs: lt.length ? Math.max(...lt.map((e) => e.dur)) : 0,
      longTasksInStep: lt.map((e) => e.dur),
      settleMs: Math.round((s.settledAtMs ?? 0) - b.t),
    };
  }, before);
  const k1 = fullKey(snap);
  await page.waitForTimeout(STABLE_RECHECK_MS);
  const after = await page.evaluate(() => window.__snap());
  if (fullKey(after) !== k1) throw new Error(`${label}: snapshot drifted after settle: ${k1} -> ${fullKey(after)}`);
  return { label, ...snap, afterHeapMB: after.heapMB };
}

// 反复会话切换：真实侧栏点击，同一页面实例，观察 DOM/堆/长任务是否随切换累积。
async function measureSwitches(page, cycles, ids) {
  const steps = [];
  for (let i = 0; i < cycles; i++) {
    for (const id of [ids.short, ids.long]) {
      const r = await step(page, () => sidebarItem(page, id).click(), `switch#${i + 1}->${id === ids.long ? "long" : "short"}`);
      steps.push({ scene: r.label, sessionId: id, nodes: r.nodes, messages: r.messages, outputChildren: r.outputChildren, toolRecords: r.toolRecords, callGroups: r.callGroups, heapMB: r.heapMB, afterHeapMB: r.afterHeapMB, mutationsInStep: r.mutationsInStep, addedNodesInStep: r.addedNodesInStep, settleMs: r.settleMs, maxLongTaskInStepMs: r.maxLongTaskInStepMs });
    }
  }
  const longSteps = steps.filter((s) => s.sessionId === ids.long);
  const nodeSpread = Math.max(...longSteps.map((s) => s.nodes)) - Math.min(...longSteps.map((s) => s.nodes));
  return {
    cycles,
    switches: steps.length,
    steps,
    longSessionNodes: longSteps.map((s) => s.nodes),
    longSessionHeapMB: longSteps.map((s) => s.heapMB),
    longSessionSettleMs: longSteps.map((s) => s.settleMs),
    longSessionMaxLongTaskMs: longSteps.map((s) => s.maxLongTaskInStepMs),
    checks: {
      domStableAcrossSwitches: nodeSpread <= Math.max(1, Math.round(longSteps[0].nodes * 0.02)),
      nodeSpreadMaxMinusMin: nodeSpread,
      everySwitchSettled: steps.every((s) => s.settleMs > 0),
    },
  };
}

// 历史翻页定位/边界/有界性检查：上一页 → 下一页 循环 + 回最新。
const entryIdOf = (key) => { try { return JSON.parse(key)[2]; } catch { return null; } };
async function measurePagination(page, rounds) {
  const readDom = () => page.evaluate(() => ({
    position: document.getElementById("history-position")?.textContent?.trim() ?? null,
    beforeDisabled: document.getElementById("history-before")?.disabled ?? null,
    afterDisabled: document.getElementById("history-after")?.disabled ?? null,
    scrollTop: Math.round(document.getElementById("transcript")?.scrollTop ?? -1),
    scrollHeight: Math.round(document.getElementById("transcript")?.scrollHeight ?? -1),
    clientHeight: Math.round(document.getElementById("transcript")?.clientHeight ?? -1),
    images: document.querySelectorAll("#output img").length,
    ids: [...document.querySelectorAll("#output [data-message-key]")].map((n) => JSON.parse(n.dataset.messageKey)[2]).filter(Boolean),
  }));
  const record = async (action, label) => {
    const r = await step(page, action, label);
    const dom = await readDom();
    return { scene: label, ...dom, ids: undefined, idsFirst: dom.ids[0] ?? null, idsLast: dom.ids.at(-1) ?? null, idCount: dom.ids.length, idsSorted: [...dom.ids].sort(), nodes: r.nodes, messages: r.messages, outputChildren: r.outputChildren, heapMB: r.heapMB, afterHeapMB: r.afterHeapMB, mutationsInStep: r.mutationsInStep, settleMs: r.settleMs, maxLongTaskInStepMs: r.maxLongTaskInStepMs };
  };
  const steps = [];
  for (let i = 0; i < rounds; i++) {
    steps.push(await record(() => page.locator("#history-before").click(), `page-before#${i + 1}`));
    steps.push(await record(() => page.locator("#history-after").click(), `page-after#${i + 1}`));
  }
  steps.push(await record(() => page.locator("#history-newest").click(), "page-newest"));
  const before1 = steps.find((s) => s.scene === "page-before#1");
  const after1 = steps.find((s) => s.scene === "page-after#1");
  const latest = steps.at(-1);
  const rangeOf = (text) => { const m = /(\d+)–(\d+) \/ (\d+)/.exec(text ?? ""); return m ? { start: +m[1], end: +m[2], total: +m[3] } : null; };
  const beforeRange = rangeOf(before1.position), afterRange = rangeOf(after1.position), latestRange = rangeOf(latest.position);
  const beforeIds = new Set(before1.idsSorted), afterIds = new Set(after1.idsSorted);
  const overlap = [...beforeIds].filter((id) => afterIds.has(id));
  const pages = steps.filter((s) => s.scene.startsWith("page-before") || s.scene.startsWith("page-after"));
  const nodeSpread = Math.max(...pages.map((s) => s.nodes)) - Math.min(...pages.map((s) => s.nodes));
  const sameRangeEachRound = steps.filter((s) => s.scene.startsWith("page-before")).every((s) => s.position === before1.position);
  return {
    rounds,
    steps: steps.map(({ idsSorted, ...rest }) => rest),
    ranges: { older: beforeRange, newer: afterRange, latest: latestRange },
    imagesInFixture: latest.images,
    checks: {
      olderPageStartsAtTop: steps.filter((s) => s.scene.startsWith("page-before")).every((s) => s.scrollTop <= 2),
      olderRangePrecedesNewer: Boolean(beforeRange && afterRange && beforeRange.start < afterRange.start && beforeRange.end < afterRange.end),
      rangesRepeatAcrossRounds: sameRangeEachRound,
      pageSetsDisjoint: overlap.length === 0,
      pageOrderIncreasing: Boolean(before1.idsLast && after1.idsFirst && before1.idsLast < after1.idsFirst),
      totalMatchesFixture: beforeRange?.total === LONG_MESSAGES && latestRange?.total === LONG_MESSAGES,
      latestReachesLastEntry: latestRange?.end === LONG_MESSAGES,
      latestFollowsBottom: latest.scrollHeight - latest.scrollTop - latest.clientHeight <= 4,
      domBoundedAcrossPages: nodeSpread <= Math.max(1, Math.round(pages[0].nodes * 0.05)),
      nodeSpreadMaxMinusMin: nodeSpread,
    },
  };
}

let browser, tmp, home, server, releaseLock;
const out = {
  scene: `${CURRENT ? "当前 worktree（含未提交改动）" : `${COMMIT} 基线`} × 假源隔离夹具：短会话（20 条）/ 长会话（${LONG_MESSAGES} 条）首屏`,
  generatedAt: new Date().toISOString(),
  completionCriterion: {
    rule: `#output 子树静默 ${QUIET_MS}ms 无任何 DOM 变更 = 首屏完成；硬超时 ${HARD_TIMEOUT_MS}ms 抛错`,
    postCheck: `完成后追加 ${STABLE_RECHECK_MS}ms 静默，复核全量快照（节点数/子节点数/消息数/末次变更时刻）不漂移`,
    probes: ["PerformanceObserver longtask", "MutationObserver #output(childList/subtree)", "performance.memory.usedJSHeapSize（含 window.gc() 后采样）", "navigation timing"],
  },
  provenance: {},
  runs: [],
  summary: {},
};

try {
  releaseLock = acquireMeasureLock(OUT, LOCK_DIR);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-perf-history-"));
  home = path.join(tmp, "fake-home");
  const codeRoot = path.join(tmp, "code-baseline");

  const fixture = buildFakeHome({ home });
  // 夹具 JSONL 里嵌入了 home 路径（session 头部的 cwd），逐次临时目录不同 → 原始 sha256 不可跨次比较。
  // 除了这个路径以外内容确定：归一化哈希把 home 换成 <home> 再算，用于跨次确认夹具一致。
  const escapedHome = JSON.stringify(home).slice(1, -1);
  const jsonlSha = Object.fromEntries(fixture.sessions.map((s) => {
    const bytes = fs.readFileSync(s.file);
    return [s.id, { bytes: bytes.length, sha256: sha256(bytes), sha256Normalized: sha256(bytes.toString("utf8").split(escapedHome).join("<home>")) }];
  }));
  const tree = CURRENT ? workingTreeProvenance() : null;
  const fileCount = CURRENT ? tree.codeFiles : materializeBaseline(codeRoot);
  const runRoot = CURRENT ? REPO : codeRoot;

  const port = await freePort();
  const started = await startServer(runRoot, home, port);
  server = started;

  const gt = { long: await serverMessageCount(started.base, LONG_ID), short: await serverMessageCount(started.base, SHORT_ID) };

  const pwPath = findPlaywright();
  const pwMod = await import(pwPath.startsWith("file:") ? pwPath : pathToFileURL(pwPath).href);
  const { chromium } = pwMod.default || pwMod;
  const candidates = [];
  const exe = findChromium();
  if (exe) candidates.push({ headless: true, executablePath: exe, args: ["--js-flags=--expose-gc"] });
  candidates.push({ headless: true, channel: "chromium", args: ["--js-flags=--expose-gc"] });
  candidates.push({ headless: true, args: ["--js-flags=--expose-gc"] });
  candidates.push({ headless: true });
  const launchErrors = [];
  for (const opts of candidates) {
    try { browser = await chromium.launch(opts); out.browser = { launch: Object.keys(opts).filter((k) => k !== "args").map((k) => `${k}=${opts[k]}`).join(", "), args: opts.args ?? [] }; break; }
    catch (e) { launchErrors.push(`${JSON.stringify(opts.executablePath ?? opts.channel ?? "default")}: ${e.message.split("\n")[0]}`); }
  }
  if (!browser) throw new Error(`chromium launch failed: ${launchErrors.join(" | ")}`);

  const fixtureProvenance = { generator: "make-fake-home.mjs", home, longId: LONG_ID, shortId: SHORT_ID, files: jsonlSha, hashNote: "原始 sha256 含临时 home 路径（session 头部 cwd），逐次运行必然不同；sha256Normalized 把 home 换成 <home> 后计算，用于跨次/跨基线确认夹具内容一致。" };
  const isolation = "独立 AXIOM_HOME/AXIOM_PORT/AXIOM_CWD/PI_CODING_AGENT_DIR 临时实例；不连网、不调用模型、不读写 ~/.axiom";
  out.provenance = CURRENT ? {
    repo: REPO,
    mode: "current",
    head: tree.head,
    codeFiles: fileCount,
    codeDigest: tree.codeDigest,
    codeSha256: { appJs: tree.appJs, sessionsJs: tree.sessionsJs, sessionHistoryJs: tree.sessionHistoryJs ?? null },
    dirtyPaths: tree.dirtyPaths,
    workingTreeUsed: true,
    fixture: fixtureProvenance,
    isolation,
    playwright: pwPath,
  } : {
    repo: REPO,
    mode: "baseline",
    baselineCommit: COMMIT,
    baselineCodeFiles: fileCount,
    baselineCodeSha256: { appJs: sha256(fs.readFileSync(path.join(codeRoot, "public/app.js"))) },
    workingTreeUsed: false,
    fixture: fixtureProvenance,
    isolation,
    playwright: pwPath,
  };

  const measure = async (sessionId, scene) => {
    const page = await browser.newPage();
    const external = [];
    page.on("request", (r) => { try { if (new URL(r.url()).origin !== new URL(started.base).origin) external.push(r.url().slice(0, 120)); } catch {} });
    try {
      await page.addInitScript(INIT, { quietMs: QUIET_MS });
      const t0 = Date.now();
      await page.goto(`${started.base}/#session=${sessionId}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__perf?.settled === true, null, { timeout: HARD_TIMEOUT_MS });
      if (!out.env) out.env = await page.evaluate(() => ({ ua: navigator.userAgent, hw: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? null, gcExposed: typeof window.gc === "function", viewport: [innerWidth, innerHeight] }));
      const r = await page.evaluate((s) => ({ scene: s, ...window.__snap(), phaseStartMs: window.__perf.phaseStart, nav: (() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { responseEnd: Math.round(n.responseEnd), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null; })() }), scene);
      if (r.firstOutputMs === null) throw new Error(`${scene}: no visible output ever (blocked)`);
      const k1 = fullKey(r);
      await page.waitForTimeout(STABLE_RECHECK_MS);
      const after = await page.evaluate(() => window.__snap());
      if (fullKey(after) !== k1) throw new Error(`${scene}: snapshot drifted after settle: ${k1} -> ${fullKey(after)}`);
      return { sessionId, wallMs: Date.now() - t0, externalRequests: [...new Set(external)], ...r, stableRecheck: { nodes: after.nodes, heapMB: after.heapMB, mutations: after.mutations } };
    } finally { await page.close(); }
  };

  for (let i = 0; i < RUNS; i++) {
    for (const [id, scene] of [[SHORT_ID, `short-firstScreen#${i + 1}`], [LONG_ID, `long-firstScreen#${i + 1}`]]) {
      const r = await measure(id, scene);
      out.runs.push(r);
      console.log(`${r.scene}: first=${r.firstOutputMs} last=${r.lastOutputMs} settle=${r.settledAtMs} maxLong=${Math.max(0, ...r.longTasks)} nodes=${r.nodes} heap=${r.heapMB}MB`);
    }
  }

  // 附加相位：复用同一个页面实例，串行执行，互不重开浏览器。
  if (SWITCH_ROUNDS > 0 || READING_CHECKS) {
    const page = await browser.newPage();
    try {
      await page.addInitScript(INIT, { quietMs: QUIET_MS });
      await page.goto(`${started.base}/#session=${LONG_ID}`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__perf?.settled === true, null, { timeout: HARD_TIMEOUT_MS });
      await page.waitForSelector(`.session-row[data-session-id="${SHORT_ID}"] .session-item`, { timeout: 15000 });
      await page.evaluate(() => { for (const d of document.querySelectorAll("#sessions details")) d.open = true; });
      if (SWITCH_ROUNDS > 0) {
        out.switchTrend = await measureSwitches(page, SWITCH_ROUNDS, { long: LONG_ID, short: SHORT_ID });
        console.log(`switch trend: ${out.switchTrend.switches} switches, long nodes ${out.switchTrend.longSessionNodes.join("→")}, heap ${out.switchTrend.longSessionHeapMB.join("→")}MB`);
      }
      if (READING_CHECKS) {
        if (!(await onSession(page, LONG_ID))) await step(page, () => sidebarItem(page, LONG_ID).click(), "pagination-reset-long");
        out.pagination = await measurePagination(page, PAGE_ROUNDS);
        console.log(`pagination: ${JSON.stringify(out.pagination.ranges)} checks=${JSON.stringify(out.pagination.checks)}`);
      }
    } finally { await page.close(); }
  }

  const agg = (id) => {
    const rs = out.runs.filter((r) => r.sessionId === id);
    const avg = (f) => Math.round(rs.reduce((a, r) => a + f(r), 0) / rs.length);
    return {
      runs: rs.length,
      firstOutputMs: rs.map((r) => r.firstOutputMs),
      firstOutputMsAvg: avg((r) => r.firstOutputMs),
      lastOutputMsAvg: avg((r) => r.lastOutputMs),
      settledAtMsAvg: avg((r) => r.settledAtMs),
      maxLongTaskMs: rs.map((r) => Math.max(0, ...r.longTasks)),
      maxLongTaskRenderMs: rs.map(phaseLongMax),
      longTasksOver50Ms: rs.map((r) => r.longTasks.filter((d) => d >= 50).length),
      nodes: rs[0].nodes, outputChildren: rs[0].outputChildren, messages: rs[0].messages, toolRecords: rs[0].toolRecords, callGroups: rs[0].callGroups,
      heapMB: rs.map((r) => r.heapMB), heapMBAvg: +(rs.reduce((a, r) => a + r.heapMB, 0) / rs.length).toFixed(1),
      heapBeforeGcMB: rs.map((r) => r.heapMBSampled),
      wallMs: rs.map((r) => r.wallMs),
    };
  };
  out.summary = { short: agg(SHORT_ID), long: agg(LONG_ID) };
  // 按会话分开比较：旧版拿短会话那次 run 与长会话那次 run 直接比，必然 false（跨会话误算）。
  const countsPerSession = (id) => [...new Set(out.runs.filter((r) => r.sessionId === id).map(countsKey))];
  out.groundTruth = {
    serverMessages: { long: gt.long, short: gt.short },
    semanticCountsPerSession: { [SHORT_ID]: countsPerSession(SHORT_ID), [LONG_ID]: countsPerSession(LONG_ID) },
    semanticCountsStableAcrossRuns: [SHORT_ID, LONG_ID].every((id) => countsPerSession(id).length === 1),
    expectedFixtureMessages: LONG_MESSAGES,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1), { flag: "wx" });
  console.log(`wrote ${OUT}`);
} catch (error) {
  console.error(`FAILED: ${error?.message}`);
  try { fs.writeFileSync(FAIL, JSON.stringify({ ok: false, error: String(error?.message || error), stack: String(error?.stack || "") }, null, 1), { flag: "wx" }); } catch {}
  process.exitCode = 1;
} finally {
  const errors = [];
  if (browser) { try { await withLimit(browser.close(), 15000, "browser.close"); } catch (e) { errors.push(e.message); } }
  for (const p of procs) { try { await stopServer(p); } catch (e) { errors.push(e.message); } }
  if (!errors.length) { try { releaseLock?.(); } catch (e) { errors.push(e.message); } }
  else errors.push(`measurement lock kept: ${LOCK_DIR}`);
  if (errors.length) { process.exitCode = 1; console.error(`cleanup incomplete: ${errors.join("; ")}`); }
  if (tmp && !KEEP && !errors.length) { try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} }
  else if (tmp) console.error(`kept temp: ${tmp}`);
}
