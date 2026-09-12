import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  DEFAULT_COMPACTION_CONFIG,
} from "../src/compaction.js";

test("增量展示与完整交接分离，格式异常保留原文", () => {
  const progress = { title: "确认通知缺口", description: "发现已通知不等于已读，尚未修复。" };
  const tags = `<axiom_compact_title>\n${progress.title}\n</axiom_compact_title>\n<axiom_compact_desc>${progress.description}</axiom_compact_desc>`;
  const text = `Goal: 保留之前的约束\nProgress: 新发现\n${tags}`;
  assert.deepEqual(parseSummaryOutput(text), { progress, summary: "Goal: 保留之前的约束\nProgress: 新发现" });
  assert.deepEqual(parseSummaryOutput(text.replaceAll("\n", "\r\n") + "\n"), { progress, summary: "Goal: 保留之前的约束\r\nProgress: 新发现" });
  for (const value of ["旧摘要", tags, `${text}\n后续正文`, text.replace("</axiom_compact_desc>", ""), text.replace(progress.title, ""), text.replace(progress.title, "长".repeat(31)), text.replace(progress.description, "长".repeat(201)), text.replace(progress.title, "<nested>标题</nested>"), `AXIOM_PROGRESS ${JSON.stringify(progress)}\n旧格式摘要`])
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
  assert.equal(DEFAULT_COMPACTION_CONFIG.enabled, false);
  assert.equal(DEFAULT_COMPACTION_CONFIG.tokenThreshold, 100000);
  assert.equal(DEFAULT_COMPACTION_CONFIG.percentThreshold, 70);
  assert.equal(DEFAULT_COMPACTION_CONFIG.model, null);
  assert.equal(DEFAULT_COMPACTION_CONFIG.thinking, "off");
  assert.equal(DEFAULT_COMPACTION_CONFIG.keepRecentTokens, 20000);
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
