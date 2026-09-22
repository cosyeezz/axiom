import { summarizeNative } from "./native-summary.js";
import { writeFileSync, readFileSync, renameSync } from "node:fs";
import {
  estimateTokens,
  findCutPoint,
  findTurnStartIndex,
  sessionEntryToContextMessages,
} from "@earendil-works/pi-coding-agent";
import { compaction, compactionDefaults } from "./protocol.js";
import { confirmDurableAppend } from "./history-journal.js";
import { requestBudget, compactionError } from "./compaction-budget.js";
import { contentHash } from "./raw-history.js";

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
  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i].type === "compaction") {
      previousSummary = branch[i].summary;
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
  for (let i = boundaryStart; i < cut.firstKeptEntryIndex; i++) {
    if (branch[i].type === "compaction") continue;
    const message = sessionEntryToContextMessages(branch[i])[0];
    if (message) {
      messagesToSummarize.push(message);
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
  return { firstKeptEntryId: firstKeptEntry.id, messagesToSummarize, previousSummary,
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

/**
 * 后台压缩控制器（每会话一个）：
 * - turn_end 快照：超过阈值时用 prepareCompaction 算法计算保留切点并启动一次摘要 flight（单飞）。
 *   flight 启动即冻结待摘要消息（structuredClone）与 model/thinking 配置，后续配置变化不漂移。
 * - 安全点应用：安装到 agent.prepareNextTurnWithContext 链上（原生钩子先行，这里兜底替换上下文），
 *   prompt() 入口也会补一次，覆盖「flight 在空闲期完成」的场景。
 * - 提交验证：flight.value 直接读取（不 await 已 settled 的 promise），摘要非空且压缩后
 *   估算（estimateTokens 全量求和）确实变小才落盘；tokensBefore 在提交时重算。
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
    if (pending) {
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
    if (!pending || !activeRun || (runId && runId !== activeRun.id))
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
      if (run) run.finalSummary = value.summary;
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
    if (disposed || pending || (!manual && (!current.enabled || Date.now() < retryAt))) return;
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
      note(run, "plan", `待摘要 ${preparation.messagesToSummarize.length} 条消息${preparation.previousSummary ? " · 含上轮摘要" : ""}`);
      const flight = {
        promise: runFlight(preparation, run),
        manual, mode,
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
      const assembled = { summary, extra: { nativeSummary: true, rawSummary: flight.value.rawSummary, ...flight.value.details } };
      await beforeCommit?.({ firstKeptEntryId: flight.firstKeptEntryId, compactedMessageIds: flight.compactedMessageIds, summary: assembled.summary });
      if (!isFresh(flight)) return skip("STALE_CANDIDATE: 归档等待期间历史已变化");
      const parentCompaction = branch.findLast(entry => entry.type === "compaction");
      const cumulativeCoverage = [...new Set([...(parentCompaction?.details?.sourceManifest?.coverage ?? []), ...flight.compactedMessageIds])];
      const manifest = sourceManifest?.(cumulativeCoverage);
      if (manifest) {
        assembled.extra.sourceManifest = manifest;
      }
      // 提交前验证：压缩后上下文（摘要 + 保留切点之后的消息）必须真的变小。
      // usage 在压缩后必然过期，这里按 estimateTokens 全量求和。
      const keptMessages = branch.slice(keptIndex).filter((entry) => entry.type !== "compaction").flatMap(sessionEntryToContextMessages);
      const estimatedAfter =
        estimateTokens({ role: "compactionSummary", summary: assembled.summary }) +
        keptMessages.reduce((sum, message) => sum + estimateTokens(message), 0);
      if (estimatedAfter >= tokensBefore) return skip("摘要未缩小上下文，保留原文");
      const budget = requestBudget({ model: session.model, messages: [{ role: "compactionSummary", summary: assembled.summary }, ...keptMessages], systemPrompt: session.systemPrompt, tools: session.agent.state.tools, config: current });
      if (!budget.safe) throw compactionError("WINDOW_UNSAFE", "压缩后仍超过安全窗口");
      note(flight.run, "apply", `安全点应用摘要 · ${tokensBefore.toLocaleString("en-US")} → ${estimatedAfter.toLocaleString("en-US")} tokens（估算）`);
      const details = {
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
      if (flight.run) flight.run.result = { compactionId: id, tokensBefore, estimatedTokensAfter: estimatedAfter, summaryChars: assembled.summary.length };
      report("applied");
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
      if (pending) throw new Error("已有压缩任务，请等待完成或先取消");
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
