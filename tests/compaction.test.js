import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
  summarizeWithPiSession,
  summarizedEntryIds,
  summaryRequest,
  parseSummaryOutput,
  validateFacts,
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

test("增量展示与完整交接分离，格式异常只丢元数据不污染正文", () => {
  const progress = { title: "确认通知缺口", description: "发现已通知不等于已读，尚未修复。" };
  const tags = `<axiom_compact_title>\n${progress.title}\n</axiom_compact_title>\n<axiom_compact_desc>${progress.description}</axiom_compact_desc>`;
  const body = "Goal: 保留之前的约束\nProgress: 新发现";
  const text = `${body}\n${tags}`;
  assert.deepEqual(parseSummaryOutput(text), { progress, summary: body });
  assert.deepEqual(parseSummaryOutput(text.replaceAll("\n", "\r\n") + "\n"), { progress, summary: body.replace("\n", "\r\n") });
  // C-T1：标签不在结尾、顺序颠倒都照样拆元数据；正文里绝不留标签原文（否则会随 previousSummary 回注自我强化）
  assert.deepEqual(parseSummaryOutput(`${text}\n后续正文`), { progress, summary: `${body}\n后续正文` });
  assert.deepEqual(
    parseSummaryOutput(`${body}\n<axiom_compact_desc>${progress.description}</axiom_compact_desc>\n<axiom_compact_title>${progress.title}</axiom_compact_title>`),
    { progress, summary: body },
  );
  // 元数据不合格（空、超长、含嵌套标签）→ 只丢 progress，正文照旧干净
  for (const value of [text.replace(progress.title, ""), text.replace(progress.title, "长".repeat(31)), text.replace(progress.description, "长".repeat(201)), text.replace(progress.title, "<nested>标题</nested>"), text.replace(progress.title, "🙂".repeat(31))])
    assert.deepEqual(parseSummaryOutput(value), { summary: body });
  // C-T2：长度按码点算，16 个 emoji 的标题不算超长；标题里的 > 是正常文字，不是嵌套标签
  for (const title of ["🙂".repeat(16), "A > B 的差异"])
    assert.deepEqual(parseSummaryOutput(text.replace(progress.title, title)), { progress: { ...progress, title }, summary: body });
  // 落单标签只删标记本身：闭合边界未知，标记后的内容当正文留下，不误吞
  assert.deepEqual(parseSummaryOutput(text.replace("</axiom_compact_desc>", "")), { summary: `${body}\n${progress.description}` });
  // 只有标签没有正文 → 摘要为空，由调用方跳过压缩保留原文；不把标签原文当摘要
  assert.deepEqual(parseSummaryOutput(tags), { progress, summary: "" });
  // 代码围栏里的标签是讨论内容不是协议；整份输出被围栏包住时退回原文扫描，元数据照样拆出
  const fenced = "```\n<axiom_compact_title>示例</axiom_compact_title>\n```";
  assert.deepEqual(parseSummaryOutput(`${fenced}\n${tags}`), { progress, summary: fenced });
  assert.deepEqual(parseSummaryOutput(`\`\`\`markdown\n${text}\n\`\`\``), { progress, summary: `\`\`\`markdown\n${body}\n\`\`\`` });
  for (const value of ["旧摘要", `AXIOM_PROGRESS ${JSON.stringify(progress)}\n旧格式摘要`])
    assert.deepEqual(parseSummaryOutput(value), { summary: value });
  const request = summaryRequest("本次新增发现", "历史约束");
  assert.match(request, /ONLY progress/);
  assert.match(request, /NOT incremental/);
  assert.match(request, /Do not include numbering/);
  assert.match(request, /<axiom_compact_title>/);
  assert.match(request, /<axiom_compact_desc>/);
  assert.ok(!request.includes("AXIOM_PROGRESS"));
});

test("连续摘要请求完整传入旧约束并要求保留，而非仅输出增量", () => {
  for (const previous of ["约束A：禁止新增依赖", "约束A：禁止新增依赖；已完成B"]) {
    const request = summaryRequest("只讨论新方案C", previous);
    assert(request.includes(`<previous-summary>\n${previous}\n</previous-summary>`));
    assert.match(request, /Silence does not mean a requirement has expired/);
    assert.match(request, /complete handoff, not just an incremental update/);
    assert.match(request, /only when the conversation explicitly changes/);
  }
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

test('manual sync generation failure falls back once without re-entering enhanced compaction', async () => {
  const { session, cleanup } = await createTestSession();
  let ctrl, calls = 0, summaries = 0;
  try {
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 }, summarize: async () => { summaries++; throw new Error('invalid JSON'); }, nativeFallback: async () => { calls++; ctrl.onTurnEnd({ manual: true }); await assert.rejects(ctrl.runNow('sync'), /已有压缩任务/); } });
    const result = await ctrl.runNow('sync');
    assert.equal(calls, 1); assert.equal(summaries, 1);
    assert.equal(result.status, 'applied'); assert.match(result.message, /未进行 facts/);
  } finally { ctrl?.dispose(); cleanup(); }
});

test('native fallback is independently observable and cancellable', async () => {
  const { session, cleanup } = await createTestSession();
  let ctrl;
  try {
    seed(session, [userMsg(big('a')), assistantMsg(big('b')), userMsg(big('c'))]);
    ctrl = createBackgroundCompaction({ session, config: { ...enabledConfig, syncKeepRecentTokens: 200 },
      summarize: async () => { throw new Error('enhanced failure'); },
      nativeFallback: async (progress, signal) => {
        progress({ kind: 'request', requestId: 'native-1', context: { systemPrompt: 'native', messages: [] } });
        const result = ctrl.cancelRun(ctrl.getStatus().runId);
        assert.equal(result.cancelled, true);
        assert.equal(signal.aborted, true);
        throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      }
    });
    const result = await ctrl.runNow('sync');
    assert.equal(result.status, 'cancelled');
    assert.equal(result.runs.length, 2);
    assert.equal(result.runs[0].status, 'failed');
    assert.equal(result.runs[1].status, 'cancelled');
    assert.equal(JSON.stringify(result).includes('systemPrompt'), false);
    const attempt = ctrl.getAttempt(result.runs[1].id);
    assert.equal(attempt.requests[0].context.systemPrompt, 'native');
    assert.equal(ctrl.getAttempt(attempt.id, attempt.revision).unchanged, true);
  } finally { ctrl?.dispose(); cleanup(); }
});

for (const mode of ['archive', 'cancel', 'native-error', 'async']) test(`native fallback safety: ${mode}`, async () => {
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
    assert.equal(calls, mode === 'native-error' ? 1 : 0);
    if (mode === 'native-error') assert.match(ctrl.getStatus().message, /未再次重试/);
  } finally { ctrl?.dispose(); cleanup(); }
});

function fakeSummarize(log) {
  return async ({ messages, previousSummary }) => {
    log?.push({ count: messages.length, previousSummary });
    return { summary: `S:${messages.length}`, progress: { title: "本次进展", description: "本次新增发现。" }, usage: { input: 10, output: 5 } };
  };
}

// 挂起不响应的伪 LLM 服务（用于验证取消真的中断 HTTP 请求）
async function startHangingLlmServer() {
  let sawRequest = false;
  let closed = false;
  const server = createServer((req, res) => {
    sawRequest = true;
    req.on("close", () => {
      closed = true;
    });
    req.resume();
    // 故意不响应：模拟慢 LLM
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    port: server.address().port,
    sawRequest: () => sawRequest,
    closed: () => closed,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

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

test('manual fallback calls real SDK compact and appends a native compaction record', async () => {
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
    assert.equal((await ctrl.runNow('sync')).status, 'applied');
    assert.equal(fake.requests.length, 1);
    const branch = session.sessionManager.getBranch();
    assert.equal(branch.at(-1).type, 'compaction');
    assert.match(branch.at(-1).summary, /Native summary/);
    assert.ok(ids.every(id => branch.some(entry => entry.id === id)));
    assert.ok(events.some(event => event.type === 'compaction_end' && event.result));
  } finally { ctrl?.dispose(); session?.dispose(); await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("真实摘要 JSON：原文引用核验，伪造引文与非 JSON 整份拒绝", async () => {
  const state = { schemaVersion: 1, goals: [], constraints: [], decisions: [], progress: [], evidence: [{ id: "e1", status: "completed", text: "已验证输出", sources: [{ ref: "m1", quote: "真实输出" }] }], uncertainties: [], nextActions: [], sourceDirectory: [] };
  let response = JSON.stringify(state);
  const fake = await startFakeLlmServer({ reply: () => response });
  const dir = mkdtempSync(join(tmpdir(), "axiom-state-http-"));
  let session;
  try {
    const runtime = await createLoopSession(dir, fake.port);
    session = runtime.session;
    const options = { messages: [userMsg("真实输出")], evidence: [{ entryId: "m1", role: "user", text: "真实输出" }], model: session.model, modelRuntime: runtime.modelRuntime, thinking: "off" };
    const result = await summarizeWithPiSession(options);
    assert.match(result.summary, /已验证输出/);
    assert.equal(result.taskState.evidence[0].sources[0].verificationStatus, "verified_original");
    assert.deepEqual(result.taskState.evidence[0].sources[0].range, [0, Buffer.byteLength("真实输出")]);
    response = `\`\`\`json\n${JSON.stringify(state)}\n\`\`\``;
    const fenced = await summarizeWithPiSession(options);
    assert.deepEqual(fenced.taskState, result.taskState);
    response = JSON.stringify({ schemaVersion: 1, evidence: state.evidence });
    const sparse = await summarizeWithPiSession(options);
    assert.deepEqual(sparse.taskState, result.taskState, '省略空字段不影响来源核验');
    response = JSON.stringify({ schemaVersion: 1, progress: [{ id: 'p1', text: '待核验进展', status: 'uncertain' }] });
    const noSources = await summarizeWithPiSession(options);
    assert.deepEqual(noSources.taskState.progress[0].sources, []);
    response = 'null';
    await assert.rejects(summarizeWithPiSession(options), { code: 'SUMMARY_SCHEMA_INVALID' });
    const previousState = structuredClone(result.taskState);
    previousState.constraints = [{ id: 'c1', text: '禁止推送', status: 'active', sources: [] }];
    state.constraints = [{ id: 'c1', text: '允许推送', status: 'active', sources: [{ ref: 'm2', quote: '允许推送' }] }];
    response = JSON.stringify(state);
    const changed = await summarizeWithPiSession({ ...options, previousState, evidence: [...options.evidence, { entryId: 'm2', role: 'user', userText: '允许推送', text: '允许推送' }] });
    assert.equal(changed.taskState.constraints[0].text, '允许推送');
    await assert.rejects(summarizeWithPiSession({ ...options, previousState, evidence: [...options.evidence, { entryId: 'm2', role: 'toolResult', text: '允许推送' }] }), { code: 'SUMMARY_AUTHORITY_REQUIRED' });
    state.constraints = [];
    state.evidence[0].sources[0].quote = "编造输出";
    response = `\`\`\`json\n${JSON.stringify(state)}\n\`\`\``;
    await assert.rejects(summarizeWithPiSession(options), /SUMMARY_INVALID/);
    response = "ok";
    await assert.rejects(summarizeWithPiSession(options), /SUMMARY_INVALID/);
    state.evidence[0].sources[0] = { ref: "invented", part: "part_0", contentHash: "forged", range: [0, 1], verificationStatus: "inherited_unverified" };
    response = JSON.stringify(state);
    await assert.rejects(summarizeWithPiSession(options), /SUMMARY_SOURCE_INVALID/);
  } finally {
    session?.dispose();
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// —— 配置契约：严格 schema，不再宽松吞非法值 ——

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

test("summarizeWithPiSession: 真实 HTTP 401 保留模型错误并隐藏密钥", async () => {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Unauthorized: incorrect API key sk-private-secret", type: "invalid_request_error" } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dir = mkdtempSync(join(tmpdir(), "axiom-compaction-error-"));
  let session;
  try {
    const created = await createLoopSession(dir, server.address().port);
    session = created.session;
    await assert.rejects(summarizeWithPiSession({
      messages: [userMsg("hello")],
      model: session.model,
      thinking: "off",
      modelRuntime: created.modelRuntime,
    }), (error) => {
      assert.match(error.message, /stopReason=error/);
      assert.match(error.message, /Unauthorized/);
      assert.ok(!error.message.includes("sk-private-secret"));
      return true;
    });
    assert.equal(requests, 1, "401 不在 SDK 中重复请求");
  } finally {
    session?.dispose();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("summarizeWithPiSession: signal 取消会真实中断后台 LLM 的 HTTP 请求", async () => {
  const fake = await startHangingLlmServer();
  const dir = mkdtempSync(join(tmpdir(), "axiom-compaction-abort-"));
  try {
    const { modelRuntime } = await createLoopSession(dir, fake.port);
    const controller = new AbortController();
    const promise = summarizeWithPiSession({
      messages: [userMsg("hello")],
      model: fakeModel(`http://127.0.0.1:${fake.port}/v1`),
      thinking: "off",
      modelRuntime,
      signal: controller.signal,
    });
    await waitFor(() => fake.sawRequest(), 10000); // 后台真实 LLM 请求已在途
    controller.abort();
    await assert.rejects(promise); // 摘要随之中止，不跑自然完成
    await waitFor(() => fake.closed(), 10000); // 底层 HTTP 连接被中断
  } finally {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// —— 真实 SDK loop 端到端：真实 prompt → turn_end 钩子 → 真实摘要会话 → 安全点自动应用 ——

test("真实 SDK loop：prompt 触发 turn_end 后台摘要，下一次 prompt 在安全点自动应用", async () => {
  const fake = await startFakeLlmServer({ reply: body => JSON.stringify(body).includes("Additional focus:") ? "## Goal\n收到 ok" : "ok" });
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
    await waitFor(() => fake.completed.length >= 2, 10000);
    // 等待摘要响应在客户端侧完成、flight 落定（本地回环，250ms 足够）
    await new Promise((resolve) => setTimeout(resolve, 250));
    await settle();

    await prompt("more"); // 安全点（pi.js 同款入口）应用压缩，然后再发起下一次 LLM 请求
    assert.equal(fake.requests.length, 3);
    const data = events.find((event) => event.type === "agent.compaction")?.data;
    assert.ok(data, "应发出 agent.compaction 事件");
    assert.match(data.summary, /## Goal/);
    const attempt = compaction.getAttempt(compaction.getStatus().runs.at(-1).id);
    assert.ok(JSON.stringify(attempt.requests).includes('原文'));
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

// —— facts 逐字引文三层机制：解析 → 校验 → 附录/快照 ——
async function createPersistentTestSession() {
  const dir = mkdtempSync(join(tmpdir(), "axiom-compaction-persist-"));
  const session = (
    await createAgentSession({
      cwd: dir,
      agentDir: dir,
      modelRuntime: await ModelRuntime.create({ authPath: join(dir, "auth.json"), modelsPath: null }),
      model: fakeModel(),
      thinkingLevel: "off",
      sessionManager: SessionManager.create(dir, dir), // 持久 session：sessionFile 非空，快照会落盘
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    })
  ).session;
  return { session, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const factsTags = (facts) => `<axiom_compact_facts>\n${facts}\n</axiom_compact_facts>`;
const withFacts = (facts) =>
  `summary body\n${factsTags(facts)}\n<axiom_compact_title>本次进展</axiom_compact_title>\n<axiom_compact_desc>本次新增发现。</axiom_compact_desc>`;
const withoutFacts = () =>
  `summary body\n<axiom_compact_title>本次进展</axiom_compact_title>\n<axiom_compact_desc>本次新增发现。</axiom_compact_desc>`;

test("parseSummaryOutput: facts 块提取（存在/缺失/未闭合/空块/bullet 保留/超长行过滤/上限）", () => {
  const ok = parseSummaryOutput(withFacts("- /src/a.js\n- npm test"));
  assert.deepEqual(ok.facts, ["- /src/a.js", "- npm test"], "bullet 前缀原样保留，交给校验层降级匹配");
  assert.equal(ok.summary, "summary body");
  assert.ok(!ok.summary.includes("axiom_compact_facts"), "标签与块内容都不得留在正文");

  const none = parseSummaryOutput(withoutFacts());
  assert.ok(!("facts" in none), "无块：不出现 facts 键（向后兼容）");

  const unclosed = parseSummaryOutput("summary body\n<axiom_compact_facts>\n- not a fact");
  assert.ok(!("facts" in unclosed), "未闭合：不进 facts");
  assert.ok(!unclosed.summary.includes("<axiom_compact_facts>"), "落单标记剥掉");
  assert.ok(unclosed.summary.includes("not a fact"), "内容留在正文");

  const empty = parseSummaryOutput(withFacts(""));
  assert.ok(!("facts" in empty));
  assert.ok(!empty.summary.includes("axiom_compact_facts"), "空块标记也剥掉");

  const bullet = parseSummaryOutput(withFacts("- /a.js\n\n\n  /b.js  \n"));
  assert.deepEqual(bullet.facts, ["- /a.js", "/b.js"], "空白行剔除、首尾 trim；bullet 前缀保留");

  const overlong = parseSummaryOutput(withFacts(`- ${"y".repeat(400)}\n- z`));
  assert.deepEqual(overlong.facts, ["- z"], "超过 300 字符的行剔除");

  const many = parseSummaryOutput(withFacts(Array.from({ length: 40 }, (_, i) => `/f${i}`).join("\n")));
  assert.equal(many.facts.length, 30, "上限 30 行");
  assert.equal(many.facts[0], "/f0");
  assert.equal(many.facts[29], "/f29");
});

test("validateFacts: 逐字对账（行号/漏检/前摘命中/bullet 降级/dedup）", () => {
  const corpus = "[User]: 修一下 /src/a.js 的 bug\n\n[Assistant]: npm test 报\nAssertionError: expected 3";
  const ok = validateFacts(["/src/a.js", "AssertionError: expected 3"], corpus, null);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.facts, [
    { quote: "/src/a.js", line: 1 },
    { quote: "AssertionError: expected 3", line: 4 },
  ]);

  const bad = validateFacts(["/src/a.js", "不存在的话"], corpus, null);
  assert.equal(bad.ok, false, "一条编造 → 整单失败");
  assert.deepEqual(bad.missed, ["不存在的话"]);
  assert.equal(bad.facts.length, 1, "其余引文仍核验记账");

  const fromPrev = validateFacts(["/old/config.json"], "", "上轮已确认路径 /old/config.json");
  assert.deepEqual(fromPrev.facts, [{ quote: "/old/config.json", line: null }], "仅前摘命中：无行号");
  const preferConv = validateFacts(["/src/a.js"], corpus, "前摘里也有 /src/a.js");
  assert.equal(preferConv.facts[0].line, 1, "会话原文优先于前摘");

  const bullet = validateFacts(["- AssertionError: expected 3"], corpus, null);
  assert.equal(bullet.ok, true);
  assert.deepEqual(bullet.facts, [{ quote: "AssertionError: expected 3", line: 4 }], "bullet 前缀剥掉后命中");

  const dup = validateFacts(["/src/a.js", "/src/a.js", "- /src/a.js"], corpus, null);
  assert.equal(dup.facts.length, 1, "同引文（含变体）只记一条");
});

test("summaryRequest: 要求第三个标签 axiom_compact_facts 并写明逐字核验后果", () => {
  const request = summaryRequest("conversation", null);
  assert.ok(request.includes("<axiom_compact_facts>"));
  assert.ok(request.includes("verified mechanically"));
  assert.ok(request.includes("discard the entire summary"));
  assert.ok(request.includes("exact contiguous copy"));
});

test("合法 facts：附录随摘要进上下文，原文快照落盘，details 携带", async () => {
  const { session, cleanup } = await createPersistentTestSession();
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    const events = [];
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
      summarize: async () => ({
        summary: "S:2",
        progress: { title: "本次进展", description: "本次新增发现。" },
        facts: ["a".repeat(80), "b".repeat(80)], // keepRecentTokens 保留最后一条消息：被摘要语料只含前两条
        usage: { input: 10, output: 5 },
      }),
      onEvent: (event) => events.push(event),
    });
    await compaction.onTurnEnd();
    await settle();
    const data = await compaction.maybeApply();
    assert.ok(data, "应用应成功");
    // 附录：摘要原文在前，随后带行号的引文清单
    assert.ok(data.summary.startsWith("S:2\n"), "摘要原文在前");
    assert.ok(data.summary.includes("已核验引文"));
    assert.ok(data.summary.includes(`- line=1 ${JSON.stringify("a".repeat(80))}`));
    assert.ok(data.summary.includes(`- line=3 ${JSON.stringify("b".repeat(80))}`));
    assert.ok(data.snapshotPath.endsWith(`.txt`) && data.snapshotPath.includes("compaction-snapshots"));
    // 快照：真实存在且内容是渲染原文（行号指向它）
    assert.ok(existsSync(data.snapshotPath));
    const snapshot = readFileSync(data.snapshotPath, "utf8");
    assert.ok(snapshot.includes("[User]: " + "a".repeat(80)));
    assert.ok(snapshot.includes("[Assistant]: " + "b".repeat(80)));
    assert.ok(data.summary.includes(`原文快照: ${data.snapshotPath}`), "回读指引随附录写入");
    // 落盘 details 同构
    const leaf = session.sessionManager.getLeafEntry();
    assert.equal(leaf.type, "compaction");
    assert.deepEqual(leaf.details.progress, { title: "本次进展", description: "本次新增发现。" });
    assert.equal(leaf.details.snapshotPath, data.snapshotPath);
    assert.deepEqual(leaf.details.facts, data.facts);
    // 上下文中的摘要消息带附录
    assert.equal(session.messages[0].role, "compactionSummary");
    assert.equal(session.messages[0].summary, data.summary);
    assert.deepEqual(events.find((e) => e.type === "agent.compaction").data, data);
  } finally {
    compaction?.dispose();
    cleanup();
  }
});

test("编造引文：整份摘要作废不落盘，冷却后回合边界重试", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
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
        if (calls.length > 2) throw new Error("failed again");
        return calls.length === 1
          ? { summary: "S:3", facts: ["a".repeat(80), "这条引文在原文中不存在"], usage: { input: 10, output: 5 } }
          : { summary: "S:3", facts: ["b".repeat(80)], usage: { input: 10, output: 5 } };
      },
      onEvent: (event) => events.push(event),
    });
    const before = session.messages.slice();
    await compaction.onTurnEnd();
    await settle();
    assert.equal(await compaction.maybeApply(), null, "一条编造 → 整单作废");
    assert.deepEqual(session.messages, before, "原文不动");
    assert.ok(!session.sessionManager.getBranch().some((entry) => entry.type === "compaction"));
    assert.equal(compaction.getStatus().status, "failed");
    assert.ok(events.some((e) => e.type === "agent.compaction.status" && /逐字/.test(e.data.message)));
    await compaction.onTurnEnd();
    assert.equal(calls.length, 1, "引文核验失败也受冷却保护");
    t.mock.timers.tick(30000);
    // 冷却后在回合边界重新发起并通过
    await compaction.onTurnEnd();
    await settle();
    assert.equal(calls.length, 2);
    const data = await compaction.maybeApply();
    assert.ok(data, "重试应成功");
    assert.ok(data.summary.includes(`- line=3 ${JSON.stringify("b".repeat(80))}`));
    seed(session, [userMsg(big("d")), assistantMsg(big("e")), userMsg(big("f"))]);
    await compaction.onTurnEnd();
    await settle();
    assert.equal(compaction.getStatus().status, "failed");
    assert.match(compaction.getStatus().message, /30 秒/, "成功应用后失败计数清零");
  } finally {
    compaction?.dispose();
    cleanup();
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
