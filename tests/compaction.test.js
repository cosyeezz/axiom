import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { compactionDefaults } from "../src/protocol.js";
import { createObservation } from "./fixtures/legacy-observation-writer.js";
import {
  createBackgroundCompaction,
  describeCompactionError,
  entryIdFor,
  normalizeCompaction,
  overCompactionThreshold,
  summarizedEntryIds,
  DEFAULT_COMPACTION_CONFIG,
} from "../src/compaction.js";

test("压缩错误摘要单行限长，隐藏常见凭据，不传递堆栈", () => {
  assert.equal(describeCompactionError(new Error("401 Unauthorized\n检查配置")), "401 Unauthorized 检查配置");
  assert.equal(describeCompactionError(null), "未知错误");
  assert.equal(describeCompactionError(""), "未知错误");
  for (const text of ["https://user:secret@host/path", "key=secret", "api_key: secret", '"apiKey":"secret"', "Bearer secret", "sk-secret", "AIzaSecret", "x".repeat(24)]) {
    const result = describeCompactionError(text);
    assert.ok(result.includes("[已脱敏]"), result);
    assert.ok(!result.includes("secret"), result);
  }
  assert.equal(describeCompactionError("错误".repeat(200)).length, 200);
  assert.equal(describeCompactionError("🙂".repeat(201)), "🙂".repeat(200));
  const error = new Error("safe reason");
  error.stack = "private stack";
  assert.equal(describeCompactionError(error), "safe reason");
});

test("恢复摘要区间不累计之前已折叠的消息", () => {
  const branch = ["a", "b", "c", "d"].map((id) => ({ id, type: "message" }));
  assert.deepEqual(summarizedEntryIds(branch, "c"), ["a", "b"]);
  branch.push({ id: "s1", type: "compaction", firstKeptEntryId: "c" });
  branch.push({ id: "e", type: "message" });
  assert.deepEqual(summarizedEntryIds(branch, "e"), ["c", "d"]);
});

test("取消旧摘要后迟到结果不覆盖新任务状态", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const resolve = [];
    compaction = createBackgroundCompaction({ session, config: enabledConfig, summarize: () => new Promise((done) => resolve.push(done)) });
    compaction.onTurnEnd();
    compaction.cancel();
    compaction.onTurnEnd();
    resolve[0]({ summary: "old" });
    await settle();
    assert.equal(compaction.getStatus().status, "summarizing");
    resolve[1]({ summary: "new" });
    await settle();
    assert.equal(compaction.getStatus().status, "ready");
    assert.equal((await compaction.maybeApply()).summary, "new");
  } finally { compaction?.dispose(); cleanup(); }
});

// —— 测试基建：真实 SDK 会话（真实钩子/SessionManager），不调用真实模型（摘要注入 fake）——

const fakeModel = (baseUrl = "http://127.0.0.1:9") => ({
  id: "test-model",
  name: "Test Model",
  api: "openai-completions",
  provider: "test",
  baseUrl,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4096,
  maxTokens: 100,
});

async function createTestSession() {
  const dir = mkdtempSync(join(tmpdir(), "axiom-compaction-test-"));
  const { session } = await createAgentSession({
    cwd: dir,
    agentDir: dir,
    modelRuntime: await ModelRuntime.create({ authPath: join(dir, "auth.json"), modelsPath: null }),
    model: fakeModel(),
    thinkingLevel: "off",
    sessionManager: SessionManager.inMemory(dir),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  });
  return {
    session,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

let seq = 0;
const userMsg = (text) => ({ role: "user", content: text, timestamp: Date.now() + seq++ });
const assistantMsg = (text) => ({
  role: "assistant",
  content: [{ type: "text", text }],
  stopReason: "stop",
  timestamp: Date.now() + seq++,
});
const big = (ch) => ch.repeat(2400); // ≈600 估算 token（chars/4）

function seed(session, messages) {
  for (const message of messages) session.sessionManager.appendMessage(message);
  session.agent.state.messages = session.sessionManager.buildSessionContext().messages;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function waitFor(condition, timeoutMs = 5000) {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const enabledConfig = {
  enabled: true,
  tokenThreshold: 700,
  percentThreshold: null, // 独立于模型窗口的固定触发阈值
  model: null,
  thinking: "off",
  keepRecentTokens: 200,
};

test("manual sync compaction bypasses disabled auto and uses its larger retention", async () => {
  const { session, cleanup } = await createTestSession();
  let ctrl;
  try {
    seed(session, Array.from({ length: 12 }, (_, i) => i % 2 ? assistantMsg(big("a")) : userMsg(big("u"))));
    session.agent.state.model = { ...session.model, contextWindow: 8192 };
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, enabled: false, syncKeepRecentTokens: 2000, asyncKeepRecentTokens: 200 }, summarize: fakeSummarize() });
    await ctrl.runNow("sync");
    assert.equal(ctrl.getStatus().status, "applied", JSON.stringify(ctrl.getStatus()));
    assert.equal(ctrl.getStatus().runs.at(-1).trigger.keepRecentTokens, 2000);
    assert.equal(ctrl.getStatus().runs.at(-1).trigger.manual, true);
  } finally { ctrl?.dispose(); cleanup(); }
});

test("manual async bypasses threshold, rejects duplicate and applies at idle", async () => {
  const { session, cleanup } = await createTestSession();
  let ctrl;
  let resolve;
  try {
    seed(session, Array.from({ length: 12 }, (_, i) => i % 2 ? assistantMsg(big("a")) : userMsg(big("u"))));
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, enabled: false, asyncKeepRecentTokens: 200 }, summarize: () => new Promise(r => { resolve = r; }) });
    const started = await ctrl.runNow("async");
    assert.equal(started.status, "summarizing");
    assert.equal(started.runs.at(-1).trigger.keepRecentTokens, 200);
    await assert.rejects(ctrl.runNow("async"), /已有压缩任务/);
    resolve({ summary: "Short summary" });
    await settle();
    assert.equal(ctrl.getStatus().status, "applied");
  } finally { ctrl?.dispose(); cleanup(); }
});

test("manual sync failure preserves messages and permits retry", async () => {
  const { session, cleanup } = await createTestSession();
  let ctrl;
  try {
    seed(session, Array.from({ length: 12 }, (_, i) => i % 2 ? assistantMsg(big("a")) : userMsg(big("u"))));
    const before = session.messages.slice();
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 }, summarize: async () => { throw new Error("offline"); } });
    await ctrl.runNow("sync");
    assert.equal(ctrl.getStatus().status, "failed");
    assert.deepEqual(session.messages, before);
    await ctrl.runNow("sync");
    assert.equal(ctrl.getStatus().runs.length, 2);
  } finally { ctrl?.dispose(); cleanup(); }
});

test('manual sync failure makes no fallback request', async () => {
  const { session, cleanup } = await createTestSession();
  let ctrl, calls = 0, summaries = 0;
  try {
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 }, summarize: async () => { summaries++; throw new Error('invalid JSON'); }, nativeFallback: async () => { calls++; ctrl.onTurnEnd({ manual: true }); await assert.rejects(ctrl.runNow('sync'), /已有压缩任务/); } });
    const result = await ctrl.runNow('sync');
    assert.equal(calls, 0); assert.equal(summaries, 1);
    assert.equal(result.status, 'failed');
  } finally { ctrl?.dispose(); cleanup(); }
});

for (const mode of ['auto', 'async', 'sync']) test(`failed generation preserves history without fallback: ${mode}`, async () => {
  const { session, cleanup } = await createTestSession(); let ctrl, calls = 0, barriers = 0;
  try {
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 },
      summarize: async () => { throw new Error('enhanced offline'); },
      fallbackSummarize: async args => { calls++; assert.equal(args.customInstructions, null); return { native: true, nativeFallback: true, summary: 'Native summary', rawSummary: 'Native summary' }; },
      beforeCommit: async () => { barriers++; },
    });
    if (mode === 'auto') { ctrl.onTurnEnd(); await settle(); await ctrl.maybeApply(); }
    else { await ctrl.runNow(mode); await settle(); await ctrl.maybeApply(); }
    assert.equal(calls, 0); assert.equal(barriers, 0);
    assert.equal(ctrl.getStatus().status, 'failed');
    assert.equal(ctrl.getStatus().runs.length, 1);
    assert.equal(session.sessionManager.getBranch().some(e => e.type === 'compaction'), false);
  } finally { ctrl?.dispose(); cleanup(); }
});

test('state generation is observable and cancellable without partial application', async () => {
  const { session, cleanup } = await createTestSession();
  let ctrl;
  try {
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 },
      summarize: async ({ onProgress: progress, signal }) => {
        await settle();
        progress({ kind: 'request', requestId: 'native-1', context: { systemPrompt: 'native', messages: [] } });
        const result = ctrl.cancelRun(ctrl.getStatus().runId);
        assert.equal(result.cancelled, true);
        assert.equal(signal.aborted, true);
        throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      }
    });
    const result = await ctrl.runNow('sync');
    assert.equal(result.status, 'cancelled');
    assert.equal(result.runs.length, 1);
    assert.equal(result.runs[0].status, 'cancelled');
    assert.equal(session.sessionManager.getBranch().some(e => e.type === 'compaction'), false);
    assert.equal(JSON.stringify(result).includes('systemPrompt'), false);
    const attempt = ctrl.getAttempt(result.runs[0].id);
    assert.equal(attempt.requests[0].context.systemPrompt, 'native');
    assert.equal(ctrl.getAttempt(attempt.id, attempt.revision).unchanged, true);
  } finally { ctrl?.dispose(); cleanup(); }
});

for (const mode of ['archive', 'cancel', 'native-error', 'async']) test(`generation failure safety without fallback: ${mode}`, async () => {
  const { session, cleanup } = await createTestSession();
  let ctrl, calls = 0, rejectSummary;
  try {
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 },
      summarize: mode === 'archive' ? fakeSummarize() : mode === 'cancel' ? () => new Promise((_, reject) => { rejectSummary = reject; }) : async () => { throw new Error('offline'); },
      beforeCommit: async () => { throw new Error('ARCHIVE_NOT_DURABLE'); },
      nativeFallback: async () => { calls++; throw new Error('native offline'); },
    });
    const running = ctrl.runNow(mode === 'async' ? 'async' : 'sync');
    if (mode === 'cancel') { ctrl.cancelRun(); rejectSummary(new Error('cancelled')); }
    await running; await settle();
    assert.equal(calls, 0);
    assert.equal(session.sessionManager.getBranch().some(e => e.type === 'compaction'), false);
  } finally { ctrl?.dispose(); cleanup(); }
});

test('native summary inputs are frozen and previousSummary inherits across rounds', async () => {
  const { session, cleanup } = await createTestSession(); let ctrl;
  const inputs = []; let release;
  try {
    session.model.contextWindow = 128000;
    seed(session, [userMsg(big('first')), assistantMsg(big('response')), userMsg('tail')]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 },
      summarize: async args => { inputs.push(args); if (inputs.length === 1) await new Promise(r => { release = r; }); return { native: true, summary: `summary ${inputs.length}`, rawSummary: `summary ${inputs.length}` }; }
    });
    const running = ctrl.runNow('sync');
    seed(session, [userMsg('AFTER_FREEZE')]);
    release(); await running;
    assert.equal(ctrl.getStatus().status, 'applied', JSON.stringify(ctrl.getStatus()));
    assert.equal(JSON.stringify(inputs[0].messages).includes('AFTER_FREEZE'), false);
    const first = session.sessionManager.getBranch().findLast(e => e.type === 'compaction');
    assert.equal(first.details.stateDoc, undefined);
    seed(session, [userMsg(big('second')), assistantMsg(big('reply')), userMsg(big('tail2'))]);
    await ctrl.runNow('sync');
    assert.equal(ctrl.getStatus().status, 'applied');
    assert.equal(inputs[1].previousSummary, 'summary 1');
    assert.equal(inputs[1].previousStateDoc, undefined);
    assert.equal(session.sessionManager.getBranch().findLast(e => e.type === 'compaction').details.stateDoc, undefined);
  } finally { ctrl?.dispose(); cleanup(); }
});

for (const mode of ['auto', 'async', 'sync']) test(`native generation shares durable commit barriers: ${mode}`, async () => {
  const { session, cleanup } = await createTestSession(); let ctrl, barriers = 0;
  try {
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 },
      summarize: async () => ({ native: true, summary: 'Native summary', rawSummary: 'Native summary' }),
      beforeCommit: async () => { barriers++; },
    });
    if (mode === 'auto') { ctrl.onTurnEnd(); await settle(); await ctrl.maybeApply(); }
    else { await ctrl.runNow(mode); await settle(); await ctrl.maybeApply(); }
    assert.equal(ctrl.getStatus().status, 'applied');
    assert.equal(barriers, 2);
    const record = session.sessionManager.getBranch().findLast(e => e.type === 'compaction');
    assert.equal(record.summary, 'Native summary');
    assert.equal(record.details.stateDoc, undefined);
  } finally { ctrl?.dispose(); cleanup(); }
});

test('native result needs no additional state to commit', async () => {
  const { session, cleanup } = await createTestSession(); let ctrl;
  try {
    session.model.contextWindow = 128000;
    seed(session, [userMsg(big('first')), assistantMsg(big('response')), userMsg(big('tail'))]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 }, summarize: async () => ({ native: true, summary: 'good summary', rawSummary: 'good summary' }) });
    await ctrl.runNow('sync');
    assert.equal(ctrl.getStatus().status, 'applied');
    assert.equal(session.sessionManager.getBranch().findLast(e => e.type === 'compaction').details.stateDoc, undefined);
  } finally { ctrl?.dispose(); cleanup(); }
});

function fakeSummarize(log) {
  return async ({ messages, previousSummary }) => {
    log?.push({ count: messages.length, previousSummary });
    return { summary: `S:${messages.length}`, progress: { title: "本次进展", description: "本次新增发现。" }, usage: { input: 10, output: 5 } };
  };
}

// 挂起不响应的伪 LLM 服务（用于验证取消真的中断 HTTP 请求）


// OpenAI completions 兼容的流式伪服务：每个请求返回一条 "ok" 助手回复（SSE）。
// hold(index) 可对第 index 个请求返回一个 promise，测试手动放行以控制时序。
async function startFakeLlmServer({ hold, reply = () => "ok" } = {}) {
  const requests = [];
  const completed = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      const index = requests.length;
      requests.push({ url: req.url });
      const gate = hold?.(index);
      if (gate) await gate;
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const chunk = (delta, finish) =>
        res.write(
          `data: ${JSON.stringify({
            id: "c",
            object: "chat.completion.chunk",
            created: 1,
            model: "test-model",
            choices: [{ index: 0, delta, finish_reason: finish }],
          })}\n\n`,
        );
      chunk({ role: "assistant", content: reply(JSON.parse(body)) }, null);
      chunk({}, "stop");
      res.write("data: [DONE]\n\n");
      res.end();
      res.on("finish", () => completed.push(index));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    port: server.address().port,
    requests,
    completed,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('manual generation failure never calls SDK fallback or appends a record', async () => {
  const fake = await startFakeLlmServer({ reply: () => 'Native summary: keep the goal and continue.' });
  const dir = mkdtempSync(join(tmpdir(), 'axiom-native-fallback-'));
  let session, ctrl;
  try {
    const runtime = await createLoopSession(dir, fake.port);
    session = runtime.session;
    session.settingsManager.applyOverrides({ compaction: { enabled: false, keepRecentTokens: 200 } });
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    const ids = session.sessionManager.getBranch().map(entry => entry.id);
    const events = [];
    session.subscribe(event => events.push(event));
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 }, summarize: async () => { throw new Error('invalid JSON'); }, nativeFallback: () => session.compact() });
    assert.equal((await ctrl.runNow('sync')).status, 'failed');
    assert.equal(fake.requests.length, 0);
    const branch = session.sessionManager.getBranch();
    assert.notEqual(branch.at(-1).type, 'compaction');
    assert.ok(ids.every(id => branch.some(entry => entry.id === id)));
    assert.equal(events.some(event => event.type === 'compaction_end' && event.result), false);
  } finally { ctrl?.dispose(); session?.dispose(); await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("normalizeCompaction: 缺省返回默认值，默认值与 protocol compactionDefaults 同源", () => {
  assert.deepEqual(normalizeCompaction(undefined), { ...DEFAULT_COMPACTION_CONFIG });
  assert.equal(DEFAULT_COMPACTION_CONFIG, compactionDefaults);
  assert.equal(DEFAULT_COMPACTION_CONFIG.enabled, true);
  assert.equal(DEFAULT_COMPACTION_CONFIG.tokenThreshold, 100000);
  assert.equal(DEFAULT_COMPACTION_CONFIG.percentThreshold, 50);
  assert.equal(DEFAULT_COMPACTION_CONFIG.model, null);
  assert.equal(DEFAULT_COMPACTION_CONFIG.thinking, "off");
  assert.equal(DEFAULT_COMPACTION_CONFIG.keepRecentTokens, 5000);
});

test("normalizeCompaction: 合法配置原样通过（null 阈值透传），非法配置抛错不回退", () => {
  const valid = { ...compactionDefaults, enabled: true, tokenThreshold: null, model: "test/test-model", thinking: "high" };
  assert.deepEqual(normalizeCompaction(valid), valid);
  const zodError = (fn) =>
    assert.throws(fn, (error) => error instanceof Error && error.name === "ZodError");
  zodError(() => normalizeCompaction({ ...valid, tokenThreshold: 0 })); // 非正数
  zodError(() => normalizeCompaction({ ...valid, percentThreshold: 400 })); // 超上界
  zodError(() => normalizeCompaction({ ...valid, thinking: "yolo" })); // 非法等级
  zodError(() => normalizeCompaction({ ...valid, model: "" })); // 空 id
  zodError(() => normalizeCompaction({ ...valid, extra: 1 })); // strict: 未知字段
  zodError(() => normalizeCompaction({ ...valid, enabled: true, tokenThreshold: null, percentThreshold: null })); // refine: 无阈值
});

test("overCompactionThreshold: 绝对与占比阈值任一命中即触发，全 null 不触发", () => {
  const base = { tokenThreshold: null, percentThreshold: null };
  assert.equal(overCompactionThreshold(999999, 1000, base), false);
  assert.equal(overCompactionThreshold(700, 1000, { ...base, percentThreshold: 70 }), true);
  assert.equal(overCompactionThreshold(699, 1000, { ...base, percentThreshold: 70 }), false);
  assert.equal(overCompactionThreshold(500, 0, { ...base, percentThreshold: 70 }), false); // 未知窗口仅占比不判
  assert.equal(overCompactionThreshold(100000, 1000, { ...base, tokenThreshold: 100000 }), true);
});

// —— 真实 SDK 会话 + 后台压缩主流程 ——

test('取消发生于提交屏障等待期间，候选不能再提交', async () => {
  const { session, cleanup } = await createTestSession(); let ctrl;
  try {
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    ctrl = createBackgroundCompaction({ session, config: enabledConfig, summarize: fakeSummarize([]), beforeCommit: async () => { ctrl.cancel(); } });
    ctrl.onTurnEnd(); await settle();
    assert.equal(await ctrl.maybeApply(), null);
    assert.equal(session.sessionManager.getBranch().filter(entry => entry.type === 'compaction').length, 0);
  } finally { ctrl?.dispose(); await cleanup(); }
});

test("原文持久屏障失败时不提交压缩、不替换上下文", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const before = JSON.stringify(session.messages);
    let commits = 0;
    compaction = createBackgroundCompaction({
      session, modelRuntime: null, config: enabledConfig, summarize: fakeSummarize([]),
      beforeCommit(commit) {
        commits++;
        assert.ok(commit.compactedMessageIds.length);
        assert.ok(commit.firstKeptEntryId);
        throw new Error("ARCHIVE_NOT_DURABLE");
      },
    });
    await compaction.onTurnEnd(); await settle();
    assert.equal(await compaction.maybeApply(), null);
    assert.equal(commits, 1);
    assert.equal(JSON.stringify(session.messages), before);
    assert.equal(session.sessionManager.getBranch().filter(entry => entry.type === "compaction").length, 0);
  } finally { compaction?.dispose(); await cleanup(); }
});

test("turn_end 快照后摘要，安全点应用：保留 recent 与快照后新增消息，事件与落盘一致", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    const old0 = userMsg(big("a"));
    const old1 = assistantMsg(big("b"));
    const recent = userMsg(big("c"));
    seed(session, [old0, old1, recent]); // ≈1800 估算 token ≥ 700

    const calls = [];
    const events = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: fakeSummarize(calls),
      onEvent: (event) => events.push(event),
    });

    await compaction.onTurnEnd(); // 模拟 turn_end 快照
    await settle();
    assert.equal(calls.length, 1);

    // 快照之后新增的消息（下一回合的输入/输出/工具结果）
    const added = userMsg("added-after-snapshot");
    session.sessionManager.appendMessage(added);
    session.agent.state.messages = session.sessionManager.buildSessionContext().messages;

    const data = await compaction.maybeApply();
    assert.ok(data, "应用应成功");
    assert.equal(data.summary, "S:2");
    assert.equal(typeof data.id, "string");
    assert.ok(data.tokensBefore >= 700, "tokensBefore 提交时重算且达到过阈值");
    assert.ok(data.estimatedTokensAfter < data.tokensBefore, "压缩后（全量估算）必须真的变小");

    // compactedMessageIds = 被折叠消息的 entry id；firstKeptEntryId 是首个保留消息
    const branch = session.sessionManager.getBranch();
    const byId = new Map(branch.map((entry) => [entry.id, entry]));
    assert.equal(byId.get(data.firstKeptEntryId).message, recent);
    assert.deepEqual(data.compactedMessageIds, [
      branch.find((e) => e.message === old0).id,
      branch.find((e) => e.message === old1).id,
    ]);

    // 状态重建：摘要消息在前，保留消息（含新增）全部还在
    const state = session.messages;
    assert.equal(state[0].role, "compactionSummary");
    assert.equal(state[0].summary, "S:2");
    assert.ok(state.includes(recent), "保留切点消息应保留");
    assert.ok(state.includes(added), "快照后新增消息应保留");
    assert.ok(!state.includes(old0) && !state.includes(old1), "被摘要消息应移出上下文");
    assert.deepEqual(session.sessionManager.buildSessionContext().messages, state);

    // 落盘：压缩条目在分支末尾
    const leaf = session.sessionManager.getLeafEntry();
    assert.equal(leaf.type, "compaction");
    assert.equal(leaf.id, data.id);
    assert.equal(leaf.firstKeptEntryId, data.firstKeptEntryId);
    assert.deepEqual(leaf.details.progress, { title: "本次进展", description: "本次新增发现。" });
    assert.deepEqual(data.progress, leaf.details.progress);
    assert.ok(!state[0].summary.includes("<axiom_compact_title>"));

    // 事件：agent.compaction 与落盘一致
    assert.deepEqual(events.filter((e) => e.type === "agent.compaction.status").map((e) => e.data.status), ["summarizing", "ready", "applied"]);
    assert.deepEqual(events.find((e) => e.type === "agent.compaction").data, data);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("split turn 不跳过：切点落在回合中间时直接摘要 boundaryStart→切点（含 turn prefix 与工具结果）", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    const calls = [];
    seed(session, [
      userMsg(big("a")), // 回合开头 ≈600 tok
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }],
        stopReason: "toolUse",
        timestamp: Date.now() + seq++,
      },
      { role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: big("r") }] },
      assistantMsg("done"),
    ]);
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: fakeSummarize(calls),
    });
    await compaction.onTurnEnd();
    await settle();
    assert.equal(calls.length, 1, "split turn（长任务工具轮次）也必须发起摘要");
    assert.equal(calls[0].count, 3, "boundaryStart→切点之间的全部消息（含 toolResult）被摘要");

    const data = await compaction.maybeApply();
    assert.ok(data);
    const state = session.messages;
    assert.equal(state[0].role, "compactionSummary");
    assert.equal(state.length, 2, "只剩摘要与保留的最终回复");
    assert.equal(state[1].role, "assistant");
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("真实 SDK 钩子链：prepareNextTurnWithContext 在原生钩子之后应用压缩结果", async () => {
  const { session, cleanup } = await createTestSession();
  session.agent.state.model = { ...session.model, contextWindow: 4096 }; 
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: { ...enabledConfig, tokenThreshold: 700, percentThreshold: null },
      summarize: fakeSummarize([]),
    });

    await compaction.onTurnEnd();
    await settle();

    // 模拟运行中的安全点调用（与 agent-loop 相同的入参形状）
    const turn = {
      message: assistantMsg("turn"),
      toolResults: [],
      context: { systemPrompt: "s", messages: session.messages.slice(), tools: [] },
      newMessages: [],
    };
    const update = await session.agent.prepareNextTurnWithContext(turn);
    assert.equal(update.model, session.model, "原生钩子的模型选择应保留");
    assert.equal(typeof update.context.systemPrompt, "string");
    assert.ok(update.context.systemPrompt.length > 0, "原生钩子的系统提示应保留");
    assert.equal(update.context.messages[0].role, "compactionSummary", "安全点应用压缩后的上下文");
    assert.deepEqual(update.context.messages, session.messages);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("真实 SDK 钩子链：无待应用结果时透传原生快照，不改动上下文", async () => {
  const { session, cleanup } = await createTestSession();
  session.agent.state.model = { ...session.model, contextWindow: 4096 };
  let compaction;
  try {
    seed(session, [userMsg("hi"), assistantMsg("hello")]);
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig, // 未达阈值 → 无 flight
      summarize: fakeSummarize([]),
    });
    const messages = session.messages.slice();
    const turn = {
      message: assistantMsg("turn"),
      toolResults: [],
      context: { systemPrompt: "s", messages, tools: [] },
      newMessages: [],
    };
    const update = await session.agent.prepareNextTurnWithContext(turn);
    assert.equal(update.context.messages, messages);
    assert.equal(update.model, session.model);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("压缩写入异常锁存不确定状态，不切上下文且改配置不能解锁", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const original = session.messages.slice();
    session.sessionManager.appendCompaction = () => { throw new Error("injected disk failure"); };
    compaction = createBackgroundCompaction({ session, config: enabledConfig, summarize: fakeSummarize([]) });
    compaction.onTurnEnd();
    await settle();
    await compaction.maybeApply();
    assert.deepEqual(session.messages, original);
    assert.throws(() => compaction.assertHealthy(), { code: "COMMIT_UNCERTAIN" });
    compaction.setConfig({ ...enabledConfig, tokenThreshold: 701 });
    await assert.rejects(() => compaction.maybeApply(), { code: "COMMIT_UNCERTAIN" });
    await assert.rejects(() => session.agent.prepareNextTurnWithContext({ context: { messages: [], tools: [], systemPrompt: "" } }), { code: "COMMIT_UNCERTAIN" });
  } finally { compaction?.dispose(); cleanup(); }
});

test("固定系统提示与工具超过小窗口时，禁止发出无效请求", async () => {
  const { session, cleanup } = await createTestSession();
  session.agent.state.model = { ...session.model, contextWindow: 1000 };
  let compaction;
  try {
    seed(session, [userMsg("hi"), assistantMsg("hello")]);
    compaction = createBackgroundCompaction({ session, modelRuntime: null, config: enabledConfig, summarize: fakeSummarize([]) });
    await assert.rejects(() => session.agent.prepareNextTurnWithContext({ message: assistantMsg("turn"), toolResults: [], context: { systemPrompt: "s", messages: session.messages.slice(), tools: [] }, newMessages: [] }), { code: "WINDOW_UNSAFE" });
    assert.equal(session.sessionManager.getBranch().filter(entry => entry.type === "compaction").length, 0);
  } finally { compaction?.dispose(); cleanup(); }
});

for (const resultCount of [1, 3]) test(`最新 ${resultCount} 条工具结果超过保留预算时仍摘要早期历史，完整保留工具配对`, async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    session.agent.state.model = { ...session.model, contextWindow: 16000 };
    const call = { ...assistantMsg("read"), content: Array.from({ length: resultCount }, (_, i) => ({ type: "toolCall", id: `large-read-${i}`, name: "read", arguments: { path: "large.txt" } })) };
    const results = call.content.map(block => ({ role: "toolResult", toolCallId: block.id, toolName: "read", content: [{ type: "text", text: big("r") }], isError: false, timestamp: Date.now() }));
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), call, ...results]);
    const calls = [];
    compaction = createBackgroundCompaction({ session, config: enabledConfig, summarize: fakeSummarize(calls) });
    compaction.onTurnEnd();
    await settle();
    assert.equal(compaction.getStatus().status, "ready");
    const applied = await compaction.maybeApply();
    assert.ok(applied);
    assert.equal(session.messages[0].role, "compactionSummary");
    assert.deepEqual(session.messages.slice(1), [call, ...results]);
    assert.equal(applied.compactedMessageIds.length, 2);
  } finally { compaction?.dispose(); cleanup(); }
});

test("单 flight：同一段时间多次 turn_end 只发起一次摘要", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const calls = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: fakeSummarize(calls),
    });
    await compaction.onTurnEnd();
    await compaction.onTurnEnd();
    await settle();
    assert.equal(calls.length, 1);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("摘要失败：保留原因与原文，指数冷却并允许配置修正后重试", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const events = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: async () => {
        throw new Error("boom");
      },
      onEvent: (event) => events.push(event),
    });
    const before = session.messages.slice();
    await compaction.onTurnEnd();
    await settle();
    assert.equal(await compaction.maybeApply(), null);
    assert.deepEqual(session.messages, before);
    assert.ok(!session.sessionManager.getBranch().some((entry) => entry.type === "compaction"));
    assert.equal(events.filter((e) => e.type === "agent.compaction").length, 0);
    assert.equal(compaction.getStatus().status, "failed");
    assert.match(compaction.getStatus().message, /boom.*30 秒/);
    const starts = () => events.filter((e) => e.data.status === "summarizing").length;
    await compaction.onTurnEnd();
    await settle();
    assert.equal(starts(), 1, "冷却期间不重复请求");
    t.mock.timers.tick(30000);
    await compaction.onTurnEnd();
    await settle();
    assert.equal(starts(), 2);
    assert.match(compaction.getStatus().message, /60 秒/);
    t.mock.timers.tick(60000);
    await compaction.onTurnEnd();
    await settle();
    assert.equal(starts(), 3);
    assert.match(compaction.getStatus().message, /boom.*已达三次失败上限/);
    for (const elapsed of [120000, 240000, 300000]) {
      t.mock.timers.tick(elapsed);
      await compaction.onTurnEnd();
      await settle();
    }
    assert.equal(starts(), 3, "到达上限后不再自动重试");
    compaction.setConfig({ ...enabledConfig, thinking: "low" });
    await compaction.onTurnEnd();
    await settle();
    assert.match(compaction.getStatus().message, /30 秒/);
    assert.equal(starts(), 4);
    assert.equal(await compaction.maybeApply(), null);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("启动与应用失败展示具体原因，冷却期间保留失败状态", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    compaction = createBackgroundCompaction({ session, config: { ...enabledConfig, model: "missing/model" } });
    await compaction.onTurnEnd();
    assert.match(compaction.getStatus().message, /无法启动.*Unknown compaction model.*30 秒/);
    compaction.setConfig(enabledConfig);
    compaction.dispose();
    compaction = createBackgroundCompaction({ session, config: enabledConfig, summarize: async () => ({ summary: "short" }) });
    await compaction.onTurnEnd();
    await settle();
    const before = session.messages.slice();
    const original = session.sessionManager.appendCompaction;
    session.sessionManager.appendCompaction = () => { throw new Error("disk unavailable"); };
    try {
      assert.equal(await compaction.maybeApply(), null);
      assert.match(compaction.getStatus().message, /应用失败.*提交不确定.*重新打开/);
      assert.throws(() => compaction.assertHealthy(), { code: "COMMIT_UNCERTAIN" });
      assert.deepEqual(session.messages, before);
      await compaction.onTurnEnd();
      assert.equal(compaction.getStatus().status, "failed");
    } finally {
      session.sessionManager.appendCompaction = original;
    }
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("提交验证：空摘要不落盘；压缩后没有真的变小也不落盘", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const events = [];
    const calls = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: async ({ messages }) => {
        calls.push(messages.length);
        // 第二次返回比原文还大的摘要
        return calls.length === 1
          ? { summary: "   ", usage: { input: 1, output: 1 } }
          : { summary: "x".repeat(20000), usage: { input: 1, output: 1 } };
      },
      onEvent: (event) => events.push(event),
    });
    await compaction.onTurnEnd();
    await settle();
    assert.equal(await compaction.maybeApply(), null, "空摘要不提交");
    await compaction.onTurnEnd();
    await settle();
    assert.equal(await compaction.maybeApply(), null, "没有变小不提交");
    assert.ok(!session.sessionManager.getBranch().some((entry) => entry.type === "compaction"));
    assert.equal(events.filter((e) => e.type === "agent.compaction").length, 0);
    assert.equal(compaction.getStatus().status, "skipped");
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("快照后出现新的压缩条目（如原生兜底）：结果作废，原文不动", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const events = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: fakeSummarize([]),
      onEvent: (event) => events.push(event),
    });
    await compaction.onTurnEnd();
    await settle();
    session.sessionManager.appendCompaction("native-summary", session.sessionManager.getBranch()[0].id, 1);
    assert.equal(await compaction.maybeApply(), null);
    assert.equal(events.filter((e) => e.type === "agent.compaction").length, 0);
    assert.equal(compaction.getStatus().status, "skipped");
    assert.equal(session.messages.some((m) => m.summary === "S:3"), false);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("快照后分支切换：结果作废", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    const first = userMsg(big("a"));
    seed(session, [first, assistantMsg(big("b")), userMsg(big("c"))]);
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: fakeSummarize([]),
    });
    await compaction.onTurnEnd();
    await settle();
    session.sessionManager.branch(session.sessionManager.getEntries()[0].id); // 切回第一条
    assert.equal(await compaction.maybeApply(), null);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

// —— 取消：dispose / setConfig 变化必须中断在途后台任务 ——

function hangingSummarize(signals) {
  return ({ signal }) =>
    new Promise((_, reject) => {
      signals.push(signal);
      signal.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true });
    });
}

test("dispose 取消在途摘要：signal 中止、结果不落地", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const signals = [];
    const events = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: hangingSummarize(signals),
      onEvent: (event) => events.push(event),
    });
    await compaction.onTurnEnd();
    assert.equal(signals.length, 1);
    assert.equal(signals[0].aborted, false);
    compaction.dispose();
    assert.equal(signals[0].aborted, true, "dispose 必须中止后台真实 LLM 的 signal");
    assert.equal(await compaction.maybeApply(), null);
    await settle();
    assert.equal(events.filter((e) => e.type === "agent.compaction").length, 0);
    assert.equal(compaction.getStatus().status, "cancelled");
    assert.ok(!session.sessionManager.getBranch().some((entry) => entry.type === "compaction"));
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("setConfig 变化作废并取消旧任务；相同配置不打扰在途任务", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const signals = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: hangingSummarize(signals),
    });
    await compaction.onTurnEnd();
    compaction.setConfig({ ...enabledConfig }); // 相同配置：不打扰
    assert.equal(signals[0].aborted, false);
    compaction.setConfig({ ...enabledConfig, keepRecentTokens: 300 }); // 配置变化：取消旧任务
    assert.equal(signals[0].aborted, true, "配置变化必须取消在途任务");
    assert.equal(await compaction.maybeApply(), null);
    // 取消后可重新发起
    await compaction.onTurnEnd();
    await settle();
    assert.equal(signals.length, 2);
    compaction.dispose();
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("未启用时 turn_end 不做任何事；非法配置在 setConfig 时抛错；未知压缩模型在 setConfig 时报错", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const calls = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: { ...enabledConfig, enabled: false },
      summarize: fakeSummarize(calls),
    });
    await compaction.onTurnEnd();
    await settle();
    assert.equal(calls.length, 0);
    assert.equal(await compaction.maybeApply(), null);

    compaction.setConfig({ ...enabledConfig });
    assert.deepEqual(compaction.getConfig(), { ...enabledConfig });
    assert.throws(() => compaction.setConfig({ ...enabledConfig, tokenThreshold: 0 }), (error) => error.name === "ZodError");
    assert.throws(() => compaction.setConfig({ ...enabledConfig, model: "nope/none" }), /Unknown compaction model/);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

// —— 真实后台 LLM 的取消 ——

// 经 models.json 注册本地 "test" provider（getAuth 只解析已注册 provider），模型对象取自 runtime
async function createLoopSession(dir, port) {
  writeFileSync(
    join(dir, "models.json"),
    JSON.stringify({
      providers: {
        test: {
          name: "Test",
          baseUrl: `http://127.0.0.1:${port}/v1`,
          api: "openai-completions",
          apiKey: "sk-test",
          models: [{ id: "test-model", name: "Test Model", contextWindow: 4096, maxTokens: 100 }],
        },
      },
    }),
  );
  const modelRuntime = await ModelRuntime.create({
    authPath: join(dir, "auth.json"),
    modelsPath: join(dir, "models.json"),
  });
  const available = await modelRuntime.getAvailable();
  const model = available.find((m) => `${m.provider}/${m.id}` === "test/test-model");
  if (!model) throw new Error(`test model unavailable: ${JSON.stringify(available.map((m) => `${m.provider}/${m.id}`))}`);
  const { session } = await createAgentSession({
    cwd: dir,
    agentDir: dir,
    modelRuntime,
    model,
    thinkingLevel: "off",
    sessionManager: SessionManager.inMemory(dir),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  });
  return { session, modelRuntime };
}

test("真实 SDK loop：prompt 触发 turn_end 后台摘要，下一次 prompt 在安全点自动应用", async () => {
  const fake = await startFakeLlmServer({ reply: body => JSON.stringify(body).includes("summarization assistant") ? "## Goal\n收到 ok" : "ok" });
  const dir = mkdtempSync(join(tmpdir(), "axiom-compaction-loop-"));
  let compaction;
  try {
    const { session, modelRuntime } = await createLoopSession(dir, fake.port);
    const events = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime, // 摘要会话复用同一 runtime（临时 auth）
      config: enabledConfig,
      onEvent: (event) => events.push(event),
    });
    session.subscribe((event) => {
      if (event.type === "turn_end") void compaction.onTurnEnd(); // 与 pi.js 相同的接线
    });
    // 与 pi.js 相同的 prompt 包装：入口先补一次应用（SDK 钩子只在同一次 loop 的续回合触发，新 prompt 不触发）
    const prompt = async (text) => {
      await compaction.maybeApply();
      await session.prompt(text);
    };
    // 种子助手消息带真实形状的 usage（SDK loop 会读 usage），totalTokens 拉高以确保超过阈值
    const seedUsage = {
      input: 900,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 901,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const seededAssistant = { ...assistantMsg(big("b")), usage: seedUsage };
    seed(session, [userMsg(big("a")), seededAssistant, userMsg(big("c"))]);

    await session.prompt("go"); // 真实 loop：LLM 回复 → turn_end → 后台摘要（真实 HTTP）
    await waitFor(() => fake.requests.length >= 2, 10000); // 第 1 个请求是主 loop，第 2 个是后台摘要
    await waitFor(() => compaction.getStatus().status === 'ready', 10000);
    await settle();

    await prompt("more"); // 安全点（pi.js 同款入口）应用压缩，然后再发起下一次 LLM 请求
    assert.equal(fake.requests.length, 3);
    const data = events.find((event) => event.type === "agent.compaction")?.data;
    assert.ok(data, "应发出 agent.compaction 事件");
    assert.match(data.summary, /## Goal/);
    const attempt = compaction.getAttempt(compaction.getStatus().runs.at(-1).id);
    assert.equal(attempt.requests.length, 1);
    assert.equal(attempt.stateDoc, undefined);
    assert.equal(JSON.stringify(attempt.requests[0]).includes('Additional focus:'), true);
    assert.ok(!JSON.stringify(attempt.requests).includes('Return ONLY a JSON object'));
    assert.match(data.summary, /收到 ok/);
    assert.ok(data.estimatedTokensAfter < data.tokensBefore);

    const state = session.messages;
    assert.equal(state[0].role, "compactionSummary");
    assert.match(state[0].summary, /收到 ok/);
    assert.ok(
      state.some(
        (message) =>
          message.role === "user" &&
          (message.content === "more" ||
            (Array.isArray(message.content) && message.content.some((block) => block.type === "text" && block.text === "more"))),
      ),
      "压缩后的后续消息保留",
    );
    const branch = session.sessionManager.getBranch();
    assert.equal(branch.filter((entry) => entry.type === "compaction").length, 1);
    assert.equal(branch.find(entry => entry.type === "compaction").details.nativeSummary, true);
    assert.equal(branch.find(entry => entry.type === "compaction").details.taskState, undefined);
    assert.equal(branch.find(entry => entry.type === "compaction").details.stateDoc, undefined);
    assert.equal(branch.at(-1).type, "message");
    // 过程可视：run 的步骤流接的是真 SDK 事件（不只是测试桩调 onProgress）
    const run = compaction.getStatus().runs.at(-1);
    assert.equal(run.status, "applied");
    for (const step of ["trigger", "plan", "request", "stream_end", "ready", "apply", "applied"])
      assert.ok(run.steps.some((item) => item.step === step), `缺步骤 ${step}`);
    assert.ok(run.stream.chars > 0, "流式文本有计数");
    assert.match(run.stream.preview, /ok/);
    assert.ok(run.model, "记录实际摘要模型");
  } finally {
    compaction?.dispose();
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("entryIdFor: 按消息引用反查持久化 entry id，未持久化返回空", async () => {
  const dir = mkdtempSync(join(tmpdir(), "axiom-entryid-"));
  try {
    const sessionManager = SessionManager.inMemory(dir);
    const message = userMsg("find-me");
    assert.deepEqual(entryIdFor(sessionManager, message), {}); // 未持久化
    const entryId = sessionManager.appendMessage(message);
    assert.deepEqual(entryIdFor(sessionManager, message), { entryId });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OP×compaction：摘要读原始全文，同批 obs_recall 回显作为真实取回事件保留", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    const source = "SOURCE-MARKER " + "r".repeat(9000); // 超过 OP 6KiB 阈值，是个真实可折叠对象
    const id = createObservation(
      { role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: source }] },
      "/tmp/unused",
    ).id;
    const echo = `[obs_recall id=${id} offset=0 next_offset=4096 eof=false]\n[chunk_bytes=4096 chunk_lines=1]\n${source.slice(0, 7000)}`;

    const calls = [];
    seed(session, [
      userMsg(big("a")),
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }],
        stopReason: "toolUse",
        timestamp: Date.now() + seq++,
      },
      { role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: source }] },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "r1", name: "obs_recall", arguments: { id } }],
        stopReason: "toolUse",
        timestamp: Date.now() + seq++,
      },
      { role: "toolResult", toolCallId: "r1", toolName: "obs_recall", content: [{ type: "text", text: echo }] },
      assistantMsg("done"),
    ]);
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: async ({ messages }) => {
        calls.push(messages);
        return { summary: `S:${messages.length}`, progress: { title: "t", description: "d" }, usage: { input: 1, output: 1 } };
      },
    });
    await compaction.onTurnEnd();
    await settle();
    assert.equal(calls.length, 1);
    const summarized = calls[0];
    const texts = summarized.flatMap((m) => (Array.isArray(m.content) ? m.content : []).filter((b) => b.type === "text").map((b) => b.text));
    assert.ok(texts.some((t) => t.includes("SOURCE-MARKER")), "原始全文仍进摘要（摘要读原始历史，不吃折叠投影）");
    assert.ok(texts.some((t) => t.startsWith("[obs_recall id=")), "真实取回事件不去重，原文与回显并存");
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

// 后台压缩可视化：每次摘要是一条 run 记录（阶段、步骤时间线、流式尾部、usage、错误），
// 随 agent.compaction.status 下发；用户可从 UI 取消当前这一次。
test("run 记录：步骤时间线与流式尾部随状态下发，终态保留结果", async () => {
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const events = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      // 真实 summarize 会通过 onProgress 上报内部流程，这里照同样的协议发几条。
      summarize: async ({ onProgress }) => {
        onProgress({ kind: "note", step: "session", text: "摘要会话就绪 · fake" });
        onProgress({ kind: "stream", text: "部分摘要正文", thinking: "想" });
        onProgress({ kind: "note", step: "stream_end", text: "模型输出结束 · stopReason=stop", usage: { input: 7, output: 3 } });
        return { summary: "S", usage: { input: 7, output: 3 } };
      },
      onEvent: (event) => events.push(event),
    });

    await compaction.onTurnEnd();
    await settle();

    const status = compaction.getStatus();
    assert.equal(status.status, "ready");
    assert.equal(status.runs.length, 1);
    const run = status.runs[0];
    assert.equal(run.id, status.runId);
    assert.equal(run.status, "ready");
    assert.equal(run.endedAt, null, "ready 还没结束（等安全点应用）");
    assert.deepEqual(run.usage, { input: 7, output: 3 });
    // 触发信息够回答「为什么压」：真实 usage 不可用时标记为估算
    assert.equal(run.trigger.tokenThreshold, 700);
    assert.equal(run.trigger.keepRecentTokens, 200);
    assert.ok(run.trigger.tokens >= 700);
    // 时间线覆盖触发 → 计划 → 摘要会话 → 输出结束 → ready
    const steps = run.steps.map((step) => step.step);
    assert.deepEqual(steps, ["trigger", "plan", "session", "stream_end", "ready"]);
    assert.ok(run.steps.every((step) => Number.isFinite(step.at)));
    assert.match(run.steps[1].text, /待摘要 2 条消息/);
    // 流式只留尾部预览与计数，不把全文塞进每个事件
    assert.equal(run.stream.preview, "部分摘要正文");
    assert.equal(run.stream.chars, "部分摘要正文".length);
    assert.equal(run.stream.thinkingChars, 1);

    assert.ok(await compaction.maybeApply());
    const applied = compaction.getStatus();
    assert.equal(applied.status, "applied");
    assert.equal(applied.runId, null, "终态后没有在途 run");
    const done = applied.runs[0];
    assert.equal(done.status, "applied");
    assert.ok(Number.isFinite(done.endedAt));
    assert.equal(typeof done.result.compactionId, "string");
    assert.ok(done.result.estimatedTokensAfter < done.result.tokensBefore);
    // 事件里带 runs：前端拿事件就能直接渲染详情，不用另外取数
    const last = events.filter((e) => e.type === "agent.compaction.status").at(-1);
    assert.equal(last.data.runs.at(-1).status, "applied");
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("run 记录：失败原因落在 run.error，历史只留最近 5 条", async () => {
  const { session, cleanup } = await createTestSession();
  const diagnosticDir = mkdtempSync(join(tmpdir(), 'axiom-diagnostic-test-'));
  session.sessionManager.getSessionFile = () => join(diagnosticDir, 'session.jsonl');
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: { ...enabledConfig, model: null },
      summarize: async () => { throw new Error("boom sk-secret"); },
    });
    for (let i = 0; i < 7; i++) {
      await compaction.onTurnEnd();
      await settle();
      // setConfig 只在配置真的变了时清冷却：交替两个值，让下一轮立马能再试。
      compaction.setConfig({ ...enabledConfig, keepRecentTokens: i % 2 === 0 ? 210 : 200 });
    }
    const runs = compaction.getStatus().runs;
    assert.equal(runs.length, 5, "只保留最近 5 条");
    const failed = runs.find((run) => run.status === "failed");
    assert.ok(failed, "失败的 run 仍可回看");
    assert.match(failed.error, /boom/);
    assert.ok(!failed.error.includes("sk-secret"), "错误已脱敏");
    const diagnosticText = readFileSync(`${session.sessionManager.getSessionFile()}.compaction-diagnostics.json`, 'utf8');
    const diagnostics = JSON.parse(diagnosticText);
    assert.equal(diagnostics.length, 5);
    assert.equal(diagnostics.at(-1).errorCode, 'SUMMARY_REQUEST_FAILED');
    assert.ok(!diagnosticText.includes('sk-secret'));
    assert.ok(!diagnosticText.includes('boom'));
    assert.ok(diagnostics.at(-1).steps.some(step => step.step === 'failed'));
  } finally {
    compaction?.dispose();
    cleanup();
    rmSync(diagnosticDir, { recursive: true, force: true });
  }
});

test("cancelRun：中断在途摘要、压冷却期，陈旧 runId 不误杀新任务", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const { session, cleanup } = await createTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const signals = [];
    let release;
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: ({ signal }) => {
        signals.push(signal);
        return new Promise((resolve) => { release = () => resolve({ summary: "S", usage: {} }); });
      },
    });

    // 没有在途任务时取消是安全的空操作
    assert.deepEqual(compaction.cancelRun(), { cancelled: false, reason: "no-active-run", status: null });

    await compaction.onTurnEnd();
    await settle();
    const runId = compaction.getStatus().runId;
    assert.ok(runId);

    // 陈旧 runId 不动在途任务
    assert.equal(compaction.cancelRun("run-stale").cancelled, false);
    assert.equal(compaction.getStatus().status, "summarizing");
    assert.equal(signals[0].aborted, false);

    const result = compaction.cancelRun(runId);
    assert.equal(result.cancelled, true);
    assert.equal(result.status.status, "cancelled");
    assert.equal(signals[0].aborted, true, "真实中断后台 LLM");
    const cancelled = compaction.getStatus().runs.at(-1);
    assert.equal(cancelled.status, "cancelled");
    assert.match(cancelled.message, /按你的要求取消/);
    assert.ok(cancelled.steps.some((step) => step.step === "cancel"));

    // 迟到结果不落地
    release();
    await settle();
    assert.equal(await compaction.maybeApply(), null);
    assert.ok(!session.sessionManager.getBranch().some((entry) => entry.type === "compaction"));

    // 冷却期内不自动重跑，冷却过后恢复
    await compaction.onTurnEnd();
    await settle();
    assert.equal(signals.length, 1, "60 秒冷却内不再自动重试");
    t.mock.timers.tick(60000);
    await compaction.onTurnEnd();
    await settle();
    assert.equal(signals.length, 2);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});
