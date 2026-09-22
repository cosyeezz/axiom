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
    compactions: [{ id: "cp1", previousEntryId: "e0", preentries: 3 }],
    retries: [{ agentId: "main", id: "retry-1", messageCount: 4, anchorEntryId: "e1", status: "failed", error: "x", history: [{ status: "waiting", attempt: 1 }] }],
    tasks: [
      { id: "task-1", task: "做事", status: "completed", text: "结果", runtime: { model: "m/x" }, resultId: "r-1", notified: true, parentContext: "背景" },
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
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_events").get().n, 0);
    store.deleteSession("missing"); // 不存在安全
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
    const saved = store.getSession("s1");
    assert.deepEqual(saved.compactions, [{ id: "cp1", previousEntryId: "e9" }]);
    assert.deepEqual(saved.retries, [
      { agentId: "main", id: "retry-1", status: "succeeded" },
      { agentId: "task-1", id: "retry-1", status: "waiting" },
    ]);
    assert.throws(() => store.saveEvent("s1", "bogus", { id: "x" }), /未知事件类型/);
    assert.throws(() => store.saveEvent("s1", "summary_trigger", { id: "x" }), /未知事件类型/); // 摘要机制删除后死类型被拒
    assert.throws(() => store.saveEvent("ghost", "compaction", { id: "x" })); // 外键：会话不存在
  }));

test("deleteEvents 按 (agentId,id) 精确删，record 或 {agentId,id} 均可；裸 id 拒绝", () =>
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
  }));

test("saveTask：内容走合并整写，notified 只动独立列不重写 record", () =>
  withStore((store, db) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveTask("s1", { id: "t1", task: "做事", status: "running", runtime: { turns: 2 }, parentContext: "bg" });
    store.saveTask("s1", { id: "t1", status: "completed", text: "结果", resultId: "r1", notified: false });
    assert.deepEqual(store.listTasks("s1").find((task) => task.id === "t1"), {
      id: "t1", task: "做事", status: "completed", runtime: { turns: 2 }, parentContext: "bg",
      text: "结果", resultId: "r1", notified: false,
    });
    assert.throws(() => store.saveTask("s1", { status: "x" }), /缺少 id/);
    // 元数据 patch（仅通知）：record 字节不变（不读不写 runtime/result）。
    const before = db.prepare("SELECT record, notified FROM tasks WHERE session_id = 's1' AND id = 't1'").get();
    store.saveTask("s1", { id: "t1", notified: true });
    const after = db.prepare("SELECT record, notified FROM tasks WHERE session_id = 's1' AND id = 't1'").get();
    assert.equal(after.record, before.record);
    assert.equal(after.notified, 1);
    // 投影由列回填：通知最新值 + 内容字段完好。
    const view = store.listTasks("s1").find((task) => task.id === "t1");
    assert.deepEqual(view, {
      id: "t1", task: "做事", status: "completed", runtime: { turns: 2 }, parentContext: "bg",
      text: "结果", resultId: "r1", notified: true,
    });
    // 旧任务无 notified 键：投影不造键。
    store.saveTask("s1", { id: "t2", task: "旧快照", status: "running" });
    const bare = store.listTasks("s1").find((task) => task.id === "t2");
    assert.equal("notified" in bare, false);
  }));

test("listPendingSessionIds 查 notified 列，含 notified 缺失的旧任务", () =>
  withStore((store) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveTask("s1", { id: "t1", task: "做事", status: "completed", resultId: "r1", notified: false });
    store.saveTask("s1", { id: "t2", task: "旧running快照", status: "running" }); // 无 notified/resultId
    store.saveTask("s1", { id: "t3", task: "已通知", status: "completed", resultId: "r3", notified: true });
    // 待通知：false（t1）与缺失（t2）都算；true（t3）不算。
    assert.deepEqual(store.listPendingSessionIds(), ["s1"]);
    store.saveTask("s1", { id: "t1", notified: true });
    assert.deepEqual(store.listPendingSessionIds(), ["s1"]); // t2 仍待
    store.saveTask("s1", { id: "t2", notified: true });
    assert.deepEqual(store.listPendingSessionIds(), []);
  }));

test("notified 聚合保留历史待通知，纯 patch 不重写正文，确认后跨重开保持", () => withStore((store, db) => {
  store.insertSession({ id: "s1", cwd: "F:/x" });
  store.saveTask("s1", { id: "t1", status: "completed", resultId: "r2", notified: true,
    previousResults: { r1: { id: "t1", resultId: "r1", text: "第一次", notified: false } } });
  assert.deepEqual(store.listPendingSessionIds(), ["s1"]);
  const before = db.prepare("SELECT record FROM tasks WHERE session_id = 's1' AND id = 't1'").get().record;
  store.saveTask("s1", { id: "t1", notified: true });
  assert.deepEqual(store.listPendingSessionIds(), ["s1"]);
  assert.equal(db.prepare("SELECT record FROM tasks WHERE session_id = 's1' AND id = 't1'").get().record, before);
  let reopened = new Database(db.path);
  try { assert.deepEqual(new SessionStore(reopened).listPendingSessionIds(), ["s1"]); }
  finally { reopened.close(); }
  store.saveTask("s1", { id: "t1", notified: true,
    previousResults: { r1: { id: "t1", resultId: "r1", text: "第一次", notified: true } } });
  assert.deepEqual(store.listPendingSessionIds(), []);
  reopened = new Database(db.path);
  try {
    const store2 = new SessionStore(reopened);
    assert.deepEqual(store2.listPendingSessionIds(), []);
    assert.equal(store2.listTasks("s1")[0].previousResults.r1.notified, true);
  } finally { reopened.close(); }
}));

test("change 包多实体全有或全无；嵌套内层回滚不影响外层", () =>
  withStore((store) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveEvent("s1", "retry", { agentId: "main", id: "retry-0", status: "failed" });
    assert.throws(() =>
      store.change(() => {
        store.saveEvent("s1", "retry", { agentId: "main", id: "retry-1", status: "waiting" });
        store.saveTask("s1", { id: "t1", task: "做事", status: "running" });
        throw new Error("炸");
      }), /炸/);
    const saved = store.getSession("s1");
    assert.deepEqual(saved.retries, [{ agentId: "main", id: "retry-0", status: "failed" }]);
    assert.deepEqual(saved.tasks, []);
    store.change(() => {
      store.saveEvent("s1", "retry", { agentId: "main", id: "retry-2", status: "waiting" });
      assert.throws(() =>
        store.change(() => {
          store.saveEvent("s1", "retry", { agentId: "main", id: "retry-3", status: "waiting" });
          throw new Error("内炸");
        }), /内炸/);
      // 内层已回滚，外层可见。
      assert.deepEqual(store.getSession("s1").retries.map((r) => r.id), ["retry-0", "retry-2"]);
    });
    assert.deepEqual(store.getSession("s1").retries.map((r) => r.id), ["retry-0", "retry-2"]);
  }));

test("importLegacySession：三表+标记单事务；重跑与同 id 不覆盖", () =>
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
    db.exec("INSERT INTO tasks (session_id, id, record) VALUES ('s1', 't1', '{bad')");
    assert.throws(
      () => store.listTasks("s1"),
      (error) => {
        assert.match(error.message, /tasks 记录不是合法 JSON/);
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

test("旧数据缺 id：compaction/retry 按原序号稳定 id，同内容两条都保留；读出带 id 供重写幂等", () =>
  withStore((store) => {
    const same = { agentId: "main", status: "waiting" };
    store.insertSession({
      id: "s1",
      cwd: "F:/x",
      retries: [
        { agentId: "main", id: "retry-1", status: "failed" },
        { ...same }, // 无 id → anon-1
      ],
      compactions: [{ previousEntryId: "e0" }],
    });
    const restored = store.getSession("s1");
    assert.deepEqual(restored.compactions.map((r) => r.id), ["anon-0"]);
    assert.deepEqual(restored.retries.map((r) => r.id), ["retry-1", "anon-1"]);
    // 原形其余字段不受影响：record 存原样，id 只是身份回填。
    assert.deepEqual(restored.retries[1], { ...same, id: "anon-1" });
    // 恢复后带稳定 id 重写中断态 → upsert 命中，不 append 重复。
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
    assert.deepEqual(store.getSession("s2").retries.map((r) => r.id), ["retry-1", "anon-1"]);
  }));

// 旧库 DDL（摘要机制删除前）：带死表死列与四类型 CHECK。
const LEGACY_DDL = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    cwd TEXT NOT NULL,
    title TEXT,
    title_manual INTEGER NOT NULL DEFAULT 0,
    title_requested INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    running_since INTEGER,
    session_file TEXT,
    main_turn INTEGER,
    selection TEXT
  );
  CREATE TABLE summaries (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    turn INTEGER,
    text TEXT NOT NULL,
    timestamp INTEGER,
    PRIMARY KEY (session_id, id)
  );
  CREATE TABLE session_events (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('compaction', 'retry', 'summary_trigger', 'progress_delivery')),
    agent_id TEXT NOT NULL,
    key TEXT,
    record TEXT NOT NULL
  );
  CREATE TABLE tasks (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    notified INTEGER,
    memory_turn INTEGER,
    progress TEXT,
    progress_delivered TEXT,
    record TEXT NOT NULL,
    PRIMARY KEY (session_id, id)
  );
`;

test("#normalizeSchema：旧库幂等清理死表死列死事件行，业务数据完整保留，重开不报错", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-migrate-"));
  const path = join(dir, "axiom.db");
  const connections = [];
  try {
    // 手工建旧库：塞含死结构与死事件行的数据。
    const old = new Database(path);
    connections.push(old);
    old.exec(LEGACY_DDL);
    old.exec("INSERT INTO sessions (id, cwd, title, main_turn) VALUES ('s1', 'F:/old', '旧会话', 7)");
    old.exec("INSERT INTO summaries (session_id, id, agent_id, text) VALUES ('s1', 'm1', 'main', '旧摘要')");
    old.exec("INSERT INTO session_events (session_id, type, agent_id, key, record) VALUES ('s1', 'compaction', 'main', 'cp1', '{\"id\":\"cp1\"}')");
    old.exec("INSERT INTO session_events (session_id, type, agent_id, key, record) VALUES ('s1', 'retry', 'main', 'r1', '{\"id\":\"r1\",\"status\":\"failed\"}')");
    old.exec("INSERT INTO session_events (session_id, type, agent_id, key, record) VALUES ('s1', 'summary_trigger', 'main', 'tr1', '{\"id\":\"tr1\"}')");
    old.exec("INSERT INTO session_events (session_id, type, agent_id, key, record) VALUES ('s1', 'progress_delivery', 'main', NULL, '{\"text\":\"p\"}')");
    old.exec("INSERT INTO tasks (session_id, id, notified, memory_turn, progress, progress_delivered, record) VALUES ('s1', 't1', 1, 3, '{\"p\":1}', 'x', '{\"task\":\"做事\"}')");

    // 同一连接打开（建表 IF NOT EXISTS 不动旧结构，归一化就地清理）。
    const store = new SessionStore(old);
    const tables = () => old.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
    const columns = (table) => old.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    assert.equal(tables().includes("summaries"), false, "死表已删");
    assert.equal(columns("sessions").includes("main_turn"), false);
    assert.equal(columns("tasks").includes("memory_turn"), false);
    assert.equal(columns("tasks").includes("progress"), false);
    assert.equal(columns("tasks").includes("progress_delivered"), false);
    const check = old.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'session_events'").get().sql;
    assert.equal(check.includes("summary_trigger"), false, "CHECK 已重建为两类型");
    assert.equal(check.includes("progress_delivery"), false);
    const events = old.prepare("SELECT type, record FROM session_events ORDER BY type").all();
    assert.deepEqual(events.map((row) => row.type), ["compaction", "retry"], "死事件行被清，业务事件保留");
    assert.equal(store.getSession("s1").title, "旧会话", "会话业务数据完整");
    assert.deepEqual(store.getSession("s1").retries, [{ id: "r1", status: "failed" }]);
    assert.deepEqual(store.listTasks("s1"), [{ id: "t1", task: "做事", notified: true }]);
    old.close();

    // 重开一次：全库已干净，归一化空转不报错（幂等）。
    const reopened = new Database(path);
    connections.push(reopened);
    const store2 = new SessionStore(reopened);
    assert.equal(store2.getSession("s1").title, "旧会话");
    reopened.close();
  } finally {
    for (const connection of connections) { try { connection.close(); } catch { /* 已关 */ } }
    await rm(dir, { recursive: true, force: true });
  }
});

test("无 id 事件按内容去重：老库 NULL key 行反复对账不再线性膨胀", () =>
  withStore((store, db) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    const legacy = { agentId: "main", status: "waiting", attempt: 1 };
    // 运行期路径都带 id；真正的触发面是老库里已有的无 id 历史行——create() 的恢复对账
    // 会把 getSession 读出的记录逐条 saveEvent 回写，每打开一次就再追加一份。
    store.saveEvent("s1", "retry", legacy);
    store.saveEvent("s1", "retry", { ...legacy });
    store.saveEvent("s1", "retry", { ...legacy });
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_events WHERE session_id = 's1'").get().n, 1);
    assert.deepEqual(store.getSession("s1").retries, [legacy]);
    // 内容不同仍各自成行（同一轮里的两条不同事件不能被并成一条）。
    store.saveEvent("s1", "retry", { ...legacy, attempt: 2 });
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_events WHERE session_id = 's1'").get().n, 2);
    // 同代理同内容才算同一条：agentId 不同的兄弟不得被误并。
    store.saveEvent("s1", "retry", { ...legacy, agentId: "task-1" });
    assert.equal(db.prepare("SELECT count(*) AS n FROM session_events WHERE session_id = 's1'").get().n, 3);
  }));

test("老库 NULL key 事件行开库补稳定身份：读回带 id，归一化重写走 upsert，撤回删得掉", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-nullkey-"));
  const path = join(dir, "axiom.db");
  const connections = [];
  const rows = (db) => db.prepare("SELECT key, record FROM session_events WHERE session_id = 's1' ORDER BY rowid").all();
  try {
    const first = new Database(path);
    connections.push(first);
    const store = new SessionStore(first);
    store.insertSession({ id: "s1", cwd: "F:/x" });
    // 老版本（key 可空、导入侧还没有 anon-<序号> 兜底）留下的无 id 行：库里没有身份，
    // 读回就没有 id，重写与删除都失去落点。只能在开库时补一次。
    first.exec(
      `INSERT INTO session_events (session_id, type, agent_id, key, record)
       VALUES ('s1', 'retry', 'main', NULL, '{"agentId":"main","status":"failed","messageCount":3}')`,
    );
    first.close();

    const upgraded = new Database(path);
    connections.push(upgraded);
    const store2 = new SessionStore(upgraded);
    assert.equal(rows(upgraded).length, 1, "补身份不得增删行");
    assert.notEqual(rows(upgraded)[0].key, null, "老库无 id 行必须在开库时补上稳定 key");
    const restored = store2.getSession("s1").retries[0];
    assert.ok(restored.id, "读回必须带 id，否则重写和删除都没有身份");

    // 恢复对账先归一化再整段回写（messageCount 落在消息数之外就删掉）：内容变了，
    // 有身份才 upsert 改同一行；没身份只能按内容判重，于是多出一条永远删不掉的幽灵行。
    const normalized = { ...restored };
    delete normalized.messageCount;
    store2.saveEvent("s1", "retry", normalized);
    assert.equal(rows(upgraded).length, 1, "归一化后回写必须改原行，不得追加幽灵行");
    assert.deepEqual(store2.getSession("s1").retries, [normalized]);

    // 撤回删除：无 id 记录会被 deleteEvents 拒绝，确定性失败会连带整笔增量（含会话快照）被丢弃，
    // 结果是界面上没了、库里永远留着。
    store2.deleteEvents("s1", "retry", [normalized]);
    assert.equal(rows(upgraded).length, 0, "撤回必须真的删掉库里的行");
    upgraded.close();

    // 幂等：已有 key 的行重开不得被改写。
    const again = new Database(path);
    connections.push(again);
    new SessionStore(again).saveEvent("s1", "retry", { id: "r1", agentId: "main", status: "waiting" });
    const keyBefore = rows(again)[0].key;
    again.close();
    const last = new Database(path);
    connections.push(last);
    new SessionStore(last);
    assert.equal(rows(last)[0].key, keyBefore, "已有身份的行重开不得被改写");
  } finally {
    for (const connection of connections) { try { connection.close(); } catch { /* 已关 */ } }
    await rm(dir, { recursive: true, force: true });
  }
});

test("待通知任务查询走部分索引，不全表扫描", () =>
  withStore((store, db) => {
    store.insertSession({ id: "s1", cwd: "F:/x" });
    store.saveTask("s1", { id: "t1", task: "做事", status: "completed", resultId: "r1", notified: false });
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT DISTINCT session_id FROM tasks WHERE COALESCE(notified, 0) = 0").all()
      .map((row) => row.detail).join(" ");
    assert.match(plan, /USING (COVERING )?INDEX tasks_pending/, `启动恢复每次都跑这条查询，不该全表扫描：${plan}`);
    assert.deepEqual(store.listPendingSessionIds(), ["s1"]);
  }));

test("新增部分索引的老库升级：重开幂等建立，旧数据仍可读且投影口径不变", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-index-upgrade-"));
  const path = join(dir, "axiom.db");
  const connections = [];
  const indexCount = (db) =>
    db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'tasks_pending'").get().n;
  try {
    // 先用当前实现建库写数据，再 DROP 掉索引 —— 等价于「本次改动之前建的老库」。
    const first = new Database(path);
    connections.push(first);
    const store = new SessionStore(first);
    store.insertSession(fullSaved());
    const before = store.getSession("s1");
    const pendingBefore = store.listPendingSessionIds();
    first.exec("DROP INDEX tasks_pending");
    assert.equal(indexCount(first), 0, "前提：老库没有这条索引");
    first.close();

    // 重开：索引自动补建，旧数据一条不少，投影字节级一致。
    const upgraded = new Database(path);
    connections.push(upgraded);
    const store2 = new SessionStore(upgraded);
    assert.equal(indexCount(upgraded), 1, "老库重开必须补建索引");
    assert.deepEqual(store2.getSession("s1"), before, "旧数据与投影口径不得变化");
    assert.deepEqual(store2.listPendingSessionIds(), pendingBefore);
    assert.deepEqual(store2.listTasks("s1"), before.tasks);
    upgraded.close();

    // 再开一次：CREATE INDEX IF NOT EXISTS 空转，不重复执行也不报错（幂等）。
    const again = new Database(path);
    connections.push(again);
    const store3 = new SessionStore(again);
    assert.equal(indexCount(again), 1);
    assert.deepEqual(store3.getSession("s1"), before);
    again.close();
  } finally {
    for (const connection of connections) { try { connection.close(); } catch { /* 已关 */ } }
    await rm(dir, { recursive: true, force: true });
  }
});
