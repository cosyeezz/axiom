import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";
import { command } from "../src/protocol.js";

// 造历史：entryId 即身份（跨重启稳定），message 只是负载。
const build = (count) => Array.from({ length: count }, (_, index) => ({
  agentId: "main", entryId: `e${index}`, message: { role: index % 2 ? "assistant" : "user", content: `m${index}` },
}));

test("协议面：历史分页命令已下线，附件只剩快照与压缩取原文", () => {
  const base = { id: "r", type: "session.history", sessionId: "s" };
  for (const options of [{ edge: "last", limit: 60 }, { after: "abc" }, { before: "abc" }, { target: "e1" }, {}])
    assert.equal(command.safeParse({ ...base, ...options }).success, false, JSON.stringify(options));
  assert.equal(command.parse({ id: "r", type: "session.attach", sessionId: "s" }).type, "session.attach");
  assert.equal(command.parse({ id: "r", type: "session.compaction.messages", sessionId: "s", compactionId: "c1" }).compactionId, "c1");
  assert.equal(command.safeParse({ id: "r", type: "session.compaction.messages", sessionId: "s" }).success, false, "compactionId 必填");
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

test("快照是全量薄投影：整段历史 + 水位，且不 leak 服务端对象", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    append(sessions, id, build(140));
    const item = sessions.get(id);
    const serverHistory = JSON.stringify(item.messages);
    const sdkContext = JSON.stringify(item.agent.state.messages);

    const state = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
    assert.equal(state.messages.length, 140, "一次下发整段历史，不再分页");
    assert.equal(state.messages[0].entryId, "e0");
    assert.equal(state.messages.at(-1).entryId, "e139");
    assert.equal(state.messageCount, 140);
    assert.deepEqual(state.messageIndexes, build(140).map((_, index) => index), "无压缩时下标与历史一致");
    assert.equal(state.instanceId, "inst");
    assert.equal(state.seq, item.seq, "attach 带水位（前端要 commitSnapshot）");
    assert.equal("history" in state, false, "不再有分页元数据");
    assert.equal(state.messages[0] !== item.messages[0], true);
    assert.equal(state.messages[0].message !== item.messages[0].message, true);

    // 不带 includeSeq 的内部快照同样是整段历史副本，且不碰服务端历史与 SDK 上下文。
    const full = sessions.snapshot(id);
    assert.equal(full.messages.length, 140);
    assert.equal("seq" in full, true, "内部快照仍带 seq 字段");
    assert.notEqual(full.messages, item.messages);
    assert.equal(JSON.stringify(item.messages), serverHistory);
    assert.equal(JSON.stringify(item.agent.state.messages), sdkContext);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("活动流身份：start 事件的 messageId 与快照 liveMessageIds 对得上", async () => {
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

    const state = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
    assert.equal(state.liveMessageIds.main, started.data.messageId);
    assert.deepEqual(Object.keys(state.live), ["main"]);

    // 结束事件沿用同一身份（无 entryId 时不会换 id，前端 rawLive 槽位才接得上）。
    sessions.get(id).emit({ type: "agent.message.end", agentId: "main", data: { message: { role: "assistant", content: "ok" } } });
    const ended = seen.find((event) => event.type === "agent.message.end");
    assert.equal(ended.data.messageId, started.data.messageId);
    assert.equal(sessions.get(id).messages.at(-1).messageId, started.data.messageId);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("快照元数据：任务与压缩全量，工具只留引用到的与在跑的", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-meta-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    const records = build(140);
    records[99] = { agentId: "main", entryId: "e99", message: { role: "toolResult", toolName: "delegate", toolCallId: "t-delegate-a",
      content: [{ type: "text", text: JSON.stringify({ taskIds: ["taskA"] }) }] } };
    records[101] = { agentId: "taskA", entryId: "e101", message: { role: "assistant", content: [{ type: "toolCall", id: "t-in", name: "read", arguments: {} }] } };
    records[102] = { agentId: "main", entryId: "e102", message: { role: "toolResult", toolName: "read", toolCallId: "t-in", content: [] } };
    append(sessions, id, records);

    const item = sessions.get(id);
    for (const [key, tool] of Object.entries({
      "main:t-in": { agentId: "main", toolCallId: "t-in", phase: "end" },
      "main:t-gone": { agentId: "main", toolCallId: "t-gone", phase: "end" },
      "main:t-live": { agentId: "main", toolCallId: "t-live", phase: "start" },
    })) item.tools[key] = tool;
    for (const job of [
      { id: "taskA", task: "A", status: "completed", text: "", error: "", historySaved: true },
      { id: "taskC", task: "C", status: "running", text: "", error: "", historySaved: true },
    ]) item.tasks.jobs.set(job.id, job);
    item.compactions.push({ id: "c-old", compactedMessageIds: [] });
    item.retries.push(
      { agentId: "main", id: "r-mid", messageCount: 120, status: "succeeded" },
      { agentId: "taskA", id: "r-anchor", anchorEntryId: "e101", status: "failed" },
      { agentId: "main", id: "r-tail", messageCount: 999, status: "failed" },
    );

    const state = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
    // 工具仍裁剪：历史里没有调用/结果引用、也没在跑的工具记录不必下发。
    assert.deepEqual(Object.keys(state.tools).sort(), ["main:t-in", "main:t-live"]);
    // 任务恒全量：委派锚点可能落在压缩折叠段里，裁了摘要卡内就打不开任务。
    assert.deepEqual(state.tasks.map((task) => task.id).sort(), ["taskA", "taskC"]);
    assert.deepEqual(state.compactions.map((record) => record.id), ["c-old"]);
    // 重试位置换算成下发数组内的下标；到达序越界的位置收敛到历史末尾（锚在最后一条之后）。
    assert.deepEqual(state.retries.map((record) => [record.id, record.messageCount]),
      [["r-mid", 120], ["r-anchor", undefined], ["r-tail", 140]]);
    assert.equal(state.messages[119].entryId, "e119", "messageCount 指向下发数组内的位置");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("缺参的 tool.state end 不清掉 start 带上的 args，快照仍带参数", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-tool-args-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    const records = build(3);
    records[1] = { agentId: "main", entryId: "e1", message: { role: "assistant",
      content: [{ type: "toolCall", id: "t-args", name: "read", arguments: { path: "a.txt" } }] } };
    append(sessions, id, records);
    const item = sessions.get(id);
    item.emit({ type: "tool.state", agentId: "main", data: { toolCallId: "t-args", name: "read", phase: "start", args: { path: "a.txt" } } });
    item.emit({ type: "tool.state", agentId: "main", data: { toolCallId: "t-args", name: "read", phase: "end", result: "ok" } });
    const state = sessions.snapshot(id, { epoch: "inst", includeSeq: true });
    assert.deepEqual(state.tools["main:t-args"].args, { path: "a.txt" }, "end 事件不带 args 时保留 start 的参数");
    assert.equal(state.tools["main:t-args"].phase, "end");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("撤回改写历史：广播 session.history.reset 让各端重取快照", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-recall-"));
  const sessions = new Sessions(fakeSource(), undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    append(sessions, id, build(20));
    const received = [];
    sessions.subscribe(id, (event) => received.push(event));
    sessions.get(id).emit({ type: "agent.message.end", data: { message: { role: "user", content: "改一下" }, entryId: "u1" } });

    const recalled = await sessions.withdraw(id, true);
    assert.equal(recalled.recalled.entryId, "u1");
    const resets = received.filter((event) => event.type === "session.history.reset");
    assert.equal(resets.length, 1, "真撤回才广播一次");
    assert.equal(resets[0].data.reason, "recall");
    assert.equal(sessions.get(id).messages.some((record) => record.entryId === "u1"), false);
    assert.equal(sessions.snapshot(id, { epoch: "inst", includeSeq: true }).messages.length, 20, "重取快照已不含被撤回的输入");
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

// —— Desktop 只读历史：从 JSONL 文件构建，不触磁盘（含空文件与旧版本迁移）。——
// 复用顶部已导入的 tmpdir/join；只补 fs 同步版与只读函数。
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { readSessionHistory } from "../src/session-history.js";

test("未加载会话取快照不创建 SDK，身份/水位/元数据遵守同一协议", () => {
  const root = mkdtempSync(join(tmpdir(), "axiom-history-cold-")), file = join(root, "history.jsonl");
  try {
    const text = [{ type: "session", version: 3, id: "s", cwd: root, timestamp: new Date().toISOString() },
      ...build(120).map((record, index) => ({ type: "message", id: record.entryId,
        parentId: index ? `e${index - 1}` : null, message: record.message }))].map(JSON.stringify).join("\n");
    writeFileSync(file, text);
    const item = { loaded: false, cwd: root, title: "历史", seq: 7 };
    const sessions = Object.create(Sessions.prototype);
    sessions.get = () => item;
    sessions.ensureLoaded = () => { throw new Error("不得初始化 SDK"); };
    sessions.goalStore = { load: () => null };
    sessions.store = { getSession: () => ({ sessionFile: file, cwd: root, tasks: [{ id: "outside", status: "completed" }],
      compactions: [], retries: [{ messageCount: 1 }] }) };
    const state = sessions.snapshot("s", { epoch: "inst", includeSeq: true });
    assert.equal(state.sessionId, "s");
    assert.equal(state.seq, 7);
    assert.equal(state.messages.length, 120, "冷路径也一次下发整段历史");
    assert.equal(state.messages[0].messageId, "e0");
    assert.equal(state.runtime.context.estimated, true);
    assert.ok(state.runtime.context.tokens > 0);
    assert.equal(state.runtime.billing.records, 0);
    assert.deepEqual(state.compactions, []);
    assert.deepEqual(state.tasks.map((task) => task.id), ["outside"], "任务恒全量");
    assert.deepEqual(state.retries.map((record) => record.messageCount), [1]);
    assert.equal(item.loaded, false);
    assert.equal(readFileSync(file, "utf8"), text);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("历史只读：当前分支、空文件和旧版本不改写磁盘", () => {
  const root = mkdtempSync(join(tmpdir(), "axiom-history-")), file = join(root, "history.jsonl");
  try {
    const text = [
      { type: "session", version: 3, id: "test", cwd: root, timestamp: new Date().toISOString() },
      { type: "message", id: "a", parentId: null, message: { role: "user", content: "hello" } },
      { type: "message", id: "b", parentId: "a", message: { role: "assistant", content: [] } },
      { type: "message", id: "c", parentId: "a", message: { role: "user", content: "branch" } },
    ].map(JSON.stringify).join("\n");
    writeFileSync(file, text);
    assert.deepEqual(readSessionHistory(file, root).map(entry => entry.id), ["a", "c"]);
    assert.equal(readFileSync(file, "utf8"), text);
    const legacy = text.replace('"version":3', '"version":2');
    writeFileSync(file, legacy);
    readSessionHistory(file, root);
    assert.equal(readFileSync(file, "utf8"), legacy);
    writeFileSync(file, "");
    assert.throws(() => readSessionHistory(file, root), /头部/);
    assert.equal(readFileSync(file, "utf8"), "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
