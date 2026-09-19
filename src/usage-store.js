import { randomUUID } from "node:crypto";

// 请求级用量与限流存储：每次逻辑 LLM 请求（一次 streamSimple 调用）一行。
// 三层账单全部由这一张表聚合得出，不建汇总表：SQLite 在十万行量级做这类聚合是毫秒级，
// 提前汇总只会引入「明细与汇总对不上」的长期麻烦。
//
// 与 session-store 的关键差异：session_id 是普通列，不是外键、不级联删除。
// 账单必须比会话活得久——现有实现把用量寄存在 JSONL 里，删会话即蒸发，
// 库里 69 条旧任务的用量已经永久丢失，这张表就是为了不再重演。
// 因此不能 REFERENCES sessions(id) ON DELETE CASCADE。
//
// 归属三元组：session_id（哪个会话）+ agent_id（"main" 或子任务 UUID）+ source。
// agent_id 沿用 Axiom 既有口径（tasks.id == messages.agentId == session_events.agent_id），
// 主代理固定字面量 "main"，与 saveEvent 的 `record?.agentId ?? "main"` 一致。
//
// token 与成本列摊平存（不塞 JSON）：唯一目的是让 SUM/GROUP BY 直接落在列上。
// cacheRead 与 cacheWrite 单价不同（读约原价十分之一，写更贵），reasoning 是推理模型的
// 隐藏思考 token，三者必须各自成列——合并成一个数就把账算糊了，现有聚合正是丢了 reasoning。

const TABLES = {
  llm_requests: `CREATE TABLE IF NOT EXISTS llm_requests (
    request_id TEXT PRIMARY KEY,
    session_id TEXT,
    agent_id TEXT NOT NULL DEFAULT 'main',
    source TEXT NOT NULL,
    pid INTEGER,
    provider TEXT,
    model TEXT,
    api TEXT,
    queued_at INTEGER NOT NULL,
    started_at INTEGER,
    ended_at INTEGER,
    wait_ms INTEGER NOT NULL DEFAULT 0,
    wait_reason TEXT,
    queue_depth INTEGER,
    http_attempts INTEGER NOT NULL DEFAULT 0,
    http_429 INTEGER NOT NULL DEFAULT 0,
    backoff_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error TEXT,
    input INTEGER NOT NULL DEFAULT 0,
    output INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0,
    cache_write INTEGER NOT NULL DEFAULT 0,
    cache_write_1h INTEGER NOT NULL DEFAULT 0,
    reasoning INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_input REAL NOT NULL DEFAULT 0,
    cost_output REAL NOT NULL DEFAULT 0,
    cost_cache_read REAL NOT NULL DEFAULT 0,
    cost_cache_write REAL NOT NULL DEFAULT 0,
    cost_total REAL NOT NULL DEFAULT 0,
    unpriced INTEGER NOT NULL DEFAULT 0
  )`,
  // 闸门侧事件：与具体请求无关的限流事实（撞 429、进入冷却、配置变更）。
  // 独立成表是因为它们没有 request 身份，塞进 llm_requests 会把「一行=一次请求」的口径破坏掉。
  gate_events: `CREATE TABLE IF NOT EXISTS gate_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    provider TEXT,
    type TEXT NOT NULL,
    detail TEXT
  )`,
};

// 审计列表按时间倒序分页 → (started_at) 主扫描索引，COALESCE 口径与查询一致：
// 未放行的行 started_at 为 NULL，必须回落到 queued_at 才不会在列表里凭空消失。
// 会话详情按 (session_id, agent_id) 聚合 → 覆盖该组合。
// 全局页按 provider/model 分组 → 单独一条。
const INDEXES = `
  CREATE INDEX IF NOT EXISTS llm_requests_recent ON llm_requests(queued_at DESC, request_id DESC);
  CREATE INDEX IF NOT EXISTS llm_requests_session ON llm_requests(session_id, agent_id);
  CREATE INDEX IF NOT EXISTS llm_requests_model ON llm_requests(provider, model);
  CREATE INDEX IF NOT EXISTS gate_events_recent ON gate_events(at DESC);
`;

// 未完成的请求：进程崩溃或汇报丢失时留在库里的行。
// 不清理、不假装成功——「一行挂在 running 上」本身就是审计信息，
// 能反过来暴露漏掉的令牌归还与异常退出。
export const OPEN_STATUS = "running";

const TOKEN_COLUMNS = {
  input: "input",
  output: "output",
  cacheRead: "cache_read",
  cacheWrite: "cache_write",
  cacheWrite1h: "cache_write_1h",
  reasoning: "reasoning",
  totalTokens: "total_tokens",
};

const COST_COLUMNS = {
  input: "cost_input",
  output: "cost_output",
  cacheRead: "cost_cache_read",
  cacheWrite: "cost_cache_write",
  total: "cost_total",
};

// 负数、NaN、Infinity 一律归零：usage 来自供应商响应，不能假定干净。
// 计价缺失（cost.total 非有限）单独用 unpriced 标记，不能静默当 0 花销。
const number = (value) => (Number.isFinite(value) && value >= 0 ? value : 0);

export class UsageStore {
  #database;
  #statements = new Map();

  constructor(database) {
    this.#database = database;
    database.exec(Object.values(TABLES).join(";\n"));
    database.exec(INDEXES);
  }

  #sql(text) {
    let statement = this.#statements.get(text);
    if (!statement) this.#statements.set(text, (statement = this.#database.prepare(text)));
    return statement;
  }

  // 请求进闸门时开行：此刻只知道身份与排队起点，用量与结果留空待补。
  // 先落行再放行，是为了让「已放行但没回来」的请求在库里留下痕迹。
  begin({ sessionId = null, agentId = "main", source = "unattributed", provider = null, model = null, api = null, queuedAt = Date.now(), pid = process.pid } = {}) {
    const requestId = randomUUID();
    this.#sql(
      `INSERT INTO llm_requests (request_id, session_id, agent_id, source, pid, provider, model, api, queued_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(requestId, sessionId, agentId, source, pid, provider, model, api, queuedAt, OPEN_STATUS);
    return requestId;
  }

  // 闸门放行：记录等待时长、等待原因与放行瞬间的队列深度。
  // 这三个数是回答「限流器是帮了还是害了」的唯一依据——没有它们就只能凭感觉调参数。
  admit(requestId, { startedAt = Date.now(), waitMs = 0, waitReason = null, queueDepth = null } = {}) {
    this.#sql(
      "UPDATE llm_requests SET started_at = ?, wait_ms = ?, wait_reason = ?, queue_depth = ? WHERE request_id = ? AND status = 'running'",
    ).run(startedAt, Math.max(0, Math.round(waitMs)), waitReason, queueDepth, requestId);
  }

  // 物理尝试累计：pi 内层 retryProviderRequest 的每次 fetch 都记一笔。
  // 一次逻辑请求可能对应多次物理请求，RPM 是按物理次数算的，这里也必须按物理次数累加。
  attempt(requestId, { is429 = false, backoffMs = 0 } = {}) {
    this.#sql(
      `UPDATE llm_requests
         SET http_attempts = http_attempts + 1,
             http_429 = http_429 + ?,
             backoff_ms = backoff_ms + ?
       WHERE request_id = ? AND status = 'running'`,
    ).run(is429 ? 1 : 0, Math.max(0, Math.round(backoffMs)), requestId);
  }

  // 请求终结：写入结果与用量。usage 形状同 pi-ai 的 Usage（可缺字段）。
  // 终态首写为准，迟到的取消/失败通知不得覆盖已记费用。
  finish(requestId, { status = "error", error = null, usage = null, endedAt = Date.now() } = {}) {
    const tokens = Object.fromEntries(Object.keys(TOKEN_COLUMNS).map((key) => [key, number(usage?.[key])]));
    const cost = Object.fromEntries(Object.keys(COST_COLUMNS).map((key) => [key, number(usage?.cost?.[key])]));
    // 有 usage 但 cost.total 不是有限数 → 该请求未计价，单独标记；无 usage 不算未计价（失败请求本就没有用量）。
    const unpriced = usage && !Number.isFinite(usage?.cost?.total) ? 1 : 0;
    this.#sql(
      `UPDATE llm_requests SET
         status = ?, error = ?, ended_at = ?,
         input = ?, output = ?, cache_read = ?, cache_write = ?, cache_write_1h = ?, reasoning = ?, total_tokens = ?,
         cost_input = ?, cost_output = ?, cost_cache_read = ?, cost_cache_write = ?, cost_total = ?,
         unpriced = ?
       WHERE request_id = ? AND status = 'running'`,
    ).run(
      status, error, endedAt,
      tokens.input, tokens.output, tokens.cacheRead, tokens.cacheWrite, tokens.cacheWrite1h, tokens.reasoning, tokens.totalTokens,
      cost.input, cost.output, cost.cacheRead, cost.cacheWrite, cost.total,
      unpriced, requestId,
    );
  }

  // 确定性主键使历史导入与副本去重幂等；事务保证不留下半条历史账目。
  importHistorical(fingerprint, { sessionId, agentId, provider, model, at, usage }) {
    const requestId = `history:${fingerprint}`;
    this.#database.exec("SAVEPOINT usage_import");
    try {
      if (this.#sql("SELECT 1 FROM llm_requests WHERE request_id = ?").get(requestId)) {
        this.#database.exec("RELEASE usage_import"); return false;
      }
      this.#sql(`INSERT INTO llm_requests (request_id, session_id, agent_id, source, provider, model, queued_at, status)
        VALUES (?, ?, ?, 'backfill', ?, ?, ?, 'running')`).run(requestId, sessionId, agentId, provider, model, at);
      this.finish(requestId, { status: "backfill", usage, endedAt: at });
      this.#database.exec("RELEASE usage_import"); return true;
    } catch (error) {
      this.#database.exec("ROLLBACK TO usage_import; RELEASE usage_import"); throw error;
    }
  }

  // 闸门事件：type 如 rate_limited / cooldown_start / config_change，detail 存 JSON 文本。
  recordGateEvent({ type, provider = null, detail = null, at = Date.now() } = {}) {
    this.#sql("INSERT INTO gate_events (at, provider, type, detail) VALUES (?, ?, ?, ?)").run(
      at, provider, type, detail === null ? null : JSON.stringify(detail),
    );
  }

  // —— 读：三层账单都是这张表上的查询 ——

  // 会话级：按 agent 拆分（主代理 + 各子任务），供 combinedBilling 形状的投影使用。
  billingBySession(sessionId) {
    return this.#sql(
      `SELECT agent_id AS agentId, provider, model,
              COUNT(*) AS records, SUM(unpriced) AS unpriced,
              SUM(input) AS input, SUM(output) AS output,
              SUM(cache_read) AS cacheRead, SUM(cache_write) AS cacheWrite,
              SUM(cache_write_1h) AS cacheWrite1h, SUM(reasoning) AS reasoning,
              SUM(cost_input) AS costInput, SUM(cost_output) AS costOutput,
              SUM(cost_cache_read) AS costCacheRead, SUM(cost_cache_write) AS costCacheWrite,
              SUM(cost_total) AS costTotal
         FROM llm_requests
        WHERE session_id = ?
        GROUP BY agent_id, provider, model
        ORDER BY agent_id, costTotal DESC`,
    ).all(sessionId);
  }

  // 全局级：跨所有会话，按天与模型汇总。这是现有实现完全没有的能力。
  // 日界按本地时区切（'unixepoch', 'localtime'）：用户看的是自己的日历天，不是 UTC 天。
  billingGlobal({ since = null, until = null } = {}) {
    return this.#sql(
      `SELECT date(COALESCE(started_at, queued_at) / 1000, 'unixepoch', 'localtime') AS day,
              provider, model,
              COUNT(*) AS records, SUM(unpriced) AS unpriced,
              SUM(input) AS input, SUM(output) AS output,
              SUM(cache_read) AS cacheRead, SUM(cache_write) AS cacheWrite,
              SUM(reasoning) AS reasoning,
              SUM(cost_total) AS costTotal
         FROM llm_requests
        WHERE (? IS NULL OR COALESCE(started_at, queued_at) >= ?)
          AND (? IS NULL OR COALESCE(started_at, queued_at) <= ?)
        GROUP BY day, provider, model
        ORDER BY day DESC, costTotal DESC`,
    ).all(since, since, until, until);
  }

  // 请求级：倒序游标分页。游标是 (排序时刻, request_id) 复合值，
  // 同毫秒多请求靠 request_id 兜住稳定顺序，避免翻页时漏行或重复。
  listRequests({ before = null, beforeId = null, limit = 50, sessionId = null, provider = null, status = null } = {}) {
    const size = Math.min(Math.max(1, Math.trunc(limit) || 50), 500);
    const rows = this.#sql(
      `SELECT request_id AS requestId, session_id AS sessionId, agent_id AS agentId, source,
              provider, model, api, pid,
              queued_at AS queuedAt, started_at AS startedAt, ended_at AS endedAt,
              wait_ms AS waitMs, wait_reason AS waitReason, queue_depth AS queueDepth,
              http_attempts AS httpAttempts, http_429 AS http429, backoff_ms AS backoffMs,
              status, error,
              input, output, cache_read AS cacheRead, cache_write AS cacheWrite,
              cache_write_1h AS cacheWrite1h, reasoning, total_tokens AS totalTokens,
              cost_input AS costInput, cost_output AS costOutput,
              cost_cache_read AS costCacheRead, cost_cache_write AS costCacheWrite,
              cost_total AS costTotal, unpriced,
              queued_at AS sortAt
         FROM llm_requests
        WHERE (? IS NULL OR session_id = ?)
          AND (? IS NULL OR provider = ?)
          AND (? IS NULL OR status = ?)
          AND (? IS NULL OR queued_at < ?
               OR (queued_at = ? AND request_id < ?))
        ORDER BY sortAt DESC, request_id DESC
        LIMIT ?`,
    ).all(sessionId, sessionId, provider, provider, status, status, before, before, before, beforeId, size + 1);
    const items = rows.slice(0, size);
    const last = items.at(-1);
    return {
      items,
      // 多取一行判断是否还有下一页，不用 COUNT(*) 全表扫。
      nextCursor: rows.length > size && last ? { before: last.sortAt, beforeId: last.requestId } : null,
    };
  }

  // 实时状态页用：当前挂着的请求（已开行未终结）。
  openRequests() {
    return this.#sql(
      `SELECT request_id AS requestId, session_id AS sessionId, agent_id AS agentId, source,
              provider, model, queued_at AS queuedAt, started_at AS startedAt,
              wait_ms AS waitMs, wait_reason AS waitReason, http_attempts AS httpAttempts, pid
         FROM llm_requests
        WHERE status = ?
        ORDER BY queued_at`,
    ).all(OPEN_STATUS);
  }

  recentGateEvents(limit = 50) {
    const size = Math.min(Math.max(1, Math.trunc(limit) || 50), 500);
    return this.#sql(
      "SELECT id, at, provider, type, detail FROM gate_events ORDER BY at DESC, id DESC LIMIT ?",
    ).all(size).map((row) => ({
      ...row,
      // 坏 JSON 不能让整页查询崩：退化成 null，行本身（时刻、类型）仍有审计价值。
      detail: row.detail === null ? null : (() => { try { return JSON.parse(row.detail); } catch { return null; } })(),
    }));
  }
}
