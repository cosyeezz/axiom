#!/usr/bin/env node
// SQLite 拆表性能验收（G 包）：旧 KV 整份保存 vs 新按实体写。
// 仅用 stdlib/node:sqlite/已有依赖，不碰 ~/.axiom，数据全部在 mkdtemp 临时目录 + fake SDK。
//
// 用法（在仓库根目录运行；集成后默认被测就是当前仓库）：
//   node tests/sqlite-benchmark.mjs [--new-dir <含src/sessions.js的目录，默认当前仓库>]
//                                   [--baseline-ref 4371708] [--sizes small,large]
//   子命令（脚本内部自用，也可单独调用）：
//     storage --side old|new --size small|large --baseline-dir <dir> --new-dir <dir>
//     e2e     --side old|new --size small|large --scenario no-pending|pending --baseline-dir <dir> --new-dir <dir>
//     lock-holder <db> <holdMs> --new-dir <dir>   拿到写锁后先输出 "READY" 再自旋持锁
//     lock-victim <db> --new-dir <dir>          连接就绪后等待 IPC，再开始测写锁
//     self-check                                  百分位/计量/失败判定的最小自校验
//
// 诚实声明：
// - baseline 侧 = git archive <ref> 物化的真实旧 Database + 真实旧 Sessions（端到端）；
//   存储微基准里的旧保存流程是 baseline persist() 的逐字段复刻（同结构/同双序列化管线），不是端到端。
// - new 侧 = --new-dir 目录的 src/ + public/ 磁盘快照（快照时刻记录在结果里），
//   经 import 加载真实 database.js / session-store.js / sessions.js。
// - 硬门槛断言不因初版不达标而放宽；门槛失败、任一子命令失败、锁实验不符预期都让 all 退出码为 1。

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from "node:fs";
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
// 分位数必须先排序：输入是未排序的逐次延迟样本。
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
};
const rss = () => process.memoryUsage().rss;
const fileStat = (p) => { try { return statSync(p).size; } catch { return 0; } };
// 给事件循环一拍：1ms 采样定时器只有真的 tick 过，漂移才会被记录（同步 phase 前后各一拍）。
const tick = () => new Promise((r) => setTimeout(r, 3));

// 事件循环延迟监视：1ms 间隔采样漂移，max ≈ 监视窗口内最长同步阻塞段。
// 注意：监视窗口必须覆盖「启动→phase 前 tick→同步 phase→phase 后 tick→stop」，
// 同步代码执行期间定时器不会触发，phase 结束后必须让出一拍再 stop，否则 max 恒为 0。
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

// SQL 计量（全脚本唯一计量点，杜绝多层重复计数）：
//   stats.sql        语句执行总次数（读+写；报告口径注明）
//   stats.writeSql   写语句次数（INSERT/UPDATE/DELETE/REPLACE 开头；DDL/事务控制不计）
//   stats.writeBytes 写语句绑定字符串的 UTF-8 字节数（含WHERE键，不等于文件增量）
//   读语句（get/all/iterate）只计次数，绝不计入写字节；store 层调用只计次数（见 countingStore）。
//   旧 KV db.set(ns,key,value) 绑定 ns/key/JSON.stringify(value)，与新 SQL 层同口径。
//   必须先 instrument、再 new SessionStore / 任何 prepare：store 按语句文本缓存 prepared 对象，后装会漏计。
const WRITE_SQL = /^\s*(insert|update|delete|replace)/i;
function instrument(db, stats) {
  const bump = (write, bytes) => { stats.sql++; if (write) { stats.writeSql++; stats.writeBytes += bytes || 0; } };
  for (const m of ["get", "set", "delete", "list"]) {
    if (typeof db[m] !== "function") continue;
    const orig = db[m].bind(db);
    db[m] = (...a) => {
      const write = m === "set" || m === "delete";
      const bound = write ? [a[0], a[1], ...(m === "set" ? [JSON.stringify(a[2])] : [])] : [];
      bump(write, bound.reduce((n, v) => n + Buffer.byteLength(v), 0));
      return orig(...a);
    };
  }
  if (typeof db.prepare === "function") {
    const origPrepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      const stmt = origPrepare(sql);
      const write = WRITE_SQL.test(sql);
      return new Proxy(stmt, {
        get(t, p) {
          if (p === "run")
            return (...a) => {
              bump(write, a.reduce((s, v) => s + (typeof v === "string" ? Buffer.byteLength(v) : 0), 0));
              return t.run(...a);
            };
          if (p === "get" || p === "all" || p === "iterate")
            return (...a) => { bump(false, 0); return t[p](...a); };
          const v = t[p];
          return typeof v === "function" ? v.bind(t) : v;
        },
      });
    };
  }
  if (typeof db.exec === "function") {
    const origExec = db.exec.bind(db);
    db.exec = (...a) => { bump(WRITE_SQL.test(String(a[0] ?? "")), 0); return origExec(...a); };
  }
  return db;
}

// 新侧 store 包装：只记方法调用次数（calls）。写入字节一律由 SQL 层唯一计量，这里不再计，
// 避免与 instrument 双计；也不能用 Proxy：SessionStore 方法使用 #私有字段，this 必须是原对象。
function countingStore(store, stats) {
  const call = (name) => (...a) => { stats.calls++; return store[name](...a); };
  return {
    saveTask: call("saveTask"),
    saveEvent: call("saveEvent"),
    updateSession: call("updateSession"),
    insertSession: call("insertSession"),
  };
}

// ---------- 数据集（小/大，大任务 runtime/result 有实际重量） ----------
// 注意：各 *Text/systemPrompt 数值是字符数；中文“字”UTF-8 下每字 3 字节，真实落库字节
// 以 Buffer.byteLength 计（payloadBytesPerSession / 写字节列），字符数 ≠ 字节数。
const SIZES = {
  // small：8 会话 × 2 任务(result 400字 + runtime 1200字)，单会话载荷 ~14KB
  small: { sessions: 8, tasks: 2, resultText: 400, systemPrompt: 1200 },
  // large：16 会话 × 6 任务(result 48K字≈144KB + runtime 16K字≈48KB)，单会话载荷 ~1.9MB
  large: { sessions: 16, tasks: 6, resultText: 48 * 1024, systemPrompt: 16 * 1024 },
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
  }));
  return {
    id, cwd: workspaceDir, title: `会话${index}`,
    titleManual: false, titleRequested: false,
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
// 计时必须覆盖全部同等保存成本：投影组装与首次 stringify 都在窗口内（旧实现真实成本如此），
// 不能只计 set 那一段。
function oldPersist(item, db) {
  const t0 = process.hrtime.bigint();
  const data = {
    id: item.id, cwd: item.cwd, title: item.title,
    titleManual: item.titleManual, titleRequested: item.titleRequested,
    createdAt: item.createdAt, updatedAt: item.updatedAt,
    compactions: item.compactions, retries: item.retries, tasks: item.tasks,
    elapsedMs: item.elapsedMs, runningSince: item.runningSince, sessionFile: item.sessionFile,
    selection: { ...item.selection },
  };
  const payload = JSON.stringify(data); // 立即序列化快照（旧实现注释原义），首次 stringify 计入成本
  db.set("sessions", item.id, JSON.parse(payload));
  return since(t0);
}

// ---------- 存储微基准子命令 ----------

async function runStorage({ side, size, baselineDir, newDir }) {
  const tmp = mkdtempSync(join(tmpdir(), `axiom-bench-storage-${side}-${size}-`));
  const workspaceDir = join(tmp, "workspaces"); mkdirSync(workspaceDir, { recursive: true });
  const dbPath = join(tmp, `bench-${side}.db`);
  const stats = { sql: 0, writeSql: 0, writeBytes: 0, calls: 0 };
  let db;
  try {
    let store;
    if (side === "old") {
      const { Database } = await import(pathToFileURL(join(baselineDir, "src/database.js")));
      db = instrument(new Database(dbPath), stats);
    } else {
      const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
      const { SessionStore } = await import(pathToFileURL(join(newDir, "src/session-store.js")));
      db = instrument(new Database(dbPath), stats); // 先 instrument 再建 store（#sql 缓存 prepared 对象）
      const rawStore = new SessionStore(db); // 读路径直用原对象；写路径包一层计数
      store = Object.assign(countingStore(rawStore, stats), {
        listSessions: (...a) => rawStore.listSessions(...a),
        listPendingSessionIds: (...a) => rawStore.listPendingSessionIds(...a),
        getSession: (...a) => rawStore.getSession(...a),
      });
    }
    const dataset = makeDataset(size, workspaceDir, false);
    const items = dataset.map((saved) => ({ ...saved })); // 内存态，模拟旧进程内 item

    const phases = [];
    const runPhase = async (op, reps, fn) => {
      const loop = loopMonitor();
      try {
      await tick(); // 相位前让 1ms 采样定时器真实 tick，last 落在相位紧前
      const lat = [];
      const sql0 = stats.sql, wsql0 = stats.writeSql, bytes0 = stats.writeBytes;
      const wal0 = fileStat(dbPath + "-wal"), rss0 = rss();
      const t0 = process.hrtime.bigint();
      for (let r = 0; r < reps; r++) lat.push(fn(r));
      const wall = since(t0);
      await tick(); // 相位后再 tick 一拍：同步阻塞的漂移才会被采样（否则 max 恒 0）
      const loopStats = loop.stop();
      phases.push({
        op, reps,
        p50: +pct(lat, 50).toFixed(3), p95: +pct(lat, 95).toFixed(3), p99: +pct(lat, 99).toFixed(3),
        wallMs: +wall.toFixed(1),
        // 写字节 = 写语句 SQL 绑定字符串字节（唯一口径）；写SQL/次 = 写语句次数；SQL/次含读写
        writeBytesPerOp: Math.round((stats.writeBytes - bytes0) / reps),
        writeSqlPerOp: +((stats.writeSql - wsql0) / reps).toFixed(2),
        sqlPerOp: +((stats.sql - sql0) / reps).toFixed(2),
        walDelta: fileStat(dbPath + "-wal") - wal0,
        rssKB: Math.round((rss() - rss0) / 1024),
        ...loopStats,
      });
      } finally { loop.stop(); }
    };

    // 数据导入（一次性，不进热路径指标，但单独报告）
    await runPhase("导入/迁移", dataset.length, (r) => {
      const t0 = process.hrtime.bigint();
      if (side === "old") db.set("sessions", dataset[r].id, dataset[r]);
      else store.insertSession(dataset[r]);
      return since(t0);
    });

    // 存储层启动读：旧 = list 全量解析；新 = 元数据 + 待通知查询
    await runPhase("启动读(全部会话)", 5, () => {
      const t0 = process.hrtime.bigint();
      if (side === "old") db.list("sessions");
      else { store.listSessions(); }
      return since(t0);
    });
    if (side === "new") {
      await runPhase("启动读(待通知查询)", 5, () => {
        const t0 = process.hrtime.bigint();
        store.listPendingSessionIds();
        return since(t0);
      });
      await runPhase("存储层首开读(单会话全投影)", 5, (r) => {
        const t0 = process.hrtime.bigint();
        store.getSession(dataset[r % dataset.length].id);
        return since(t0);
      });
    }

    const R = REPS[size];
    if (side === "old") {
      await runPhase("改标题", R, (r) => { const it = items[r % items.length]; it.title = `改名${r}`; it.updatedAt = Date.now(); return oldPersist(it, db); });
      await runPhase("任务通知(notified)", R, (r) => { const it = items[r % items.length]; it.tasks[0].notified = !it.tasks[0].notified; return oldPersist(it, db); });
      await runPhase("计时更新(elapsedMs)", R, (r) => { const it = items[r % items.length]; it.elapsedMs += 100; return oldPersist(it, db); });
    } else {
      await runPhase("改标题", R, (r) => { const t0 = process.hrtime.bigint(); store.updateSession(dataset[r % dataset.length].id, { title: `改名${r}`, updatedAt: Date.now() }); return since(t0); });
      await runPhase("任务通知(notified)", R, (r) => { // E 真实热路径：deliver → persist(item,{task:{id,notified:true}})
        const t0 = process.hrtime.bigint();
        store.saveTask(dataset[r % dataset.length].id, { id: `task-${r % dataset.length}-0`, notified: Math.floor(r / dataset.length) % 2 === 0 });
        return since(t0);
      });
      await runPhase("计时更新(elapsedMs)", R, (r) => { const t0 = process.hrtime.bigint(); store.updateSession(dataset[r % dataset.length].id, { elapsedMs: dataset[r % dataset.length].elapsedMs + 100 * (Math.floor(r / dataset.length) + 1) }); return since(t0); });
    }

    return {
      mode: "storage", side, size,
      payloadBytesPerSession: Math.round(bytesOf(dataset[0])),
      totalPayloadBytes: dataset.reduce((s, d) => s + bytesOf(d), 0),
      dbFileBytes: fileStat(dbPath), walBytes: fileStat(dbPath + "-wal"),
      rssKB: Math.round(rss() / 1024),
      phases,
    };
  } finally {
    try { db?.close(); } catch {}
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- 端到端子命令（真实 Sessions + fake SDK） ----------

// subscriptions 可选：收集每个 agent 注册的事件回调，供门4注入 token 流事件（E2E 不传，行为同裸 subscribe）。
function fakeAgentFactory(counter, fallbackDir, subscriptions) {
  const factory = async (tools, config = {}) => {
    counter.count++;
    const file = config.sessionFile && existsSync(config.sessionFile) ? config.sessionFile : join(fallbackDir, `fake-${counter.count}.jsonl`);
    return {
      cwd: config.cwd ?? fallbackDir,
      config: () => config,
      sessionFile: () => file,
      historyEntries: () => [],
      compactions: () => [],
      subscribe: (cb) => { subscriptions?.push(cb); return () => {}; },
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
  let db, sessions;
  try {
    let Sessions;
    if (side === "old") ({ Sessions } = await import(pathToFileURL(join(baselineDir, "src/sessions.js"))));
    else ({ Sessions } = await import(pathToFileURL(join(newDir, "src/sessions.js"))));

    // 数据先落库（迁移口径），再测真实启动路径
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

    sessions = new Sessions(fakeAgentFactory(counter, storageDir), null, storageDir, db);
    const loop = loopMonitor();
    const rssBefore = rss();
    await tick(); // 让采样定时器先 tick
    const t0 = process.hrtime.bigint();
    await sessions.load();
    const startupMs = since(t0);
    const startupSdk = counter.count;
    // load 完成后（微任务先于 setImmediate）暂停通知投递，避免测量路径外的 prompt 交互
    for (const item of sessions.items.values()) item.notificationsPaused = true;
    await tick(); // 让 load 期间的阻塞漂移被采样
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

    return {
      mode: "e2e", side, size, scenario,
      startupMs: +startupMs.toFixed(1), startupSdk,
      firstOpenMs, firstOpenSdk,
      sessions: dataset.length,
      dbFileBytes: fileStat(dbPath), walBytes: fileStat(dbPath + "-wal"),
      rssBeforeKB: Math.round(rssBefore / 1024), rssAfterKB: Math.round(rss() / 1024),
      ...loopStats,
    };
  } finally {
    // 清理顺序固定：先关 Sessions（收尾 persist + dispose 各 agent），再关外部注入的库，最后删临时目录。
    try { await sessions?.close(); } catch {}
    try { db?.close(); } catch {}
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- 硬门槛（父进程内，小数据，专用库，断言不放宽） ----------

async function runGates(baselineDir, newDir) {
  const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
  const { SessionStore } = await import(pathToFileURL(join(newDir, "src/session-store.js")));
  const { Sessions } = await import(pathToFileURL(join(newDir, "src/sessions.js")));
  const gates = [];
  const check = (name, pass, detail) => gates.push({ name, pass, detail });

  // 每个门槛独立临时库；instrument 必须先于 SessionStore 装配（store 按语句文本缓存 prepared 对象）。
  const fresh = () => {
    const tmp = mkdtempSync(join(tmpdir(), "axiom-bench-gate-"));
    const stats = { sql: 0, writeSql: 0, writeBytes: 0, calls: 0 };
    const db = instrument(new Database(join(tmp, "gate.db")), stats);
    const store = new SessionStore(db);
    const workspaceDir = join(tmp, "ws"); mkdirSync(workspaceDir, { recursive: true });
    return { tmp, db, store, stats, workspaceDir };
  };
  const rawRows = (db, table, sid) =>
    db.prepare(`SELECT * FROM ${table} WHERE session_id = ? ORDER BY rowid`).all(sid).map((r) => JSON.stringify(r));
  // 机制级硬闸：门槛动作期间该表任何 UPDATE 直接 RAISE(ABORT)——比行快照对比更强，
  // 行快照只能证明"这一次没变"，触发器证明"实现不可能变"。
  const forbidUpdate = (db, table, tag) =>
    db.exec(`CREATE TRIGGER gate_${tag}_${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '门槛违规：不得 UPDATE ${table}'); END;`);
  const mark = (g) => ({ sql: g.stats.sql, writeSql: g.stats.writeSql, writeBytes: g.stats.writeBytes });
  const delta = (g, m) => ({ sql: g.stats.sql - m.sql, writeSql: g.stats.writeSql - m.writeSql, writeBytes: g.stats.writeBytes - m.writeBytes });

  // 门2：notified 更新不携带 runtime/result——写负载在 SQL 绑定层唯一计量，
  // 与任务 record 体积无关；writeSql>=1 自校验计量层确实观测到了写入（防代理被语句缓存绕过）。
  {
    const g = fresh();
    try {
      const small = makeSession(0, { ...SIZES.small, resultText: 300, systemPrompt: 500 }, g.workspaceDir, false);
      const big = makeSession(1, { ...SIZES.large, resultText: 48 * 1024, systemPrompt: 16 * 1024 }, g.workspaceDir, false);
      g.store.insertSession(small);
      g.store.insertSession(big);
      const m1 = mark(g);
      g.store.saveTask(small.id, { id: small.tasks[0].id, notified: true });
      const smallBytes = g.stats.writeBytes - m1.writeBytes, smallSql = g.stats.writeSql - m1.writeSql;
      const m2 = mark(g);
      g.store.saveTask(big.id, { id: big.tasks[0].id, notified: true });
      const bigBytes = g.stats.writeBytes - m2.writeBytes, bigSql = g.stats.writeSql - m2.writeSql;
      const stillNotified = g.store.listTasks(big.id).find((t) => t.id === big.tasks[0].id)?.notified === true;
      const pass = bigBytes <= smallBytes + 512 && stillNotified && smallSql >= 1 && bigSql >= 1;
      check("门2 notified 不携带 runtime/result",
        pass,
        `notified 更新 SQL 绑定写字节：小任务 ${smallBytes}B vs 大任务(48K字 result+16K字 runtime) ${bigBytes}B（写语句各 ${smallSql}/${bigSql} 条），语义保留=${stillNotified}` +
        (pass ? "" : smallSql < 1 || bigSql < 1 ? "；SQL 计量未观测到写入，门槛失效" : "；notified 更新写负载随 runtime/result 体积放大，须独立列修复"));
    } catch (e) { check("门2 notified 不携带 runtime/result", false, `异常：${e.message}`); }
    finally { g.db.close(); rmSync(g.tmp, { recursive: true, force: true }); }
  }

  // 门3：改标题不改任务/摘要/事件——行快照逐字节不变 + 三子表 UPDATE 触发器（ABORT）+ 写语句恰 1 条
  {
    const g = fresh();
    try {
      const s = makeSession(0, SIZES.small, g.workspaceDir);
      g.store.insertSession(s);
      const before = ["tasks", "session_events"].map((t) => rawRows(g.db, t, s.id));
      for (const t of ["tasks", "session_events"]) forbidUpdate(g.db, t, "g3");
      const m = mark(g);
      g.store.updateSession(s.id, { title: "门3改名", updatedAt: Date.now() });
      const d = delta(g, m);
      const after = ["tasks", "session_events"].map((t) => rawRows(g.db, t, s.id));
      const title = g.store.getSession(s.id).title;
      const same = JSON.stringify(before) === JSON.stringify(after);
      check("门3 改标题不改任务",
        same && title === "门3改名" && d.writeSql === 1,
        `子表行逐字节不变=${same}，标题已更新=${title === "门3改名"}，写语句 ${d.writeSql} 条（应恰 1：sessions 行）；期间任何 UPDATE tasks/session_events 都被触发器 ABORT`);
    } catch (e) { check("门3 改标题不改任务", false, `异常：${e.message}`); }
    finally { g.db.close(); rmSync(g.tmp, { recursive: true, force: true }); }
  }

  // 门4：逐 token 不写库——动态证据为主：真实 Sessions + fake subscribe 注入 100 个含 token
  // 数据的事件（agent.message.start / agent.delta ×66 / agent.runtime ×33，runtime 带 usage 计数），
  // 观测窗口内 SQL 总数（含读）必须为 0；辅以静态证据：表结构无 token/usage 列、
  // 摘要/事件/会话内容无 token 计数。允许项：任务 runtime 内 usage 与 compaction.tokensBefore
  // 属计划允许的运行详情快照（静态扫描不含 tasks.record）。
  {
    const g = fresh();
    let sessions;
    try {
      const s = makeSession(0, SIZES.small, g.workspaceDir);
      g.store.insertSession(s);
      let badColumns = [];
      for (const table of ["sessions", "session_events", "tasks"])
        for (const col of g.db.prepare(`PRAGMA table_info(${table})`).all())
          if (/token|usage/i.test(col.name)) badColumns.push(`${table}.${col.name}`);
      const subs = [];
      sessions = new Sessions(fakeAgentFactory({ count: 0 }, g.workspaceDir, subs), null, g.workspaceDir, g.db);
      await sessions.load();
      await sessions.ensureLoaded(s.id);
      sessions.get(s.id).notificationsPaused = true; // 通知投递不得进入观测窗口
      const emitEvent = subs[0];
      if (!emitEvent) throw new Error("fake agent 未注册 subscribe 回调，注入通道缺失");
      const m = mark(g);
      emitEvent({ type: "agent.message.start", data: { message: { role: "assistant", content: [{ type: "text", text: "" }] } } });
      for (let i = 1; i < 100; i++) {
        if (i % 3 === 1) emitEvent({ type: "agent.delta", data: { type: "text_delta", contentIndex: 0, delta: `token块${i} ` } });
        else if (i % 3 === 2) emitEvent({ type: "agent.delta", data: { type: "thinking_delta", contentIndex: 0, delta: `tok${i}` } });
        else emitEvent({ type: "agent.runtime", data: { model: "fake-model", usage: { input_tokens: 7, output_tokens: 3, cache_read_tokens: 1 } } });
      }
      await tick(); // 若存在异步保存路径，也必须落进观测窗口
      const d = delta(g, m);
      const content = [
        ...g.db.prepare("SELECT record FROM session_events").all().map((r) => r.record),
        ...g.db.prepare("SELECT selection, title FROM sessions").all().map((r) => JSON.stringify(r)),
      ].join("\n");
      const leaked = content.match(/"(\w*_)?tokens?"\s*:|"(input|output|cache_read|cache_creation)_tokens"/i);
      check("门4 逐 token 不写库",
        badColumns.length === 0 && d.sql === 0 && !leaked,
        `无 token/usage 列=${badColumns.length === 0}${badColumns.length ? `（${badColumns.join(",")}）` : ""}；100 个含 token 事件（agent.delta×66、agent.runtime×33 带 usage）期间 SQL 总数=${d.sql}（应 0，含读）；事件/会话内容无 token 计数=${!leaked}（任务 runtime usage 与 compaction.tokensBefore 属允许快照）`);
    } catch (e) { check("门4 逐 token 不写库", false, `异常：${e.message}`); }
    finally { try { await sessions?.close(); } catch {} g.db.close(); rmSync(g.tmp, { recursive: true, force: true }); }
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
// holder 先真实拿到写锁，再经 stdout 发 "READY"（fs.writeSync 同步行）；父进程收到 READY 才启动
// victim，保证测量必落在持锁窗口内。取代旧探针方案（探针自身抢写锁会干扰持锁窗口、重试循环
// 耗尽后仍继续测、catch 所有 error 会吞掉真实故障）。victim 复用生产 Database（busy_timeout=5000 不调参）。
// 退出码：victim 0=成功；2=锁超时（hold 超过 busy_timeout 时的预期结果，错误可见）；4=其他错误；holder 3=失败。

async function lockHolder(dbPath, holdMs, newDir) {
  const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
  const db = new Database(dbPath);
  try {
    db.exec("BEGIN IMMEDIATE"); // 拿不到写锁这里抛（构造器已设 busy_timeout=5000）
    writeSync(1, "READY\n"); // 锁就绪信号：父进程见此行才启动 victim
    const t0 = Date.now();
    while (Date.now() - t0 < holdMs) { /* 同步持锁自旋 */ }
    db.exec("COMMIT");
    const heldMs = Date.now() - t0;
    db.close();
    writeSync(1, JSON.stringify({ role: "holder", ok: true, requestedMs: holdMs, heldMs }) + "\n");
  } catch (error) {
    try { db.close(); } catch {}
    writeSync(1, JSON.stringify({ role: "holder", ok: false, requestedMs: holdMs, error: String(error.message) }) + "\n");
    process.exit(3);
  }
}

async function lockVictim(dbPath, newDir) {
  const { Database } = await import(pathToFileURL(join(newDir, "src/database.js")));
  const db = new Database(dbPath); // 生产构造器：busy_timeout=5000，不调参
  // 先连好库，再等holder拿锁：进程启动/模块导入不占测量窗口。
  if (process.send) {
    const start = new Promise((resolve) => process.once("message", resolve));
    writeSync(1, "READY\n");
    await start;
    process.disconnect();
  }
  const t0 = process.hrtime.bigint();
  try {
    db.set("lock", "victim", Date.now());
    const waitMs = since(t0);
    db.close();
    writeSync(1, JSON.stringify({ role: "victim", ok: true, waitMs: +waitMs.toFixed(1) }) + "\n");
  } catch (error) {
    const waitMs = since(t0);
    try { db.close(); } catch {}
    const timedOut = /locked|busy/i.test(String(error.message)); // 只有锁超时算预期失败，其余错误如实暴露
    writeSync(1, JSON.stringify({ role: "victim", ok: false, timedOut, waitMs: +waitMs.toFixed(1), error: String(error.message) }) + "\n");
    process.exit(timedOut ? 2 : 4);
  }
}

async function runLock(newDir) {
  const tmp = mkdtempSync(join(tmpdir(), "axiom-bench-lock-"));
  const dbPath = join(tmp, "lock.db");
  { const { Database } = await import(pathToFileURL(join(newDir, "src/database.js"))); new Database(dbPath).close(); } // 预建 schema
  const child = (a) => spawn(process.execPath, [scriptPath, ...a], {
    cwd: repoDir, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  // 收集子进程 stdout 到退出，末行解析为 JSON；ready 回调在 READY 行出现时立即触发（不等退出）。
  const collect = (p, onReady) => new Promise((res) => {
    let buf = "", err = "", fired = false;
    p.stderr.on("data", d => { err += d; });
    p.once("error", error => res({ code: null, ok: false, error: error.message }));
    p.stdout.on("data", (d) => {
      buf += d;
      if (onReady && !fired && /^READY\b/m.test(buf)) { fired = true; onReady(); }
    });
    p.on("close", (code) => {
      const line = buf.trim().split("\n").filter(Boolean).pop() ?? "";
      try { res({ ...JSON.parse(line), code }); }
      catch { res({ code, ok: false, error: `子进程输出不可解析：${(err || buf).slice(0, 200)}` }); }
    });
  });

  const results = {};
  let ok = true;
  for (const [name, holdMs] of [["hold300ms", 300], ["hold6000ms_超过busy_timeout", 6000]]) {
    const victim = child(["lock-victim", dbPath, "--new-dir", newDir]);
    const victimReady = Promise.withResolvers();
    const vp = collect(victim, victimReady.resolve);
    const connected = await Promise.race([victimReady.promise.then(() => true), vp.then(() => false)]);
    let h = { ok: false }, outcome = "exited";
    if (connected) {
      const holder = child(["lock-holder", dbPath, String(holdMs), "--new-dir", newDir]);
      const holderReady = Promise.withResolvers();
      const hp = collect(holder, holderReady.resolve);
      outcome = await Promise.race([holderReady.promise.then(() => "ready"), hp.then(() => "exited")]);
      if (outcome === "ready") victim.send("write");
      else victim.kill();
      h = await hp;
    }
    const v = await vp;
    const pass =
      outcome === "ready" && h.code === 0 && h.ok === true && v != null &&
      (holdMs <= 4000
        ? v.code === 0 && v.ok === true && h.heldMs > 0 && v.waitMs >= h.heldMs * 0.8 // 原门槛不放宽
        : v.code === 2 && v.ok === false && v.timedOut === true && v.waitMs >= 4000);
    if (!pass) ok = false;
    results[name] = {
      holdMs, pass, holder: h,
      victim: v && { waitMs: v.waitMs, ok: v.ok === true, exitCode: v.code, timedOut: v.timedOut, error: v.ok ? undefined : v.error },
    };
  }
  rmSync(tmp, { recursive: true, force: true });
  return { results, ok };
}

// 子进程close后再解析，非零退出即失败，不能被提前输出的合法JSON掩盖。
function childResult(code, out, err = "") {
  const marker = out.indexOf("===BENCH_JSON===\n");
  if (code !== 0 || marker < 0)
    return { error: `子进程失败(exit ${code})：${(err || out).slice(-2000)}` };
  try { return JSON.parse(out.slice(marker + "===BENCH_JSON===\n".length).trim()); }
  catch { return { error: "子进程结果不是合法JSON" }; }
}

// ---------- 失败判定（纯函数；self-check 验证其失败路径） ----------
// all 模式退出码依据：门槛失败 + 任一子进程失败 + 锁实验不符预期，任何一项都算整体失败。
function judge(report) {
  return [
    ...(report.gates ?? []).filter((g) => !g.pass).map((g) => `门槛失败：${g.name}`),
    ...Object.entries(report.storage ?? {}).filter(([, r]) => r?.error).map(([k]) => `存储子进程失败：${k}`),
    ...Object.entries(report.e2e ?? {}).filter(([, r]) => r?.error).map(([k]) => `端到端子进程失败：${k}`),
    ...(report.lock && report.lock.ok === false
      ? ["锁实验未达预期（hold300ms 应阻塞近整个窗口后成功；hold6000ms 应接近 busy_timeout 超时且错误可见）"]
      : []),
  ];
}

// ---------- self-check：证明百分位/计量/失败判定/环路采样本身有效（手写断言，不引框架） ----------
async function selfCheck() {
  const { DatabaseSync } = await import("node:sqlite");
  const results = [];
  const test = async (name, fn) => {
    try { await fn(); results.push({ name, pass: true }); }
    catch (e) { results.push({ name, pass: false, error: e.message }); }
  };
  const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg}：得 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`); };

  await test("pct 先排序再取分位", () => {
    eq(pct([5, 1, 3, 2, 4], 50), 3, "乱序输入 p50");
    eq(pct([10, 20, 30, 40], 50), 20, "p50 取第 ceil(0.5*4) 个");
    eq(pct([10, 20, 30, 40], 95), 40, "p95 取最大");
    eq(pct([7], 99), 7, "单样本 p99");
    eq(pct([3, 1], 1), 1, "极小分位取最小");
  });

  await test("instrument：读不计写；写字节=绑定字符串 UTF-8；DDL/事务不算写语句", () => {
    const stats = { sql: 0, writeSql: 0, writeBytes: 0, calls: 0 };
    const db = instrument(new DatabaseSync(":memory:"), stats);
    try {
    db.exec("CREATE TABLE t (a TEXT)");
    eq(stats.sql, 1, "CREATE 计语句次数");
    eq(stats.writeSql, 0, "DDL 不计写语句");
    db.prepare("INSERT INTO t VALUES (?)").run("abc");
    eq(stats.writeSql, 1, "INSERT 计写");
    eq(stats.writeBytes, 3, "绑定字符串字节数");
    db.prepare("SELECT a FROM t WHERE a = ?").get("abc");
    eq(stats.sql, 3, "语句总次数含读");
    eq(stats.writeBytes, 3, "SELECT 的绑定参数不计写字节");
    db.prepare("UPDATE t SET a = ? WHERE a = ?").run("xy", "abc");
    eq(stats.writeSql, 2, "UPDATE 计写");
    eq(stats.writeBytes, 8, "写字节累计=3(INSERT)+5(UPDATE)，读参数不计");
    db.prepare("BEGIN").run();
    eq(stats.writeSql, 2, "事务控制不计写语句");
    } finally { db.close(); }
    const kvStats = { sql: 0, writeSql: 0, writeBytes: 0 };
    instrument({ set() {}, delete() {} }, kvStats).set("ns", "k", "abc");
    eq(kvStats.writeBytes, 8, "旧侧包含namespace/key及JSON引号，与SQL绑定同口径");
  });

  await test("countingStore 只计调用数，无字节字段（杜绝与 SQL 层双计）", () => {
    const stats = { sql: 0, writeSql: 0, writeBytes: 0, calls: 0 };
    let called = 0;
    const wrapped = countingStore({ saveTask: () => called++ }, stats);
    wrapped.saveTask("sid", { id: "t", notified: true });
    eq(stats.calls, 1, "store 调用计数");
    eq(called, 1, "透传原方法");
    eq(stats.writeBytes, 0, "写字节归 SQL 层");
    eq("bytes" in stats, false, "store 层没有 bytes 计量");
  });

  await test("judge 失败路径：门槛/子进程/锁失败各计入一次，干净报告零失败", () => {
    eq(judge({ gates: [{ pass: true }], storage: {}, e2e: {}, lock: { ok: true } }).length, 0, "干净报告");
    const bad = judge({
      gates: [{ name: "x", pass: false }, { name: "y", pass: true }],
      storage: { "old-large": { error: "boom" } },
      e2e: { "new-small-pending": { error: "boom2" } },
      lock: { ok: false, results: {} },
    });
    eq(bad.length, 4, "1 门槛 + 1 存储 + 1 e2e + 1 锁");
  });

  await test("子进程结果必须同时满足退出码0和有效JSON", () => {
    const out = '===BENCH_JSON===\n{"mode":"storage"}';
    eq(childResult(0, out).mode, "storage", "成功输出");
    eq(Boolean(childResult(2, out).error), true, "合法JSON不能掩盖非零退出");
    eq(Boolean(childResult(null, out).error), true, "被信号杀死不能成功");
    eq(Boolean(childResult(0, "===BENCH_JSON===\n{").error), true, "坏JSON也失败");
  });

  await test("loopMonitor：phase 前后真实 tick，同步阻塞被采样（非恒 0）", async () => {
    const loop = loopMonitor();
    await tick();
    const t0 = Date.now();
    while (Date.now() - t0 < 40) { /* 同步忙等 */ }
    await tick();
    const s = loop.stop();
    if (!(s.loopMaxMs >= 25)) throw new Error(`40ms 同步阻塞后 loopMaxMs=${s.loopMaxMs}，采样未生效（旧实现此场景恒 0）`);
  });

  const pass = results.filter((r) => r.pass).length;
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.pass ? "" : ` —— ${r.error}`}`);
  console.log(`self-check：${pass}/${results.length} 通过`);
  if (pass !== results.length) process.exitCode = 1;
}

// ---------- 环境与编排 ----------

async function main() {
  if (mode === "self-check") return selfCheck();
  if (mode === "lock-holder") return lockHolder(args._[1], Number(args._[2]), args["new-dir"]);
  if (mode === "lock-victim") return lockVictim(args._[1], args["new-dir"]);

  const emit = (obj) => console.log("===BENCH_JSON===\n" + JSON.stringify(obj));

  if (mode === "storage") return emit(await runStorage({ side: args.side, size: args.size, baselineDir: args["baseline-dir"], newDir: args["new-dir"] }));
  if (mode === "e2e") return emit(await runE2E({ side: args.side, size: args.size, scenario: args.scenario, baselineDir: args["baseline-dir"], newDir: args["new-dir"] }));

  // —— all：父进程编排 ——
  const readAt = new Date().toISOString();
  const newDir = resolve(args["new-dir"] ?? repoDir); // 默认当前仓库：集成后无需外部工作树即可运行
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
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n'); // 保留原仓库ESM解释，不额外测语法探测成本
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
      p.once("error", error => res([null, o, error.message]));
      p.on("close", (code) => res([code, o, e]));
    });
    return childResult(code, out, err);
  };

  const report = {
    meta: {
      time: readAt,
      note: "new 侧为 --new-dir 目录读取时刻的磁盘快照；口径：写字节=写语句 SQL 绑定字符串 UTF-8 字节（唯一计量点），SQL 次数=语句执行次数（含读写）",
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
  line("口径：写字节/次 = 写语句 SQL 绑定字符串 UTF-8 字节；SQL/次 = 语句执行次数（含读写）");
  for (const size of sizes) {
    const d = report.meta.sizes[size];
    line(`数据集 ${size}: ${d.sessions} 会话 × ${d.tasks} 任务(result ${d.resultText}字 + runtime ${d.systemPrompt}字)`);
  }
  for (const size of sizes) {
    for (const side of ["old", "new"]) {
      const r = report.storage[`${side}-${size}`];
      if (r.error) { line(`\n========== 存储微基准 ${side} [${size}] 子进程失败 ==========\n${r.error}`); continue; }
      line(`\n========== 存储微基准 ${side === "old" ? "旧 KV 整份保存" : "新按实体写"} [${size}] 单会话载荷 ${kb(r.payloadBytesPerSession)} ==========`);
      line("操作                       p50(ms)  p95(ms)  p99(ms)  写字节/次   写SQL/次  SQL/次(含读)  WAL增长(B)  环路max(ms)");
      for (const p of r.phases) {
        if (p.op.startsWith("导入") || p.op.startsWith("启动读") || p.op.startsWith("存储层")) continue;
        line(`${p.op.padEnd(24)} ${String(p.p50).padStart(8)} ${String(p.p95).padStart(8)} ${String(p.p99).padStart(8)} ${String(p.writeBytesPerOp).padStart(11)} ${String(p.writeSqlPerOp).padStart(9)} ${String(p.sqlPerOp).padStart(12)} ${String(p.walDelta).padStart(11)} ${String(p.loopMaxMs).padStart(10)}`);
      }
      for (const p of r.phases.filter((p) => p.op.startsWith("导入") || p.op.startsWith("启动读") || p.op.startsWith("存储层")))
        line(`${p.op.padEnd(24)} p50=${p.p50}ms (一次性/读取)`);
      line(`库文件 ${kb(r.dbFileBytes)} | WAL ${kb(r.walBytes)} | 进程RSS(退出前采样) ${Math.round(r.rssKB / 1024)}MB`);
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
  for (const [k, v] of Object.entries(report.lock?.results ?? {})) {
    line(`${v.pass ? "PASS" : "FAIL"}  ${k}: holder 实持 ${v.holder?.heldMs ?? "-"}ms | victim ${v.victim?.ok ? `等待 ${v.victim.waitMs}ms 后成功` : `等待 ${v.victim?.waitMs ?? "-"}ms 后失败：${v.victim?.error}`}（exit ${v.victim?.exitCode ?? "-"}）`);
  }
  const failed = judge(report);
  const gatesPassed = report.gates.filter((g) => g.pass).length;
  line(`\n结论：硬门槛 ${gatesPassed}/${report.gates.length} 通过${failed.length ? `；判定失败 ${failed.length} 项：\n  - ${failed.join("\n  - ")}` : "；子进程与锁实验全部成功"}。退出码 ${failed.length ? 1 : 0}`);

  emit(report);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
