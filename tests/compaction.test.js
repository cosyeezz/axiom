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
import {
  createBackgroundCompaction,
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
  contextWindow: 1000,
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
  tokenThreshold: null,
  percentThreshold: 70, // contextWindow 1000 → 700 触发
  model: null,
  thinking: "off",
  keepRecentTokens: 200,
};

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
async function startFakeLlmServer({ hold } = {}) {
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
      chunk({ role: "assistant", content: "ok" }, null);
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
  let compaction;
  try {
    seed(session, [userMsg(big("a")), assistantMsg(big("b")), userMsg(big("c"))]);
    compaction = createBackgroundCompaction({
      session,
      modelRuntime: null,
      config: enabledConfig,
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

test("摘要失败：保留原文，不落盘，及时报告失败", async () => {
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
    // 失败后 flight 释放，可以再次触发
    await compaction.onTurnEnd();
    await settle();
    assert.equal(await compaction.maybeApply(), null);
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
          models: [{ id: "test-model", name: "Test Model", contextWindow: 1000, maxTokens: 100 }],
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
  const fake = await startFakeLlmServer();
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
    assert.equal(data.summary, "ok");
    assert.ok(data.estimatedTokensAfter < data.tokensBefore);

    const state = session.messages;
    assert.equal(state[0].role, "compactionSummary");
    assert.equal(state[0].summary, "ok");
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
    assert.equal(branch.at(-1).type, "message");
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

test("编造引文：整份摘要作废不落盘，下个 turn_end 自然重试", async () => {
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
    // 失败释放 flight，下个 turn_end 重新发起并通过
    await compaction.onTurnEnd();
    await settle();
    assert.equal(calls.length, 2);
    const data = await compaction.maybeApply();
    assert.ok(data, "重试应成功");
    assert.ok(data.summary.includes(`- line=3 ${JSON.stringify("b".repeat(80))}`));
  } finally {
    compaction?.dispose();
    cleanup();
  }
});
