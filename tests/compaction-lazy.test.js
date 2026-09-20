import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

// 压缩折叠的语义：快照把被摘要覆盖的历史裁成精简版（只留用户输入与正式答复），完整原文在前端点开摘要卡时按 compactionId 取。
// 这里直接驱动 Sessions 的事件入口构造历史，覆盖折叠投影、下标换算、按段取原文三件事。

const factory = async () => ({
  config: () => ({ model: "test/one", thinking: "off", levels: ["off"] }),
  subscribe: () => () => {},
  abort: async () => {},
  dispose: async () => {},
  historyEntries: () => [],
  compactions: () => [],
});
factory.catalog = () => [{ key: "test/one" }];

const withSession = async (body) => {
  const root = await mkdtemp(join(tmpdir(), "axiom-lazy-"));
  const sessions = new Sessions(factory, undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    await body(sessions, sessions.get(id), id);
  } finally {
    await sessions.close();
    await rm(root, { recursive: true, force: true });
  }
};

const sayMain = (item, entryId, content, role = "assistant") =>
  item.emit({ type: "agent.message.end", data: { entryId, message: { role, content } } });

test("快照折叠压缩段：段内用户输入保留为精简版，工具结果与子代理记录不下发，折叠前下标与总数照旧", async () => {
  await withSession(async (sessions, item, id) => {
    sayMain(item, "m1", "第一轮提问", "user");
    // delegate 结果声明子任务：投影会把子代理历史挂到这条锚点之后。
    item.emit({ type: "agent.message.end", data: { entryId: "m2", message: { role: "toolResult", toolName: "delegate", toolCallId: "t1", content: [{ type: "text", text: JSON.stringify({ taskIds: ["task-a"] }) }] } } });
    item.emit({ type: "agent.message.end", agentId: "task-a", data: { entryId: "s1", message: { role: "assistant", content: "子代理输出" } } });
    sayMain(item, "m3", "压缩后仍保留");
    item.emit({ type: "agent.compaction", data: { id: "c1", summary: "摘要", compactedMessageIds: ["m1", "m2"], firstKeptEntryId: "m3" } });

    const state = sessions.snapshot(id);
    assert.deepEqual(state.messages.map((entry) => entry.entryId), ["m1", "m3"], "段内用户输入留下，工具结果与子代理记录不下发");
    assert.equal(state.messages[0].compacted, true, "精简版带标记，前端才能按节选渲染");
    assert.equal(state.messages[1].compacted, undefined, "未被压缩的消息不带标记");
    // 折叠前下标必须照旧：前端按历史下标登记目标轮次锚点。
    assert.deepEqual(state.messageIndexes, [0, 3]);
    assert.equal(state.messageCount, 4);
    assert.deepEqual(state.compactions.map((record) => record.id), ["c1"]);
  });
});

test("精简版只留展示正文：助手取 axiom_display 内的答复，纯过程轮次整条不下发", async () => {
  await withSession(async (sessions, item, id) => {
    sayMain(item, "m1", "第一轮提问", "user");
    // 带标签的回复：只留标签内正文，过程说明与记忆标签都不下发。
    sayMain(item, "m2", "先查了一圈代码。\n<axiom_display>\n已修好。\n</axiom_display>");
    // 纯工具轮次（无正文）：没有可展示的内容，整条跟着摘要卡走。
    item.emit({ type: "agent.message.end", data: { entryId: "m3", message: { role: "assistant", content: [{ type: "thinking", thinking: "想一想" }, { type: "toolCall", id: "t1", name: "read", arguments: {} }] } } });
    sayMain(item, "m4", "压缩后仍保留");
    item.emit({ type: "agent.compaction", data: { id: "c1", summary: "摘要", compactedMessageIds: ["m1", "m2", "m3"], firstKeptEntryId: "m4" } });

    const state = sessions.snapshot(id);
    assert.deepEqual(state.messages.map((entry) => entry.entryId), ["m1", "m2", "m4"], "纯过程轮次 m3 不下发");
    assert.deepEqual(state.messages[1].message.content, [{ type: "text", text: "已修好。" }], "助手精简版只留正式答复正文");
    assert.deepEqual(state.messageIndexes, [0, 1, 3]);
  });
});

test("精简版保留用户附件，内部任务通知不当作用户输入", async () => {
  await withSession(async (sessions, item, id) => {
    item.emit({ type: "agent.message.end", data: { entryId: "m1", message: { role: "user", content: [{ type: "text", text: "看这张图" }, { type: "image", mimeType: "image/png", data: "AAAA" }] } } });
    sayMain(item, "m2", "[Axiom 子任务完成通知] task-a 已结束", "user");
    sayMain(item, "m3", "压缩后仍保留");
    item.emit({ type: "agent.compaction", data: { id: "c1", summary: "摘要", compactedMessageIds: ["m1", "m2"], firstKeptEntryId: "m3" } });

    const state = sessions.snapshot(id);
    assert.deepEqual(state.messages.map((entry) => entry.entryId), ["m1", "m3"], "任务通知不进精简版");
    assert.deepEqual(state.messages[0].message.content, [{ type: "text", text: "看这张图" }, { type: "image", mimeType: "image/png", data: "AAAA" }], "附件原样保留");
  });
});

test("按 compactionId 取回折叠段：含子代理记录与其工具，主工具不夹带", async () => {
  await withSession(async (sessions, item, id) => {
    sayMain(item, "m1", "第一轮提问", "user");
    item.emit({ type: "agent.message.end", data: { entryId: "m2", message: { role: "toolResult", toolName: "delegate", toolCallId: "t1", content: [{ type: "text", text: JSON.stringify({ taskIds: ["task-a"] }) }] } } });
    item.emit({ type: "agent.message.end", agentId: "task-a", data: { entryId: "s1", message: { role: "assistant", content: [{ type: "toolCall", id: "t2", name: "bash", arguments: {} }] } } });
    item.emit({ type: "tool.state", agentId: "task-a", data: { toolCallId: "t2", toolName: "bash", phase: "end", output: "子代理工具输出" } });
    item.emit({ type: "tool.state", data: { toolCallId: "t1", toolName: "delegate", phase: "end", output: "主工具输出" } });
    sayMain(item, "m3", "压缩后仍保留");
    item.emit({ type: "agent.compaction", data: { id: "c1", summary: "摘要", compactedMessageIds: ["m1", "m2"], firstKeptEntryId: "m3" } });

    const segment = await sessions.compactionMessages(id, "c1");
    assert.deepEqual(segment.messages.map((entry) => entry.entryId), ["m1", "m2", "s1"], "段内按投影顺序返回，子代理记录跟着锚点");
    assert.deepEqual(Object.keys(segment.tools), ["task-a:t2"], "只补子代理工具：折叠段的主消息不重绘，主工具没有落位处");
    await assert.rejects(sessions.compactionMessages(id, "missing"), /找不到该压缩摘要/);
  });
});

test("锚点落在折叠段里的重试卡：快照滤掉、展开时随原文补发且不带下标", async () => {
  await withSession(async (sessions, item, id) => {
    sayMain(item, "m1", "第一轮提问", "user");
    item.emit({ type: "agent.retry", data: { id: "retry-1", status: "waiting", attempt: 1, delayMs: 2000, error: "429" } });
    item.emit({ type: "agent.retry", data: { id: "retry-1", status: "succeeded", attempt: 1 } });
    sayMain(item, "m2", "压缩后仍保留");
    item.emit({ type: "agent.retry", data: { id: "retry-2", status: "succeeded", attempt: 1 } });
    item.emit({ type: "agent.compaction", data: { id: "c1", summary: "摘要", compactedMessageIds: ["m1"], firstKeptEntryId: "m2" } });

    const state = sessions.snapshot(id);
    assert.deepEqual(state.retries.map((record) => record.id), ["retry-2"], "锚点被折叠的重试卡不下发");
    assert.equal(state.retries[0].anchorEntryId, "m2");
    const segment = await sessions.compactionMessages(id, "c1");
    assert.deepEqual(segment.retries.map((record) => record.id), ["retry-1"]);
    // 展开补发的重试卡只靠锚点归位：下发数组里没有对应槽位，下标会指错。
    assert.equal("messageCount" in segment.retries[0], false);
    assert.equal(segment.retries[0].anchorEntryId, "m1");
  });
});

test("未加载会话也能按段取原文：走 JSONL 只读投影，不唤起 SDK 实例", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-lazy-"));
  const storage = join(root, "sessions");
  const file = join(root, "main.jsonl");
  await writeFile(file, [
    { type: "session", version: 3, id: "pi-1", timestamp: "t", cwd: root },
    { type: "message", id: "m1", parentId: null, timestamp: "t", message: { role: "user", content: [{ type: "text", text: "折叠掉的提问" }] } },
    { type: "message", id: "m2", parentId: "m1", timestamp: "t", message: { role: "assistant", content: [{ type: "text", text: "保留的回答" }] } },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  let created = 0;
  const counting = async (...args) => { created++; return factory(...args); };
  counting.catalog = factory.catalog;
  let restored;
  const sessions = new Sessions(counting, undefined, storage);
  try {
    const id = await sessions.create(root);
    const item = sessions.get(id);
    item.emit({ type: "agent.message.end", data: { entryId: "m1", message: { role: "user", content: "折叠掉的提问" } } });
    item.sessionFile = file;
    sessions.saveChange(item, { session: { sessionFile: file } });
    item.emit({ type: "agent.compaction", data: { id: "c1", summary: "摘要", compactedMessageIds: ["m1"], firstKeptEntryId: "m2" } });
    await item.saving;
    await sessions.close();

    restored = new Sessions(counting, undefined, storage);
    await restored.load();
    const before = created;
    // 冷快照同样按折叠投影：段内用户输入留精简版，完整原文展开才按段取。
    assert.deepEqual(restored.snapshot(id).messages.map((entry) => entry.entryId), ["m1", "m2"]);
    assert.equal(restored.snapshot(id).messages[0].compacted, true);
    const segment = await restored.compactionMessages(id, "c1");
    assert.deepEqual(segment.messages.map((entry) => entry.entryId), ["m1"]);
    assert.equal(created, before, "冷会话只读 JSONL，不创建 SDK 实例");
    assert.notEqual(restored.get(id).loaded, true);
  } finally {
    await restored?.close();
    await rm(root, { recursive: true, force: true });
  }
});
