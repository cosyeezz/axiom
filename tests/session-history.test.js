import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";
import { createHistory, pageOf, touchHistory, HISTORY_PAGE_DEFAULT } from "../src/session-history.js";
import { command } from "../src/protocol.js";

// 造历史：entryId 即身份（跨重启稳定），message 只是负载。
const build = (count) => Array.from({ length: count }, (_, index) => ({
  agentId: "main", entryId: `e${index}`, message: { role: index % 2 ? "assistant" : "user", content: `m${index}` },
}));
const ids = (page) => page.records.map((record) => record.entryId);
const ask = (records, history, options) => pageOf(records, history, { sessionId: "s", epoch: "inst", ...options });

test("prev 指更旧、next 指更新：两条链都能不重不漏走完整段历史", () => {
  const records = build(150);
  const history = createHistory("s");
  const last = ask(records, history, { edge: "last", limit: 60 });
  assert.deepEqual(ids(last), records.slice(90).map((record) => record.entryId));
  assert.equal(last.meta.nextCursor, null, "最新页没有更新方向");
  assert.ok(last.meta.prevCursor, "最新页有更旧方向");
  assert.equal(last.meta.total, 150);

  const middle = ask(records, history, { before: last.meta.prevCursor, limit: 60 });
  assert.deepEqual(ids(middle), records.slice(30, 90).map((record) => record.entryId));
  const first = ask(records, history, { before: middle.meta.prevCursor, limit: 60 });
  assert.deepEqual(ids(first), records.slice(0, 30).map((record) => record.entryId));
  assert.equal(first.meta.prevCursor, null, "最旧页没有更旧方向");

  // 反向：first → 逐页 next（after）回到最新页。
  const forward = [];
  let page = ask(records, history, { edge: "first", limit: 60 });
  while (page) {
    forward.push(...ids(page));
    page = page.meta.nextCursor ? ask(records, history, { after: page.meta.nextCursor, limit: 60 }) : null;
  }
  assert.deepEqual(forward, records.map((record) => record.entryId));
  // 往返一致：从最新页拿到的 prev 游标换回来的正是上一页。
  assert.deepEqual(ids(ask(records, history, { before: last.meta.prevCursor, limit: 60 })), forward.slice(30, 90));
});

test("游标锚 messageId 而非下标：历史前插/重排也指向同一条消息", () => {
  const records = build(30);
  const history = createHistory("s");
  const first = ask(records, history, { edge: "first", limit: 5 });
  const next = first.meta.nextCursor;
  const shifted = [{ agentId: "main", entryId: "inserted", message: { role: "user", content: "x" } }, ...records];
  assert.deepEqual(ids(ask(shifted, history, { after: next, limit: 5 })), ["e5", "e6", "e7", "e8", "e9"]);
  assert.deepEqual(ids(ask(shifted, history, { before: next, limit: 5 })), ["e0", "e1", "e2", "e3", "e4"]);
});

test("追加消息不动游标：同一游标翻页结果逐字节不变", () => {
  const records = build(50);
  const history = createHistory("s");
  const before = ask(records, history, { edge: "last", limit: 10 }).meta.prevCursor;
  const anchored = ask(records, history, { before, limit: 10 });
  records.push(...build(20).map((record, index) => ({ ...record, entryId: `new${index}` })));
  // 追加不换号（revision 只有撤回/压缩才动），所以游标依然有效且指向同一条消息。
  assert.equal(history.revision, anchored.meta.revision);
  assert.deepEqual(ids(ask(records, history, { before, limit: 10 })), ids(anchored));
  assert.equal(ask(records, history, { edge: "last", limit: 10 }).meta.total, 70);
});

test("游标按 session/epoch/revision/messageId 逐维失效，坏游标显式报错", () => {
  const records = build(30);
  const history = createHistory("s");
  const cursor = ask(records, history, { edge: "first", limit: 5 }).meta.nextCursor;
  assert.throws(() => pageOf(records, history, { sessionId: "other", epoch: "inst", after: cursor, limit: 5 }), /不属于该会话/);
  assert.throws(() => pageOf(records, history, { sessionId: "s", epoch: "restarted", after: cursor, limit: 5 }), /其他服务实例/);
  assert.throws(() => ask(records, history, { before: "not-a-cursor", limit: 5 }), /游标无效/);
  assert.throws(() => ask(records, history, { before: Buffer.from(JSON.stringify({ v: 1, s: "s", e: "inst", r: history.revision, i: 0 })).toString("base64url"), limit: 5 }), /游标无效/);
  // 信封合法（同会话/同实例/同修订号）但锚点消息不在当前历史：显式失效，不猜下标。
  const twin = createHistory("s");
  twin.revision = history.revision;
  const stale = pageOf(build(30).map((record) => ({ ...record, entryId: `z${record.entryId}` })), twin,
    { sessionId: "s", epoch: "inst", edge: "first", limit: 5 }).meta.nextCursor;
  assert.throws(() => ask(records, history, { after: stale, limit: 5 }), /游标已失效/);
  // 换号（撤回/压缩）后旧游标一律拒绝。
  touchHistory(history);
  assert.throws(() => ask(records, history, { after: cursor, limit: 5 }), /历史已变更/);
});

test("参数互斥、limit 边界与 target 定位", () => {
  const records = build(30);
  const history = createHistory("s");
  const cursor = ask(records, history, { edge: "first", limit: 5 }).meta.nextCursor;
  assert.throws(() => ask(records, history, { before: cursor, after: cursor, limit: 5 }), /不能同时使用/);
  assert.throws(() => ask(records, history, { target: "e3", after: cursor, limit: 5 }), /不能再带游标/);
  assert.throws(() => ask(records, history, { edge: "last", before: cursor, limit: 5 }), /同时使用/);
  assert.throws(() => ask(records, history, { edge: "middle", limit: 5 }), /定位无效/);
  for (const limit of [0, -1, 201, 1.5, "60"]) assert.throws(() => ask(records, history, { edge: "last", limit }), /历史分页数量/);
  assert.equal(ask(records, history, { edge: "last" }).records.length, 30);
  assert.equal(ask(records, history, {}).meta.limit, HISTORY_PAGE_DEFAULT);
  assert.deepEqual(ids(ask(records, history, { target: "e7", limit: 5 })), ["e7", "e8", "e9", "e10", "e11"]);
  assert.deepEqual(ids(ask(records, history, { target: "e28", limit: 5 })), ["e28", "e29"]);
  assert.throws(() => ask(records, history, { target: "missing", limit: 5 }), /找不到历史定位消息/);
});

test("协议面：session.history 只收分页字段且 limit 与窗口上限一致", () => {
  const base = { id: "r", type: "session.history", sessionId: "s" };
  for (const limit of [1, 60, 200]) assert.equal(command.parse({ ...base, edge: "last", limit }).limit, limit);
  for (const bad of [{ limit: 0 }, { limit: 201 }, { edge: "middle" }, { cursor: "x" }, { before: "x".repeat(4097) }])
    assert.equal(command.safeParse({ ...base, ...bad }).success, false, JSON.stringify(bad));
  assert.equal(command.parse({ ...base, after: "abc" }).after, "abc");
});

// —— 集成：假 SDK 源，真实 Sessions ——
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

const append = (sessions, id, records) => {
  for (const record of records)
    sessions.get(id).emit({ type: "agent.message.end", agentId: record.agentId, data: { message: record.message, entryId: record.entryId } });
};

test("分页响应是薄投影：页窗口 + 稳定游标 + 修订号，且不 leak 服务端对象", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    append(sessions, id, build(140));
    const item = sessions.get(id);
    const serverHistory = JSON.stringify(item.messages);
    const sdkContext = JSON.stringify(item.agent.state.messages);

    const last = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
    assert.equal(last.messages.length, 60);
    assert.equal(last.messages[0].entryId, "e80");
    assert.equal(last.history.total, 140);
    assert.equal(last.history.start, 80);
    assert.equal(last.instanceId, "inst");
    assert.equal(last.revision, item.history.revision);
    assert.equal(last.history.nextCursor, null);
    assert.equal("seq" in last, false, "分页响应不带水位");
    assert.equal(last.messages[0] !== item.messages[80], true);
    assert.equal(last.messages[0].message !== item.messages[80].message, true);

    const older = await sessions.history(id, { before: last.history.prevCursor, limit: 60 }, "inst");
    assert.equal(older.messages[0].entryId, "e20");
    assert.equal(older.history.nextCursor, last.history.prevCursor, "往回翻的 next 指回刚才那页边界");

    // attach 仍带水位（前端要 commitSnapshot），其余形状与分页一致。
    const attach = sessions.snapshot(id, { epoch: "inst", includeSeq: true, window: { edge: "last", limit: 60 } });
    assert.equal(attach.seq, item.seq);
    assert.equal(attach.messages.length, 60);

    // 内部全量契约不变：不带 window 时仍是整段历史（且是副本）。
    const full = sessions.snapshot(id);
    assert.equal(full.messages.length, 140);
    assert.equal("history" in full, false);
    assert.notEqual(full.messages, item.messages);
    // 分页不改服务端历史，也不碰 SDK 上下文。
    assert.equal(JSON.stringify(item.messages), serverHistory);
    assert.equal(JSON.stringify(item.agent.state.messages), sdkContext);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("活动流身份：start 事件的 messageId 与快照 liveMessageIds 对得上，旧页不带 live", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-live-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    append(sessions, id, build(140));
    const seen = [];
    sessions.subscribe(id, (event) => seen.push(event));
    sessions.get(id).emit({ type: "agent.message.start", agentId: "main", data: { message: { role: "assistant", content: [] } } });
    const started = seen.find((event) => event.type === "agent.message.start");
    assert.ok(started.data.messageId, "流式开始就带临时身份");

    const latest = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
    assert.equal(latest.liveMessageIds.main, started.data.messageId);
    assert.deepEqual(Object.keys(latest.live), ["main"]);
    const older = await sessions.history(id, { edge: "first", limit: 60 }, "inst");
    assert.deepEqual(older.live, {}, "旧页没有正在流的消息");
    assert.deepEqual(older.liveMessageIds, {});

    // 结束事件沿用同一身份（无 entryId 时不会换 id，前端 rawLive 槽位才接得上）。
    sessions.get(id).emit({ type: "agent.message.end", agentId: "main", data: { message: { role: "assistant", content: "ok" } } });
    const ended = seen.find((event) => event.type === "agent.message.end");
    assert.equal(ended.data.messageId, started.data.messageId);
    assert.equal(sessions.get(id).messages.at(-1).messageId, started.data.messageId);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("分页只带本页引用到的已完成元数据（工具/任务/压缩/重试）", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-meta-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    const records = build(140);
    // 页内引用面：主代理的 delegate 结果（声明 taskD）、子代理 taskA 自己的消息、工具 t-in 的调用与结果。
    records[100] = { agentId: "main", entryId: "e100", message: { role: "toolResult", toolName: "delegate", toolCallId: "t-delegate",
      content: [{ type: "text", text: JSON.stringify({ taskIds: ["taskD"] }) }] } };
    records[101] = { agentId: "taskA", entryId: "e101", message: { role: "assistant", content: [{ type: "toolCall", id: "t-in", name: "read", arguments: {} }] } };
    records[102] = { agentId: "main", entryId: "e102", message: { role: "toolResult", toolName: "read", toolCallId: "t-in", content: [] } };
    append(sessions, id, records);

    const item = sessions.get(id);
    for (const [key, tool] of Object.entries({
      "main:t-in": { agentId: "main", toolCallId: "t-in", phase: "end" },
      "main:t-out": { agentId: "main", toolCallId: "t-out", phase: "end" },
      "main:t-live": { agentId: "main", toolCallId: "t-live", phase: "start" },
    })) item.tools[key] = tool;
    for (const job of [
      { id: "taskA", task: "A", status: "completed", text: "", error: "", historySaved: true },
      { id: "taskD", task: "D", status: "completed", text: "", error: "", historySaved: true },
      { id: "taskB", task: "B", status: "completed", text: "", error: "", historySaved: true },
      { id: "taskC", task: "C", status: "running", text: "", error: "", historySaved: true },
    ]) item.tasks.jobs.set(job.id, job);
    item.compactions.push({ id: "c-in", compactedMessageIds: ["e100"] }, { id: "c-out", compactedMessageIds: ["e0"] });
    item.retries.push(
      { agentId: "main", id: "r-in", messageCount: 120, status: "succeeded" },
      { agentId: "main", id: "r-out", messageCount: 5, status: "succeeded" },
      { agentId: "taskA", id: "r-anchor", anchorEntryId: "e101", status: "failed" },
      { agentId: "main", id: "r-lost", messageCount: 999, status: "failed" },
    );

    const page = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
    assert.deepEqual(Object.keys(page.tools).sort(), ["main:t-in", "main:t-live"], "只留页内引用与仍在跑的工具");
    assert.deepEqual(page.tasks.map((task) => task.id).sort(), ["taskA", "taskC", "taskD"], "页内 agent / spawn 关联 / 在跑任务");
    assert.deepEqual(page.compactions.map((record) => record.id), ["c-in"], "压缩卡只留交集本页的");
    assert.deepEqual(page.retries.map((record) => [record.id, record.messageCount]), [["r-in", 40], ["r-anchor", undefined]], "重试位置换算成页内下标");

    // 翻到第一页：只剩第一页引用到的（压缩 c-out 命中，delegate 与 taskA 都不在）。
    const first = await sessions.history(id, { edge: "first", limit: 60 }, "inst");
    assert.deepEqual(first.compactions.map((record) => record.id), ["c-out"]);
    assert.deepEqual(first.tasks.map((task) => task.id), ["taskC"], "在跑任务不因窗口外消失");
    assert.deepEqual(first.retries.map((record) => record.id), ["r-out"]);
    assert.deepEqual(Object.keys(first.tools), ["main:t-live"], "只有在跑的工具跨页保留");
    // 内部全量快照不裁剪。
    const full = sessions.snapshot(id);
    assert.equal(full.tools["main:t-out"]?.phase, "end");
    assert.equal(full.tasks.length, 4);
    assert.equal(full.retries.length, 4);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("订阅先于加载：create 替换条目后 listener 仍然在册（事件一个不漏）", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-sub-"));
  const storage = join(root, "sessions");
  const first = new Sessions(fakeSource(), undefined, storage);
  let restored;
  try {
    const id = await first.create(root);
    append(first, id, build(3));
    await first.close();

    restored = new Sessions(fakeSource(), undefined, storage);
    await restored.load();
    const received = [];
    restored.subscribe(id, (event) => received.push(event));
    await restored.ensureLoaded(id);
    restored.get(id).emit({ type: "agent.message.end", data: { message: { role: "user", content: "after-load" }, entryId: "post" } });
    assert.equal(received.filter((event) => event.type === "agent.message.end").length, 1);
    assert.equal(received.at(-1).sessionId, id);
  } finally { await restored?.close(); await first.close(); await rm(root, { recursive: true, force: true }); }
});

test("撤回/压缩换号：旧游标作废并广播 session.history.changed", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-revision-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    append(sessions, id, build(140));
    const received = [];
    sessions.subscribe(id, (event) => received.push(event));
    const cursor = (await sessions.history(id, { edge: "last", limit: 60 }, "inst")).history.prevCursor;

    sessions.get(id).emit({ type: "agent.compaction", agentId: "main", data: { id: "c1", compactedMessageIds: ["e0"] } });
    const changed = received.find((event) => event.type === "session.history.changed");
    assert.equal(changed.data.reason, "compaction");
    assert.equal(changed.data.revision, sessions.get(id).history.revision);
    await assert.rejects(sessions.history(id, { before: cursor, limit: 60 }, "inst"), /历史已变更/);
    const fresh = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
    assert.equal(fresh.revision, changed.data.revision);
    assert.equal(fresh.messages.length, 60);

    // 撤回同样换号：先补一条可撤回的主代理输入。
    sessions.get(id).emit({ type: "agent.message.end", data: { message: { role: "user", content: "改一下" }, entryId: "u1" } });
    const before = (await sessions.history(id, { edge: "last", limit: 60 }, "inst")).history.prevCursor;
    const recalled = await sessions.withdraw(id, true);
    assert.equal(recalled.recalled.entryId, "u1");
    assert.equal(recalled.revision, sessions.get(id).history.revision);
    assert.equal(received.filter((event) => event.type === "session.history.changed" && event.data.reason === "recall").length, 1);
    await assert.rejects(sessions.history(id, { before, limit: 60 }, "inst"), /历史已变更/);
    assert.equal(sessions.get(id).messages.some((record) => record.entryId === "u1"), false);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("跨页遍历经由 session.history 不重不漏，追加后仍稳定", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-walk-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    append(sessions, id, build(155));
    const seen = [];
    let page = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
    while (page) {
      seen.unshift(...page.messages.map((record) => record.entryId));
      page = page.history.prevCursor ? await sessions.history(id, { before: page.history.prevCursor, limit: 60 }, "inst") : null;
    }
    assert.deepEqual(seen, build(155).map((record) => record.entryId));

    // 追加后旧游标仍指向同一条消息：翻到的页不变。
    const newest = await sessions.history(id, { edge: "last", limit: 60 }, "inst");
    const older = await sessions.history(id, { before: newest.history.prevCursor, limit: 60 }, "inst");
    append(sessions, id, build(5).map((record, index) => ({ ...record, entryId: `x${index}` })));
    const again = await sessions.history(id, { before: newest.history.prevCursor, limit: 60 }, "inst");
    assert.deepEqual(again.messages.map((record) => record.entryId), older.messages.map((record) => record.entryId));
    assert.equal(again.history.total, 160);
    // 同一边界重复请求（含追加之后）游标恒等：边界身份是消息，不是会漂的下标。
    const repeat = await sessions.history(id, { before: newest.history.prevCursor, limit: 60 }, "inst");
    assert.equal(repeat.history.prevCursor, again.history.prevCursor);
    assert.equal(again.history.nextCursor !== null, true, "原最新页变成中间页后才有更新方向");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});
