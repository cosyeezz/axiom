import { randomUUID } from "node:crypto";
import { createJiti } from "jiti";

// 退避节奏：第 1..11 次失败后分别等待 2,2,5,5,10,10,30,60,120,240,480 秒，第 12 次起翻倍但封顶 16 分钟；最多重试 45 次。
export const RETRY_DELAYS_MS = [2000, 2000, 5000, 5000, 10000, 10000, 30000, 60000, 120000, 240000, 480000];
export const MAX_DELAY_MS = 960_000; // 16 分钟
export const MAX_RETRIES = 45;
const RECOVERY_PROMPT = "[Axiom 自动恢复] 上一轮输出被截断。请依据现有用户请求和实际工具结果继续，不要重复已完成的操作；无法继续时简短说明原因。";
const delayFor = (attempt) =>
  attempt <= RETRY_DELAYS_MS.length
    ? RETRY_DELAYS_MS[attempt - 1]
    : Math.min(RETRY_DELAYS_MS.at(-1) * 2 ** (attempt - RETRY_DELAYS_MS.length), MAX_DELAY_MS);

// setTimeout 上限 2^31-1 ms：等待超过上限时分段；当前封顶 16 分钟不会触发，防御性保留。
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;
export const abortableSleep = (ms, signal) =>
  signal.aborted
    ? Promise.reject(signal.reason ?? new Error("已取消"))
    : new Promise((resolve, reject) => {
        let remaining = ms;
        let timer;
        const onAbort = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          reject(signal.reason ?? new Error("已取消"));
        };
        const chunk = () => {
          const step = Math.min(remaining, MAX_TIMEOUT_MS);
          remaining -= step;
          timer = setTimeout(() => {
            if (remaining > 0) return chunk();
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, step);
        };
        signal.addEventListener("abort", onAbort);
        chunk();
      });

// 与 SDK 同源的错误分类（pi-ai compat）：
// - isRetryableAssistantError：429/限流/overloaded/5xx/网络/超时 → 可重试；
//   配额/计费（insufficient_quota、billing 等）及一切不匹配可重试模式的错误（凭证/权限/参数）→ 不重试。
// - isRecoverableLength：stopReason=length 且产出低于模型输出上限 → 属"未完成"，可续跑；
//   产出已满上限的重试只是原样复刻，不重试。
const { isRetryableAssistantError, isRecoverableLength } = await createJiti(
  import.meta.resolve("@earendil-works/pi-coding-agent"),
).import("@earendil-works/pi-ai/compat");

// 返回 null = 正常结束；{ retry, error } = 应重试；{ terminal, error } / { cancelled, error } = 终止。
// custom：会话配置的错误词表（子串匹配，小写预归一）；命中黑名单 → 不重试，命中白名单 → 重试，
// 二者优先于内建判定（如某供应商把可瞬时故障报成 quota 文案时，可白名单强制重试）。
function classify(message, later, maxTokens, custom = { retryable: [], nonRetryable: [] }) {
  if (!message || message.stopReason === "stop") return null;
  // 工具调用已全部拿到结果的 toolUse 收尾是正常轮次结束，不是错误。
  if (message.stopReason === "toolUse") {
    const calls = message.content.filter((block) => block.type === "toolCall");
    if (calls.length && calls.every((call) => later.some((m) => m.role === "toolResult" && m.toolCallId === call.id)))
      return null;
  }
  if (message.stopReason === "length")
    return isRecoverableLength(message, maxTokens)
      ? { retry: true, error: message.errorMessage || "输出被截断（length）" }
      : { terminal: true, error: message.errorMessage || "输出超出模型上限（length）" };
  // aborted：signal 已 abort（用户主动取消）→ cancelled；否则属意外中断，由调用方按可重试继续。
  if (message.stopReason === "aborted") return { cancelled: true, error: message.errorMessage || "已中止" };
  const text = (message.errorMessage || "").toLowerCase();
  if (custom.nonRetryable.some((pattern) => text.includes(pattern)))
    return { terminal: true, error: message.errorMessage || "error" };
  if (custom.retryable.some((pattern) => text.includes(pattern))) return { retry: true, error: message.errorMessage || "error" };
  if (isRetryableAssistantError(message)) return { retry: true, error: message.errorMessage || "error" };
  return { terminal: true, error: message.errorMessage || "error" };
}

// 与 SDK _prepareRetry 相同的准备：仅移除末尾失败/截断的助手消息（原始消息仍留在会话历史）。
// 末尾不是 assistant（半截轮次停在 user/toolResult）时是空操作，continue() 直接接着跑。
export function dropFailedAssistant(session) {
  const messages = session.agent.state.messages;
  if (messages.at(-1)?.role === "assistant") session.agent.state.messages = messages.slice(0, -1);
}

// 手动重试的可续判定（public/app.js canResumeMessage 是同一条规则的前端副本，改一处记得同步）：
// 只认“确有异常”的正面证据 —— 失败/被中止/截断的 assistant（Esc 停止 → aborted、终态错误 → error）、
// 停在 toolUse 的未收尾轮次，或末尾还是 user/toolResult 的半截轮次。
// stopReason=stop 的正常收尾与没有 stopReason 的消息都不给重试，宁可漏不可误。
export const RESUMABLE_STOP_REASONS = ["error", "aborted", "length", "toolUse"];
export function canResume(session) {
  const last = session.agent.state.messages.at(-1);
  return !!last && (last.role !== "assistant" || RESUMABLE_STOP_REASONS.includes(last.stopReason));
}

/**
 * pi factory 层自动重试（主/子代理共享）：
 * - 限流/网络中断（含 start() 抛出的异常）/意外 aborted/可恢复 length 未完成 → 按 delayFor 退避后
 *   用 SDK 安全继续机制续跑（移除末尾失败/截断的助手消息后 agent.continue()：不重发原始用户输入，
 *   已完成工具保留在上下文）。
 * - 用户主动取消（signal abort）、配额/计费/凭证/权限/参数等不可恢复错误 → 不重试，
 *   错误经 result() 照常传播。
 * - 每次 prompt 运行一个稳定 id；失败 → waiting（含 delayMs/nextRetryAt）→ running → succeeded/failed/cancelled。
 * - 等待期可经 cancel() 取消（会话 abort/dispose 时调用）；此期间会话 status 保持 running，
 *   新消息只会入队（steer/followUp），不会启动另一次运行，由重试成功后的续跑消化。
 */
export function createAutoRetry({ session, emit, patterns, sleep = abortableSleep, maxRetries = MAX_RETRIES, now = Date.now }) {
  // 词表小写归一一次，classify 内子串比对错误消息的小写副本。
  const custom = {
    retryable: (patterns?.retryable ?? []).map((pattern) => pattern.toLowerCase()),
    nonRetryable: (patterns?.nonRetryable ?? []).map((pattern) => pattern.toLowerCase()),
  };
  let controller;
  return {
    cancel() {
      controller?.abort(new Error("已取消自动重试"));
    },
    // start：发起一次运行（首次为 session.prompt，重试时换成 agent.continue）。
    async run(start) {
      const id = randomUUID();
      const signal = (controller = new AbortController()).signal;
      const preRun = new Set(session.agent.state.messages);
      // 只认本次运行新增的消息：插件无输出时不能把历史助手回应误当成本轮结果。
      const freshAssistant = () => {
        const messages = session.agent.state.messages;
        for (let i = messages.length - 1; i >= 0 && !preRun.has(messages[i]); i--)
          if (messages[i].role === "assistant") return { message: messages[i], later: messages.slice(i + 1) };
        return undefined;
      };
      let attempt = 0;
      let recovered = false;
      let originalSystemPrompt;
      const announce = (status, extra = {}) =>
        emit({ type: "agent.retry", data: { id, status, attempt, maxRetries, ...extra } });
      try {
        for (;;) {
          let verdict;
          let fresh;
          try {
            await start();
          } catch (error) {
            if (signal.aborted || recovered) throw error; // 用户取消或纠偏再失败：不继续重试
            // start() 抛出的网络等异常同样走重试分类，而不是直接失败。
            const message = error?.message ?? String(error);
            if (!isRetryableAssistantError({ stopReason: "error", errorMessage: message })) throw error;
            verdict = { retry: true, error: message };
          }
          if (!verdict) {
            fresh = freshAssistant();
            verdict = classify(fresh?.message, fresh?.later ?? [], session.model?.maxTokens ?? 0, custom);
          }
          if (signal.aborted) {
            if (attempt > 0) announce("cancelled", { error: "已取消自动重试" });
            return fresh?.message;
          }
          const emptyLength = fresh?.message.stopReason === "length"
            && session.agent.state.messages.at(-1) === fresh.message
            && !fresh.message.content.some((block) => block.type === "toolCall"
              || (block.type === "text" && block.text.trim()));
          if (emptyLength && !recovered)
            verdict = { retry: true, error: "输出截断且正文为空，自动恢复一次（length）" };
          else if (verdict && recovered && !signal.aborted)
            verdict = { terminal: true, error: verdict.error };
          if (!verdict) {
            if (attempt > 0) announce("succeeded");
            return fresh?.message;
          }
          // 仅用户主动取消（signal 已 abort）终止；意外 aborted 按可重试继续。
          const cancelledByUser = verdict.cancelled && signal.aborted;
          if (verdict.terminal || cancelledByUser) {
            if (attempt > 0) announce(cancelledByUser ? "cancelled" : "failed", { error: verdict.error });
            return fresh?.message;
          }
          if (!emptyLength && attempt >= maxRetries) throw new Error(`自动重试已达上限（${maxRetries} 次）：${verdict.error}`);
          attempt++;
          const delayMs = delayFor(attempt);
          announce("waiting", { delayMs, nextRetryAt: now() + delayMs, error: verdict.error });
          await sleep(delayMs, signal);
          announce("running", { error: verdict.error });
          if (signal.aborted) throw signal.reason;
          dropFailedAssistant(session);
          if (emptyLength) {
            recovered = true;
            originalSystemPrompt = session.agent.state.systemPrompt;
            // 临时内部提示：不伪造用户消息，不改 JSONL，结束后恢复。
            session.agent.state.systemPrompt = `${originalSystemPrompt}\n\n${RECOVERY_PROMPT}`;
          }
          start = () => session.agent.continue();
        }
      } catch (error) {
        if (signal.aborted) announce("cancelled", { error: signal.reason?.message ?? "已取消" });
        else announce("failed", { error: error?.message ?? String(error) });
        throw error; // 取消/上限用尽/不可恢复错误必须传播（sessions 层转 error 事件，result() 同样抛出）
      } finally {
        if (recovered) session.agent.state.systemPrompt = originalSystemPrompt;
        if (controller?.signal === signal) controller = undefined;
      }
    },
  };
}
