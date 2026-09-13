#!/usr/bin/env node
// SQLite 拆表性能验收（G 包）：旧 KV 整份保存 vs 新按实体写。
// 仅用 stdlib/node:sqlite/已有依赖，不碰 ~/.axiom，数据全部在 mkdtemp 临时目录 + fake SDK。
//
// 用法（在本 worktree 根目录）：
//   node tests/sqlite-benchmark.mjs [--new-dir <E工作树>] [--baseline-ref 4371708] [--sizes small,large]
//   子命令（脚本内部自用，也可单独调用）：
//     storage --side old|new --size small|large --baseline-dir <dir> --new-dir <dir>
//     e2e     --side old|new --size small|large --scenario no-pending|pending --baseline-dir <dir> --new-dir <dir>
//     lock-holder <db> <holdMs> / lock-victim <db> --new-dir <dir>
//
// 诚实声明：
// - baseline 侧 = git archive <ref> 物化的真实旧 Database + 真实旧 Sessions（端到端）；
//   存储微基准里的旧保存流程是 baseline persist() 的逐字段复刻（同结构/同双序列化管线），不是端到端。
// - new 侧 = --new-dir 指向的 E 工作树磁盘快照（src/ + public/，快照时刻记录在结果里），
//   经 import 加载真实 database.js / session-store.js / sessions.js。
// - 硬门槛断言不因初版不达标而放宽；失败据实报告，退出码 1。

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------- 参数 ----------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[++i] ?? true;
    else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const scriptPath = fileURLToPath(import.meta.url);
const repoDir = resolve(dirname(scriptPath), "..");
const mode = args._[0] ?? "all";

// ---------- 公共小工具 ----------

const bytesOf = (v) => Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v ?? null));
const since = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)}MB` : `${(n / 1024).toFixed(1)}KB`);
const pct = (sorted, p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
const rss = () => process.memoryUsage().rss;
const fileStat = (p) => { try { return statSync(p).size; } catch { return 0; } };

// 事件循环延迟监视：1ms 间隔采样漂移，max ≈ 最长同步阻塞段。
function loopMonitor() {
  let max = 0, sum = 0, n = 0;
  let last = process.hrtime.bigint();
  const iv = setInterval(() => {
    const now = process.hrtime.bigint();
    const d = Number(now - last - 1_000_000n) / 1e6;
    if (d > max) max = d;
    if (d > 0) { sum += d; n++; }
    last = now;
  }, 1);
  return { stop: () => { clearInterval(iv); return { loopMaxMs: +max.toFixed(2), loopMeanMs: n ? +(sum / n).toFixed(3) : 0 }; } };
}

// SQL/写入字节计量：get/set/delete/list 各计 1 次（旧侧即语句数）；
// 新侧 prepare 返回的语句代理 run/get/all/iterate 各计 1，exec 计 1；
// 写入字节 = SQL 绑定字符串参数字节数（旧侧 set 的值 stringified，即真实落库字节）。
function instrument(db, stats) {
  const count = (bytes) => { stats.sql++; stats.bytes += bytes || 0; };
  for (const m of ["get", "set", "delete", "list"]) {
    if (typeof db[m] !== "function") continue;
    const orig = db[m].bind(db);
    db[m] = (...a) => { count(m === "set" ? bytesOf(a[2]) : 0); return orig(...a); };
  }
  if (typeof db.prepare === "function") {
    const origPrepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      const stmt = origPrepare(sql);
      return new Proxy(stmt, {
        get(t, p) {
          if (p === "run" || p === "get" || p === "all" || p === "iterate") {
            return (...a) => {
              count(a.reduce((s, v) => s + (typeof v === "string" ? Buffer.byteLength(v) : 0), 0));
              return t[p](...a);
            };
          }
          const v = t[p];
          return typeof v === "function" ? v.bind(t) : v;
        },
      });
    };
  }
  if (typeof db.exec === "function") {
    const origExec = db.exec.bind(db);
    db.exec = (...a) => { count(0); return origExec(...a); };
  }
  return db;
}

// 新侧 store 包装：只为 saveSummary/saveTask/saveEvent/updateSession 记调用数（字节走 SQL 层计量）。
// 不能用 Proxy：SessionStore 方法使用 #私有字段，this 必须是原对象。
function countingStore(store, stats) {
  const call = (name, bytesFn) => (...a) => { stats.calls++; stats.bytes += bytesFn ? bytesFn(a) : 0; return store[name](...a); };
  return {
    saveSummary: call("saveSummary", (a) => bytesOf(a[1])),
    saveTask: call("saveTask", (a) => bytesOf(a[1])),
    saveEvent: call("saveEvent", (a) => bytesOf(a[2])),
    updateSession: call("updateSession", (a) => bytesOf(JSON.stringify(a[1] ?? {}))),
    pruneEvents: call("pruneEvents"),
    setTurn: call("setTurn"),
    insertSession: call("insertSession"),
  };
}

// ---------- 数据集（小/大，大任务 runtime/result 有实际重量） ----------

const SIZES = {
  // small：8 会话 × 4 摘要(200B) × 2 任务(result 400B + runtime 1.2KB)，单会话载荷 ~5KB
  small: { sessions: 8, summaries: 4, summaryText: 200, tasks: 2, resultText: 400, systemPrompt: 1200, deliveries: 3 },
  // large：16 会话 × 32 摘要(1KB) × 6 任务(result 48KB + runtime 16KB)，单会话载荷 ~430KB
  large: { sessions: 16, summaries: 32, summaryText: 1000, tasks: 6, resultText: 48 * 1024, systemPrompt: 16 * 1024, deliveries: 50 },
};
const REPS = { small: 40, large: 12 };

const filler = (n, tag) => (tag + "字".repeat(Math.max(0, n - tag.length))).slice(0, n);

// 生成一个「saved」会话对象：字段形状取自 baseline persist() 投影（两版都认）。
function makeSession(index, size, workspaceDir, notified = true) {
  const id = `sess-${String(index).padStart(3, "0")}-${randomUUID().slice(0, 8)}`;
  const sessionFile = join(workspaceDir, `${id}.jsonl`);
  writeFileSync(sessionFile, "", { mode: 0o600 }); // 必须真实存在，否则两版启动都按缺历史跳过
  const tasks = Array.from({ length: size.tasks }, (_, j) => ({
    id: `task-${index}-${j}`,
    task: filler(200, `子任务${j}：`),
    status: "completed",
    text: filler(size.resultText, "结果："),
    error: null,
    resultId: randomUUID(),
    notified,
    parentContext: filler(300, "委派背景："),
    runtime: {
      model: "fake-model", thinking: "off",
      systemPrompt: filler(size.systemPrompt, "系统提示词："),
      context: Array.from({ length: 20 }, (_, k) => ({ role: k % 2 ? "assistant" : "user", text: filler(100, `c${k}`) })),
      usage: { input_tokens: 1234, output_tokens: 567, cache_read_tokens: 89 }, // 任务运行详情快照允许保留 usage
    },
    progress: [{ at: Date.now(), text: filler(120, "进度：") }],
    progressDelivered: "progress-0",
  }));
  return {
    id, cwd: workspaceDir, title: `会话${index}`,
    titleManual: false, titleRequested: false,
    summaries: Array.from({ length: size.summaries }, (_, j) => ({
      id: `sum-${index}-${j}`, agentId: "main", text: filler(size.summaryText, "摘要："),
      turn: j, messageTimestamp: Date.now() + j,
    })),
    memoryTurns: { main: size.summaries, [tasks[0].id]: 3 },
    progressDeliveries: Array.from({ length: size.deliveries }, (_, j) => ({
      id: `progress-${j}`, taskId: tasks[0].id, at: Date.now() + j, text: filler(120, "送达："),
    })),
    summaryTriggers: [{ id: `trig-${index}`, status: "interrupted", messageTimestamp: Date.now() }],
    createdAt: Date.now(), updatedAt: Date.now(),
    compactions: [{ id: `cp-${index}`, summary: filler(500, "压缩：") }],
    retries: [{ id: `rt-${index}`, status: "succeeded", agentId: "main" }],
    tasks,
    elapsedMs: 1000 * index, runningSince: null,
    sessionFile,
    // selection 形状取自旧 persist：useDefaults:false 的整体配置
    selection: { queueType: "steer", trustProject: false, useDefaults: false, compaction: { keepTokens: 24000 } },
  };
}

function makeDataset(sizeName, workspaceDir, notified = true) {
  return Array.from({ length: SIZES[sizeName].sessions }, (_, i) => makeSession(i, SIZES[sizeName], workspaceDir, notified));
}

// ---------- baseline 侧：旧 KV 整份保存（persist 复刻，管线与 4371708 完全一致） ----------

// baseline persist()：组装整份投影 → stringify → parse → set（内部再 stringify）。
// 任何一处变更（改标题/追加摘要/任务通知…）都重写整份。
function oldPersist(item, db) {
  const data = {
    id: item.id, cwd: item.cwd, title: item.title,
    titleManual: item.titleManual, titleRequested: item.titleRequested,
    summaries: item.summaries, memoryTurns: item.memoryTurns, progressDeliveries: item.progressDeliveries,
    summaryTriggers: item.summaryTriggers, createdAt: item.createdAt, updatedAt: item.updatedAt,
    compactions: item.compactions, retries: item.retries, tasks: item.tasks,
    elapsedMs: item.elapsedMs, runningSince: item.runningSince, sessionFile: item.sessionFile,
    selection: { ...item.selection },
  };
  const payload = JSON.stringify(data); // 立即序列化快照（旧实现注释原义）
  const t0 = process.hrtime.bigint();
  db.set("sessions", item.id, JSON.parse(payload));
  return since(t0);
}

// ---------- 存储微基准子命令 ----------

async function runStorage({ side, size, baselineDir, newDir }) {
  const tmp = mkdtempSync(join(tmpdir(), `axiom-bench-storage-${side}-${size}-`));
  const workspaceDir = join(tmp, "workspaces"); mkdirSync(workspaceDir, { recursive: true });
  const dbPath = join(tmp, `bench-${side}.db`);
  const stats = { sql: 0, bytes: 0, calls: 0 };
  let db, store;
  if (side === "old") {
    const { Database } = await import(pathToFileURL(join(baselineDir, "src/database.js")));
    db = instrument(new Database(dbPath), stats);
  } else {
    const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
    const { SessionStore } = await import(pathToFileURL(join(newDir, "src/session-store.js")));
    db = instrument(new Database(dbPath), stats);
    const rawStore = new SessionStore(db); // 读路径直用原对象；写路径包一层计数
    store = Object.assign(countingStore(rawStore, stats), {
      listSessions: (...a) => rawStore.listSessions(...a),
      listPendingSessionIds: (...a) => rawStore.listPendingSessionIds(...a),
      getSession: (...a) => rawStore.getSession(...a),
    });
  }
  const dataset = makeDataset(size, workspaceDir);
  const items = dataset.map((saved) => ({ ...saved })); // 内存态，模拟旧进程内 item

  const phases = [];
  const runPhase = (op, reps, fn) => {
    const loop = loopMonitor();
    const lat = [];
    const sql0 = stats.sql, bytes0 = stats.bytes, wal0 = fileStat(dbPath + "-wal"), rss0 = rss();
    const t0 = process.hrtime.bigint();
    for (let r = 0; r < reps; r++) lat.push(fn(r));
    const wall = since(t0);
    const loopStats = loop.stop();
    phases.push({
      op, reps,
      p50: +pct(lat, 50).toFixed(3), p95: +pct(lat, 95).toFixed(3), p99: +pct(lat, 99).toFixed(3),
      wallMs: +wall.toFixed(1),
      writeBytesPerOp: Math.round((stats.bytes - bytes0) / reps),
      sqlPerOp: +((stats.sql - sql0) / reps).toFixed(2),
      walDelta: fileStat(dbPath + "-wal") - wal0,
      rssKB: Math.round((rss() - rss0) / 1024),
      ...loopStats,
    });
  };

  // 数据导入（一次性，不进热路径指标，但单独报告）
  runPhase("导入/迁移", dataset.length, (r) => {
    const t0 = process.hrtime.bigint();
    if (side === "old") db.set("sessions", dataset[r].id, dataset[r]);
    else store.insertSession(dataset[r]);
    return since(t0);
  });

  // 存储层启动读：旧 = list 全量解析；新 = 元数据 + 待通知查询
  runPhase("启动读(全部会话)", 5, () => {
    const t0 = process.hrtime.bigint();
    if (side === "old") db.list("sessions");
    else { store.listSessions(); }
    return since(t0);
  });
  if (side === "new") {
    runPhase("启动读(待通知查询)", 5, () => {
      const t0 = process.hrtime.bigint();
      store.listPendingSessionIds();
      return since(t0);
    });
    runPhase("存储层首开读(单会话全投影)", 5, (r) => {
      const t0 = process.hrtime.bigint();
      store.getSession(dataset[r % dataset.length].id);
      return since(t0);
    });
  }

  const R = REPS[size];
  if (side === "old") {
    runPhase("改标题", R, (r) => { const it = items[r % items.length]; it.title = `改名${r}`; it.updatedAt = Date.now(); return oldPersist(it, db); });
    runPhase("追加摘要", R, (r) => { const it = items[r % items.length]; it.summaries.push({ id: `new-${r}`, agentId: "main", text: filler(200, "新摘要："), turn: 999 }); return oldPersist(it, db); });
    runPhase("任务进度", R, (r) => { const it = items[r % items.length]; const t = it.tasks[0]; t.progress = [...t.progress, { at: Date.now(), text: filler(120, "进度：") }]; return oldPersist(it, db); });
    runPhase("任务通知(notified)", R, (r) => { const it = items[r % items.length]; it.tasks[r % it.tasks.length].notified = true; return oldPersist(it, db); });
    runPhase("进度送达+修剪", R, (r) => {
      const it = items[r % items.length];
      it.progressDeliveries.push({ id: `pd-${r}`, taskId: it.tasks[0].id, at: Date.now(), text: filler(120, "送达：") });
      if (it.progressDeliveries.length > 50) it.progressDeliveries.shift();
      return oldPersist(it, db);
    });
    runPhase("计时更新(elapsedMs)", R, (r) => { const it = items[r % items.length]; it.elapsedMs += 100; return oldPersist(it, db); });
  } else {
    runPhase("改标题", R, (r) => { const t0 = process.hrtime.bigint(); store.updateSession(dataset[r % dataset.length].id, { title: `改名${r}`, updatedAt: Date.now() }); return since(t0); });
    runPhase("追加摘要", R, (r) => { const t0 = process.hrtime.bigint(); store.saveSummary(dataset[r % dataset.length].id, { id: `new-${r}`, agentId: "main", text: filler(200, "新摘要："), turn: 999 }); return since(t0); });
    runPhase("任务进度", R, (r) => { // E 真实热路径形态：persist(item,{progress}) → saveTask 单任务
      const t0 = process.hrtime.bigint();
      store.saveTask(dataset[r % dataset.length].id, { id: `task-${r % dataset.length}-0`, progress: { at: Date.now(), text: filler(120, "进度：") } });
      return since(t0);
    });
    runPhase("任务通知(notified)", R, (r) => { // E 真实热路径：deliver → persist(item,{task:{id,notified:true}})
      const t0 = process.hrtime.bigint();
      store.saveTask(dataset[r % dataset.length].id, { id: `task-${r % dataset.length}-0`, notified: true });
      return since(t0);
    });
    runPhase("进度送达+修剪", R, (r) => {
      const t0 = process.hrtime.bigint();
      store.saveEvent(dataset[r % dataset.length].id, "progress_delivery", { id: `pd-${r}`, taskId: `task-${r % dataset.length}-0`, at: Date.now(), text: filler(120, "送达：") });
      store.pruneEvents(dataset[r % dataset.length].id, "progress_delivery", 50);
      return since(t0);
    });
    runPhase("计时更新(elapsedMs)", R, (r) => { const t0 = process.hrtime.bigint(); store.updateSession(dataset[r % dataset.length].id, { elapsedMs: 1000 }); return since(t0); });
  }

  const result = {
    mode: "storage", side, size,
    payloadBytesPerSession: Math.round(bytesOf(dataset[0])),
    totalPayloadBytes: dataset.reduce((s, d) => s + bytesOf(d), 0),
    dbFileBytes: fileStat(dbPath), walBytes: fileStat(dbPath + "-wal"),
    rssKB: Math.round(rss() / 1024),
    phases,
  };
  try { db.close(); } catch {}
  rmSync(tmp, { recursive: true, force: true });
  return result;
}

// ---------- 端到端子命令（真实 Sessions + fake SDK） ----------

function fakeAgentFactory(counter, fallbackDir) {
  const factory = async (tools, config = {}) => {
    counter.count++;
    const file = config.sessionFile && existsSync(config.sessionFile) ? config.sessionFile : join(fallbackDir, `fake-${counter.count}.jsonl`);
    return {
      cwd: config.cwd ?? fallbackDir,
      config: () => config,
      sessionFile: () => file,
      historyEntries: () => [],
      compactions: () => [],
      subscribe: () => () => {},
      runtime: () => ({ model: "fake-model", usage: { input_tokens: 1, output_tokens: 2 } }),
      prompt: async () => {}, result: () => "ok",
      abort: () => {}, dispose: async () => {}, enqueue: () => {}, queue: () => ({ paused: false }),
      refreshSkills: async () => {}, configure: async () => {}, withdraw: async () => {}, recall: async () => ({}),
    };
  };
  return Object.assign(factory, { cwd: fallbackDir, catalog: () => [] });
}

async function runE2E({ side, size, scenario, baselineDir, newDir }) {
  const tmp = mkdtempSync(join(tmpdir(), `axiom-bench-e2e-${side}-${size}-`));
  const workspaceDir = join(tmp, "workspaces"); mkdirSync(workspaceDir, { recursive: true });
  const storageDir = join(workspaceDir, "ws"); mkdirSync(storageDir, { recursive: true });
  const dbPath = join(tmp, "e2e.db");
  const dataset = makeDataset(size, storageDir, true);
  if (scenario === "pending") dataset[0].tasks.forEach((t) => { t.notified = false; }); // 恰一个会话待通知

  const counter = { count: 0 };
  let Sessions;
  if (side === "old") ({ Sessions } = await import(pathToFileURL(join(baselineDir, "src/sessions.js"))));
  else ({ Sessions } = await import(pathToFileURL(join(newDir, "src/sessions.js"))));

  // 数据先落库（迁移口径），再测真实启动路径
  let db;
  if (side === "old") {
    const { Database } = await import(pathToFileURL(join(baselineDir, "src/database.js")));
    db = new Database(dbPath);
    for (const saved of dataset) db.set("sessions", saved.id, saved);
  } else {
    const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
    const { SessionStore } = await import(pathToFileURL(join(newDir, "src/session-store.js")));
    db = new Database(dbPath);
    const store = new SessionStore(db);
    for (const saved of dataset) store.insertSession(saved);
  }

  const sessions = new Sessions(fakeAgentFactory(counter, storageDir), null, storageDir, db);
  const loop = loopMonitor();
  const rssBefore = rss();
  const t0 = process.hrtime.bigint();
  await sessions.load();
  const startupMs = since(t0);
  const startupSdk = counter.count;
  // load 完成后（微任务先于 setImmediate）暂停通知投递，避免测量路径外的 prompt 交互
  for (const item of sessions.items.values()) item.notificationsPaused = true;
  const loopStats = loop.stop();

  let firstOpenMs = null;
  let firstOpenSdk = 0;
  const notLoaded = [...sessions.items.values()].find((it) => !it.loaded);
  if (notLoaded && sessions.ensureLoaded) {
    const sdkBefore = counter.count;
    const t1 = process.hrtime.bigint();
    await sessions.ensureLoaded(notLoaded.id);
    firstOpenMs = +since(t1).toFixed(3);
    firstOpenSdk = counter.count - sdkBefore;
    notLoaded.notificationsPaused = true;
  }

  const result = {
    mode: "e2e", side, size, scenario,
    startupMs: +startupMs.toFixed(1), startupSdk,
    firstOpenMs, firstOpenSdk,
    sessions: dataset.length,
    dbFileBytes: fileStat(dbPath), walBytes: fileStat(dbPath + "-wal"),
    rssBeforeKB: Math.round(rssBefore / 1024), rssAfterKB: Math.round(rss() / 1024),
    ...loopStats,
  };
  try { db.close(); } catch {}
  rmSync(tmp, { recursive: true, force: true });
  return result;
}

// ---------- 硬门槛（父进程内，小数据，专用库，断言不放宽） ----------

async function runGates(baselineDir, newDir) {
  const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
  const { SessionStore } = await import(pathToFileURL(join(newDir, "src/session-store.js")));
  const gates = [];
  const check = (name, pass, detail) => gates.push({ name, pass, detail });

  const fresh = () => {
    const tmp = mkdtempSync(join(tmpdir(), "axiom-bench-gate-"));
    const db = new Database(join(tmp, "gate.db"));
    const store = new SessionStore(db);
    const workspaceDir = join(tmp, "ws"); mkdirSync(workspaceDir, { recursive: true });
    return { tmp, db, store, workspaceDir };
  };
  const rawRows = (db, table, sid) =>
    db.prepare(`SELECT * FROM ${table} WHERE session_id = ? ORDER BY rowid`).all(sid).map((r) => JSON.stringify(r));

  // 门1：追加摘要不更新旧任务
  {
    const g = fresh();
    try {
      const s = makeSession(0, SIZES.small, g.workspaceDir);
      g.store.insertSession(s);
      const before = rawRows(g.db, "tasks", s.id);
      g.store.saveSummary(s.id, { id: "gate1-new", agentId: "main", text: "门1新摘要", turn: 42 });
      const after = rawRows(g.db, "tasks", s.id);
      const summaries = g.store.listSummaries(s.id).length;
      check("门1 追加摘要不更新旧任务",
        JSON.stringify(before) === JSON.stringify(after) && summaries === SIZES.small.summaries + 1,
        `任务行 ${before.length} 条逐字节不变=${JSON.stringify(before) === JSON.stringify(after)}，摘要数 ${summaries}`);
    } catch (e) { check("门1 追加摘要不更新旧任务", false, `异常：${e.message}`); }
    finally { g.db.close(); rmSync(g.tmp, { recursive: true, force: true }); }
  }

  // 门2：notified 更新不携带 runtime/result（SQL 层写入字节须与任务 result/runtime 体积无关；
  // 必须在 SQL 绑定参数层计量——saveTask 参数本身很小，整记录重写发生在语句内部）
  {
    const g = fresh();
    try {
      const small = makeSession(0, { ...SIZES.small, resultText: 300, systemPrompt: 500 }, g.workspaceDir);
      const big = makeSession(1, { ...SIZES.large, resultText: 48 * 1024, systemPrompt: 16 * 1024 }, g.workspaceDir);
      g.store.insertSession(small);
      g.store.insertSession(big);
      const stats = { sql: 0, bytes: 0 };
      instrument(g.db, stats);
      g.store.saveTask(small.id, { id: small.tasks[0].id, notified: true });
      const smallBytes = stats.bytes, smallSql = stats.sql; stats.bytes = 0; stats.sql = 0;
      g.store.saveTask(big.id, { id: big.tasks[0].id, notified: true });
      const bigBytes = stats.bytes, bigSql = stats.sql;
      const stillNotified = g.store.listTasks(big.id).find((t) => t.id === big.tasks[0].id)?.notified === true;
      // SQL 次数必须 ≥1：否则计量层没观测到写入（如语句缓存被预热绕过代理），门槛空转无效。
      const pass = bigBytes <= smallBytes + 512 && stillNotified && smallSql >= 1 && bigSql >= 1;
      check("门2 notified 不携带 runtime/result",
        pass,
        `notified 更新写入字节：小任务 ${smallBytes}B vs 大任务(64KB result+16KB runtime) ${bigBytes}B（SQL 各 ${smallSql}/${bigSql} 次），语义保留=${stillNotified}` +
        (pass ? "" : smallSql < 1 || bigSql < 1 ? "；SQL 计量未观测到写入，门槛失效" : "；notified 更新写入随 runtime/result 体积放大，须独立列修复"));
    } catch (e) { check("门2 notified 不携带 runtime/result", false, `异常：${e.message}`); }
    finally { g.db.close(); rmSync(g.tmp, { recursive: true, force: true }); }
  }

  // 门3：改标题不改任务（任务/摘要/事件行逐字节不变）
  {
    const g = fresh();
    try {
      const s = makeSession(0, SIZES.small, g.workspaceDir);
      g.store.insertSession(s);
      const before = ["tasks", "summaries", "session_events"].map((t) => rawRows(g.db, t, s.id));
      g.store.updateSession(s.id, { title: "门3改名", updatedAt: Date.now() });
      const after = ["tasks", "summaries", "session_events"].map((t) => rawRows(g.db, t, s.id));
      const title = g.store.getSession(s.id).title;
      check("门3 改标题不改任务",
        JSON.stringify(before) === JSON.stringify(after) && title === "门3改名",
        `子表行逐字节不变=${JSON.stringify(before) === JSON.stringify(after)}，标题已更新=${title === "门3改名"}`);
    } catch (e) { check("门3 改标题不改任务", false, `异常：${e.message}`); }
    finally { g.db.close(); rmSync(g.tmp, { recursive: true, force: true }); }
  }

  // 门4：token 不写库（表结构无 token/usage 列；摘要/事件/会话内容无 token 计数）
  {
    const g = fresh();
    try {
      const s = makeSession(0, SIZES.small, g.workspaceDir);
      g.store.insertSession(s);
      g.store.saveEvent(s.id, "progress_delivery", { id: "gate4", taskId: s.tasks[0].id, at: Date.now() });
      let badColumns = [];
      for (const table of ["sessions", "summaries", "session_events", "tasks"]) {
        for (const col of g.db.prepare(`PRAGMA table_info(${table})`).all())
          if (/token|usage/i.test(col.name)) badColumns.push(`${table}.${col.name}`);
      }
      const content = [
        ...g.db.prepare("SELECT record FROM summaries").all().map((r) => r.record),
        ...g.db.prepare("SELECT record FROM session_events").all().map((r) => r.record),
        ...g.db.prepare("SELECT selection, title FROM sessions").all().map((r) => JSON.stringify(r)),
      ].join("\n");
      const leaked = content.match(/"(\w*_)?tokens?"\s*:|"(input|output|cache_read|cache_creation)_tokens"/i);
      check("门4 token 不写库",
        badColumns.length === 0 && !leaked,
        `无 token/usage 列=${badColumns.length === 0}${badColumns.length ? `（${badColumns.join(",")}）` : ""}，摘要/事件/会话内容无 token 计数=${!leaked}（任务 runtime 内 usage 属计划允许的运行详情快照）`);
    } catch (e) { check("门4 token 不写库", false, `异常：${e.message}`); }
    finally { g.db.close(); rmSync(g.tmp, { recursive: true, force: true }); }
  }

  // 门5（存储层前置）：待通知查询三态——notified:false / 缺键(旧记录) / notified:true
  {
    const g = fresh();
    try {
      const a = makeSession(0, SIZES.small, g.workspaceDir, false);
      const b = makeSession(1, SIZES.small, g.workspaceDir, true);
      delete b.tasks[0].notified; // 旧 running/starting 快照常无此键
      g.store.insertSession(a);
      g.store.insertSession(b);
      const pending = new Set(g.store.listPendingSessionIds());
      const pass = pending.has(a.id) && pending.has(b.id);
      const c = makeSession(2, SIZES.small, g.workspaceDir, true);
      g.store.insertSession(c);
      const pending2 = new Set(g.store.listPendingSessionIds());
      check("门5a 待通知查询三态", pass && !pending2.has(c.id),
        `notified:false→待通知=${pending.has(a.id)}，缺notified键→待通知=${pending.has(b.id)}，notified:true→不待通知=${!pending2.has(c.id)}`);
    } catch (e) { check("门5a 待通知查询三态", false, `异常：${e.message}`); }
    finally { g.db.close(); rmSync(g.tmp, { recursive: true, force: true }); }
  }
  return gates;
}

// ---------- 双进程持锁/超时可见实验 ----------

async function lockHolder(dbPath, holdMs, newDir) {
  const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
  const db = new Database(dbPath);
  db.exec("BEGIN IMMEDIATE");
  const t0 = Date.now();
  while (Date.now() - t0 < holdMs) { /* 同步持锁自旋 */ }
  db.exec("COMMIT");
  db.close();
  console.log(JSON.stringify({ role: "holder", requestedMs: holdMs, heldMs: Date.now() - t0 }));
}

async function lockVictim(dbPath, newDir) {
  const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
  const { DatabaseSync } = await import("node:sqlite");
  // 同步化：两子进程并发启动，victim 可能抢在 holder 持锁前写入（实测发生过）。
  // 探针连接 busy_timeout=0：能立即拿到写锁 = holder 尚未就位，让 50ms 重试；
  // BEGIN IMMEDIATE 失败 = holder 已持锁，才开始计时测量。
  const probe = new DatabaseSync(dbPath);
  probe.exec("PRAGMA busy_timeout = 0");
  for (let i = 0; i < 200; i++) {
    try { probe.exec("BEGIN IMMEDIATE"); probe.exec("COMMIT"); await new Promise((r) => setTimeout(r, 50)); }
    catch { break; }
  }
  probe.close();
  const db = new Database(dbPath); // busy_timeout=5000 由生产构造器设置，不调参
  const t0 = process.hrtime.bigint();
  try {
    db.set("lock", "victim", Date.now());
    const waitMs = since(t0);
    db.close();
    console.log(JSON.stringify({ role: "victim", ok: true, waitMs: +waitMs.toFixed(1) }));
    process.exit(0);
  } catch (error) {
    const waitMs = since(t0);
    try { db.close(); } catch {}
    console.log(JSON.stringify({ role: "victim", ok: false, waitMs: +waitMs.toFixed(1), error: String(error.message) }));
    process.exit(2); // 2 = 按超时失败退出（实验预期之一）
  }
}

async function runLock(newDir) {
  const tmp = mkdtempSync(join(tmpdir(), "axiom-bench-lock-"));
  const dbPath = join(tmp, "lock.db");
  { const { Database } = await import(pathToFileURL(join(newDir, "src/database.js"))); new Database(dbPath).close(); } // 预建 schema
  const child = (a) => spawn(process.execPath, [scriptPath, ...a], { cwd: repoDir });
  const collect = async (p) => {
    const [code, out] = await new Promise((res) => {
      let buf = "";
      p.stdout.on("data", (d) => (buf += d));
      p.on("exit", (code) => res([code, buf]));
    });
    const line = out.trim().split("\n").pop();
    try { return { code, ...JSON.parse(line) }; } catch { return { code, error: `子进程输出不可解析：${out.slice(0, 200)}` }; }
  };

  const results = {};
  for (const [name, holdMs] of [["hold300ms", 300], ["hold6000ms_超过busy_timeout", 6000]]) {
    const holder = child(["lock-holder", dbPath, String(holdMs), "--new-dir", newDir]);
    const victim = child(["lock-victim", dbPath, "--new-dir", newDir]); // 与 holder 并发，busy_timeout 兜底
    const [h, v] = await Promise.all([collect(holder), collect(victim)]);
    results[name] = { holdMs, holder: h, victim: { waitMs: v.waitMs, ok: v.ok === true, exitCode: v.code, error: v.ok ? undefined : v.error } };
  }
  rmSync(tmp, { recursive: true, force: true });
  return results;
}

// ---------- 环境与编排 ----------

async function main() {
  if (mode === "lock-holder") return lockHolder(args._[1], Number(args._[2]), args["new-dir"]);
  if (mode === "lock-victim") return lockVictim(args._[1], args["new-dir"]);

  const emit = (obj) => console.log("===BENCH_JSON===\n" + JSON.stringify(obj));

  if (mode === "storage") return emit(await runStorage({ side: args.side, size: args.size, baselineDir: args["baseline-dir"], newDir: args["new-dir"] }));
  if (mode === "e2e") return emit(await runE2E({ side: args.side, size: args.size, scenario: args.scenario, baselineDir: args["baseline-dir"], newDir: args["new-dir"] }));

  // —— all：父进程编排 ——
  const readAt = new Date().toISOString();
  const newDir = resolve(args["new-dir"] ?? join(repoDir, "..", "Axiom-sqlite-refactor-plan"));
  const baselineRef = args["baseline-ref"] ?? "4371708";
  const sizes = String(args.sizes ?? "small,large").split(",");
  if (!existsSync(join(newDir, "src/sessions.js"))) {
    console.error(`--new-dir 无效：${newDir} 下没有 src/sessions.js`);
    process.exit(1);
  }

  // 物化 baseline（git archive）与 new（磁盘快照），记录读取时间。
  // tar 用相对文件名并 cwd 到 root：GNU tar 会把带盘符的绝对路径当远程主机。
  const root = mkdtempSync(join(tmpdir(), "axiom-bench-run-"));
  writeFileSync(join(root, "baseline.tar"), spawnSync("git", ["archive", baselineRef, "src", "public"], { cwd: repoDir, maxBuffer: 64 * 1024 * 1024 }).stdout);
  spawnSync("tar", ["-xf", "baseline.tar"], { cwd: root });
  const baselineDir = root;
  if (!existsSync(join(baselineDir, "src", "sessions.js"))) {
    console.error("baseline 物化失败：git archive/tar 提取后无 src/sessions.js");
    process.exit(1);
  }
  const newSnap = join(root, "new");
  cpSync(join(newDir, "src"), join(newSnap, "src"), { recursive: true });
  if (existsSync(join(newDir, "public"))) cpSync(join(newDir, "public"), join(newSnap, "public"), { recursive: true });
  // 快照目录脱离了原 node_modules 祖先链（protocol.js 裸导入 zod）；用 junction 接回，不复制文件。
  const nodeModules = [join(newDir, "node_modules"), join(repoDir, "node_modules")].find((p) => existsSync(p));
  if (nodeModules) {
    try { symlinkSync(nodeModules, join(newSnap, "node_modules"), "junction"); } catch {}
    try { symlinkSync(nodeModules, join(baselineDir, "node_modules"), "junction"); } catch {}
  }
  const mtime = (p) => { try { return statSync(p).mtime.toISOString(); } catch { return "缺失"; } };
  const eFiles = Object.fromEntries(["sessions.js", "session-store.js", "database.js"].map((f) => [f, mtime(join(newDir, "src", f))]));

  const childArgs = (extra) => [scriptPath, ...extra, "--baseline-dir", baselineDir, "--new-dir", newSnap];
  const runChild = async (a) => {
    const p = spawn(process.execPath, childArgs(a), { cwd: repoDir });
    const [code, out, err] = await new Promise((res) => {
      let o = "", e = "";
      p.stdout.on("data", (d) => (o += d));
      p.stderr.on("data", (d) => (e += d));
      p.on("exit", (code) => res([code, o, e]));
    });
    const marker = out.indexOf("===BENCH_JSON===\n");
    if (marker < 0) return { error: `子进程失败(exit ${code})：${(err || out).slice(-2000)}` };
    return JSON.parse(out.slice(marker + "===BENCH_JSON===\n".length).trim().split("\n").pop());
  };

  const report = {
    meta: {
      time: readAt,
      note: "new 侧为 E 工作树读取时刻的磁盘快照；主审在 A 交付后应以最终代码重跑本脚本",
      baselineRef, baselineSource: `git archive ${baselineRef} (src, public)`,
      newDir, eSrcMtime: eFiles,
      node: process.version, platform: `${process.platform} ${process.arch} os=${os.release()}`,
      cpu: os.cpus()[0]?.model ?? "未知",
      sizes: Object.fromEntries(sizes.map((s) => [s, SIZES[s]])),
    },
    storage: {}, e2e: {}, gates: [], lock: null,
  };

  for (const size of sizes) {
    for (const side of ["old", "new"]) {
      report.storage[`${side}-${size}`] = await runChild(["storage", "--side", side, "--size", size]);
      for (const scenario of ["no-pending", "pending"]) {
        if (scenario === "pending" && size !== "small") continue; // 待通知场景只跑 small 足够验证
        report.e2e[`${side}-${size}-${scenario}`] = await runChild(["e2e", "--side", side, "--size", size, "--scenario", scenario]);
      }
    }
  }

  report.gates = await runGates(baselineDir, newSnap);
  {
    // 门5b：端到端层——无待通知任务时启动 SDK 创建数为 0；有待通知时只恢复待通知会话
    const a = report.e2e["new-small-no-pending"], b = report.e2e["new-small-pending"], o = report.e2e["old-small-no-pending"];
    const pass = a && !a.error && a.startupSdk === 0 && b && !b.error && b.startupSdk === 1;
    const errDetail = [a, b].filter((r) => r?.error).map((r) => r.error.slice(0, 200)).join("；");
    report.gates.push({
      name: "门5b 无待通知任务启动 SDK=0",
      pass,
      detail: errDetail ||
        `无待通知启动 SDK=${a?.startupSdk}（应 0）；恰 1 会话待通知启动 SDK=${b?.startupSdk}（应 1，只恢复待通知会话）；旧版全量恢复对照 SDK=${o?.startupSdk}/${o?.sessions}`,
    });
  }
  report.lock = await runLock(newSnap);

  rmSync(root, { recursive: true, force: true });

  // —— 汇总打印 ——
  const line = (s) => console.log(s);
  line("========== 环境 ==========");
  line(`Node ${report.meta.node} | ${report.meta.platform} | ${report.meta.cpu}`);
  line(`baseline: ${report.meta.baselineSource} | new 快照读取时刻: ${report.meta.time}`);
  line(`E src mtime: ${JSON.stringify(report.meta.eSrcMtime)}`);
  for (const size of sizes) {
    const d = report.meta.sizes[size];
    line(`数据集 ${size}: ${d.sessions} 会话 × ${d.tasks} 任务(result ${d.resultText}B + runtime ${d.systemPrompt}B) × ${d.summaries} 摘要`);
  }
  for (const size of sizes) {
    for (const side of ["old", "new"]) {
      const r = report.storage[`${side}-${size}`];
      if (r.error) { line(`\n========== 存储微基准 ${side} [${size}] 子进程失败 ==========\n${r.error}`); continue; }
      line(`\n========== 存储微基准 ${side === "old" ? "旧 KV 整份保存" : "新按实体写"} [${size}] 单会话载荷 ${kb(r.payloadBytesPerSession)} ==========`);
      line("操作                       p50(ms)  p95(ms)  p99(ms)  写入字节/次   SQL/次   WAL增长(B)  环路max(ms)");
      for (const p of r.phases) {
        if (p.op.startsWith("导入") || p.op.startsWith("启动读") || p.op.startsWith("存储层")) continue;
        line(`${p.op.padEnd(24)} ${String(p.p50).padStart(8)} ${String(p.p95).padStart(8)} ${String(p.p99).padStart(8)} ${String(p.writeBytesPerOp).padStart(11)} ${String(p.sqlPerOp).padStart(8)} ${String(p.walDelta).padStart(11)} ${String(p.loopMaxMs).padStart(10)}`);
      }
      for (const p of r.phases.filter((p) => p.op.startsWith("导入") || p.op.startsWith("启动读") || p.op.startsWith("存储层")))
        line(`${p.op.padEnd(24)} p50=${p.p50}ms (一次性/读取)`);
      line(`库文件 ${kb(r.dbFileBytes)} | WAL ${kb(r.walBytes)} | 进程RSS ${Math.round(r.rssKB / 1024)}MB`);
    }
  }
  line("\n========== 端到端（真实 Sessions + fake SDK） ==========");
  line("场景                          启动ms   启动SDK  首开ms    环路max(ms)  RSS增量MB");
  for (const [k, r] of Object.entries(report.e2e)) {
    if (r.error) { line(`${k.padEnd(28)} 失败：${r.error.slice(0, 120)}`); continue; }
    line(`${k.padEnd(28)} ${String(r.startupMs).padStart(8)} ${String(r.startupSdk).padStart(8)} ${String(r.firstOpenMs ?? "-").padStart(8)} ${String(r.loopMaxMs).padStart(10)} ${String(Math.round((r.rssAfterKB - r.rssBeforeKB) / 1024)).padStart(10)}`);
  }
  line("\n========== 硬门槛 ==========");
  for (const g of report.gates) line(`${g.pass ? "PASS" : "FAIL"}  ${g.name} —— ${g.detail}`);
  line("\n========== 双进程同库持锁/超时 ==========");
  for (const [k, v] of Object.entries(report.lock ?? {})) {
    line(`${k}: holder 实持 ${v.holder?.heldMs}ms | victim ${v.victim?.ok ? `等待 ${v.victim.waitMs}ms 后成功` : `等待 ${v.victim?.waitMs}ms 后失败：${v.victim?.error}`}`);
  }
  const failed = report.gates.filter((g) => !g.pass);
  line(`\n结论：硬门槛 ${report.gates.length - failed.length}/${report.gates.length} 通过${failed.length ? `；失败：${failed.map((g) => g.name).join("、")}` : ""}`);

  emit(report);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
