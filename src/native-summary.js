import { compact, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";
import { requestBudget, compactionError } from './compaction-budget.js';
import { wrapUsageStream } from "./usage-stream.js";
const { AssistantMessageEventStream } = await createJiti(import.meta.resolve("@earendil-works/pi-coding-agent")).import("@earendil-works/pi-ai");

export const EXCERPT_INSTRUCTIONS = '保持原有摘要格式与规则。对你认为需要保留原始依据的重要内容，在对应句后附短的、连续的逐字原文，格式为 `[原文：“…”]`。不要为了引用而增加摘要内容，不要求逐句引用。保留旧摘要中的相关内容时，沿用其已有 `[消息:ID]` 来源标识。不得编造来源标识。';

// Observes actual public request/response data, never changes provider options or retries.
export function observeSummaryStream(original, progress = () => {}) {
  let seq = 0;
  const emit = event => { try { progress(event); } catch { /* observer is not execution */ } };
  return (model, context, options = {}) => {
    const requestId = `request-${++seq}`;
    emit({ kind: "request", requestId, context: structuredClone(context), model: `${model.provider}/${model.id}` });
    const out = new AssistantMessageEventStream();
    void (async () => {
      let final;
      try {
        const source = await original(model, context, options);
        for await (const event of source) {
          const message = event.partial ?? event.message;
          if (message?.content) emit({ kind: "stream", requestId, text: message.content.filter(b => b.type === "text").map(b => b.text).join("") });
          if (event.type === "done" || event.type === "error") {
            final = event.type === "done" ? event.message : event.error;
            emit({ kind: "note", requestId, step: "stream_end", text: `摘要请求结束 · ${final.stopReason}`, usage: final.usage });
          }
          out.push(event);
        }
        if (!final) throw new Error("摘要流未返回终态");
      } catch (error) {
        if (!final) {
          final = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
            timestamp: Date.now(), stopReason: options.signal?.aborted ? "aborted" : "error", errorMessage: error.message,
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
          out.push({ type: "error", reason: final.stopReason, error: final });
        }
      } finally { out.end(final); }
    })();
    return out;
  };
}

export async function summarizeNative({ preparation, model, thinking, modelRuntime, signal, onProgress, usage, audit, customInstructions = EXCERPT_INSTRUCTIONS }) {
  const runtime = modelRuntime ?? await ModelRuntime.create();
  const auth = await runtime.getAuth(model);
  const requestModel = auth?.auth?.baseUrl ? { ...model, baseUrl: auth.auth.baseUrl } : model;
  let stream = runtime.streamSimple.bind(runtime);
  if (usage) stream = wrapUsageStream(stream, { service: usage, identity: { sessionId: audit?.sessionId ?? null, agentId: audit?.agentId ?? "main", source: "compaction" }, createStream: () => new AssistantMessageEventStream() });
  // SDK's split-turn prefix has no customInstructions argument. At its public
  // stream boundary append only our source requirement; preserve the native prompt.
  const observed = observeSummaryStream(stream, onProgress);
  const enhancedStream = (m, context, options) => {
    if (customInstructions && !context.messages.some(message => JSON.stringify(message.content).includes(customInstructions))) {
      context = structuredClone(context);
      const last = context.messages.at(-1);
      const suffix = `\n\nAdditional focus: ${customInstructions}`;
      if (typeof last.content === "string") last.content += suffix;
      else last.content.push({ type: "text", text: suffix });
    }
    const budget = requestBudget({ model: m, messages: context.messages, systemPrompt: context.systemPrompt, tools: [] });
    if (!budget.safe) throw compactionError('WINDOW_UNSAFE', '原生摘要实际请求超过摘要模型安全窗口，保留原文');
    return observed(m, context, options);
  };
  const result = await compact(preparation, requestModel, auth?.auth?.apiKey, auth?.auth?.headers,
    customInstructions ?? undefined, signal, thinking ?? "off", enhancedStream, auth?.env, undefined, undefined, audit?.sessionId);
  if (signal?.aborted) throw Object.assign(new Error("Compaction cancelled"), { name: "AbortError" });
  return { ...result, native: true, nativeFallback: !customInstructions, rawSummary: result.summary };
}
