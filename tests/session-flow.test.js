import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, mkdir, writeFile, symlink, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Sessions } from "../src/sessions.js";

test("sessions persist across shutdown, queue by type, switch models while running, and delete on disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-flow-"));
  const storage = join(root, "sessions");
  const factory = async (_, selection) => {
    let model = selection.model || "test/one", listener, finish;
    const queue = { steering: [], followUp: [] };
    return {
      config: () => ({ model, thinking: "off", levels: ["off"] }),
      configure: async (next) => { model = next.model; return { model }; },
      subscribe: (fn) => { listener = fn; return () => {}; },
      prompt: (text) => { listener({ type: "agent.message.end", data: { message: { role: "user", content: text } } }); return new Promise((resolve) => { finish = resolve; }); },
      enqueue: async (text, type) => { queue[type === "steer" ? "steering" : "followUp"].push(text); },
      queue: () => queue,
      withdraw: () => { const old = structuredClone(queue); queue.steering = []; queue.followUp = []; return old; },
      abort: async () => { finish?.(); }, result: () => "ok", dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "test/one" }, { key: "test/two" }];
  try {
    const first = new Sessions(factory, undefined, storage);
    const id = await first.create(root);
    await mkdir(join(root, "src"));
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "src", "hello.txt"), "hello");
    assert.equal((await first.browse(id)).entries.some((entry) => entry.name === ".git"), false);
    assert.deepEqual((await first.browse(id, "src")).entries, [{ name: "hello.txt", directory: false, path: "src/hello.txt" }]);
    await assert.rejects(first.browse(id, ".."), /只能浏览当前工作空间/);
    await assert.rejects(first.browse(id, "missing"));
    await first.prompt(id, "hello");
    await first.configure(id, { model: "test/two", queueType: "followUp" });
    assert.equal(first.get(id).status, "running");
    await first.prompt(id, "later");
    await first.prompt(id, "now", "steer");
    assert.deepEqual(first.snapshot(id).queue, { steering: ["now"], followUp: ["later"] });
    assert.deepEqual(first.get(id).agent.withdraw(), { steering: ["now"], followUp: ["later"] });
    assert.deepEqual(first.snapshot(id).queue, { steering: [], followUp: [] });
    first.get(id).emit({ type: "agent.retry", agentId: "main", data: { id: "retry-1", status: "waiting", attempt: 1, delayMs: 96000, error: "429" } });
    first.get(id).emit({ type: "agent.retry", agentId: "child", data: { id: "retry-1", status: "succeeded", attempt: 2 } });
    assert.equal(first.snapshot(id).retries.length, 2, "main and child retries are isolated");
    const position = first.get(id).messages.length;
    first.get(id).emit({ type: "agent.retry", data: { id: "finished", status: "waiting", attempt: 1, delayMs: 2000, nextRetryAt: 12345, error: "network" } });
    first.get(id).emit({ type: "agent.message.end", data: { message: { role: "assistant", content: "done" } } });
    first.get(id).emit({ type: "agent.retry", data: { id: "finished", status: "succeeded", attempt: 1 } });
    const finished = first.snapshot(id).retries[2];
    assert.equal(finished.messageCount, position);
    for (const field of ["error", "delayMs", "nextRetryAt"]) assert.equal(field in finished, false);
    assert.equal(finished.history[0].error, "network");
    await first.rename(id, "saved name");
    await first.close();
    const restored = new Sessions(factory, undefined, storage);
    await restored.load();
    const state = restored.snapshot(id);
    assert.equal(state.title, "saved name");
    assert.equal(state.config.model, "test/two");
    assert.equal(state.config.queueType, "followUp");
    assert.equal(state.messages[0].message.content, "hello");
    assert.equal(state.status, "idle");
    assert.equal(state.retries[0].status, "cancelled");
    assert.equal(state.retries[0].history[0].delayMs, 96000);
    assert.equal(state.retries[1].status, "succeeded");
    assert.equal(state.retries[2].messageCount, position);
    assert.equal(state.retries[2].error, undefined);
    await restored.remove(id);
    const [workspace] = await readdir(storage);
    assert.deepEqual(await readdir(join(storage, workspace)), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const flowFactory = async () => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {},
  queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
  abort: async () => {}, result: () => "ok", dispose: async () => {},
});
flowFactory.catalog = () => [{ key: "test/one" }];

// 带 JSONL 落盘历史的工厂：entry.timestamp（ISO，消费时写入）与 message.timestamp（入队毫秒）刻意背离。
const jsonlFactory = () => {
  const factory = async () => ({
    config: () => ({ model: "test/one", thinking: "off" }),
    subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {},
    queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
    abort: async () => {}, result: () => "ok", dispose: async () => {},
    historyEntries: () => [
      { id: "a1", timestamp: "2026-01-01T00:00:00.100Z" },
      { id: "u1", timestamp: "2026-01-01T00:00:00.900Z" },
    ],
  });
  factory.catalog = () => [{ key: "test/one" }];
  return factory;
};

test("new retries carry the nearest same-agent entryId and broadcast position in event.data", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-retry-anchor-"));
  const sessions = new Sessions(flowFactory, undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root);
    const seen = [];
    sessions.subscribe(id, (event) => seen.push(event));
    const item = sessions.get(id);
    item.emit({ type: "agent.message.end", data: { message: { role: "user", content: "hi" }, entryId: "u1" } });
    item.emit({ type: "agent.message.end", agentId: "child", data: { message: { role: "assistant", content: [] }, entryId: "c1" } });
    item.emit({ type: "agent.retry", data: { id: "r1", status: "waiting", attempt: 1, delayMs: 2000, nextRetryAt: 3000, error: "429" } });
    item.emit({ type: "agent.retry", agentId: "child", data: { id: "r2", status: "waiting", attempt: 1, delayMs: 2000, nextRetryAt: 3000, error: "429" } });
    const broadcast = seen.filter((event) => event.type === "agent.retry").map((event) => event.data);
    assert.deepEqual(broadcast, [
      { id: "r1", status: "waiting", attempt: 1, delayMs: 2000, nextRetryAt: 3000, error: "429", messageCount: 2, anchorEntryId: "u1" },
      { id: "r2", status: "waiting", attempt: 1, delayMs: 2000, nextRetryAt: 3000, error: "429", messageCount: 2, anchorEntryId: "c1" },
    ]);
    assert.deepEqual(sessions.snapshot(id).retries.map((r) => [r.messageCount, r.anchorEntryId]), [[2, "u1"], [2, "c1"]]);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("legacy retries migrate from persisted entry timestamps, never from queue-time message timestamps", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-retry-jsonl-"));
  const sessions = new Sessions(jsonlFactory(), undefined, join(root, "storage"));
  try {
    // 排队 user 的 message.timestamp(150) 早于重试起点(500)，但落盘时间(900)晚于起点：
    // 边界必须按消费时间落在它之前，重试卡不得被排队消息推到末尾。
    const id = await sessions.create(root, {}, { id: "queued", messages: [
      { agentId: "main", entryId: "a1", message: { role: "assistant", content: [], stopReason: "error", timestamp: 100 } },
      { agentId: "main", entryId: "u1", message: { role: "user", content: "排队插话", timestamp: 150 } },
    ], retries: [{ id: "r", agentId: "main", status: "succeeded", attempt: 1,
      history: [{ attempt: 1, nextRetryAt: Date.parse("2026-01-01T00:00:02.500Z"), delayMs: 2000 }] }] });
    const [record] = sessions.snapshot(id).retries;
    assert.equal(record.messageCount, 1);
    assert.equal(record.anchorEntryId, "a1", "锚点补最近同代理带 entryId 的消息");
    // 落盘历史里查不到的 entryId 不能猜；有 JSONL 但时间线不自洽时也不用助手边界。
    const other = await sessions.create(root, {}, { id: "strict", messages: [
      { agentId: "main", message: { role: "assistant", content: [], stopReason: "error", timestamp: 100 } },
    ], retries: [{ id: "r", agentId: "main", status: "failed", attempt: 1, error: "x",
      history: [{ attempt: 1, nextRetryAt: 2500, delayMs: 2000 }] }] });
    assert.equal(sessions.snapshot(other).retries[0].messageCount, undefined);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("out-of-range legacy counts are re-derived from known boundaries or dropped, never kept", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-retry-oob-"));
  const sessions = new Sessions(flowFactory, undefined, join(root, "sessions"));
  try {
    const id = await sessions.create(root, {}, { id: "oob", messages: [
      { agentId: "main", message: { role: "user", content: "hi", timestamp: 100 } },
      { agentId: "main", message: { role: "assistant", content: [], stopReason: "aborted", timestamp: 200 } },
    ], retries: [
      { id: "oob", agentId: "main", status: "cancelled", attempt: 3, messageCount: 99 },
      { id: "stable", agentId: "main", status: "succeeded", attempt: 1, messageCount: 1 },
      { id: "lost", agentId: "main", status: "failed", attempt: 2, error: "x", messageCount: -4 },
    ] });
    // 越界旧值不留存：不凭最后失败消息猜位置；界内稳定 count 不被覆盖；
    // 无任何可靠依据时归未知（见上一用例末尾的缺失时间/时钟倒退场景）。
    assert.deepEqual(sessions.snapshot(id).retries.map((r) => r.messageCount), [undefined, 1, undefined]);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test("legacy retry boundaries migrate once and survive repeated service restarts", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-retry-order-"));
  const storage = join(root, "sessions");
  const retry = (id, extra = {}) => ({ id, agentId: "main", status: "succeeded", attempt: 1,
    history: [{ attempt: 1, nextRetryAt: 2200, delayMs: 2000 }], ...extra });
  let sessions = new Sessions(flowFactory, undefined, storage);
  try {
    const id = await sessions.create(root, {}, { id: "legacy", messages: [
      { agentId: "main", message: { role: "user", content: "hello", timestamp: 100 } },
      { agentId: "main", message: { role: "assistant", content: [], stopReason: "error", timestamp: 150 } },
      { agentId: "child", message: { role: "assistant", content: [], timestamp: 180 } },
      { agentId: "main", message: { role: "assistant", content: "done", timestamp: 300 } },
    ], retries: [retry("old"), retry("fixed", { messageCount: 1 }),
      retry("child", { agentId: "child" }), retry("missing", { history: [] }),
      retry("ambiguous", { history: [{ nextRetryAt: 2150, delayMs: 2000 }] })] });
    // 旧记录时间线不可用时明确归档，不猜位置。
    // ambiguous/missing 均保持未知。
    assert.deepEqual(sessions.snapshot(id).retries.map(r => r.messageCount), [3, 1, 3, undefined, undefined]);
    for (let restart = 0; restart < 2; restart++) {
      await sessions.close();
      sessions = new Sessions(flowFactory, undefined, storage);
      await sessions.load();
      assert.deepEqual(sessions.snapshot(id).retries.map(r => r.messageCount), [3, 1, 3, undefined, undefined]);
      assert.equal(sessions.snapshot(id).retries[0].history[0].nextRetryAt, 2200);
    }
    const queued = await sessions.create(root, {}, { messages: [
      { agentId: "main", message: { role: "assistant", stopReason: "error", timestamp: 100, content: [] } },
      { agentId: "main", message: { role: "user", timestamp: 150, content: "排队输入" } },
      { agentId: "main", message: { role: "assistant", timestamp: 300, content: [] } },
    ], retries: [retry("queued")] });
    assert.equal(sessions.snapshot(queued).retries[0].messageCount, undefined, "无消费记录时不能用排队输入的编写时间猜位置");
    // 缺失时间或时钟倒退不能用于迁移。
    for (const timestamps of [[100, undefined], [300, 100]]) {
      const other = await sessions.create(root, {}, { messages: timestamps.map(timestamp => ({
        agentId: "main", message: { role: "assistant", content: [], timestamp },
      })), retries: [retry("uncertain")] });
      assert.equal(sessions.snapshot(other).retries[0].messageCount, undefined);
    }
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

// 会话模式 files.browse：相对路径、工作空间边界、保留原有过滤、分页与导航字段。
test("files.browse session mode stays inside the workspace and pages filtered entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-files-"));
  const storage = join(root, "sessions");
  try {
    const sessions = new Sessions(flowFactory, undefined, storage);
    const id = await sessions.create(root);
    await mkdir(join(root, "src"));
    await mkdir(join(root, ".git"));
    await Promise.all(Array.from({ length: 205 }, (_, i) =>
      writeFile(join(root, "src", `file-${String(i).padStart(3, "0")}.txt`), "x")));
    await symlink(join(root, ".git"), join(root, "src", "linked")).catch(() => {});

    // 根目录：相对路径、无父级、面包屑与快速位置指向工作空间，原有过滤保留。
    const rootListing = await sessions.listFiles({ sessionId: id });
    assert.equal(rootListing.path, "");
    assert.equal(rootListing.parent, null);
    assert.equal(rootListing.nextOffset, null);
    assert.deepEqual(rootListing.breadcrumbs, [{ name: basename(root), path: "" }]);
    assert.deepEqual(rootListing.locations, [{ name: basename(root), path: "" }]);
    assert.equal(rootListing.entries.some((entry) => entry.name === ".git"), false);
    assert.equal(rootListing.entries[0].directory, true, "目录应排在文件前");

    // 子目录导航：parent 回链、面包屑逐级可回放。
    const src = await sessions.listFiles({ sessionId: id, path: "src" });
    assert.equal(src.path, "src");
    assert.equal(src.parent, "");
    assert.deepEqual(src.breadcrumbs, [
      { name: basename(root), path: "" },
      { name: "src", path: "src" },
    ]);
    assert.equal(src.entries.some((entry) => entry.name === "linked"), false, "符号链接应跳过");

    // 分页：每页 200，nextOffset 续页；大小写不敏感过滤后再分页。
    assert.equal(src.entries.length, 200);
    assert.equal(src.nextOffset, 200);
    const page2 = await sessions.listFiles({ sessionId: id, path: "src", offset: 200 });
    assert.equal(page2.entries.length, 5);
    assert.equal(page2.nextOffset, null);
    assert.deepEqual(page2.entries.at(-1).path, "src/file-204.txt");
    const filtered = await sessions.listFiles({ sessionId: id, path: "src", query: "FILE-01", offset: 5 });
    assert.equal(filtered.entries.length, 5);
    assert.equal(filtered.nextOffset, null);

    // directoriesOnly 只返回目录（storage 目录也是工作空间成员）。
    const dirs = await sessions.listFiles({ sessionId: id, directoriesOnly: true });
    assert.deepEqual(dirs.entries.map((entry) => entry.name).sort(), ["sessions", "src"]);

    // 边界：越界绝对路径与相对上跳都被拒绝。
    await assert.rejects(sessions.listFiles({ sessionId: id, path: ".." }), /只能浏览当前工作空间/);
    await assert.rejects(sessions.listFiles({ sessionId: id, path: join(root, "..") }), /只能浏览当前工作空间/);
    await assert.rejects(sessions.listFiles({ sessionId: id, path: "missing" }), /目录不存在/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// 导入 pi JSONL：复制进本实例存储、重建网页历史与标题，删除会话不触碰原文件。
test("session.import copies a pi jsonl session, rebuilds history and protects the original", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-import-"));
  const storage = join(root, "storage");
  const workspace = join(root, "workspace");
  const target = join(root, "target");
  await mkdir(workspace, { recursive: true });
  await mkdir(target, { recursive: true });
  const source = join(root, "pi-2026.jsonl");
  await writeFile(source, [
    { type: "session", version: 3, id: "pi-1", timestamp: "2026-01-01T00:00:00.000Z", cwd: workspace },
    { type: "model_change", id: "m1", parentId: null, timestamp: "t", provider: "test", modelId: "one" },
    { type: "message", id: "u1", parentId: "m1", timestamp: "t", message: { role: "user", content: [{ type: "text", text: "<skill name=\"x\" location=\"/x\">\n# 正文\n</skill>\n\n帮我检查导入" }] } },
    { type: "message", id: "a1", parentId: "u1", timestamp: "t", message: { role: "assistant", content: [{ type: "text", text: "好的" }] } },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  // 假工厂代替 SDK：像 SessionManager 一样从 sessionFile 读回历史。
  const factory = async (_, selection = {}) => {
    const entries = selection.sessionFile
      ? (await readFile(selection.sessionFile, "utf8")).split("\n").filter(Boolean).slice(1)
          .map((line) => JSON.parse(line)).filter((entry) => entry.type === "message")
          .map((entry) => ({ id: entry.id, message: entry.message }))
      : [];
    return {
      config: () => ({ model: "test/one", thinking: "off" }),
      subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {},
      queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
      abort: async () => {}, result: () => "ok", dispose: async () => {},
      sessionFile: () => selection.sessionFile,
      historyEntries: () => entries, compactions: () => [],
    };
  };
  factory.catalog = () => [{ key: "test/one" }];
  factory.cwd = target;
  try {
    const sessions = new Sessions(factory, undefined, storage);
    const original = await readFile(source, "utf8");
    const id = await sessions.importSession(source, target);
    const state = sessions.snapshot(id);
    assert.equal(state.cwd, target, "会话归属导入目标，而非源工作空间");
    assert.equal(state.title, "帮我检查导入", "标题取首条用户正文，不含 Skill 注入内容");
    assert.deepEqual(state.messages.map((record) => record.entryId), ["u1", "a1"]);
    const copied = sessions.get(id).agent.sessionFile();
    assert.notEqual(copied, source);
    const [header, ...history] = (await readFile(copied, "utf8")).split("\n");
    assert.equal(JSON.parse(header).cwd, target);
    assert.equal(JSON.parse(header).id, id);
    assert.deepEqual(history, original.split("\n").slice(1), "历史条目原样保留");
    await sessions.rename(id, "独立副本");
    await sessions.close();
    const restored = new Sessions(factory, undefined, storage);
    await restored.load();
    assert.equal(restored.snapshot(id).cwd, target);
    assert.equal(restored.snapshot(id).title, "独立副本");
    assert.deepEqual(restored.snapshot(id).messages, state.messages);
    await restored.remove(id);
    assert.equal(await readFile(source, "utf8"), original, "导入、重命名、恢复、删除均不改源会话");
    assert.equal(existsSync(source), true, "删除 Axiom 会话不删原始 pi 文件");
    assert.equal(existsSync(copied), false);
    const fallback = await sessions.importSession(source);
    assert.equal(sessions.snapshot(fallback).cwd, target, "旧调用省略 cwd 时使用实例默认目录");
    await sessions.remove(fallback);
    await assert.rejects(sessions.importSession(source, join(root, "missing-workspace")), /目录|不存在|ENOENT/);
    await assert.rejects(sessions.importSession(join(root, "missing.jsonl")), /会话文件不存在/);
    const bogus = join(root, "bogus.jsonl");
    await writeFile(bogus, '{"type":"message","id":"x"}\n');
    await assert.rejects(sessions.importSession(bogus), /缺少 session 头/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
