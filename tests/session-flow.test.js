import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, mkdir, writeFile, symlink, readFile } from "node:fs/promises";
import { existsSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Sessions } from "../src/sessions.js";

test("sessions persist across shutdown, queue by type, switch models while running, and delete on disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-flow-"));
  const storage = join(root, "sessions");
  // 模拟 SDK 职责边界：agent 的 JSONL 是历史权威（消息消费时落盘），网页快照只存管理数据。
  const factory = async (_, selection = {}) => {
    let model = selection.model || "test/one", listener, finish;
    const queue = { steering: [], followUp: [] };
    const file = selection.sessionFile || join(selection.sessionDir, "session.jsonl");
    let seq = 0;
    return {
      config: () => ({ model, thinking: "off", levels: ["off"] }),
      configure: async (next) => { model = next.model; return { model }; },
      subscribe: (fn) => { listener = fn; return () => {}; },
      prompt: (text) => {
        const entry = { id: `e${++seq}`, message: { role: "user", content: text } };
        appendFileSync(file, JSON.stringify(entry) + "\n");
        listener({ type: "agent.message.end", data: { message: entry.message, entryId: entry.id } });
        return new Promise((resolve) => { finish = resolve; });
      },
      enqueue: async (text, type) => { queue[type === "steer" ? "steering" : "followUp"].push(text); },
      queue: () => queue,
      withdraw: () => { const old = structuredClone(queue); queue.steering = []; queue.followUp = []; return old; },
      abort: async () => { finish?.(); }, result: () => "ok", dispose: async () => {},
      sessionFile: () => file,
      // historyEntries 必须同步返回（create/retry 重算直接消费返回值，不 await Promise）；
      // 首次 prompt 前文件尚不存在。
      historyEntries: () => { try { return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } },
    };
  };
  factory.catalog = () => [{ key: "test/one" }, { key: "test/two" }];
  let first, restored;
  try {
    first = new Sessions(factory, undefined, storage);
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
    restored = new Sessions(factory, undefined, storage);
    await restored.load();
    await restored.ensureLoaded(id);
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
    await restored.close();
    const [workspace] = await readdir(storage);
    assert.deepEqual(await readdir(join(storage, workspace)), []);
  } finally { await restored?.close(); await first?.close(); await rm(root, { recursive: true, force: true }); }
});

const flowFactory = async (_, selection = {}) => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {},
  queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
  abort: async () => {}, result: () => "ok", dispose: async () => {},
  sessionFile: () => selection.sessionFile, historyEntries: () => [],
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
  await mkdir(storage, { recursive: true });
  // 模拟 SDK 职责边界：JSONL 记录消费时间线（ISO），子代理消息不落盘（与真实行为一致）。
  const jsonl = join(storage, "legacy.jsonl");
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  await writeFile(jsonl, [
    { id: "u0", timestamp: new Date(base + 100).toISOString(), message: { role: "user", content: "hello" } },
    { id: "a1", timestamp: new Date(base + 150).toISOString(), message: { role: "assistant", content: [], stopReason: "error" } },
    { id: "a2", timestamp: new Date(base + 300).toISOString(), message: { role: "assistant", content: "done" } },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const restoreFactory = async (_, selection = {}) => ({
    config: () => ({ model: "test/one", thinking: "off" }),
    subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {},
    queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
    abort: async () => {}, result: () => "ok", dispose: async () => {},
    sessionFile: () => selection.sessionFile,
    historyEntries: () => selection.sessionFile
      ? readFileSync(selection.sessionFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
      : [],
  });
  restoreFactory.catalog = () => [{ key: "test/one" }];
  const retry = (id, extra = {}) => ({ id, agentId: "main", status: "succeeded", attempt: 1,
    history: [{ attempt: 1, nextRetryAt: base + 2500, delayMs: 2000 }], ...extra });
  let sessions = new Sessions(flowFactory, undefined, storage);
  try {
    // —— 内存路径：旧快照仍带完整 messages（首个 persist 前的旧版升级），可从 message 时间线迁移。
    const id = await sessions.create(root, {}, { id: "legacy", sessionFile: jsonl, messages: [
      { agentId: "main", message: { role: "user", content: "hello", timestamp: base + 100 } },
      { agentId: "main", message: { role: "assistant", content: [], stopReason: "error", timestamp: base + 150 } },
      { agentId: "child", message: { role: "assistant", content: [], timestamp: base + 180 } },
      { agentId: "main", message: { role: "assistant", content: "done", timestamp: base + 300 } },
    ], retries: [retry("old", { history: [{ attempt: 1, nextRetryAt: base + 2200, delayMs: 2000 }] }), retry("fixed", { messageCount: 1 }),
      retry("child", { agentId: "child" }), retry("missing", { history: [] }),
      retry("ambiguous", { history: [{ nextRetryAt: base + 2150, delayMs: 2000 }] })] });
    // 旧记录时间线不可用时明确归档，不猜位置。
    // ambiguous/missing 均保持未知。
    assert.deepEqual(sessions.snapshot(id).retries.map(r => r.messageCount), [3, 1, 3, undefined, undefined]);
    await sessions.close();

    // —— 重启路径：快照不再存 messages，主代理历史从 JSONL 分支重建；位置已随首次 persist 固化，
    //    重复重启不漂移；子代理消息不回放（count 界内保留但失去锚点）。
    for (let restart = 0; restart < 2; restart++) {
      sessions = new Sessions(restoreFactory, undefined, storage);
      await sessions.load();
      await sessions.ensureLoaded(id);
      const [old, fixed, child, missing, ambiguous] = sessions.snapshot(id).retries;
      assert.deepEqual([old.messageCount, fixed.messageCount, child.messageCount, missing.messageCount, ambiguous.messageCount],
        [3, 1, 3, undefined, undefined]);
      assert.equal(old.anchorEntryId, "a2", "锚点补最近同代理 JSONL entryId");
      assert.equal(child.anchorEntryId, undefined, "子代理消息不落 JSONL，恢复后无锚点");
      assert.equal(old.history[0].nextRetryAt, base + 2200);
      // 主代理历史从 JSONL 重建（child 不回放）。
      assert.deepEqual(sessions.snapshot(id).messages.map((r) => r.entryId), ["u0", "a1", "a2"]);
      await sessions.close();
    }
    sessions = new Sessions(flowFactory, undefined, storage);
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

test("history IDs, retry boundaries and compaction recovery do not rescan whole history per record", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-history-scan-"));
  const n = 256, base = Date.parse("2026-01-01T00:00:00Z");
  let reads = 0, serialized = 0, compactionReads = 0;
  const history = Array.from({ length: n }, (_, i) => ({ id: `e${i}`,
    timestamp: new Date(base + i * 10).toISOString(),
    message: { role: "assistant", content: `重复${i % 4}`,
      toJSON() { serialized++; return { role: this.role, content: this.content }; } } }));
  const messages = history.map((entry, i) => ({ agentId: "main",
    ...(i % 2 ? {} : { entryId: entry.id }), get message() { reads++; return entry.message; } }));
  const compactions = history.map((_, i) => ({ get id() { compactionReads++; return `cp${i}`; }, set id(value) { assert.equal(value, `cp${i}`); }, summary: "旧" }));
  const factory = Object.assign(async (...args) => ({ ...await flowFactory(...args),
    historyEntries: () => history,
    compactions: () => history.map((_, i) => ({ id: `cp${i}`, summary: "JSONL权威" })),
  }), { catalog: flowFactory.catalog });
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create(root, {}, { messages, compactions,
      retries: history.map((_, i) => ({ id: `r${i}`, agentId: "main", status: "succeeded",
        ...(i % 2 ? {} : { messageCount: n }),
        history: [{ nextRetryAt: base + n / 2 * 10 + 5 + 2000, delayMs: 2000 }] })) });
    const item = sessions.get(id);
    assert.ok(reads <= n * 40, `消息读取 ${reads} 次，不能逐重试重新扫描全历史`);
    assert.ok(serialized <= n * 4, `消息序列化 ${serialized} 次，重复内容须单向匹配`);
    assert.ok(compactionReads <= n * 8, `压缩ID读取 ${compactionReads} 次，不能逐条find`);
    assert.deepEqual(item.messages.map(r => r.entryId), history.map(r => r.id));
    assert.deepEqual(item.retries.map(r => [r.messageCount, r.anchorEntryId]),
      history.map((_, i) => i % 2 ? [n / 2 + 1, `e${n / 2}`] : [n, `e${n - 1}`]));
    assert.ok(item.compactions.every(r => r.summary === "JSONL权威"));
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

// 会话模式 files.browse：相对路径、工作空间边界、递归模糊搜索、分页与导航字段。
test("files.browse session mode stays inside the workspace and pages filtered entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-files-"));
  const storage = join(root, "sessions");
  let sessions;
  try {
    sessions = new Sessions(flowFactory, undefined, storage);
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

    // 分页：每页 200，nextOffset 续页。
    assert.equal(src.entries.length, 200);
    assert.equal(src.nextOffset, 200);
    const page2 = await sessions.listFiles({ sessionId: id, path: "src", offset: 200 });
    assert.equal(page2.entries.length, 5);
    assert.equal(page2.nextOffset, null);
    assert.deepEqual(page2.entries.at(-1).path, "src/file-204.txt");

    // 搜索：递归子目录、名称模糊匹配、大小写不敏感，一次返回全部命中（不分页）。
    await mkdir(join(root, "src", "deep"));
    await writeFile(join(root, "src", "deep", "nested-app.js"), "x");
    const filtered = await sessions.listFiles({ sessionId: id, path: "src", query: "file-200" });
    assert.deepEqual(filtered.entries.map((entry) => entry.path), ["src/file-200.txt"]);
    assert.equal(filtered.nextOffset, null);
    assert.deepEqual((await sessions.listFiles({ sessionId: id, query: "appjs" })).entries.map((entry) => entry.path), ["src/deep/nested-app.js"]);
    assert.deepEqual((await sessions.listFiles({ sessionId: id, query: "nested", directoriesOnly: true })).entries, []);

    // directoriesOnly 只返回目录（storage 目录也是工作空间成员）。
    const dirs = await sessions.listFiles({ sessionId: id, directoriesOnly: true });
    assert.deepEqual(dirs.entries.map((entry) => entry.name).sort(), ["sessions", "src"]);

    // 边界：越界绝对路径与相对上跳都被拒绝。
    await assert.rejects(sessions.listFiles({ sessionId: id, path: ".." }), /只能浏览当前工作空间/);
    await assert.rejects(sessions.listFiles({ sessionId: id, path: join(root, "..") }), /只能浏览当前工作空间/);
    await assert.rejects(sessions.listFiles({ sessionId: id, path: "missing" }), /目录不存在/);
  } finally { await sessions?.close(); await rm(root, { recursive: true, force: true }); }
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
  let sessions, restored;
  try {
    sessions = new Sessions(factory, undefined, storage);
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
    restored = new Sessions(factory, undefined, storage);
    await restored.load();
    await restored.ensureLoaded(id);
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
    await restored.close();
  } finally { await restored?.close(); await sessions?.close(); await rm(root, { recursive: true, force: true }); }
});

test("尚未落盘的 JSONL 路径不落库，空会话重启后仍能打开", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-empty-session-"));
  const storage = join(root, "storage");
  // 真实 SessionManager 懒创建 JSONL：路径创建时即确定，文件要等第一条消息才写出来。
  let sessionFile = join(root, "pending.jsonl");
  const factory = async () => ({
    config: () => ({ model: "test/one", thinking: "off" }),
    subscribe: () => () => {}, prompt: async () => {}, enqueue: async () => {},
    queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
    abort: async () => {}, result: () => "ok", dispose: async () => {},
    sessionFile: () => sessionFile, historyEntries: () => [],
  });
  factory.catalog = () => [{ key: "test/one" }];
  let sessions, restored;
  try {
    sessions = new Sessions(factory, undefined, storage);
    const id = await sessions.create(root);
    assert.equal(existsSync(join(root, "pending.jsonl")), false, "前提：此刻还没有 JSONL 文件");
    // 落库的只能是真文件；否则重启后 ensureLoaded 会按「历史文件缺失」永久拒绝加载这条会话。
    assert.equal(sessions.store.getSession(id).sessionFile ?? null, null);
    assert.equal(sessions.list()[0].sessionFile, null, "列表同源，前端据此提示「发送首条消息后生成」");
    await sessions.close();
    restored = new Sessions(factory, undefined, storage);
    await restored.load();
    await restored.ensureLoaded(id);
    assert.deepEqual(restored.snapshot(id).messages, [], "按空会话打开，而不是报历史缺失");
    // 真落盘之后路径才进库。
    sessionFile = join(root, "landed.jsonl");
    await writeFile(sessionFile, "");
    await restored.persist(restored.get(id));
    assert.equal(restored.store.getSession(id).sessionFile, sessionFile);
  } finally { await restored?.close(); await sessions?.close(); await rm(root, { recursive: true, force: true }); }
});
