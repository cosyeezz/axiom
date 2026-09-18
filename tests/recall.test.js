import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recallLastMessage } from "../src/pi.js";
import { Sessions } from "../src/sessions.js";

const user = (content) => ({ type: "message", id: "u1", message: { role: "user", content } });
const assistant = (stopReason = "aborted", content = []) => ({ type: "message", id: "a1", message: { role: "assistant", stopReason, content } });
const thinking = [{ type: "thinking", thinking: "想一半" }];

function fixture(entries, { streaming = false, cancelled = false } = {}) {
  const calls = { aborted: 0, navigated: [], custom: [] };
  const session = {
    isStreaming: streaming,
    abort: async () => { calls.aborted++; session.isStreaming = false; },
    navigateTree: async (id) => { calls.navigated.push(id); return { cancelled, editorText: "" }; },
    sessionManager: {
      getBranch: () => entries,
      appendCustomEntry: (type, data) => calls.custom.push({ type, data }),
    },
  };
  return { session, calls };
}

test("recall pulls the last user input back before any model output", async () => {
  const { session, calls } = fixture([user([{ type: "text", text: "看图 [image1]" }, { type: "image", mimeType: "image/png", data: "AA==" }])]);
  const recalled = await recallLastMessage(session);
  assert.deepEqual(calls.navigated, ["u1"], "leaf falls back to before the recalled message");
  assert.equal(calls.custom[0].type, "axiom_recall", "branch is pinned on disk so a restart keeps it");
  assert.equal(recalled.text, "看图 [image1]");
  assert.deepEqual(recalled.images, [{ type: "image", mimeType: "image/png", data: "AA==" }]);
});

test("recall stops a running turn first and drops its interrupted half-answer", async () => {
  const { session, calls } = fixture([user([{ type: "text", text: "hi" }]), assistant("aborted", thinking)], { streaming: true });
  await recallLastMessage(session);
  assert.equal(calls.aborted, 1);
  assert.deepEqual(calls.navigated, ["u1"], "an aborted half-answer is dropped with the input");
});

test("recall refuses once the model produced an answer, a tool result or a tool call", async () => {
  const answered = fixture([user([{ type: "text", text: "hi" }]), assistant("stop")]);
  await assert.rejects(recallLastMessage(answered.session), /已经产生了模型输出/);
  assert.deepEqual(answered.calls.navigated, []);
  const tools = fixture([user([{ type: "text", text: "hi" }]), { type: "message", id: "t1", message: { role: "toolResult", content: [] } }]);
  await assert.rejects(recallLastMessage(tools.session), /已经产生了模型输出/);
  const calling = fixture([user([{ type: "text", text: "hi" }]), assistant("aborted", [{ type: "toolCall", id: "c1", name: "read" }])]);
  await assert.rejects(recallLastMessage(calling.session), /已经产生了模型输出/, "side effects must keep their record");
});

test("recall without a user message and a cancelled navigation do nothing", async () => {
  const empty = fixture([]);
  assert.equal(await recallLastMessage(empty.session), null);
  assert.equal(empty.calls.custom.length, 0);
  const cancelled = fixture([user([{ type: "text", text: "hi" }])], { cancelled: true });
  assert.equal(await recallLastMessage(cancelled.session), null);
  assert.deepEqual(cancelled.calls.custom, [], "no marker when an extension cancelled the navigation");
});

test("withdraw with recall trims the web history and leaves the queue alone when recall fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-recall-sessions-"));
  const queued = { steering: ["插话"], followUp: [] };
  let recalled = { entryId: "u1", text: "撤回的输入", images: [] };
  const factory = async () => ({
    config: () => ({ model: "test/one", thinking: "off", levels: ["off"] }),
    configure: async () => ({}),
    subscribe: () => () => {},
    prompt: async () => {},
    enqueue: async () => {},
    queue: () => structuredClone(queued),
    withdraw: () => { const old = structuredClone(queued); queued.steering = []; return old; },
    recall: async () => { if (!recalled) throw new Error("本轮已经产生了模型输出，无法撤回输入"); return recalled; },
    abort: async () => {}, result: () => "ok", dispose: async () => {},
  });
  factory.catalog = () => [{ key: "test/one" }];
  const sessions = new Sessions(factory, undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    sessions.get(id).messages = [
      { agentId: "main", entryId: "u0", message: { role: "user", content: "旧输入" } },
      { agentId: "main", entryId: "u1", message: { role: "user", content: "撤回的输入" } },
      { agentId: "main", message: { role: "assistant", stopReason: "aborted", content: [] } },
    ];
    // 历史被改写要广播：其他客户端手里的快照已经不对，必须整挂重取。
    const resets = [];
    sessions.subscribe(id, (event) => { if (event.type === "session.history.reset") resets.push(event); });
    const withdrawn = await sessions.withdraw(id, true);
    assert.deepEqual(resets.map((event) => event.data.reason), ["recall"]);
    assert.ok(Number.isInteger(resets[0].seq), "复用事件通路带 seq：前端 watermark 不能倒退");
    assert.deepEqual(withdrawn.recalled, recalled);
    assert.deepEqual(withdrawn.steering, ["插话"], "queue withdrawal still rides along");
    assert.deepEqual(sessions.snapshot(id).messages.map((record) => record.entryId), ["u0"], "recalled input and its interrupted answer leave the transcript");
    recalled = null;
    queued.steering = ["再来一条"];
    await assert.rejects(sessions.withdraw(id, true), /已经产生了模型输出/);
    assert.equal(resets.length, 1, "撤回失败没有改写历史，不广播重取");
    assert.deepEqual(sessions.get(id).agent.queue(), { steering: ["再来一条"], followUp: [] }, "a refused recall must not eat the queue");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("recall keeps web history in sync when SQLite rejects writes, returns input and retries the whole cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-recall-readonly-"));
  let branch = [
    { ...user("保留"), id: "u0" }, { ...assistant("stop"), id: "a0" },
    user("撤回的输入"), assistant("aborted", thinking),
  ];
  const sdk = {
    isStreaming: false,
    navigateTree: async id => { branch = branch.slice(0, branch.findIndex(e => e.id === id)); return {}; },
    sessionManager: { getBranch: () => branch, appendCustomEntry: () => {} },
  };
  const factory = Object.assign(async () => ({
    config: () => ({ model: "test/one" }), subscribe: () => () => {},
    recall: () => recallLastMessage(sdk), withdraw: () => ({ steering: ["排队输入"], followUp: [] }),
    historyEntries: () => branch, dispose: async () => {}, abort: async () => {},
  }), { catalog: () => [{ key: "test/one" }] });
  const sessions = new Sessions(factory, undefined, join(root, "storage"));
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id), errors = [];
    item.messages = branch.map(entry => ({ agentId: "main", entryId: entry.id, message: entry.message }));
    item.live.main = assistant("aborted", thinking).message;
    item.retries = [{ id: "retry", agentId: "main", anchorEntryId: "a1", messageCount: 4, status: "cancelled" }];
    await sessions.persist(item, { event: { type: "retry", record: item.retries[0] } });
    sessions.subscribe(id, event => { if (event.type === "error") errors.push(event); });
    sessions.database.exec("PRAGMA query_only = ON");
    const result = await sessions.withdraw(id, true);
    assert.equal(result.recalled.text, "撤回的输入", "SDK已经回退，必须把输入交还用户");
    assert.deepEqual(result.steering, ["排队输入"]);
    assert.deepEqual(item.messages.map(e => e.entryId), branch.map(e => e.id));
    assert.equal(item.live.main, undefined);
    assert.deepEqual(item.retries, []);
    assert.ok(errors.length, "数据库错误仍可见，不冒充已落盘");
    assert.equal(sessions.store.getSession(id).retries.length, 1);
    sessions.database.exec("PRAGMA query_only = OFF");
    // 撤回清理失败时不能半途丢记录；重试仍复用原有pendingWrites。
    const original = sessions.store.deleteEvents.bind(sessions.store);
    sessions.store.deleteEvents = (sid, type, records) => {
      if (type === "retry") throw new Error("injected cleanup failure");
      return original(sid, type, records);
    };
    await assert.rejects(sessions.persist(item, {}), /injected cleanup failure/);
    assert.equal(sessions.store.getSession(id).retries.length, 1, "同一次撤回清理须为短事务");
    sessions.store.deleteEvents = original;
    await sessions.persist(item, {});
    assert.equal(sessions.store.getSession(id).retries.length, 0);
  } finally {
    sessions.database.exec("PRAGMA query_only = OFF");
    await sessions.close(); await rm(root, { recursive: true, force: true });
  }
});

test("withdraw drops retracted main retries, keeps earlier and subagent ones without stale positions", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-recall-retries-"));
  let recalled = { entryId: "u1", text: "撤回的输入", images: [] };
  // 撤回后的 JSONL 分支只剩 u0；子代理消息不落 JSONL（与真实行为一致）。
  const branch = [{ id: "u0", message: { role: "user", content: "保留的输入" } }];
  const factory = async () => ({
    config: () => ({ model: "test/one", thinking: "off", levels: ["off"] }),
    configure: async () => ({}),
    subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {},
    queue: () => ({ steering: [], followUp: [] }),
    withdraw: () => ({ steering: [], followUp: [] }),
    recall: async () => recalled,
    historyEntries: () => branch,
    abort: async () => {}, result: () => "ok", dispose: async () => {},
  });
  factory.catalog = () => [{ key: "test/one" }];
  const sessions = new Sessions(factory, undefined, join(root, "sessions"));
  let reopened;
  try {
    const id = await sessions.create(root);
    sessions.get(id).messages = [
      { agentId: "main", entryId: "u0", message: { role: "user", content: "保留的输入" } },
      { agentId: "main", entryId: "u1", message: { role: "user", content: "撤回的输入" } },
      { agentId: "child", entryId: "c9", message: { role: "assistant", content: "保留子任务" } },
    ];
    sessions.get(id).retries = [
      { id: "kept", agentId: "main", status: "succeeded", attempt: 1, messageCount: 1, anchorEntryId: "u0" },
      { id: "count-cut", agentId: "main", status: "succeeded", attempt: 1, messageCount: 2 },
      { id: "anchor-cut", agentId: "main", status: "succeeded", attempt: 1, anchorEntryId: "u1" },
      { id: "unknown", agentId: "main", status: "failed", attempt: 2, error: "x" },
      { id: "child", agentId: "child", status: "succeeded", attempt: 1, messageCount: 3, anchorEntryId: "c9" },
    ];
    await sessions.withdraw(id, true);
    const item = sessions.get(id);
    assert.deepEqual(item.retries.map((r) => r.id), ["kept", "unknown", "child"],
      "撤回区间内的主代理重试移除，区间前与未知位置及子代理保留");
    assert.deepEqual(item.retries.map((r) => [r.messageCount, r.anchorEntryId]),
      [[1, "u0"], [undefined, undefined], [2, "c9"]],
      "保留记录不得残留越界 count 或失效锚点，新消息不会让旧卡漂移");
    // 持久化后重开：主代理历史从 JSONL 分支重建（c9 不回放）；child 卡 count=2 超过重建后的
    // 1 条主代理消息 → 清为未知，绝不残留越界数值；kept 界内保留。
    await sessions.close();
    reopened = new Sessions(factory, undefined, join(root, "sessions"));
    await reopened.load();
    await reopened.ensureLoaded(id);
    assert.deepEqual(reopened.snapshot(id).retries.map((r) => [r.id, r.messageCount]),
      [["kept", 1], ["unknown", undefined], ["child", undefined]]);
    assert.deepEqual(reopened.snapshot(id).messages.map(r => r.entryId), ["u0"]);
    reopened.get(id).emit({ type: "agent.message.end", data: { message: { role: "user", content: "后续输入" }, entryId: "u2" } });
    assert.equal(reopened.snapshot(id).retries.find(r => r.id === "child").messageCount, undefined);
    await reopened.close();
  } finally { await reopened?.close(); await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
