import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.js";
import { SessionStore } from "../src/session-store.js";

// 每个用例独立临时库，结束关闭连接再清理（Windows 文件句柄）。
async function withStore(work) {
  const dir = await mkdtemp(join(tmpdir(), "axiom-store-"));
  const db = new Database(join(dir, "axiom.db"));
  const store = new SessionStore(db);
  try {
    return await work(store, db);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
}

// 旧 persist 完整形状：恢复所需全部字段。
function fullSaved(overrides = {}) {
  return {
    id: "s1",
    cwd: "F:/demo",
    title: "标题",
    titleManual: true,
    titleRequested: true,
    createdAt: 100,
    updatedAt: 200,
    elapsedMs: 30,
    runningSince: null,
    sessionFile: "F:/demo/.jsonl",
    summaries: [
      { id: "m1", agentId: "main", turn: 1, text: "主摘要", timestamp: 1, messageTimestamp: 2, source: "model", entryId: "e1", toolResults: [{ toolCallId: "t1", toolName: "read", isError: false }] },
      { id: "m2", agentId: "main", turn: 2, text: "主摘要2", timestamp: 3, source: "model" },
      { id: "c1", agentId: "task-1", turn: 1, text: "子进度", timestamp: 4, source: "model" },
    ],
    memoryTurns: { main: 7, "task-1": 3 },
    progressDeliveries: [{ timestamp: 10, text: "<subagent_progress>x</subagent_progress>" }],
    summaryTriggers: [{ id: "tr1", agentId: "main", turn: 2, timestamp: 5, reason: "interval", status: "recorded", summaryId: "m2", messageTimestamp: 6 }],
    compactions: [{ id: "cp1", previousEntryId: "e0", preentries: 3 }],
    retries: [{ agentId: "main", id: "retry-1", messageCount: 4, anchorEntryId: "e1", status: "failed", error: "x", history: [{ status: "waiting", attempt: 1 }] }],
    tasks: [
      { id: "task-1", task: "做事", status: "completed", text: "结果", runtime: { model: "m/x" }, resultId: "r-1", notified: true, parentContext: "背景", progress: { id: "m2", text: "进度" }, progressDelivered: "m2" },
      { id: "task-2", task: "另一件", status: "cancelled", error: "服务已重启，子任务已停止" },
    ],
    selection: { model: "a/b", thinking: "high", capabilities: null, subagentModel: "c/d", subagentThinking: null, queueType: "steer", trustProject: true, useDefaults: false },
    ...overrides,
  };
}

test("insertSession + getSession：旧 saved 完整投影往返，子实体全保留", () =>
  withStore((store) => {
    store.insertSession(fullSaved());
    assert.equal(store.hasSession("s1"), true);
    assert.deepEqual(store.getSession("s1"), fullSaved());
    // 列表仅元数据，不含大对象；rowid 序。
    assert.deepEqual(store.listSessions(), [{
      id: "s1", cwd: "F:/demo", title: "标题", titleManual: true, titleRequested: true,
      createdAt: 100, updatedAt: 200, elapsedMs: 30, runningSince: null, sessionFile: "F:/demo/.jsonl",
    }]);
  }));

test("缺字段不造时间：最小 saved 恢复时缺什么就是什么", () =>
  withStore((store) => {
    store.insertSession({ id: "bare", cwd: "F:/x" });
    const saved = store.getSession("bare");
    assert.deepEqual(saved, {
      id: "bare", cwd: "F:/x", titleManual: false, titleRequested: false,
      summaries: [], memoryTurns: { main: 0 }, progressDeliveries: [], summaryTriggers: [],
      compactions: [], retries: [], tasks: [], elapsedMs: 0, runningSince: null,
    });
    assert.deepEqual(store.listSessions(), [{ id: "bare", cwd: "F:/x", titleManual: false, titleRequested: false, elapsedMs: 0, runningSince: null }]);
  }));

test("updateSession 只更新传入字段；未知字段（含 id）抛错", () =>
  withStore((store) => {
    store.insertSession(fullSaved());
    store.updateSession("s1", { title: "新标题", updatedAt: 999, titleManual: false, runningSince: null });
    const saved = store.getSession("s1");
    assert.equal(saved.title, "新标题");
    assert.equal(saved.updatedAt, 999);
    assert.equal(saved.titleManual, false);
    assert.equal(saved.runningSince, null);
    assert.equal(saved.cwd, "F:/demo"); // 未传字段不动
    assert.equal(saved.selection.model, "a/b"); // selection 未传不读不写
    assert.throws(() => store.updateSession("s1", { summaries: [] }), /未知会话字段 summaries/);
    assert.throws(() => store.updateSession("s1", { id: "s1", title: "x" }), /未知会话字段 id/); // session.id 由调用方剥离
    store.updateSession("s1", {}); // 空 patch 安全 no-op
  }));

test("deleteSession 级联清空子表", () =>
  withStore((store, db) => {
    store.insertSession(fullSaved());
    store.deleteSession("s1");
    assert.equal(store.hasSession("s1"), false);
    assert.deepEqual(store.listSessions(), []);
    assert.deepEqual(store.listTasks("s1"), []);
    assert.deepEqual(store.listSummaries("s1"), []);
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_events").get().n, 0);
    store.deleteSession("missing"); // 不存在安全
  }));

test("saveSummary upsert；无 id 摘要稳定生成 id 且原形保留；listSummaries 过滤与 limit；deleteSummaries", () =>
  withStore((store) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveSummary("s1", { id: "m1", agentId: "main", text: "v1" });
    store.saveSummary("s1", { id: "m1", agentId: "main", text: "v2" });
    store.saveSummary("s1", { id: "m2", agentId: "task-1", text: "子" });
    assert.deepEqual(store.listSummaries("s1"), [
      { id: "m1", agentId: "main", text: "v2" },
      { id: "m2", agentId: "task-1", text: "子" },
    ]);
    assert.deepEqual(store.listSummaries("s1", "main"), [{ id: "m1", agentId: "main", text: "v2" }]);
    assert.deepEqual(store.listSummaries("s1", "main", 5), [{ id: "m1", agentId: "main", text: "v2" }]);
    // 无 id 原形：同一原形重复保存不重复成行；读出回填稳定 id，其余字段原样。
    const anonymous = { agentId: "main", turn: 9, text: "旧无id摘要", timestamp: 42 };
    store.saveSummary("s1", anonymous);
    store.saveSummary("s1", { ...anonymous });
    const list = store.listSummaries("s1", "main");
    assert.equal(list.length, 2);
    assert.match(list[1].id, /^anon-/);
    assert.equal(list[1].text, "旧无id摘要");
    assert.equal(list[1].timestamp, 42);
    store.deleteSummaries("s1", [list[1].id, "m1"]);
    assert.deepEqual(store.listSummaries("s1"), [{ id: "m2", agentId: "task-1", text: "子" }]);
    store.deleteSummaries("s1", []); // 空安全
  }));

test("saveEvent：有 id 按 (agentId,id) upsert，同 id 双代理隔离；无 id 追加；坏类型与 FK 抛错", () =>
  withStore((store) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    // compaction 无 agentId → 默认 main，upsert 不重复。
    store.saveEvent("s1", "compaction", { id: "cp1", previousEntryId: "e0" });
    store.saveEvent("s1", "compaction", { id: "cp1", previousEntryId: "e9" });
    // retry 同 id 双代理：各自成行、各自更新互不影响。
    store.saveEvent("s1", "retry", { agentId: "main", id: "retry-1", status: "waiting", delayMs: 100 });
    store.saveEvent("s1", "retry", { agentId: "task-1", id: "retry-1", status: "waiting" });
    store.saveEvent("s1", "retry", { agentId: "main", id: "retry-1", status: "succeeded" });
    // summary_trigger upsert 更新字段。
    store.saveEvent("s1", "summary_trigger", { id: "tr1", agentId: "main", status: "pending" });
    store.saveEvent("s1", "summary_trigger", { id: "tr1", agentId: "main", status: "recorded", summaryId: "m1" });
    // progress_delivery 无 id：每次追加。
    store.saveEvent("s1", "progress_delivery", { timestamp: 1, text: "a" });
    store.saveEvent("s1", "progress_delivery", { timestamp: 2, text: "b" });
    const saved = store.getSession("s1");
    assert.deepEqual(saved.compactions, [{ id: "cp1", previousEntryId: "e9" }]);
    assert.deepEqual(saved.retries, [
      { agentId: "main", id: "retry-1", status: "succeeded" },
      { agentId: "task-1", id: "retry-1", status: "waiting" },
    ]);
    assert.deepEqual(saved.summaryTriggers, [{ id: "tr1", agentId: "main", status: "recorded", summaryId: "m1" }]);
    assert.deepEqual(saved.progressDeliveries, [{ timestamp: 1, text: "a" }, { timestamp: 2, text: "b" }]);
    assert.throws(() => store.saveEvent("s1", "bogus", { id: "x" }), /未知事件类型/);
    assert.throws(() => store.saveEvent("ghost", "compaction", { id: "x" })); // 外键：会话不存在
  }));

test("deleteEvents 按 (agentId,id) 精确删，record 或 {agentId,id} 均可；裸 id 拒绝；pruneEvents 保留最近 N 条", () =>
  withStore((store) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveEvent("s1", "retry", { agentId: "main", id: "retry-1", status: "waiting" });
    store.saveEvent("s1", "retry", { agentId: "task-1", id: "retry-1", status: "waiting" });
    store.saveEvent("s1", "retry", { agentId: "task-2", id: "retry-9", status: "failed" });
    // record 形式（撤回代码直接把过滤后的 record 传回来）。
    store.deleteEvents("s1", "retry", [{ agentId: "main", id: "retry-1", status: "waiting" }]);
    // {agentId, id} 形式。
    store.deleteEvents("s1", "retry", [{ agentId: "task-2", id: "retry-9" }]);
    assert.deepEqual(store.getSession("s1").retries, [{ agentId: "task-1", id: "retry-1", status: "waiting" }]);
    assert.throws(() => store.deleteEvents("s1", "retry", ["retry-1"]), /拒绝裸 id/); // 字符串拒绝
    assert.throws(() => store.deleteEvents("s1", "retry", [{}]), /拒绝裸 id/);
    // 仅 {id} 等价 main 事件目标（main 事件无 agentId 字段）：删掉最后一条 task-1 后再试不误伤。
    store.deleteEvents("s1", "retry", [{ agentId: "task-1", id: "retry-1" }]);
    store.deleteEvents("s1", "retry", [{ id: "retry-1" }]); // = main 的 retry-1，不存在则 no-op
    assert.deepEqual(store.getSession("s1").retries, []);
    store.deleteEvents("s1", "retry", []); // 空安全
    for (let i = 1; i <= 4; i++) store.saveEvent("s1", "progress_delivery", { timestamp: i, text: `p${i}` });
    store.pruneEvents("s1", "progress_delivery", 2);
    assert.deepEqual(store.getSession("s1").progressDeliveries, [{ timestamp: 3, text: "p3" }, { timestamp: 4, text: "p4" }]);
    store.pruneEvents("s1", "progress_delivery", 10); // 未超限不动
    assert.equal(store.getSession("s1").progressDeliveries.length, 2);
  }));

test("saveTask：内容走合并整写，notified/progressDelivered/progress 只动独立列不重写 record", () =>
  withStore((store, db) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveTask("s1", { id: "t1", task: "做事", status: "running", runtime: { turns: 2 }, parentContext: "bg" });
    store.saveTask("s1", { id: "t1", status: "completed", text: "结果", resultId: "r1", notified: false, progress: { id: "p1", text: "进度" }, progressDelivered: "p1" });
    assert.deepEqual(store.listTasks("s1").find((task) => task.id === "t1"), {
      id: "t1", task: "做事", status: "completed", runtime: { turns: 2 }, parentContext: "bg",
      text: "结果", resultId: "r1", notified: false, progress: { id: "p1", text: "进度" }, progressDelivered: "p1",
    });
    assert.throws(() => store.saveTask("s1", { status: "x" }), /缺少 id/);
    // 元数据 patch（子代理自报 progress + 通知）：record 字节不变（不读不写 runtime/result）。
    const before = db.prepare("SELECT record, progress, notified FROM tasks WHERE session_id = 's1' AND id = 't1'").get();
    store.saveTask("s1", { id: "t1", progress: { id: "p2", text: "进度2" } });
    const after = db.prepare("SELECT record, progress, notified FROM tasks WHERE session_id = 's1' AND id = 't1'").get();
    assert.equal(after.record, before.record);
    assert.equal(JSON.parse(after.progress).text, "进度2");
    assert.equal(after.notified, 0);
    store.saveTask("s1", { id: "t1", notified: true, progressDelivered: "p2" });
    // 投影由列回填：progress/通知最新值 + 内容字段完好。
    const view = store.listTasks("s1").find((task) => task.id === "t1");
    assert.deepEqual(view, {
      id: "t1", task: "做事", status: "completed", runtime: { turns: 2 }, parentContext: "bg",
      text: "结果", resultId: "r1", notified: true, progress: { id: "p2", text: "进度2" }, progressDelivered: "p2",
    });
    // 旧任务无 notified/progress 键：投影不造键。
    store.saveTask("s1", { id: "t2", task: "旧快照", status: "running" });
    const bare = store.listTasks("s1").find((task) => task.id === "t2");
    assert.equal("notified" in bare, false);
    assert.equal("progress" in bare, false);
    assert.equal("progressDelivered" in bare, false);
  }));

test("setTurn 双落点；listPendingSessionIds 查列，含 notified 缺失的旧任务", () =>
  withStore((store) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveTask("s1", { id: "t1", task: "做事", status: "completed", resultId: "r1", notified: false });
    store.saveTask("s1", { id: "t2", task: "旧running快照", status: "running" }); // 无 notified/resultId
    store.saveTask("s1", { id: "t3", task: "已通知", status: "completed", resultId: "r3", notified: true });
    store.setTurn("s1", "main", 7);
    store.setTurn("s1", "t1", 3);
    const saved = store.getSession("s1");
    assert.deepEqual(saved.memoryTurns, { main: 7, t1: 3 }); // t2/t3 无轮次不造键
    store.setTurn("s1", "t1", 5); // 轮次前进即覆盖
    assert.equal(store.getSession("s1").memoryTurns.t1, 5);
    // 待通知：false（t1）与缺失（t2）都算；true（t3）不算。
    assert.deepEqual(store.listPendingSessionIds(), ["s1"]);
    store.saveTask("s1", { id: "t1", notified: true });
    assert.deepEqual(store.listPendingSessionIds(), ["s1"]); // t2 仍待
    store.saveTask("s1", { id: "t2", notified: true });
    assert.deepEqual(store.listPendingSessionIds(), []);
  }));

test("change 包多实体全有或全无；嵌套内层回滚不影响外层", () =>
  withStore((store) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveSummary("s1", { id: "m0", agentId: "main", text: "旧" });
    assert.throws(() =>
      store.change(() => {
        store.saveSummary("s1", { id: "m1", agentId: "main", text: "新" });
        store.saveEvent("s1", "progress_delivery", { timestamp: 1, text: "p" });
        store.setTurn("s1", "main", 3);
        throw new Error("炸");
      }), /炸/);
    const saved = store.getSession("s1");
    assert.deepEqual(store.listSummaries("s1"), [{ id: "m0", agentId: "main", text: "旧" }]);
    assert.deepEqual(saved.progressDeliveries, []);
    assert.equal(saved.memoryTurns.main, 0);
    store.change(() => {
      store.saveSummary("s1", { id: "m2", agentId: "main", text: "外层" });
      assert.throws(() =>
        store.change(() => {
          store.saveSummary("s1", { id: "m3", agentId: "main", text: "内层" });
          throw new Error("内炸");
        }), /内炸/);
      // 内层已回滚，外层可见。
      assert.deepEqual(store.listSummaries("s1").map((record) => record.id), ["m0", "m2"]);
    });
    assert.deepEqual(store.listSummaries("s1").map((record) => record.id), ["m0", "m2"]);
  }));

test("importLegacySession：四表+标记单事务；重跑与同 id 不覆盖", () =>
  withStore((store, db) => {
    const saved = fullSaved();
    assert.equal(store.importLegacySession(saved, "sessions/F:/old/s1.json"), true);
    assert.deepEqual(store.getSession("s1"), fullSaved());
    assert.equal(db.prepare("SELECT value FROM store WHERE namespace='migrated' AND key='sessions/F:/old/s1.json'").get().value, "true");
    // 重跑：已标记直接跳过，不碰新表。
    assert.equal(store.importLegacySession({ ...saved, title: "改" }, "sessions/F:/old/s1.json"), false);
    assert.equal(store.getSession("s1").title, "标题");
    // 未标记但新表已有同 id：以新表为准，仅补标记。
    assert.equal(store.importLegacySession({ ...saved, title: "旧值" }, "sessions/F:/old/again.json"), false);
    assert.equal(store.getSession("s1").title, "标题");
    assert.equal(db.prepare("SELECT count(*) AS n FROM store WHERE namespace='migrated' AND key='sessions/F:/old/again.json'").get().n, 1);
    // 校验失败不写标记，可修复重试。
    assert.throws(() => store.importLegacySession({ cwd: "F:/x" }, "sessions/bad.json"), /缺少会话 id/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM store WHERE namespace='migrated' AND key='sessions/bad.json'").get().n, 0);
  }));

test("migrateLegacy：store 旧 JSON 逐行迁移，坏行告警保留源不阻断，重跑幂等不覆盖新表", () =>
  withStore((store, db) => {
    db.set("sessions", "s1", fullSaved()); // 真实数据里 store 键与会话 id 一致
    db.set("sessions", "bad", '{"id": "b1", "cwd":');
    db.set("sessions", "fresh", { id: "fresh", cwd: "F:/new", title: "新表新建" });
    store.insertSession({ id: "fresh", cwd: "F:/new", title: "新表新建" });
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);
    let migrated;
    try {
      migrated = store.migrateLegacy();
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(migrated, 1); // 只有 s1 实际迁入
    assert.equal(store.hasSession("s1"), true);
    assert.deepEqual(store.getSession("s1"), fullSaved());
    assert.match(warnings.join("\n"), /bad/); // 坏行告警（含键位）
    assert.equal(db.get("sessions", "bad").startsWith('{"id"'), true); // 坏行源保留（原文未动）
    assert.equal(db.get("migrated", "session-store/bad"), undefined); // 坏行无标记，修复后可重试
    // fresh：新表已有同 id → 不覆盖仅标记。
    assert.equal(store.getSession("fresh").title, "新表新建");
    // 重跑：0 迁入，且新表改动不被旧源覆盖。
    store.updateSession("s1", { title: "运行中改名" });
    assert.equal(store.migrateLegacy(), 0);
    assert.equal(store.getSession("s1").title, "运行中改名");
  }));

test("坏 JSON 错误只报键位不泄露内容；Database.list 坏行隔离不吞 SQL 错误", () =>
  withStore((store, db) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    db.exec("UPDATE sessions SET selection = '{oops-secret' WHERE id = 's1'");
    assert.throws(
      () => store.getSession("s1"),
      (error) => {
        assert.match(error.message, /sessions 记录不是合法 JSON/);
        assert.match(error.message, /会话 s1/);
        assert.match(error.message, /selection/);
        assert.doesNotMatch(error.message, /oops-secret/);
        return true;
      },
    );
    db.exec("INSERT INTO session_events (session_id, type, agent_id, key, record) VALUES ('s1', 'retry', 'main', 'r1', '[broken-secret')");
    assert.throws(
      () => store.getSession("s1"),
      (error) => {
        assert.match(error.message, /session_events/);
        assert.match(error.message, /retry/);
        assert.doesNotMatch(error.message, /broken-secret/);
        return true;
      },
    );
    db.exec("INSERT INTO tasks (session_id, id, record, progress) VALUES ('s1', 't1', '{}', '{bad')");
    assert.throws(
      () => store.listTasks("s1"),
      (error) => {
        assert.match(error.message, /progress/);
        assert.doesNotMatch(error.message, /\{bad/);
        return true;
      },
    );
    // Database.list：好行照常、坏行告警跳过且不泄露内容。
    db.set("ns", "ok", { v: 1 });
    db.exec("INSERT INTO store (namespace, key, value) VALUES ('ns', 'broken', '{leak')");
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (message) => warnings.push(message);
    let listed;
    try {
      listed = db.list("ns");
    } finally {
      console.warn = originalWarn;
    }
    assert.deepEqual(listed, [{ key: "ok", value: { v: 1 } }]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /ns.*broken/);
    assert.doesNotMatch(warnings[0], /leak/);
    // Database.get：坏 JSON 抛脱敏错误（不带原文与解析器消息）。
    assert.throws(
      () => db.get("ns", "broken"),
      (error) => {
        assert.match(error.message, /命名空间 ns 键 broken/);
        assert.match(error.message, /不是合法 JSON/);
        assert.doesNotMatch(error.message, /leak/);
        assert.doesNotMatch(error.message, /JSON at position|Unexpected token/);
        return true;
      },
    );
  }));

test("importLegacySession 首次真正导入前自动 VACUUM INTO 一致性备份；重跑不覆盖；跳过路径不备份", () =>
  withStore((store, db, dir) => {
    const backupPath = `${db.path}.pre-store-migration.db`;
    const saved = fullSaved();
    assert.equal(store.importLegacySession(saved, "sessions/old1.json"), true);
    assert.equal(existsSync(backupPath), true); // 首次导入前已备份
    // 快照可打开且是导入前状态：不含迁移标记，也无已导会话。
    const snapshot = new Database(backupPath);
    const snapStore = new SessionStore(snapshot);
    try {
      assert.equal(snapStore.hasSession("s1"), false);
      assert.equal(snapshot.get("migrated", "sessions/old1.json"), undefined);
    } finally {
      snapshot.close();
    }
    // 第二条导入：备份已存在不覆盖，仍是首次快照（不含第二次导入的数据）。
    assert.equal(store.importLegacySession({ id: "s2", cwd: "F:/y" }, "sessions/old2.json"), true);
    const snapshot2 = new Database(backupPath);
    try {
      assert.equal(snapshot2.get("migrated", "sessions/old2.json"), undefined);
    } finally {
      snapshot2.close();
    }
  }));

test("迁移跳过路径（重跑已标记 / 新表已有同 id）不产生备份", () =>
  withStore((store, db) => {
    const saved = { id: "j1", cwd: "F:/x" };
    store.insertSession({ id: "j1", cwd: "F:/new" }); // 新表已有同 id
    assert.equal(store.importLegacySession(saved, "sessions/dup.json"), false);
    assert.equal(store.importLegacySession({ id: "j2", cwd: "F:/x" }, "sessions/dup2.json"), true); // 这条会备份
    const backupPath = `${db.path}.pre-store-migration.db`;
    assert.equal(existsSync(backupPath), true);
    // 已标记重跑：不触碰备份（无新导入也无新快照）。
    assert.equal(store.importLegacySession(saved, "sessions/dup.json"), false);
    store.deleteSession("j2"); // 删掉已导会话后重跑 marker：已标记直接 false，不重导入也不备份
    assert.equal(store.importLegacySession({ id: "j2", cwd: "F:/x" }, "sessions/dup2.json"), false);
  }));

test("备份失败残片不算成功；解除错误后重新备份，再导入并标记", () =>
  withStore((store, db) => {
    const exec = db.exec.bind(db);
    const target = `${db.path}.pre-store-migration.db`;
    let attempts = 0;
    db.exec = sql => {
      if (sql.startsWith("VACUUM INTO")) {
        attempts++;
        const temporary = sql.slice("VACUUM INTO '".length, -1).replaceAll("''", "'");
        writeFileSync(temporary, "partial-backup");
        throw new Error("injected backup failure");
      }
      exec(sql);
    };
    assert.throws(() => store.importLegacySession({ id: "s1", cwd: "test" }, "old/s1"), /backup failure/);
    assert.equal(existsSync(target), false);
    assert.equal(store.hasSession("s1"), false);
    assert.equal(db.get("migrated", "old/s1"), undefined);
    assert.equal(readdirSync(join(db.path, "..")).some(name => name.endsWith(".tmp")), false);
    db.exec = sql => { if (sql.startsWith("VACUUM INTO")) attempts++; exec(sql); };
    assert.equal(store.importLegacySession({ id: "s1", cwd: "test" }, "old/s1"), true);
    assert.equal(attempts, 2);
    assert.equal(existsSync(target), true);
  }));

test("重复迁移在SQL层跳过已标记旧JSON，不读取或解析大历史", () =>
  withStore((store, db) => {
    db.set("sessions", "s1", { id: "s1", cwd: "test" });
    assert.equal(store.migrateLegacy(), 1);
    const get = db.get.bind(db);
    db.get = (namespace, key) => {
      assert.notEqual(namespace, "sessions", "已迁移源不应再读取");
      return get(namespace, key);
    };
    assert.equal(store.migrateLegacy(), 0);
    assert.equal(store.getSession("s1").cwd, "test");
  }));

test("旧数据缺 id：summary/trigger/compaction/retry 按原序号稳定 id，同内容两条都保留；读出带 id 供重写幂等", () =>
  withStore((store) => {
    const same = { agentId: "main", text: "同内容", timestamp: 1 };
    store.insertSession({
      id: "s1",
      cwd: "F:/x",
      summaries: [
        { ...same }, // 无 id，index 0
        { ...same }, // 与上一条完全相同：不得被内容哈希去重
        { id: "m3", agentId: "main", text: "带id" }, // 有 id，占用 index 2
        { agentId: "task-1", text: "子" }, // 无 id，index 3 → anon-3
      ],
      summaryTriggers: [
        { agentId: "main", turn: 1, reason: "interval" },
        { agentId: "main", turn: 2, reason: "interval" },
      ],
      retries: [
        { agentId: "main", id: "retry-1", status: "failed" },
        { agentId: "main", status: "waiting" }, // 无 id → anon-1
      ],
      compactions: [{ previousEntryId: "e0" }],
    });
    const restored = store.getSession("s1");
    assert.deepEqual(
      restored.summaries.map((r) => [r.id, r.text]),
      [["anon-0", "同内容"], ["anon-1", "同内容"], ["m3", "带id"], ["anon-3", "子"]],
    );
    assert.deepEqual(restored.summaryTriggers.map((r) => r.id), ["anon-0", "anon-1"]);
    assert.deepEqual(restored.compactions.map((r) => r.id), ["anon-0"]);
    assert.deepEqual(restored.retries.map((r) => r.id), ["retry-1", "anon-1"]);
    // 原形其余字段不受影响：record 存原样，id 只是身份回填。
    assert.deepEqual(restored.summaries[1], { ...same, id: "anon-1" });
    // E 场景：恢复后带稳定 id 重写中断态 → upsert 命中，不 append 重复。
    store.saveEvent("s1", "retry", { ...restored.retries[1], status: "succeeded" });
    assert.deepEqual(
      store.getSession("s1").retries,
      [
        { agentId: "main", id: "retry-1", status: "failed" },
        { agentId: "main", id: "anon-1", status: "succeeded" },
      ],
    );
    // 重导入同一 saved（新会话 id）：数组序相同 → 生成的序号 id 相同（稳定，非随机）。
    store.importLegacySession({ ...restored, id: "s2" }, "sessions/from-s2.json");
    assert.deepEqual(store.getSession("s2").summaries.map((r) => r.id), ["anon-0", "anon-1", "m3", "anon-3"]);
    // progress_delivery 天然无 id：读出仍不带 id。
    store.saveEvent("s1", "progress_delivery", { timestamp: 5, text: "p" });
    assert.deepEqual(store.getSession("s1").progressDeliveries, [{ timestamp: 5, text: "p" }]);
  }));
