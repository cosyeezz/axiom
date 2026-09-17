import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";
import { HISTORY_PAGE_RECORDS_MAX } from "../src/session-history.js";

// 混合时间线的读时投影 + 主轴预算分页：子代理记录不占窗口预算、随锚点整组进出页。
// 主/子记录按「真实会话」的到达顺序构造：委派发生 → 子代理持续产出 → 主对话继续。

function fakeSource() {
  const factory = async (_, selection = {}) => ({
    config: () => ({ model: "test/one", thinking: "off", levels: ["off"] }),
    configure: async (next) => ({ model: next.model }),
    subscribe: () => () => {},
    prompt: async () => {}, enqueue: async () => {},
    queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
    recall: async () => ({ entryId: "u1" }),
    abort: async () => {}, result: () => "ok", dispose: async () => {},
    sessionFile: () => selection.sessionFile,
    historyEntries: () => [],
    state: { messages: [] },
  });
  factory.catalog = () => [{ key: "test/one" }];
  return factory;
}

const mainRecord = (n, extra = {}) => ({ agentId: "main", entryId: `m${n}`,
  message: { role: n % 2 ? "assistant" : "user", content: `主消息 ${n}`, ...extra } });
const subRecord = (task, n) => ({ agentId: task, entryId: `s-${task}-${n}`,
  message: { role: n % 2 ? "assistant" : "user", content: `子记录 ${n}` } });
const delegateAnchor = (n, taskIds) => ({ agentId: "main", entryId: `m${n}`,
  message: { role: "toolResult", toolName: "delegate", toolCallId: `call-${n}`,
    content: [{ type: "text", text: JSON.stringify({ taskIds }) }] } });

const append = (sessions, id, records) => {
  for (const record of records)
    sessions.get(id).emit({ type: "agent.message.end", agentId: record.agentId, data: { message: record.message, entryId: record.entryId } });
};

const mainCount = (page) => page.messages.filter((message) => (message.agentId ?? "main") === "main").length;

async function boot(t, records) {
  const root = await mkdtemp(join(tmpdir(), "axiom-main-budget-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  t.after(async () => { await sessions.close(); await rm(root, { recursive: true, force: true }); });
  const id = await sessions.create(root);
  append(sessions, id, records);
  return { sessions, id };
}

test("子代理风暴后末页仍含满额主记录：主对话不被挤出首屏", async t => {
  // 症状复现：主对话在前、550 条子记录持续到达（旧算法末页 60 条全是子记录，首屏空白）。
  const arrival = [
    ...Array.from({ length: 100 }, (_, n) => n === 95 ? delegateAnchor(95, ["storm"]) : mainRecord(n)),
    ...Array.from({ length: 550 }, (_, n) => subRecord("storm", n)),
  ];
  const { sessions, id } = await boot(t, arrival);
  const page = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
  assert.equal(mainCount(page), 60, "末页预算按主记录计");
  assert.equal(page.messages.at(-1).entryId, "m99", "最后一条主消息在页内");
  assert.equal(page.messages[0].entryId, "m40", "从主秩 40 起取窗");
  // 锚点在页内 → 其子记录整组跟随，超出单页记录上限时裁更旧的子记录。
  assert.equal(page.messages.length, HISTORY_PAGE_RECORDS_MAX);
  assert.deepEqual(page.history.truncatedTasks, ["storm"]);
  const pageSubs = page.messages.filter((message) => message.agentId === "storm");
  assert.equal(pageSubs.at(-1).entryId, "s-storm-549", "保留更新的子记录");
  assert.equal(page.messages.some((message) => message.entryId === "s-storm-0"), false, "更旧的子记录被裁");
  // 上一页从 m0 起且不含被裁间隙之外的内容：翻页链依然不重不漏（间隙=被裁剪声明）。
  const first = await sessions.history(id, { before: page.history.prevCursor, limit: 60 }, "inst");
  assert.equal(first.messages[0].entryId, "m0");
  assert.equal(first.messages.at(-1).entryId, "m39");
  assert.equal(first.history.prevCursor, null);
});

test("游标往返：锚点整组跟随边界，前后链不重不漏", async t => {
  const arrival = [
    ...Array.from({ length: 200 }, (_, n) => n === 99 ? delegateAnchor(99, ["taskA"]) : mainRecord(n)),
    ...Array.from({ length: 50 }, (_, n) => subRecord("taskA", n)),
  ];
  const { sessions, id } = await boot(t, arrival);
  const seen = new Set();
  const check = (page) => {
    for (const message of page.messages) {
      assert.ok(!seen.has(message.messageId), `不重复：${message.messageId}`);
      seen.add(message.messageId);
    }
  };
  // 反向链：最新页 → before → … → 最旧页。
  let page = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
  check(page);
  assert.equal(page.messages.filter((m) => m.agentId === "taskA").length, 0, "末页不含 taskA（锚点 m99 在更早页）");
  while (page.history.prevCursor) {
    page = await sessions.history(id, { before: page.history.prevCursor, limit: 60 }, "inst");
    check(page);
  }
  assert.equal(seen.size, 250, "反向链全覆盖");
  // 正向链：first → after → … → 最新页；包含锚点组的页应整组携带 50 条子记录。
  seen.clear();
  page = await sessions.history(id, { edge: "first", limit: 60 }, "inst");
  check(page);
  let grouped = 0;
  while (page.history.nextCursor) {
    page = await sessions.history(id, { after: page.history.nextCursor, limit: 60 }, "inst");
    check(page);
    grouped = Math.max(grouped, page.messages.filter((m) => m.agentId === "taskA").length);
  }
  assert.equal(seen.size, 250, "正向链全覆盖");
  assert.equal(grouped, 50, "锚点所在页整组携带子记录");
});

test("live 到达序与 JSONL 恢复投影等价：同一页内容逐条一致", async t => {
  const arrival = [
    ...Array.from({ length: 6 }, (_, n) => n === 5 ? delegateAnchor(5, ["child"]) : mainRecord(n)),
    ...Array.from({ length: 300 }, (_, n) => subRecord("child", n)),
    ...Array.from({ length: 94 }, (_, n) => mainRecord(n + 6)),
  ];
  const { sessions, id } = await boot(t, arrival);
  const live = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
  assert.equal(mainCount(live), 60);
  assert.equal(live.messages.at(-1).entryId, "m99");
  assert.equal(live.messages[0].entryId, "m40");

  // 只读分支：同样的记录写进主/子 JSONL，恢复路径分页结果与 live 一致。
  const root = await mkdtemp(join(tmpdir(), "axiom-main-budget-readonly-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const writeFile = (name, messages) => {
    const file = join(root, `${name}.jsonl`);
    const lines = [{ type: "session", version: 3, id: name, cwd: root },
      ...messages.map((message, n) => ({ type: "message", id: `${name}-${n}`, parentId: n ? `${name}-${n - 1}` : null, message }))];
    writeFileSync(file, lines.map(JSON.stringify).join("\n"));
    return file;
  };
  const mainMessages = arrival.filter((r) => r.agentId === "main").map((r) => r.message);
  const childMessages = arrival.filter((r) => r.agentId === "child").map((r) => r.message);
  const file = writeFile("main", mainMessages);
  const childFile = writeFile("child", childMessages);
  const restored = Object.create(Sessions.prototype);
  const item = { loaded: false, cwd: root, title: "历史", seq: 7 };
  restored.get = () => item;
  restored.goalStore = { load: () => null };
  restored.store = { getSession: () => ({ sessionFile: file, cwd: root, selection: { model: "test/model", levels: ["off"] }, tasks: [{ id: "child", task: "子任务", status: "completed", sessionFile: childFile }] }) };
  const readonly = restored.snapshot("s", { epoch: "instance", window: { edge: "last", limit: 60 } });
  const normalize = (list) => list.map((m) => m.messageId.replace(/^main-/, "m").replace(/^child-/, "s-child-"));
  assert.deepEqual(normalize(readonly.messages), normalize(live.messages), "两条路径同构");
});

test("孤儿子记录前置头部且投影幂等：末页不被遮蔽", async t => {
  const arrival = [
    ...Array.from({ length: 80 }, (_, n) => mainRecord(n)),
    ...Array.from({ length: 40 }, (_, n) => subRecord("orphan", n)), // 无委派锚点
  ];
  const { sessions, id } = await boot(t, arrival);
  const first = await sessions.history(id, { edge: "first", limit: 60 }, "inst");
  assert.equal(first.messages[0].agentId, "orphan", "孤儿前置");
  assert.equal(mainCount(first), 60);
  const last = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
  assert.equal(last.messages.at(-1).entryId, "m79");
  assert.equal(last.messages[0].entryId, "m20");
  // 幂等：同一请求重复投影结果逐条一致（游标/分页稳定）。
  const again = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
  assert.deepEqual(again.messages.map((m) => m.messageId), last.messages.map((m) => m.messageId));
});

test("重试位置按投影换算：live 到达序的 messageCount 归一到锚点顺序", async t => {
  const arrival = [
    ...Array.from({ length: 6 }, (_, n) => n === 5 ? delegateAnchor(5, ["child"]) : mainRecord(n)),
    ...Array.from({ length: 100 }, (_, n) => subRecord("child", n)),
    ...Array.from({ length: 44 }, (_, n) => mainRecord(n + 6)),
  ];
  const { sessions, id } = await boot(t, arrival);
  // 到达序长度 107 时记录的重试：之后紧跟 arrival[106] = m6。
  sessions.get(id).retries.push({ agentId: "main", id: "r-live", messageCount: 107, status: "succeeded" });
  const page = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
  // 投影顺序：[m0..m5, s×100, m6..m49]；m6 的投影下标 106，其后槽位 107。
  const retry = page.retries.find((record) => record.id === "r-live");
  assert.equal(retry.messageCount, 107);
  assert.equal(page.messages[retry.messageCount - 1].entryId, "m6", "重试卡锚在 m6 之后");
});
