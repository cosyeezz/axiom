import { randomUUID } from "node:crypto";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";

// 会话实体存储：sessions / session_events / tasks 三表替代「单会话整 JSON」。
// 读写同步、prepared 语句复用、多语句操作走 SAVEPOINT（事务外等价 BEGIN/COMMIT，事务内自动
// 嵌套，同名保存点释放最近一层）；单实体方法都是单条语句，可被外层 change() 原子包裹。
// 子表外键 ON DELETE CASCADE，删会话即级联；父行只用普通 INSERT（绝不 REPLACE，避免级联误删）。
// record 列一律存调用方原形 JSON（camelCase 原字段），本层不改写字段、不造时间：旧记录缺的
// 字段恢复时就缺着，列里存 NULL。无 id 的旧事件按原序号补稳定 id，原形仍原样
// 保存，读出时回填生成 id 供撤回引用。
// tasks 的 notified 是独立列：通知高频更新只动列，绝不读回重写含 runtime/result 的大 record
//（record 存任务内容，投影时回填）。
const EVENT_TYPES = new Set(["compaction", "retry"]);

// updateSession 只接受这些标量/selection 字段；事件、任务各走专用 API，防整对象回写。
const SESSION_FIELDS = {
  cwd: "cwd",
  title: "title",
  titleManual: "title_manual",
  titleRequested: "title_requested",
  createdAt: "created_at",
  updatedAt: "updated_at",
  elapsedMs: "elapsed_ms",
  runningSince: "running_since",
  sessionFile: "session_file",
  selection: "selection",
};

// 建表与建索引分开：已有库要先归一化（删死列、重建带旧 CHECK 的表）再建索引，
// 因为重建会连带丢掉表上的索引。
const TABLES = {
  sessions: `CREATE TABLE IF NOT EXISTS sessions (
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
    selection TEXT
  )`,
  session_events: `CREATE TABLE IF NOT EXISTS session_events (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('compaction', 'retry')),
    agent_id TEXT NOT NULL,
    key TEXT,
    record TEXT NOT NULL
  )`,
  tasks: `CREATE TABLE IF NOT EXISTS tasks (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    notified INTEGER,
    record TEXT NOT NULL,
    PRIMARY KEY (session_id, id)
  )`,
};

// 事件身份 = (会话, 类型, 代理, 记录 id)：retry 在 main 与子代理可能同 id，缺 agent_id 会误并。
// 无 id 的事件不进部分唯一索引，天然只追加。
const INDEXES = `
  CREATE UNIQUE INDEX IF NOT EXISTS session_events_identity
    ON session_events(session_id, type, agent_id, key) WHERE key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS session_events_scan ON session_events(session_id, type);
`;

// 摘要与子代理进度机制删除后的历史残留（旧库才有）：summaries 表、sessions.main_turn、
// tasks 的 memory_turn/progress/progress_delivered、session_events 里 summary_trigger 与
// progress_delivery 两类行及旧 CHECK 约束。
const DEAD_TABLES = ["summaries"];
const DEAD_COLUMNS = { sessions: ["main_turn"], tasks: ["memory_turn", "progress", "progress_delivered"] };
const DEAD_EVENT_TYPES = ["summary_trigger", "progress_delivery"];

export class SessionStore {
  #database;
  #statements = new Map();

  constructor(database) {
    this.#database = database;
    database.exec(Object.values(TABLES).join(";\n"));
    this.#normalizeSchema();
    database.exec(INDEXES);
  }

  // 旧库归一化（幂等，按实际库结构自检，不需要迁移标记）：删死表死列、清死事件行、
  // 重建仍带旧 CHECK 的 session_events。新库全部条件都不成立，一条 DDL 都不执行。
  #normalizeSchema() {
    const columns = (table) => this.#database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    const schemaOf = (name) =>
      this.#database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)?.sql ?? "";
    const dropColumns = Object.entries(DEAD_COLUMNS)
      .flatMap(([table, dead]) => {
        const present = new Set(columns(table));
        return dead.filter((column) => present.has(column)).map((column) => `ALTER TABLE ${table} DROP COLUMN ${column}`);
      });
    const staleEvents = DEAD_EVENT_TYPES.some((type) => schemaOf("session_events").includes(type));
    if (!dropColumns.length && !staleEvents && !DEAD_TABLES.some((table) => schemaOf(table))) return;
    this.#change(() => {
      for (const statement of dropColumns) this.#database.exec(statement);
      for (const table of DEAD_TABLES) this.#database.exec(`DROP TABLE IF EXISTS ${table}`);
      if (!staleEvents) return;
      // CHECK 约束改不了，只能建新表搬行：先清死类型行（新 CHECK 会拒绝），再换表。
      const placeholders = DEAD_EVENT_TYPES.map(() => "?").join(", ");
      this.#database.prepare(`DELETE FROM session_events WHERE type IN (${placeholders})`).run(...DEAD_EVENT_TYPES);
      this.#database.exec(TABLES.session_events.replace("IF NOT EXISTS session_events", "session_events_new"));
      this.#database.exec("INSERT INTO session_events_new SELECT session_id, type, agent_id, key, record FROM session_events");
      this.#database.exec("DROP TABLE session_events");
      this.#database.exec("ALTER TABLE session_events_new RENAME TO session_events");
    });
  }

  // —— 基础设施：prepared 复用、SAVEPOINT 嵌套事务、坏 JSON 只报键位 ——

  #sql(text) {
    let statement = this.#statements.get(text);
    if (!statement) this.#statements.set(text, (statement = this.#database.prepare(text)));
    return statement;
  }

  // 多语句操作的原子边界：事务外 SAVEPOINT 自动开事务、RELEASE 提交；事务内自动嵌套，
  // 同名保存点释放最近一层——可被嵌套调用（外层 change 包多实体，内层专用 API 各自包裹）。
  // 同步无 await；失败 ROLLBACK TO 后重抛，由调用方决定重试。
  #change(work) {
    this.#database.exec("SAVEPOINT session_change");
    try {
      const result = work();
      this.#database.exec("RELEASE session_change");
      return result;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK TO session_change");
        this.#database.exec("RELEASE session_change");
      } catch {}
      throw error;
    }
  }

  // 供调用方把一次多实体写入包成全有或全无；失败增量由调用方按序重放。
  change(work) {
    return this.#change(work);
  }

  // 解析失败抛含表名/会话/键位的错误；不携带内容片段或解析器消息，避免原文泄露。
  #parse(table, sessionId, label, text) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`session-store：${table} 记录不是合法 JSON，读取中止（会话 ${sessionId}${label ? `，${label}` : ""}）`);
    }
  }

  // 原形缺 id 键且给定的 id 非空时，读出补上身份（库里仍存原形，不改写）。
  #withId(parsed, id) {
    return id != null && parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.id == null
      ? { ...parsed, id }
      : parsed;
  }

  // —— 会话元数据与存在判断 ——

  hasSession(id) {
    return this.#sql("SELECT 1 FROM sessions WHERE id = ?").get(id) !== undefined;
  }

  // 仅元数据（不含事件/任务/selection JSON 解析），rowid 序 ≈ 创建序。
  listSessions() {
    return this.#sql(
      "SELECT id, cwd, title, title_manual, title_requested, created_at, updated_at, elapsed_ms, running_since, session_file FROM sessions ORDER BY rowid",
    )
      .all()
      .map((row) => ({
        id: row.id,
        cwd: row.cwd,
        ...(row.title != null ? { title: row.title } : {}),
        titleManual: !!row.title_manual,
        titleRequested: !!row.title_requested,
        ...(row.created_at != null ? { createdAt: row.created_at } : {}),
        ...(row.updated_at != null ? { updatedAt: row.updated_at } : {}),
        elapsedMs: row.elapsed_ms,
        runningSince: row.running_since,
        ...(row.session_file != null ? { sessionFile: row.session_file } : {}),
      }));
  }

  // 启动补发子任务通知的会话清单：notified 为 false 或缺失（旧 running/starting 快照常无此键
  // 也无 resultId）都算待通知；恢复归一化由调用方处理。查独立列，不碰 record JSON。
  listPendingSessionIds() {
    return this.#sql("SELECT DISTINCT session_id FROM tasks WHERE COALESCE(notified, 0) = 0")
      .all()
      .map((row) => row.session_id);
  }

  // —— 读：旧 saved 完整投影（恢复/对账口径） ——

  getSession(id) {
    const row = this.#sql(
      "SELECT id, cwd, title, title_manual, title_requested, created_at, updated_at, elapsed_ms, running_since, session_file, selection FROM sessions WHERE id = ?",
    ).get(id);
    if (!row) return undefined;
    const sessionId = row.id;
    const tasks = this.#sql("SELECT id, notified, record FROM tasks WHERE session_id = ? ORDER BY rowid")
      .all(sessionId)
      .map(({ id: taskId, notified, record }) => this.#taskRecord(sessionId, taskId, notified, record));
    const events = (type) =>
      this.#sql("SELECT key, record FROM session_events WHERE session_id = ? AND type = ? ORDER BY rowid")
        .all(sessionId, type)
        // key 列即事件身份：无 id 旧数据导入时已按原序号生成稳定 id，读出回填，
        // 恢复后带 id 重写走 upsert 不重复。
        .map(({ key, record }) => this.#withId(this.#parse("session_events", sessionId, type, record), key));
    return {
      id: sessionId,
      cwd: row.cwd,
      ...(row.title != null ? { title: row.title } : {}),
      titleManual: !!row.title_manual,
      titleRequested: !!row.title_requested,
      compactions: events("compaction"),
      retries: events("retry"),
      tasks,
      ...(row.created_at != null ? { createdAt: row.created_at } : {}),
      ...(row.updated_at != null ? { updatedAt: row.updated_at } : {}),
      elapsedMs: row.elapsed_ms,
      runningSince: row.running_since,
      ...(row.session_file != null ? { sessionFile: row.session_file } : {}),
      ...(row.selection != null ? { selection: this.#parse("sessions", sessionId, "selection", row.selection) } : {}),
    };
  }

  // record（任务内容）+ 元数据列回填：notified 列是通知的权威（patch 只动列，record 不重写）。
  // 列为 NULL 表示原数据无此键，投影保持无键（缺字段保留，不造值）。
  #taskRecord(sessionId, id, notified, record) {
    // id 以行主键为准回填（record 只存任务内容，不含身份键）。
    const saved = { ...this.#parse("tasks", sessionId, id, record), id };
    if (notified != null) saved.notified = !!notified;
    return saved;
  }

  // —— 写：会话行 ——

  #validateSaved(saved) {
    if (typeof saved?.id !== "string" || !saved.id) throw new Error("缺少会话 id");
    if (typeof saved.cwd !== "string" || !saved.cwd) throw new Error(`会话 ${saved.id} 缺少工作空间 cwd`);
    if (saved.selection != null && (typeof saved.selection !== "object" || Array.isArray(saved.selection)))
      throw new Error(`会话 ${saved.id} 的 selection 必须是对象`);
  }

  // fallbackId：导入路径给原序号稳定 id；缺省（运行期无 id 事件）追加 key NULL。
  #insertEventRow(sessionId, type, record, fallbackId) {
    this.#sql("INSERT INTO session_events (session_id, type, agent_id, key, record) VALUES (?, ?, ?, ?, ?)").run(
      sessionId,
      type,
      record?.agentId ?? "main",
      record?.id != null ? String(record.id) : (fallbackId ?? null),
      JSON.stringify(record ?? null),
    );
  }

  #insertTaskRow(sessionId, task) {
    const { id, notified, ...record } = task;
    if (typeof id !== "string" || !id) throw new Error(`会话 ${sessionId} 存在缺少 id 的任务`);
    this.#sql("INSERT INTO tasks (session_id, id, notified, record) VALUES (?, ?, ?, ?)").run(
      sessionId,
      id,
      notified == null ? null : notified ? 1 : 0,
      JSON.stringify(record),
    );
  }

  // 新建/迁移共用：saved 一次携带全部子实体（compactions、retries、tasks），父行 + 子行
  // 同一保存点，崩溃只会全有或全无。
  #insertAll(saved) {
    this.#sql(
      "INSERT INTO sessions (id, cwd, title, title_manual, title_requested, created_at, updated_at, elapsed_ms, running_since, session_file, selection) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      saved.id,
      saved.cwd,
      saved.title ?? null,
      saved.titleManual ? 1 : 0,
      saved.titleRequested ? 1 : 0,
      saved.createdAt ?? null,
      saved.updatedAt ?? null,
      saved.elapsedMs ?? 0,
      saved.runningSince ?? null,
      saved.sessionFile ?? null,
      saved.selection != null ? JSON.stringify(saved.selection) : null,
    );
    // 缺 id 的子实体按数组原序号生成稳定 id（anon-<序号>）：同内容两条各自成行不丢，
    // 重导入（同数组序）得到同一 id；带 id 的用原 id，序号跳号无妨。
    (saved.compactions ?? []).forEach((record, index) => this.#insertEventRow(saved.id, "compaction", record, `anon-${index}`));
    (saved.retries ?? []).forEach((record, index) => this.#insertEventRow(saved.id, "retry", record, `anon-${index}`));
    for (const task of saved.tasks ?? []) this.#insertTaskRow(saved.id, task);
  }

  // 仅新建用：同 id 已存在会直接抛约束错误（新建不该撞已有 id，撞了就该暴露）。
  insertSession(saved) {
    this.#validateSaved(saved);
    this.#change(() => this.#insertAll(saved));
  }

  // 首次真正导入前的库级一致性快照：VACUUM INTO 到 <主库>.pre-store-migration.db。
  // 快照已存在则跳过（保留首次快照，重跑不覆盖）；备份失败（磁盘/权限）直接抛错中止迁移，
  // 绝不无备份迁移。由实际迁移入口 importLegacySession 在每次真正导入前调用。
  #ensureMigrationBackup() {
    const target = `${this.#database.path}.pre-store-migration.db`;
    if (existsSync(target)) return;
    const temporary = `${target}.${randomUUID()}.tmp`;
    // 先限制临时文件权限；只有 VACUUM 完整成功才发布备份，失败残片不能成为下次的成功标志。
    writeFileSync(temporary, "", { flag: "wx", mode: 0o600 });
    try {
      this.#database.exec(`VACUUM INTO '${temporary.replaceAll("'", "''")}'`);
      renameSync(temporary, target);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  // 迁移专用（同步单保存点）：四表导入 + 写精确标记，全有或全无。
  // 首次真正导入前自动 VACUUM INTO 生成磁盘一致性备份（见 #ensureMigrationBackup）；
  // 迁移源（store 旧行 / 旧 JSON 文件）另由调用方保留。
  // 返回 true=本次导入；false=跳过（已有标记，或新表已有同 id 记录——以新表为准不覆盖，仅补标记防重扫）。
  importLegacySession(saved, marker) {
    if (typeof marker !== "string" || !marker) throw new Error("importLegacySession：缺少迁移标记 marker");
    if (this.#database.get("migrated", marker)) return false;
    this.#validateSaved(saved);
    if (this.hasSession(saved.id)) {
      this.#database.set("migrated", marker, true);
      return false;
    }
    this.#ensureMigrationBackup();
    this.#change(() => {
      this.#insertAll(saved);
      this.#database.set("migrated", marker, true);
    });
    return true;
  }

  // store.sessions 旧整 JSON 逐行迁移：坏行告警保留源不阻断好行；成功标记精确到会话，重跑不覆盖新表。
  migrateLegacy() {
    let migrated = 0;
    // 先取待迁移键（不持有读取游标跨 VACUUM/事务），每次只解析一条；重启不再读已迁移大 JSON。
    const keys = this.#database.prepare(`SELECT source.key FROM store AS source
      WHERE source.namespace = 'sessions' AND NOT EXISTS (
        SELECT 1 FROM store AS marker WHERE marker.namespace = 'migrated'
        AND marker.key = 'session-store/' || source.key AND marker.value = 'true'
      )`).all();
    for (const { key: id } of keys) {
      try {
        const saved = this.#database.get("sessions", id);
        if (this.importLegacySession(saved, `session-store/${id}`)) migrated++;
      } catch {
        console.warn(`旧会话迁移失败，保留源数据：${id}（请检查记录格式、备份目录及数据库读写权限）`);
      }
    }
    return migrated;
  }

  // 只更新传入字段：直接拼 UPDATE，不读回旧行（元数据高频更新不碰大 JSON）。
  // 未知字段（含 id，由调用方剥离 session.id）一律抛错——事件/任务必须走专用 API，
  // 防止整对象回写复活。
  updateSession(id, patch) {
    const assignments = [];
    const values = [];
    for (const [key, value] of Object.entries(patch ?? {})) {
      const column = SESSION_FIELDS[key];
      if (!column) throw new Error(`updateSession：未知会话字段 ${key}（事件/任务请走专用 API）`);
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      values.push(
        column === "selection"
          ? value == null
            ? null
            : JSON.stringify(value)
          : typeof value === "boolean"
            ? value
              ? 1
              : 0
            : value,
      );
    }
    if (!assignments.length) return;
    this.#sql(`UPDATE sessions SET ${assignments.join(", ")} WHERE id = ?`).run(...values, id);
  }

  deleteSession(id) {
    this.#sql("DELETE FROM sessions WHERE id = ?").run(id); // 子表外键级联
  }

  // —— 写：事件（按 (agentId, id) upsert；无 id 追加） ——

  saveEvent(sessionId, type, record) {
    if (!EVENT_TYPES.has(type)) throw new Error(`未知事件类型：${type}（允许：${[...EVENT_TYPES].join("、")}）`);
    if (record?.id == null) {
      // 无 id：纯追加，身份由 rowid 决定。
      this.#sql("INSERT INTO session_events (session_id, type, agent_id, key, record) VALUES (?, ?, ?, NULL, ?)").run(
        sessionId,
        type,
        record?.agentId ?? "main",
        JSON.stringify(record ?? null),
      );
      return;
    }
    this.#sql(
      "INSERT INTO session_events (session_id, type, agent_id, key, record) VALUES (?, ?, ?, ?, ?) ON CONFLICT(session_id, type, agent_id, key) WHERE key IS NOT NULL DO UPDATE SET record = excluded.record",
    ).run(sessionId, type, record.agentId ?? "main", String(record.id), JSON.stringify(record));
  }

  // 撤回删除：targets 每项是 {agentId, id} 或直接传事件 record（取其 agentId/id 字段）。
  // 身份含 agentId：main 与子代理同 id 的 retry 兄弟不会被误删。传裸字符串一律抛错。
  deleteEvents(sessionId, type, targets) {
    const list = (targets ?? []).map((target) => {
      if (!target || typeof target !== "object" || target.id == null)
        throw new Error("deleteEvents：目标必须是 {agentId, id} 或含 id 的事件 record，拒绝裸 id 以免误删同 id 兄弟");
      return { agentId: target.agentId ?? "main", key: String(target.id) };
    });
    if (!list.length) return;
    const del = this.#sql("DELETE FROM session_events WHERE session_id = ? AND type = ? AND agent_id = ? AND key = ?");
    this.#change(() => {
      for (const { agentId, key } of list) del.run(sessionId, type, agentId, key);
    });
  }

  // —— 写：任务 ——

  // 单任务写入，record 只存任务内容（剥离元键 notified，投影时由列回填）。仅通知变化时只
  // UPDATE notified 列，绝不读回重写含 runtime/result 的大 record。纯元数据 patch 遇到未建
  // 任务行时静默 no-op：通知必发生在 task.state 发布之后，正常序不受影响。
  saveTask(sessionId, task) {
    if (typeof task?.id !== "string" || !task.id) throw new Error("saveTask：任务缺少 id");
    const { id, notified, ...content } = task;
    if (Object.keys(content).length === 0) {
      this.#sql("UPDATE tasks SET notified = COALESCE(?, notified) WHERE session_id = ? AND id = ?").run(
        notified === undefined ? null : notified ? 1 : 0,
        sessionId,
        id,
      );
      return;
    }
    const row = this.#sql("SELECT notified, record FROM tasks WHERE session_id = ? AND id = ?").get(sessionId, id);
    const merged = { ...(row ? this.#parse("tasks", sessionId, id, row.record) : {}), ...content };
    this.#sql(
      "INSERT INTO tasks (session_id, id, notified, record) VALUES (?, ?, ?, ?) ON CONFLICT(session_id, id) DO UPDATE SET notified = excluded.notified, record = excluded.record",
    ).run(
      sessionId,
      id,
      notified !== undefined ? (notified ? 1 : 0) : row?.notified ?? null,
      JSON.stringify(merged),
    );
  }

  listTasks(sessionId) {
    return this.#sql("SELECT id, notified, record FROM tasks WHERE session_id = ? ORDER BY rowid")
      .all(sessionId)
      .map(({ id, notified, record }) => this.#taskRecord(sessionId, id, notified, record));
  }
}
