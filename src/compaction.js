import { messageText, resolveSummaryExcerpts } from "./compaction-excerpt.js";
import { summarizeNative } from "./native-summary.js";
import { SUMMARY_SYSTEM_PROMPT, summaryRequest, taskStateRequest } from "./prompts.js";
export { summaryRequest } from "./prompts.js";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  convertToLlm,
  createAgentSession,
  DefaultResourceLoader,
  estimateTokens,
  findCutPoint,
  findTurnStartIndex,
  ModelRuntime,
  SessionManager,
  sessionEntryToContextMessages,
  serializeConversation,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { compaction, compactionDefaults } from "./protocol.js";
import { confirmDurableAppend } from "./history-journal.js";
import { STATE_FIELDS, validateTaskState, inheritTaskState, renderStateSections } from "./compaction-state.js";
import { selectSummaryInput } from "./compaction-input.js";
import { requestBudget, compactionError } from "./compaction-budget.js";
import { parseTaskStateOutput } from "./compaction-output.js";
import { contentHash } from "./raw-history.js";
import { wrapUsageStream } from "./usage-stream.js";
import { createJiti } from "jiti";
const { AssistantMessageEventStream } = await createJiti(import.meta.resolve("@earendil-works/pi-coding-agent")).import("@earendil-works/pi-ai");
import { cutSpans, maskCode } from "../public/markdown-scan.js";

// SDK usage 未知（尤其刚压缩后）时只估算现有内容，不能重新信任旧 usage。
function contextTokens(messages) {
  return messages.reduce((sum, message) => sum + estimateTokens(message), 0);
}

// 与 SDK 内部 prepareCompaction 同算法（未从包主入口导出）：找上个压缩边界 → findCutPoint 裁剪 → 收集待摘要消息。
// split turn 不跳过（用户明确长任务的工具轮次就是触发场景）：最简按 findCutPoint 直接摘要
// boundaryStart → 切点（含 turn prefix），一次摘要请求覆盖全部被折叠消息。
function prepareBackgroundCompaction(branch, keepRecentTokens, reserveTokens = 16384) {
  if (branch.length > 0 && branch[branch.length - 1].type === "compaction") return undefined;
  let boundaryStart = 0;
  let previousSummary;
  let previousState;
  let previousStateDoc;
  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i].type === "compaction") {
      previousSummary = branch[i].summary;
      previousState = structuredClone(branch[i].details?.taskState);
      previousStateDoc = branch[i].details?.stateDoc;
      const kept = branch.findIndex((entry) => entry.id === branch[i].firstKeptEntryId);
      if (kept < 0 && branch[i].firstKeptEntryId !== "__axiom_checkpoint__") throw compactionError("SOURCE_CORRUPT", "Unknown compaction boundary");
      boundaryStart = kept >= 0 ? kept : i + 1;
      break;
    }
  }
  const cut = findCutPoint(branch, boundaryStart, branch.length, keepRecentTokens);
  // SDK 在最新工具结果自身超过保留预算、且其后没有合法切点时会回退到
  // 历史开头。改为向前寻找该批结果所属的助手消息：允许保留尾部超预算，
  // 但仍可摘要更早历史；下方配对检查继续保证不拆散调用与结果。
  if (cut.firstKeptEntryIndex <= boundaryStart) {
    let tokens = 0;
    let crossed = false;
    for (let i = branch.length - 1; i >= boundaryStart; i--) {
      tokens += sessionEntryToContextMessages(branch[i]).reduce((sum, message) => sum + estimateTokens(message), 0);
      crossed ||= tokens >= keepRecentTokens;
      if (crossed && ["assistant", "user"].includes(branch[i].message?.role)) {
        cut.firstKeptEntryIndex = i;
        break;
      }
    }
  }
  const calls = new Map();
  for (let i = boundaryStart; i < branch.length; i++) {
    const message = branch[i].message;
    if (message?.role === "assistant" && Array.isArray(message.content)) for (const block of message.content) if (block.type === "toolCall") calls.set(block.id, i);
    if (message?.role === "toolResult" && i >= cut.firstKeptEntryIndex) {
      const start = calls.get(message.toolCallId);
      if (start !== undefined && start < cut.firstKeptEntryIndex) cut.firstKeptEntryIndex = start;
    }
  }
  const firstKeptEntry = branch[cut.firstKeptEntryIndex];
  if (!firstKeptEntry?.id) return undefined; // 会话需要迁移
  const messagesToSummarize = [];
  const evidence = [];
  for (let i = boundaryStart; i < cut.firstKeptEntryIndex; i++) {
    if (branch[i].type === "compaction") continue;
    const message = sessionEntryToContextMessages(branch[i])[0];
    if (message) {
      messagesToSummarize.push(message);
      evidence.push({ entryId: branch[i].id, role: message.role, userText: message.role === "user" ? (typeof message.content === "string" ? message.content : message.content.filter(block => block.type === "text").map(block => block.text).join("\n")) : undefined, text: serializeConversation(convertToLlm([message])) });
    }
  }
  if (messagesToSummarize.length === 0) return undefined;
  // A recall is a real historical event, not disposable duplicate text.
  const turnStart = findTurnStartIndex(branch, cut.firstKeptEntryIndex, boundaryStart);
  const isSplitTurn = turnStart >= boundaryStart && turnStart < cut.firstKeptEntryIndex;
  const history = isSplitTurn ? branch.slice(boundaryStart, turnStart).filter(e => e.type !== "compaction").flatMap(sessionEntryToContextMessages) : messagesToSummarize;
  const turnPrefixMessages = isSplitTurn ? branch.slice(turnStart, cut.firstKeptEntryIndex).filter(e => e.type !== "compaction").flatMap(sessionEntryToContextMessages) : [];
  const parent = branch.findLast(e => e.type === "compaction");
  const fileOps = { read: new Set(parent?.details?.readFiles ?? []), written: new Set(parent?.details?.modifiedFiles ?? []), edited: new Set() };
  for (const message of messagesToSummarize) if (message.role === "assistant" && Array.isArray(message.content)) {
    for (const block of message.content) if (block.type === "toolCall" && typeof block.arguments?.path === "string") {
      const kind = { read: "read", write: "written", edit: "edited" }[block.name];
      if (kind) fileOps[kind].add(block.arguments.path);
    }
  }
  return { firstKeptEntryId: firstKeptEntry.id, messagesToSummarize, previousSummary, previousState, previousStateDoc, evidence,
    nativePreparation: { firstKeptEntryId: firstKeptEntry.id, messagesToSummarize: history, turnPrefixMessages, isSplitTurn,
      previousSummary, tokensBefore: contextTokens(branch.flatMap(sessionEntryToContextMessages)), fileOps,
      settings: { enabled: true, reserveTokens, keepRecentTokens } } };
}

// 配置契约：与 protocol.js 的 compaction schema 严格一致（复用同一份 zod schema 与默认值），
// 非法配置直接抛错，不再宽松兜底吞掉非法值。
export const DEFAULT_COMPACTION_CONFIG = compactionDefaults;

export function normalizeCompaction(value) {
  return value == null ? { ...compactionDefaults } : compaction.parse(value);
}

export function overCompactionThreshold(tokens, contextWindow, config) {
  if (config.tokenThreshold != null && tokens >= config.tokenThreshold) return true;
  return config.percentThreshold != null && contextWindow > 0 && tokens >= (contextWindow * config.percentThreshold) / 100;
}

// message_end 事件发出时 SDK 尚未持久化该消息，持久化完成后可按消息引用反查 entry id。
export function entryIdFor(sessionManager, message) {
  try {
    const entry = sessionManager
      .getEntries()
      .findLast((candidate) => candidate.type === "message" && candidate.message === message);
    return entry ? { entryId: entry.id } : {};
  } catch {
    return {};
  }
}

// 被摘要折叠的消息对应的 entry id（与摘要区间一致：上个压缩保留边界 → 保留切点）。
// 压缩记录追加在分支末尾，可能在本次切点之后；从整条分支寻找最新保留边界。
export function summarizedEntryIds(branch, firstKeptEntryId) {
  const cut = branch.findIndex((entry) => entry.id === firstKeptEntryId);
  if (cut <= 0) return [];
  let start = 0;
  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i].type === "compaction") {
      const kept = branch.findIndex((entry) => entry.id === branch[i].firstKeptEntryId);
      start = kept >= 0 ? kept : i + 1;
      break;
    }
  }
  return branch.slice(start, cut).filter((entry) => ["message", "custom_message"].includes(entry.type)).map((entry) => entry.id);
}

// —— 后台摘要：独立内存 Pi 会话，无工具、不加载任何扩展/技能/提示词/主题/上下文文件 ——
// 空临时 agentDir 只隔离全局发现；祖先 AGENTS/.agents 扫描（loadProjectContextFiles 沿 cwd 向上）
// 与技能扫描由 noContextFiles/noSkills 等选项显式关闭。
// 展示元数据只在格式有效时拆出；模型不守格式时只丢元数据，正文照旧完整。
// 标签原文一律从正文里剥掉：兜底保留全文会让标签随 previousSummary 回注、自我强化，
// 下一轮摘要把标签当交接内容再抄一遍。解析放宽到「标签不在结尾、顺序颠倒、后面还有正文」
// 都能拆出，长度按码点算（emoji 不占两格）。
const COMPACT_MAX = { title: 30, desc: 200 };
const FACTS_MAX = { lines: 30, chars: 300 };
export function parseSummaryOutput(text) {
  const raw = text.trim();
  const masked = maskCode(raw);
  // 围栏里的标签是讨论内容不是协议；整份输出被围栏包住时标签全被掩码，退回原文扫描
  const scan = masked.includes("<axiom_compact_") ? masked : raw;
  const spans = [];
  const field = (name) => {
    const open = `<axiom_compact_${name}>`;
    const close = `</axiom_compact_${name}>`;
    for (const hit of scan.matchAll(new RegExp(`</?axiom_compact_${name}>`, "g")))
      spans.push([hit.index, hit.index + hit[0].length]); // 落单标记也剥掉，正文不留标签原文
    const at = scan.indexOf(open);
    const end = at < 0 ? -1 : scan.indexOf(close, at + open.length);
    if (end < 0) return null; // 配不成对：闭合边界未知，只删标记本身，后面的内容当正文留着
    spans.push([at, end + close.length]);
    const value = raw.slice(at + open.length, end).trim();
    return value && !value.includes("<") && [...value].length <= COMPACT_MAX[name] ? value : null;
  };
  // facts 块：逐字引文清单，交由 validateFacts 机械对账。无块/空块/超长行都只丢这一层，
  // 摘要照旧——这层是校验增益不是硬门槛；但只要给出引文，就必须逐条能对上，一条编造整单作废。
  // 引文里允许出现 <（代码事实常见），与 title/desc 的纯文本约束不同。
  const factsField = () => {
    const open = "<axiom_compact_facts>";
    const close = "</axiom_compact_facts>";
    for (const hit of scan.matchAll(new RegExp("</?axiom_compact_facts>", "g")))
      spans.push([hit.index, hit.index + hit[0].length]);
    const at = scan.indexOf(open);
    const end = at < 0 ? -1 : scan.indexOf(close, at + open.length);
    if (at < 0 || end < 0) return undefined; // 无块或配不成对：只剥标记本身，内容不进 facts
    spans.push([at, end + close.length]);
    const lines = raw
      .slice(at + open.length, end)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => [...line].length <= FACTS_MAX.chars);
    return lines.length > 0 ? lines.slice(0, FACTS_MAX.lines) : undefined;
  };
  const facts = factsField();
  const title = field("title");
  const description = field("desc");
  const summary = cutSpans(raw, spans).trim();
  const result = title && description ? { summary, progress: { title, description } } : { summary };
  if (facts) result.facts = facts;
  return result;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error("Summarization aborted");
}

// —— 逐字引文校验（借鉴 SoL-Pi EPR 的 evidence 纪律）——
// 摘要的叙述无法机械核对，但它声称的“事实”可以：每条引文在摘要模型实际看到的语料里
// indexOf 逐字对账，一条编造就作废整份摘要（不是删掉坏行，防止“编十条留九条”的激励）。
// 语料 = serializeConversation 渲染文本（与模型所见逐字一致，纯确定性渲染无时间戳），
// 快照文件与行号都指向这份文本；上轮摘要里的内容可引（行号记 null，它不在本次快照里）。
function factMatch(fact, corpus) {
  const direct = corpus.indexOf(fact);
  if (direct >= 0) return { index: direct, quote: fact };
  const stripped = fact.replace(/^[-*]\s+/, ""); // 模型可能加 bullet 前缀；剥掉后能逐字命中才算数
  if (stripped !== fact) {
    const index = corpus.indexOf(stripped);
    if (index >= 0) return { index, quote: stripped };
  }
  return null;
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

export function validateFacts(facts, conversationText, previousSummary) {
  const verified = [];
  const missed = [];
  const seen = new Set();
  for (const fact of facts) {
    const inConversation = factMatch(fact, conversationText);
    if (inConversation) {
      if (!seen.has(inConversation.quote)) {
        seen.add(inConversation.quote);
        verified.push({ quote: inConversation.quote, line: lineOf(conversationText, inConversation.index) });
      }
      continue;
    }
    const inPrevious = previousSummary ? factMatch(fact, previousSummary) : null;
    if (inPrevious) {
      if (!seen.has(inPrevious.quote)) {
        seen.add(inPrevious.quote);
        verified.push({ quote: inPrevious.quote, line: null });
      }
      continue;
    }
    missed.push(fact);
  }
  return missed.length > 0 ? { ok: false, missed, facts: verified } : { ok: true, facts: verified };
}

// 原文快照：与摘要模型所见逐字一致的会话渲染，按内容哈希命名，落在 session 文件旁。
// 先落盘再替换上下文，任何后续降级都保证原文可回读（journal 虽全量留档，但 JSONL 不适合直接 grep/read）。
// 无持久 session 文件（内存会话）或写盘失败时跳过，不阻断压缩——引文校验与快照互不依赖。
function writeConversationSnapshot(session, conversationText) {
  try {
    const sessionFile = session.sessionManager.getSessionFile?.() ?? session.sessionFile;
    if (!sessionFile) return null;
    const dir = join(dirname(sessionFile), "compaction-snapshots");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `snapshot-${createHash("sha256").update(conversationText).digest("hex").slice(0, 16)}.txt`);
    writeFileSync(path, conversationText, "utf8");
    return path;
  } catch {
    return null;
  }
}

// 把已核验引文拼进摘要正文（行号指向快照），回读指引一并写入——写在摘要里而不是系统提示词：
// 路径每次压缩都不同，且指引正好出现在模型需要它的位置（引文旁边），随会话持久化、resume 后仍在。
function appendVerifiedFacts(summary, verifiedFacts, snapshotPath) {
  if (!verifiedFacts?.length) return { summary, extra: {} };
  const lines = [
    "",
    "已核验引文（逐字复制自压缩前对话，行号对应原文快照）:",
    ...verifiedFacts.map((fact) =>
      fact.line != null ? `- line=${fact.line} ${JSON.stringify(fact.quote)}` : `- (上轮摘要) ${JSON.stringify(fact.quote)}`,
    ),
  ];
  if (snapshotPath)
    lines.push(`原文快照: ${snapshotPath} — 需要精确原文或更多上下文时，用 grep 在该文件搜关键词，或用 read 按行号读取。`);
  return {
    summary: `${summary}\n${lines.join("\n")}`,
    extra: { facts: verifiedFacts, ...(snapshotPath ? { snapshotPath } : {}) },
  };
}

// 后台摘要跑在一个独立的临时 pi 会话里，过程原先完全不可见。onProgress 把该会话的生命周期
// 事件（建会话、发请求、流式产出、收尾）原样上报给控制器，控制器再转成 UI 可读的步骤流。
// 上报失败绝不影响摘要本身：每次回调都包 try/catch。
export async function summarizeWithPiSession({ messages, previousSummary, model, thinking, modelRuntime, signal, onProgress, evidence, previousState, usage, audit }) {
  const progress = (event) => { try { onProgress?.(event); } catch {} };
  throwIfAborted(signal); // 创建前检查
  progress({ kind: "note", step: "prepare", text: "准备摘要运行环境（临时目录 + 无工具会话）" });
  const agentDir = mkdtempSync(join(tmpdir(), "axiom-compaction-"));
  let session;
  let unsubscribe;
  let summaryInputManifest;
  try {
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false, provider: { maxRetries: 0 } } });
    const loader = new DefaultResourceLoader({
      cwd: agentDir,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      appendSystemPrompt: [],
    });
    await loader.reload();
    session = (
      await createAgentSession({
        cwd: agentDir,
        agentDir,
        modelRuntime: modelRuntime ?? (await ModelRuntime.create()),
        model,
        thinkingLevel: thinking,
        noTools: "all",
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(agentDir),
        settingsManager,
      })
    ).session;
    if (usage) session.agent.streamFunction = wrapUsageStream(session.agent.streamFunction, { service: usage, identity: { sessionId: audit?.sessionId ?? null, agentId: audit?.agentId ?? "main", source: "compaction" }, createStream: () => new AssistantMessageEventStream() });
    throwIfAborted(signal); // 创建后检查（等待 loader 期间可能已被取消）
    progress({ kind: "note", step: "session", text: `摘要会话就绪 · ${model?.name || model?.id || "主代理模型"} · thinking=${thinking ?? "off"}` });
    // 订阅只做上报：读取 SDK 已累积好的消息内容，不自己拼 delta，避免与流式协议细节耦合。
    unsubscribe = session.subscribe?.((event) => {
      if (event.type === "message_start" && event.message?.role === "assistant")
        progress({ kind: "note", step: "stream_start", text: "模型开始回写摘要" });
      if (event.type === "message_update" && event.message?.role === "assistant") {
        const blocks = Array.isArray(event.message.content) ? event.message.content : [];
        progress({
          kind: "stream",
          text: blocks.filter((block) => block?.type === "text").map((block) => block.text || "").join("\n"),
          thinking: blocks.filter((block) => block?.type === "thinking").map((block) => block.thinking || "").join("\n"),
        });
      }
      if (event.type === "message_end" && event.message?.role === "assistant")
        progress({ kind: "note", step: "stream_end", text: `模型输出结束 · stopReason=${event.message.stopReason ?? "none"}`, usage: event.message.usage });
    });
    const onAbort = () => void session.abort(); // 真实中断后台 LLM，不跑自然完成
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const inputBudget = requestBudget({ model: session.model, systemPrompt: session.systemPrompt, tools: [] });
      const stateBytes = Buffer.byteLength(JSON.stringify({ previousState, previousSummary }));
      const selectedEvidence = evidence ? selectSummaryInput(evidence, Math.floor((inputBudget.hard - inputBudget.fixed) * 2) - stateBytes - 1024) : undefined;
      summaryInputManifest = selectedEvidence?.map(({ text, ...metadata }) => metadata);
      const request = evidence ? taskStateRequest({ previousState, previousSummary, messages: selectedEvidence }) : summaryRequest(serializeConversation(convertToLlm(messages)), previousSummary);
      progress({ kind: "note", step: "request", text: `发出摘要请求 · 约 ${request.length.toLocaleString("en-US")} 字符原文` });
      const summaryBudget = requestBudget({ model: session.model, messages: [{ role: "user", content: request }], systemPrompt: session.systemPrompt, tools: [] });
      if (!summaryBudget.safe) throw compactionError("WINDOW_UNSAFE", "摘要输入超过摘要模型安全窗口，保留原文");
      await session.prompt(request, {
        expandPromptTemplates: false,
      });
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
    const last = session.messages.findLast((message) => message.role === "assistant");
    const summary = (last?.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (last?.stopReason !== "stop" || !summary)
      throw new Error(`Summarization failed (stopReason=${last?.stopReason ?? "none"}): ${describeCompactionError(last?.errorMessage || (!summary ? "模型未返回摘要正文" : "模型未正常完成摘要"))}`);
    if (evidence) {
      let state = parseTaskStateOutput(summary);
      const sources = new Map(evidence.map(source => [source.entryId, source]));
      for (const field of STATE_FIELDS) for (const item of state[field] ?? []) item.sources = (item.sources ?? []).map(source => {
        if (source.contentHash) {
          const inherited = previousState?.[field]?.find(old => old.id === item.id)?.sources?.find(old => contentHash(old) === contentHash(source));
          if (!inherited) throw compactionError("SUMMARY_SOURCE_INVALID", "SUMMARY_SOURCE_INVALID: invented inherited source");
          return { ...inherited, verificationStatus: "inherited_unverified" };
        }
        const original = sources.get(source.ref);
        const start = typeof source.quote === "string" && source.quote.length ? original?.text.indexOf(source.quote) : -1;
        if (!original || start < 0) throw compactionError("SUMMARY_INVALID", "SUMMARY_INVALID: source quote not found");
        return { ref: source.ref, part: "serialized-message", quote: source.quote, contentHash: contentHash(original.text), range: [Buffer.byteLength(original.text.slice(0, start)), Buffer.byteLength(original.text.slice(0, start + source.quote.length))], verificationStatus: "verified_original" };
      });
      state = inheritTaskState(state, previousState);
      state = validateTaskState(state, { previous: previousState, resolveEvidence: source => sources.get(source.ref)?.text, authorizeConstraintChange: ({ next }) => next.sources.some(source => source.verificationStatus === "verified_original" && sources.get(source.ref)?.role === "user" && sources.get(source.ref)?.userText?.trim() === next.text.trim() && source.quote === next.text) });
      progress({ kind: "note", step: "parsed", text: "task-state 解析完成" });
      return { summary: renderStateSections(state), taskState: state, summaryInputManifest, facts: [], usage: last.usage };
    }
    const parsed = parseSummaryOutput(summary);
    progress({ kind: "note", step: "parsed", text: `摘要解析完成 · 正文 ${parsed.summary?.length ?? 0} 字符 · 引文 ${parsed.facts?.length ?? 0} 条` });
    return { ...parsed, usage: last.usage };
  } finally {
    try {
      unsubscribe?.();
    } catch {}
    try {
      session?.dispose();
    } catch {}
    try {
      rmSync(agentDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * 后台压缩控制器（每会话一个）：
 * - turn_end 快照：超过阈值时用 prepareCompaction 算法计算保留切点并启动一次摘要 flight（单飞）。
 *   flight 启动即冻结待摘要消息（structuredClone）与 model/thinking 配置，后续配置变化不漂移。
 * - 安全点应用：安装到 agent.prepareNextTurnWithContext 链上（原生钩子先行，这里兜底替换上下文），
 *   prompt() 入口也会补一次，覆盖「flight 在空闲期完成」的场景。
 * - 提交验证：flight.value 直接读取（不 await 已 settled 的 promise），摘要非空且压缩后
 *   估算（estimateTokens 全量求和）确实变小才落盘；tokensBefore 在提交时重算。
 * - 事实核验（EPR 纪律）：摘要自带的逐字引文在渲染语料里逐条对账，一条编造 → 整单作废；
 *   通过的引文以附录（带行号）随摘要进上下文，原文快照落盘可 grep/read 回读。
 * - 失效检查：分支切换或快照之后落了别的压缩条目 → 结果作废，原文不动；摘要失败同样原文不动。
 * - 取消：cancel()（setConfig 变化 / dispose 时自动调用，pi wrapper 的 abort 也应调用）
 *   通过 AbortController 信号中断后台真实 LLM 请求；cancelRun(runId) 是用户从 UI 主动取消，
 *   额外压一段冷却期，避免下一个 turn_end 立马又跑起来。
 * - 可观测：每次摘要是一条 run 记录（阶段、步骤时间线、流式正文尾部、usage、错误），
 *   随 agent.compaction.status 下发。内存保留最近 RUN_HISTORY 条，进程重启不留存。
 */
// 运行记录上限：只为“出事了可以回头看”，不做长期审计；预览只留尾部，避免流式期间 payload 越跑越大。
const RUN_HISTORY = 5;
const RUN_PREVIEW_CHARS = 1500;
const RUN_STEPS = 40;
// 流式正文频率很高：节流后再广播，避免每个 token 都走一轮 WebSocket 广播。
const RUN_STREAM_INTERVAL = 500;
// 用户主动取消后的冷却：立即重试等于取消按钮无效；也不能永不重试，上下文还是会溢。
const CANCEL_COOLDOWN = 60000;
// 错误仅展示单行摘要，不传播堆栈；先脱敏再截断，避免截断凭据后无法识别。
export function describeCompactionError(error) {
  const message = String(error?.message ?? error ?? "未知错误")
    .replace(/\bhttps?:\/\/[^\s@/]+@/gi, "https://[已脱敏]@")
    .replace(/\bBearer\s+[^\s"',;]+/gi, "Bearer [已脱敏]")
    .replace(/((?:[?&]|\b)(?:api[-_]?key|key|token|authorization)\s*["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi, "$1[已脱敏]")
    .replace(/\b(?:sk-[\w-]+|AIza[\w-]+)\b/g, "[已脱敏]")
    .replace(/[A-Za-z0-9+/=_-]{20,}/g, "[已脱敏]")
    .replace(/[\s\x00-\x1f\x7f]+/g, " ")
    .trim();
  return message ? Array.from(message).slice(0, 200).join("") : "未知错误";
}

export function createBackgroundCompaction({
  session,
  modelRuntime,
  available = [],
  config,
  summarize = summarizeNative,
  beforeCommit,
  confirmCommit = confirmDurableAppend,
  sourceManifest,
  usage,
  audit,
  onEvent,
}) {
  let current = normalizeCompaction(config);
  let pending = null; // { promise, settled, value?, error?, firstKeptEntryId, compactedMessageIds, leafId }
  let controller = null; // 在途摘要的 AbortController
  let disposed = false;
  let commitUncertain;
  let nativeBusy = false;
  let generation = 0;
  const assertHealthy = () => { if (commitUncertain) throw commitUncertain; };
  const lockCommit = cause => (commitUncertain = Object.assign(new Error("压缩提交不确定，须重新打开会话恢复"), { code: "COMMIT_UNCERTAIN", cause }));
  let status = null;
  let failures = 0;
  let retryAt = 0;
  let lastAppliedBudgetTokens = null;
  const attemptsFile = session.sessionManager.getSessionFile?.();
  let runs = [];
  try { if (attemptsFile) runs = JSON.parse(readFileSync(`${attemptsFile}.compaction-attempts.json`, "utf8")).slice(-RUN_HISTORY); } catch { /* no prior attempts */ }
  if (runs.length) status = { status: runs.at(-1).status, startedAt: runs.at(-1).startedAt };
  let activeRun = null; // 当前在途/待应用的 run，终态后置 null
  let runSeq = 0;
  let streamTimer = null;
  let lastStreamEmit = 0;
  function resetRetry() { failures = 0; retryAt = 0; }
  // 下发载荷：外层字段保持原样（老前端只认 status/message/startedAt），run 详情另开字段。
  function statusPayload() {
    if (!status) return null;
    return { ...status, runId: activeRun?.id ?? null, runs: runs.map(({ requests, rawSummary, finalSummary, excerpts, ...run }) => structuredClone(run)) };
  }
  function emitStatus(immediate = true) {
    if (immediate) {
      if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
      lastStreamEmit = Date.now();
      try { onEvent?.({ type: "agent.compaction.status", data: statusPayload() }); } catch {}
      return;
    }
    if (streamTimer) return;
    const wait = Math.max(0, RUN_STREAM_INTERVAL - (Date.now() - lastStreamEmit));
    streamTimer = setTimeout(() => { streamTimer = null; emitStatus(true); }, wait);
    streamTimer.unref?.();
  }
  function startRun(info) {
    activeRun = {
      id: `run-${Date.now().toString(36)}-${++runSeq}`,
      status: "summarizing",
      revision: 0,
      startedAt: Date.now(),
      endedAt: null,
      model: info.model,
      thinking: info.thinking,
      trigger: info.trigger,
      steps: [],
      stream: { chars: 0, preview: "", thinkingChars: 0 },
      usage: null,
      error: null,
      result: null,
    };
    runs = [...runs, activeRun].slice(-RUN_HISTORY);
    // 外层 status 与 run 同时置为 summarizing：后续 note/流式上报都基于这个状态广播。
    status = { status: "summarizing", startedAt: activeRun.startedAt };
    return activeRun;
  }
  // 步骤时间线：与上一条完全重复则不追加，避免同一句话刷屏。
  function note(run, step, text) {
    if (!run) return;
    const last = run.steps.at(-1);
    if (last && last.step === step && last.text === text) return;
    run.revision = (run.revision ?? 0) + 1;
    run.steps = [...run.steps, { step, text: text == null ? "" : String(text).slice(0, 400), at: Date.now() }].slice(-RUN_STEPS);
  }
  function fail(message, error) {
    const delay = Math.min(300000, 30000 * 2 ** Math.min(failures++, 4));
    const action = error?.action ?? compactionError(error?.code ?? 'SUMMARY_REQUEST_FAILED').action;
    retryAt = failures >= 3 || action === 'stop' ? Infinity : Date.now() + delay;
    if (activeRun) { activeRun.error = error == null ? message : describeCompactionError(error); activeRun.errorCode = error?.code ?? 'SUMMARY_REQUEST_FAILED'; activeRun.errorAction = action; }
    report("failed", `${message}${error == null ? "" : `（${describeCompactionError(error)}）`}；${commitUncertain ? "提交不确定，必须重新打开会话恢复" : failures >= 3 ? "已达三次失败上限，需修改配置后恢复" : `${delay / 1000} 秒后可在后续回合重试`}`);
  }
  function report(phase, message) {
    status = { status: phase, startedAt: phase === "summarizing" ? Date.now() : status?.startedAt, ...(message ? { message } : {}) };
    if (activeRun) {
      activeRun.status = phase;
      if (message) activeRun.message = message;
      note(activeRun, phase, message || phase);
      // ready 是“算完了等安全点应用”，还没结束；其余非 summarizing 阶段都是终态。
      if (phase !== "summarizing" && phase !== "ready") {
        activeRun.endedAt = Date.now();
        // Persist bounded, content-free diagnostics beside the session. Never
        // write model output, prompts, quotes or provider error text here.
        try {
          const file = session.sessionManager.getSessionFile?.();
          if (file) {
            const records = runs.filter(run => run.endedAt).map(run => ({
              id: run.id, status: run.status, startedAt: run.startedAt, endedAt: run.endedAt,
              model: run.model, thinking: run.thinking, trigger: run.trigger,
              errorCode: run.errorCode ?? null, errorAction: run.errorAction ?? null,
              outputChars: run.stream.chars, result: run.result,
              steps: run.steps.map(({ step, at }) => ({ step, at })),
            }));
            writeFileSync(`${file}.compaction-diagnostics.json`, JSON.stringify(records, null, 2), { mode: 0o600 });
          }
        } catch { /* Diagnostics must not change commit or failure semantics. */ }
        try {
          const file = session.sessionManager.getSessionFile?.();
          if (file) {
            const target = `${file}.compaction-attempts.json`;
            writeFileSync(`${target}.tmp`, JSON.stringify(runs.filter(r => r.endedAt)), { mode: 0o600 });
            renameSync(`${target}.tmp`, target);
          }
        } catch { /* observational persistence does not change commit semantics */ }
        activeRun = null;
      }
    }
    emitStatus(true);
  }
  // 摘要会话的内部进展：note 进时间线（立即广播），stream 只更新尾部预览（节流广播）。
  function onFlightProgress(run, event) {
    if (!run || runs.indexOf(run) < 0) return;
    if (event?.kind === "request") {
      run.requests ??= [];
      run.requests.push({ id: event.requestId, model: event.model, context: event.context, text: "" });
      note(run, "request", `已发送摘要请求 ${run.requests.length}`);
      emitStatus(true);
      return;
    }
    if (event?.kind === "stream") {
      run.revision = (run.revision ?? 0) + 1;
      const request = run.requests?.find(r => r.id === event.requestId);
      if (request) request.text = String(event.text ?? "");
      const text = String(event.text ?? "");
      run.stream = {
        chars: text.length,
        preview: text.length > RUN_PREVIEW_CHARS ? text.slice(-RUN_PREVIEW_CHARS) : text,
        thinkingChars: String(event.thinking ?? "").length,
      };
      emitStatus(false);
      return;
    }
    if (event?.usage) run.usage = event.usage;
    note(run, event?.step || "note", event?.text);
    emitStatus(true);
  }

  function cancel(reason) {
    generation++;
    if (pending || nativeBusy) {
      if (activeRun) note(activeRun, "cancel", reason || "后台摘要已取消");
      report("cancelled", reason || "后台摘要已取消，保留原文");
    }
    try {
      controller?.abort();
    } catch {}
    controller = null;
    pending = null;
  }

  // 用户从 UI 取消：只能取消当前这一次（带 runId 时还要对得上，防前端拿陈旧 id 误杀新任务）。
  // 不抛错：按钮与真实状态天然有竞争，返回结果让前端自己对齐。
  function cancelRun(runId) {
    if ((!pending && !nativeBusy) || !activeRun || (runId && runId !== activeRun.id))
      return { cancelled: false, reason: "no-active-run", status: statusPayload() };
    retryAt = Date.now() + CANCEL_COOLDOWN;
    failures = 0;
    cancel(`已按你的要求取消本次后台摘要，保留原文；${CANCEL_COOLDOWN / 1000} 秒内不再自动重试`);
    return { cancelled: true, reason: null, status: statusPayload() };
  }

  function resolveModel() {
    if (!current.model) return session.model;
    const found = available.find((m) => `${m.provider}/${m.id}` === current.model);
    if (!found) throw new Error("Unknown compaction model");
    return found;
  }

  function isFresh(flight) {
    if (!flight.leafId || flight.generation !== generation) return false;
    const branch = session.sessionManager.getBranch();
    const leafIndex = branch.findIndex((entry) => entry.id === flight.leafId);
    if (leafIndex < 0 || contentHash(branch.slice(0, leafIndex + 1)) !== flight.sourceHash) return false; // 分支或快照内容变化
    return !branch.slice(leafIndex + 1).some((entry) => entry.type === "compaction" || entry.customType === "axiom-control"); // 期间出现过新压缩 → 作废
  }

  // Restored/imported assistant messages may lack usage; treat SDK errors as
  // unavailable usage and retain the conservative local token estimate.
  function safeContextUsage() {
    try { return session.getContextUsage?.(); } catch { return undefined; }
  }

  function runFlight(preparation, run) {
    const model = resolveModel(); // 快照时同步捕获 model/thinking，配置漂移不影响在途 flight
    controller = new AbortController();
    if (run) run.model = model?.name || model?.id || run.model;
    return summarize({
      preparation: structuredClone(preparation.nativePreparation),
      messages: structuredClone(preparation.messagesToSummarize), // 冻结快照，防消息对象后续被原地改写
      previousSummary: preparation.previousSummary,
      evidence: preparation.evidence,
      previousState: preparation.previousState,
      previousStateDoc: preparation.previousStateDoc,
      model,
      thinking: current.thinking,
      modelRuntime,
      usage,
      audit,
      signal: controller.signal,
      onProgress: (event) => onFlightProgress(run, event),
    }).then(value => {
      if (!value.native) return value;
      if (run) run.rawSummary = value.rawSummary;
      if (!value.stateDoc?.trim()) throw compactionError('SUMMARY_INVALID', '缺少配套任务状态，保留原文');
      if (run) { run.stateDoc = value.stateDoc; run.finalSummary = value.summary; }
      return value;
    });
  }

  function appendConfirmed(summary, boundary, tokensBefore, details, usage) {
    assertHealthy();
    try {
      const id = session.sessionManager.appendCompaction(summary, boundary, tokensBefore, details, false, usage);
      const file = session.sessionManager.getSessionFile?.();
      if (file) confirmCommit(file, id);
      session.agent.state.messages = session.sessionManager.buildSessionContext().messages;
      return id;
    } catch (cause) { throw lockCommit(cause); }
  }

  function onTurnEnd({ manual = false, mode = "async" } = {}) {
    if (commitUncertain) return;
    if (disposed || nativeBusy || pending || (!manual && (!current.enabled || Date.now() < retryAt))) return;
    const keepRecentTokens = mode === "sync" ? (current.syncKeepRecentTokens ?? compactionDefaults.syncKeepRecentTokens) : (current.asyncKeepRecentTokens ?? current.keepRecentTokens);
    try {
      // 阈值判断优先用 SDK 的 getContextUsage（感知「压缩后 usage 过期」并返回 null）；
      // 拿不到真实 usage 时回退到 chars/4 估算。
      const usage = safeContextUsage();
      const budget = requestBudget({ model: session.model, messages: session.messages, systemPrompt: session.systemPrompt, tools: session.agent.state.tools, config: current });
      const tokens = Math.max(usage?.tokens ?? 0, budget.tokens);
      const contextWindow = session.model?.contextWindow ?? 0;
      if (!manual && tokens < budget.start) { lastAppliedBudgetTokens = null; return; }
      if (!manual && lastAppliedBudgetTokens !== null && tokens < budget.hard && tokens - lastAppliedBudgetTokens < Math.max(128, budget.start - budget.target)) return;
      const branch = session.sessionManager.getBranch();
      const preparation = prepareBackgroundCompaction(branch, keepRecentTokens);
      if (!preparation || preparation.messagesToSummarize.length === 0) {
        fail("无合法压缩切点，保留原文", compactionError("NO_VALID_CUT"));
        return;
      }
      // 校验语料：与摘要模型所见逐字一致（同一渲染函数、同一消息内容）；快照与引文行号都指向这份文本
      const corpus = serializeConversation(convertToLlm(preparation.messagesToSummarize));
      const run = startRun({
        model: current.model || session.model?.name || session.model?.id || "主代理模型",
        thinking: current.thinking,
        trigger: {
          tokens,
          contextWindow,
          tokenThreshold: current.tokenThreshold ?? null,
          percentThreshold: current.percentThreshold ?? null,
          keepRecentTokens,
          manual, mode,
          estimated: usage?.tokens == null, // 真实 usage 不可用时是 chars/4 估算
        },
      });
      note(run, "trigger", `触发后台压缩 · 上下文 ${tokens.toLocaleString("en-US")}${contextWindow ? ` / ${contextWindow.toLocaleString("en-US")}` : ""} tokens${usage?.tokens == null ? "（估算）" : ""}`);
      note(run, "plan", `待摘要 ${preparation.messagesToSummarize.length} 条消息 · 语料 ${corpus.length.toLocaleString("en-US")} 字符${preparation.previousSummary ? " · 含上轮摘要" : ""}`);
      const flight = {
        promise: runFlight(preparation, run),
        manual, mode,
        corpus,
        previousSummary: preparation.previousSummary,
        firstKeptEntryId: preparation.firstKeptEntryId,
        compactedMessageIds: summarizedEntryIds(branch, preparation.firstKeptEntryId),
        leafId: session.sessionManager.getLeafEntry()?.id ?? null,
        sourceHash: contentHash(branch),
        generation,
        settled: false,
        run,
      };
      pending = flight;
      emitStatus(true);
      flight.promise.then(
        (value) => {
          if (pending !== flight) return;
          if (value?.usage) flight.run.usage = value.usage;
          if (!value?.summary?.trim()) {
            pending = null;
            controller = null;
            report("skipped", "摘要为空，保留原文");
            return;
          }
          // 逐字引文校验：一条引文在渲染会话/上轮摘要里逐字找不到 → 整份摘要作废（不删坏行，防“编十条留九条”）。
          // 模型没给 facts 块时不校验（格式缺失静默降级），给了就必须全对。
          const facts = (value.facts ?? [])
            .map((fact) => (typeof fact === "string" ? fact.trim() : ""))
            .filter(Boolean);
          if (facts.length > 0) {
            note(run, "verify", `事实核验：逐字对账 ${facts.length} 条引文`);
            const checked = validateFacts(facts, flight.corpus, flight.previousSummary);
            if (!checked.ok) {
              pending = null;
              controller = null;
              fail(`事实核验未通过（${checked.missed.length} 条引文无法逐字找到），保留原文`);
              return;
            }
            flight.verifiedFacts = checked.facts;
            note(run, "verify_ok", `引文全部通过（${checked.facts.length} 条）`);
          }
          flight.value = value;
          flight.settled = true;
          report("ready");
        },
        (error) => {
          if (pending !== flight) return;
          pending = null;
          controller = null;
          fail("后台摘要生成失败，保留原文", error);
        },
      );
    } catch (error) {
      pending = null;
      controller = null;
      fail("无法启动后台摘要，保留原文", error);
    }
  }

  async function maybeApply() {
    assertHealthy();
    if (disposed || !pending || !pending.settled || (!pending.manual && !current.enabled)) return null;
    const flight = pending;
    pending = null; // 先占位再验证，防重入双写
    controller = null;
    const skip = (message) => { report("skipped", message); return null; };
    if (disposed || (!flight.manual && !current.enabled) || !isFresh(flight)) return skip("STALE_CANDIDATE: 历史已变化，本次摘要作废，保留原文");
    try {
      const summary = (flight.value.summary ?? "").trim();
      if (!summary) return skip("摘要为空，保留原文");
      const branch = session.sessionManager.getBranch();
      const keptIndex = branch.findIndex((entry) => entry.id === flight.firstKeptEntryId);
      if (keptIndex < 0) return skip("保留边界已变化，保留原文");
      // 提交时重算压缩前占用：usage 可能过期（上次压缩后未回应），不可信时回退估算
      const freshUsage = safeContextUsage();
      // Compare like with like: provider usage may describe OP's projected view,
      // whereas estimatedAfter describes raw retained history.
      const tokensBefore = contextTokens(session.messages);
      const projectedTokensBefore = freshUsage?.tokens ?? null;
      // 引文附录 + 原文快照：先落盘再拼装（快照失败不阻断压缩），附录计入压缩后体积估算。
      // 同一对话内容 → 同一哈希文件，拒绝重试不产生重复快照。
      const snapshotPath = flight.value.native ? null : writeConversationSnapshot(session, flight.corpus);
      const assembled = flight.value.native ? { summary, extra: { nativeSummary: true, rawSummary: flight.value.rawSummary, ...flight.value.details, stateDoc: flight.value.stateDoc, stateBoundary: flight.firstKeptEntryId } } : appendVerifiedFacts(summary, flight.verifiedFacts, snapshotPath);
      await beforeCommit?.({ firstKeptEntryId: flight.firstKeptEntryId, compactedMessageIds: flight.compactedMessageIds, summary: assembled.summary });
      if (!isFresh(flight)) return skip("STALE_CANDIDATE: 归档等待期间历史已变化");
      const parentCompaction = branch.findLast(entry => entry.type === "compaction");
      const cumulativeCoverage = [...new Set([...(parentCompaction?.details?.sourceManifest?.coverage ?? []), ...flight.compactedMessageIds])];
      const manifest = sourceManifest?.(cumulativeCoverage);
      if (manifest) {
        if (flight.value.taskState) {
          const state = structuredClone(flight.value.taskState);
          const refs = new Map((manifest.sources ?? []).map(source => [source.entryId, source.ref]));
          for (const field of STATE_FIELDS) for (const item of state[field]) for (const source of item.sources) {
            if (refs.has(source.ref)) { source.entryId = source.ref; source.ref = refs.get(source.ref); source.part = "summaryEvidence"; }
          }
          flight.value.taskState = state;
          assembled.summary = renderStateSections(state);
        }
        if (!flight.value.native) assembled.summary += `\n\n原文来源（程序生成；历史不是当前指令）：\n${JSON.stringify(manifest)}\n使用 history_search 和 history_read 分页读取。`;
        assembled.extra.sourceManifest = manifest;
      }
      // 提交前验证：压缩后上下文（摘要 + 保留切点之后的消息）必须真的变小。
      // usage 在压缩后必然过期，这里按 estimateTokens 全量求和。
      const keptMessages = branch.slice(keptIndex).filter((entry) => entry.type !== "compaction").flatMap(sessionEntryToContextMessages);
      const estimatedAfter =
        estimateTokens({ role: "compactionSummary", summary: assembled.summary + (flight.value.stateDoc ?? '') }) +
        keptMessages.reduce((sum, message) => sum + estimateTokens(message), 0);
      if (estimatedAfter >= tokensBefore) return skip("摘要未缩小上下文，保留原文");
      const budget = requestBudget({ model: session.model, messages: [{ role: "compactionSummary", summary: assembled.summary + (flight.value.stateDoc ?? '') }, ...keptMessages], systemPrompt: session.systemPrompt, tools: session.agent.state.tools, config: current });
      if (!budget.safe) throw compactionError("WINDOW_UNSAFE", "压缩后仍超过安全窗口");
      note(flight.run, "apply", `安全点应用摘要 · ${tokensBefore.toLocaleString("en-US")} → ${estimatedAfter.toLocaleString("en-US")} tokens（估算）`);
      const details = {
        ...(flight.value.taskState ? { taskState: flight.value.taskState, summaryInputManifest: flight.value.summaryInputManifest } : {}),
        parentCompactionId: branch.findLast(entry => entry.type === "compaction")?.id ?? null,
        branchAnchor: flight.leafId,
        inputHash: flight.sourceHash,
        compactedMessageIds: flight.compactedMessageIds,
        coverageHash: contentHash(flight.compactedMessageIds.map(id => branch.find(entry => entry.id === id))),
        rawEstimatedTokensBefore: tokensBefore,
        projectedTokensBefore,
        ...(flight.value.progress ? { progress: flight.value.progress } : {}),
        ...assembled.extra,
      };
      await beforeCommit?.({ firstKeptEntryId: flight.firstKeptEntryId, compactedMessageIds: flight.compactedMessageIds, summary: assembled.summary });
      if (disposed || (!flight.manual && !current.enabled) || !isFresh(flight)) return skip("持久屏障等待期间历史已变化，保留原文");
      const commitBranch = session.sessionManager.getBranch();
      if (contentHash(commitBranch) !== contentHash(branch)) return skip("STALE_CANDIDATE: 提交屏障期间尾部改变，重新计划预算");
      const id = appendConfirmed(assembled.summary, flight.firstKeptEntryId, tokensBefore, details, flight.value.usage);
      const data = {
        id,
        summary: assembled.summary,
        ...(flight.value.progress ? { progress: flight.value.progress } : {}),
        ...assembled.extra,
        firstKeptEntryId: flight.firstKeptEntryId,
        compactedMessageIds: flight.compactedMessageIds,
        tokensBefore,
        estimatedTokensAfter: estimatedAfter,
      };
      try { onEvent?.({ type: "agent.compaction", data }); } catch {}
      resetRetry();
      lastAppliedBudgetTokens = budget.tokens > budget.target ? budget.tokens : null;
      if (flight.run) flight.run.result = { compactionId: id, tokensBefore, estimatedTokensAfter: estimatedAfter, summaryChars: assembled.summary.length, facts: flight.value.excerpts?.length ?? flight.verifiedFacts?.length ?? 0 };
      report("applied", flight.value.stateDoc ? '原生摘要与任务状态已同步应用' : undefined);
      return data;
    } catch (error) {
      fail("后台摘要应用失败", error);
      return null;
    }
  }

  // 安全点：包在 SDK 原生 prepareNextTurnWithContext（阈值压缩 + 系统提示刷新）之外。
  const previousPrepare = session.agent.prepareNextTurnWithContext?.bind(session.agent);
  session.agent.prepareNextTurnWithContext = async (turn, signal) => {
    assertHealthy();
    const snapshot = previousPrepare ? await previousPrepare(turn, signal) : undefined;
    let applied = await maybeApply();
    assertHealthy();
    const context = snapshot?.context ?? turn.context;
    const budgetNow = () => requestBudget({ model: session.model, messages: applied ? session.messages : context.messages, systemPrompt: context.systemPrompt, tools: context.tools, config: current });
    if (!budgetNow().safe) {
      if (current.enabled && !pending && Date.now() >= retryAt) onTurnEnd();
      if (pending) {
        let timer;
        try {
          await Promise.race([pending.promise.catch(() => {}), new Promise((_, reject) => { timer = setTimeout(() => reject(compactionError("COMPACTION_TIMEOUT")), 30000); timer.unref?.(); })]);
          applied = await maybeApply() || applied;
          assertHealthy();
        } finally { clearTimeout(timer); }
      }
      if (!budgetNow().safe) throw compactionError("WINDOW_UNSAFE", "上下文超过安全窗口，保留原文并停止请求");
    }
    if (!applied) return snapshot;
    return {
      ...(snapshot ?? {}),
      context: { ...(snapshot?.context ?? turn.context), messages: session.messages.slice() },
    };
  };

  return {
    async runNow(mode = "async") {
      assertHealthy();
      if (disposed) throw new Error("会话已关闭");
      if (!["sync", "async"].includes(mode)) throw new Error("未知压缩模式");
      if (pending || nativeBusy) throw new Error("已有压缩任务，请等待完成或先取消");
      onTurnEnd({ manual: true, mode });
      const flight = pending;
      if (!flight) throw new Error("当前历史不足以压缩，或压缩无法启动；请检查保留 tokens 与压缩模型配置");
      if (mode === "sync") {
        await flight.promise.catch(() => {}); // failure is recorded by the flight handler
        await maybeApply();
        assertHealthy();
      } else {
        // 没有下一轮请求时也在空闲安全点应用；运行中由 prepare hook 接管。
        flight.promise.then(() => {
          if (!session.isStreaming) return maybeApply();
        }, () => {}).catch(() => {});
      }
      return statusPayload();
    },
    onTurnEnd,
    maybeApply,
    assertHealthy,
    lockCommit,
    appendConfirmed,
    cancel, // pi wrapper 在会话 abort / dispose 时调用，中断后台真实 LLM
    cancelRun, // 用户从 UI 主动取消本次摘要
    discardStale: () => { if (pending && !isFresh(pending)) cancel("会话已回退，丢弃不属于当前分支的摘要"); },
    getConfig: () => ({ ...current }),
    getStatus: () => statusPayload(),
    getAttempt: (id, revision) => {
      const run = runs.find(run => run.id === id);
      return run && revision !== undefined && run.revision === revision ? { unchanged: true, revision } : structuredClone(run ?? null);
    },
    setConfig(next) {
      const normalized = normalizeCompaction(next);
      if (normalized.model && !available.some((m) => `${m.provider}/${m.id}` === normalized.model))
        throw new Error("Unknown compaction model");
      const changed = JSON.stringify(normalized) !== JSON.stringify(current);
      current = normalized;
      if (changed || !current.enabled) {
        cancel(); // 配置变化作废/取消旧任务，并允许修正配置后立即重试
        resetRetry();
      }
    },
    dispose() {
      disposed = true;
      cancel(); // 中断在途摘要，结果不再落地
      if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    },
  };
}
