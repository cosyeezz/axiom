import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.js";
import { SessionStore } from "../src/session-store.js";
import { UsageStore } from "../src/usage-store.js";

// 每个用例独立临时库，结束关闭连接再清理（Windows 文件句柄）。
async function withStore(work) {
  const dir = await mkdtemp(join(tmpdir(), "axiom-usage-"));
  const db = new Database(join(dir, "axiom.db"));
  const store = new UsageStore(db);
  try {
    return await work(store, db);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
}

// 供应商真实 usage 形状（取自实际 JSONL 样例）。
function usage(overrides = {}) {
  return {
    input: 4060,
    output: 182,
    cacheRead: 7296,
    cacheWrite: 0,
    reasoning: 0,
    totalTokens: 11538,
    cost: { input: 0.0406, output: 0.0091, cacheRead: 0.007296, cacheWrite: 0, total: 0.056996 },
    ...overrides,
  };
}

// 完整生命周期：开行 → 放行 → 物理尝试 → 终结。
function complete(store, { sessionId = "s1", agentId = "main", source = "main", usageData = usage(), ...rest } = {}) {
  const id = store.begin({ sessionId, agentId, source, provider: "oa173", model: "gpt-6-astra", api: "openai-completions", ...rest });
  store.admit(id, { waitMs: 120, waitReason: "rpm", queueDepth: 2 });
  store.attempt(id, {});
  store.finish(id, { status: "ok", usage: usageData });
  return id;
}

test("请求全生命周期落库，用量与成本逐列保留", async () => {
  await withStore((store) => {
    const id = complete(store);
    const { items } = store.listRequests({});
    assert.equal(items.length, 1);
    const row = items[0];
    assert.equal(row.requestId, id);
    assert.equal(row.status, "ok");
    assert.equal(row.sessionId, "s1");
    assert.equal(row.agentId, "main");
    // cacheRead / cacheWrite 各自成列，不被合并。
    assert.equal(row.input, 4060);
    assert.equal(row.cacheRead, 7296);
    assert.equal(row.cacheWrite, 0);
    assert.equal(row.costTotal, 0.056996);
    // 排队与物理尝试信息保留，这是审计限流器效果的依据。
    assert.equal(row.waitMs, 120);
    assert.equal(row.waitReason, "rpm");
    assert.equal(row.queueDepth, 2);
    assert.equal(row.httpAttempts, 1);
    assert.equal(row.rpmWaitMs, 0);
  });
});

test("已有审计表补充 RPM 等待列且保留原记录", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-usage-legacy-"));
  const path = join(dir, "axiom.db");
  try {
    const db = new Database(path);
    const original = new UsageStore(db);
    const id = original.begin({ sessionId: "old" });
    db.exec("ALTER TABLE llm_requests DROP COLUMN rpm_wait_ms");
    new UsageStore(db);
    assert.equal(db.prepare("SELECT rpm_wait_ms FROM llm_requests WHERE request_id = ?").get(id).rpm_wait_ms, 0);
    new UsageStore(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM llm_requests").get().count, 1);
    db.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("迟到的终态和尝试不能覆盖已记账请求", async () => {
  await withStore(store => {
    const id = complete(store);
    store.finish(id, { status: "aborted" });
    store.attempt(id, { is429: true });
    store.admit(id, { startedAt: 1 });
    const row = store.listRequests().items[0];
    assert.equal(row.status, "ok");
    assert.equal(row.costTotal, usage().cost.total);
    assert.equal(row.httpAttempts, 1);
    assert.notEqual(row.startedAt, 1);
  });
});

test("reasoning 与 cacheWrite1h 不被丢弃", async () => {
  await withStore((store) => {
    complete(store, { usageData: usage({ reasoning: 512, cacheWrite1h: 64 }) });
    const [row] = store.listRequests({}).items;
    assert.equal(row.reasoning, 512);
    assert.equal(row.cacheWrite1h, 64);
  });
});

test("会话级按 agent 拆分主代理与子任务", async () => {
  await withStore((store) => {
    complete(store, { agentId: "main", source: "main" });
    complete(store, { agentId: "task-a", source: "task" });
    complete(store, { agentId: "task-a", source: "task" });
    complete(store, { sessionId: "s2", agentId: "main", source: "main" });

    const rows = store.billingBySession("s1");
    const byAgent = new Map(rows.map((row) => [row.agentId, row]));
    assert.deepEqual([...byAgent.keys()].sort(), ["main", "task-a"]);
    assert.equal(byAgent.get("main").records, 1);
    assert.equal(byAgent.get("task-a").records, 2);
    // 另一个会话不串台。
    assert.equal(store.billingBySession("s2").length, 1);
  });
});

test("全局级跨会话按模型汇总", async () => {
  await withStore((store) => {
    complete(store, { sessionId: "s1" });
    complete(store, { sessionId: "s2" });
    const rows = store.billingGlobal({});
    assert.equal(rows.length, 1, "同模型同天合并为一行");
    assert.equal(rows[0].records, 2);
    assert.equal(rows[0].model, "gpt-6-astra");
    // 两次相同请求，成本翻倍。
    assert.ok(Math.abs(rows[0].costTotal - 0.056996 * 2) < 1e-9);
  });
});

test("未计价请求单独标记，不被当成零花销", async () => {
  await withStore((store) => {
    complete(store, { usageData: usage({ cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: undefined } }) });
    const [row] = store.listRequests({}).items;
    assert.equal(row.unpriced, 1);
    assert.equal(store.billingBySession("s1")[0].unpriced, 1);
  });
});

test("失败请求不算未计价，错误原因保留", async () => {
  await withStore((store) => {
    const id = store.begin({ sessionId: "s1", source: "main", provider: "oa173" });
    store.admit(id, {});
    store.finish(id, { status: "error", error: "429 too many requests" });
    const [row] = store.listRequests({}).items;
    assert.equal(row.status, "error");
    assert.equal(row.error, "429 too many requests");
    assert.equal(row.unpriced, 0, "没有 usage 的失败请求不该被标成未计价");
  });
});

test("脏 usage 归零而不是写入 NaN", async () => {
  await withStore((store) => {
    complete(store, { usageData: usage({ input: -5, output: Number.NaN, cacheRead: Infinity }) });
    const [row] = store.listRequests({}).items;
    assert.equal(row.input, 0);
    assert.equal(row.output, 0);
    assert.equal(row.cacheRead, 0);
  });
});

test("物理尝试与 429 累加，反映 pi 内层重试", async () => {
  await withStore((store) => {
    const id = store.begin({ sessionId: "s1", source: "main" });
    store.admit(id, {});
    store.attempt(id, { is429: true, backoffMs: 2000, rpmWaitMs: 12 });
    store.attempt(id, { is429: true, backoffMs: 4000, rpmWaitMs: 34 });
    store.attempt(id, {});
    store.finish(id, { status: "ok", usage: usage() });
    const [row] = store.listRequests({}).items;
    assert.equal(row.httpAttempts, 3);
    assert.equal(row.http429, 2);
    assert.equal(row.backoffMs, 6000);
    assert.equal(row.rpmWaitMs, 46);
  });
});

test("未终结请求留在库里且可查，不假装成功", async () => {
  await withStore((store) => {
    const id = store.begin({ sessionId: "s1", source: "main" });
    store.admit(id, {});
    const open = store.openRequests();
    assert.equal(open.length, 1);
    assert.equal(open[0].requestId, id);
    // 已终结的不再出现在挂起列表。
    store.finish(id, { status: "ok", usage: usage() });
    assert.equal(store.openRequests().length, 0);
  });
});

test("账单不随会话删除而消失", async () => {
  await withStore((store, db) => {
    // 真实会话表在场：删会话走 SessionStore 的级联删除路径，用量记录必须活下来。
    // 现有实现把用量寄存在 JSONL 里，删会话即蒸发，这条就是防回归。
    const sessions = new SessionStore(db);
    sessions.insertSession({ id: "gone", cwd: "F:/demo" });
    complete(store, { sessionId: "gone" });
    sessions.deleteSession("gone");

    assert.equal(sessions.hasSession("gone"), false, "会话本身确实被删掉了");
    assert.equal(store.listRequests({ sessionId: "gone" }).items.length, 1, "用量记录必须留存");
  });
});

test("游标分页倒序不漏不重", async () => {
  await withStore((store) => {
    const made = [];
    for (let index = 0; index < 7; index++) {
      const id = store.begin({ sessionId: "s1", source: "main", queuedAt: 1000 + index });
      store.admit(id, { startedAt: 1000 + index });
      store.finish(id, { status: "ok", usage: usage() });
      made.push(id);
    }
    const seen = [];
    let cursor = null;
    for (let page = 0; page < 10; page++) {
      const result = store.listRequests({ limit: 3, ...(cursor ?? {}) });
      seen.push(...result.items.map((row) => row.requestId));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    assert.equal(seen.length, 7);
    assert.equal(new Set(seen).size, 7, "分页不得重复");
    assert.deepEqual(seen, [...made].reverse(), "严格按时间倒序");
  });
});

test("同毫秒请求分页仍稳定", async () => {
  await withStore((store) => {
    for (let index = 0; index < 5; index++) {
      const id = store.begin({ sessionId: "s1", source: "main", queuedAt: 5000 });
      store.admit(id, { startedAt: 5000 });
      store.finish(id, { status: "ok", usage: usage() });
    }
    const seen = [];
    let cursor = null;
    for (let page = 0; page < 10; page++) {
      const result = store.listRequests({ limit: 2, ...(cursor ?? {}) });
      seen.push(...result.items.map((row) => row.requestId));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    assert.equal(new Set(seen).size, 5, "同毫秒也不能漏行或重复");
  });
});

test("筛选按会话、供应商、状态生效", async () => {
  await withStore((store) => {
    complete(store, { sessionId: "s1", provider: "oa173" });
    complete(store, { sessionId: "s2", provider: "abc" });
    const failed = store.begin({ sessionId: "s1", source: "main", provider: "oa173" });
    store.finish(failed, { status: "error", error: "boom" });

    assert.equal(store.listRequests({ sessionId: "s1" }).items.length, 2);
    assert.equal(store.listRequests({ provider: "abc" }).items.length, 1);
    assert.equal(store.listRequests({ status: "error" }).items.length, 1);
  });
});

test("闸门事件独立记录且坏 JSON 不炸查询", async () => {
  await withStore((store, db) => {
    store.recordGateEvent({ type: "rate_limited", provider: "oa173", detail: { retryAfter: 30 } });
    store.recordGateEvent({ type: "cooldown_start", provider: "oa173", detail: null });
    db.exec("INSERT INTO gate_events (at, provider, type, detail) VALUES (9, 'oa173', 'bad', '{oops')");

    const events = store.recentGateEvents();
    assert.equal(events.length, 3);
    const byType = new Map(events.map((event) => [event.type, event]));
    assert.deepEqual(byType.get("rate_limited").detail, { retryAfter: 30 });
    assert.equal(byType.get("cooldown_start").detail, null);
    assert.equal(byType.get("bad").detail, null, "坏 JSON 退化为 null 而不是抛错");
  });
});

test("重复建表幂等，重开库数据仍在", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-usage-"));
  const path = join(dir, "axiom.db");
  try {
    const first = new Database(path);
    const id = complete(new UsageStore(first));
    first.close();

    const second = new Database(path);
    const store = new UsageStore(second);
    const { items } = store.listRequests({});
    assert.equal(items.length, 1);
    assert.equal(items[0].requestId, id);
    second.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
