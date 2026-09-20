import { retryAfterMs } from "./request-gate.js";

// 工厂由 SDK 同版本 pi-ai 提供，避免构造第二套不兼容的流。
export function wrapUsageStream(original, { service, identity = {}, createStream, onRequestUsage }) {
  const safe = async work => { try { return await work(); } catch { service.auditFailures = (service.auditFailures ?? 0) + 1; return undefined; } };
  return function(model, context, options = {}) {
    const out = createStream();
    void (async () => {
      let lease, requestId, finalMessage, usageReported = false;
      const reportUsage = async message => {
        if (usageReported) return;
        usageReported = true;
        try { await onRequestUsage?.({ requestId: requestId ?? null, usage: message.usage, status: message.stopReason, provider: model.provider, model: model.id }); } catch {}
      };
      const failure = error => ({ role: "assistant", content: [], api: model.api, provider: model.provider,
        model: model.id, timestamp: Date.now(), stopReason: options.signal?.aborted ? "aborted" : "error",
        errorMessage: error?.message ?? String(error), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
          totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      const record = message => safe(() => service.store.finish(requestId, {
        status: message.stopReason === "aborted" ? "aborted" : message.stopReason === "error" ? "error" : "ok",
        usage: message.usage, error: message.errorMessage ?? null,
      }));
      try {
        requestId = await safe(() => service.store.begin({ ...identity, provider: model.provider, model: model.id, api: model.api }));
        if (service.refresh) await safe(() => service.refresh());
        try { lease = await service.gate.acquire(model.provider, { signal: options.signal }); }
        catch (error) { if (options.signal?.aborted) throw error; }
        if (requestId) safe(() => service.store.admit(requestId, { waitMs: lease?.waitMs ?? 0, waitReason: lease?.waitMs ? "concurrency" : null, queueDepth: lease?.queueDepth ?? 0 }));
        const fetchImpl = options.fetch ?? globalThis.fetch;
        // Google 明确拒绝 custom fetch；WebSocket 在 transport 内绕过 fetch。
        // 未配置 RPM 不注入 fetch，保留供应商原生路径。
        const gatedOptions = service.gate.limits[model.provider]?.rpm && !String(model.api).startsWith("google-")
          ? { ...options, fetch: async (input, init) => {
            const signal = init?.signal ?? options.signal;
            try { await service.gate.acquire(model.provider, { kind: "rpm", signal }); }
            catch (error) { if (signal?.aborted) throw error; }
            let response;
            try { response = await fetchImpl(input, init); return response; }
            finally {
              const is429 = response?.status === 429;
              const cooldown = is429 ? retryAfterMs(response.headers.get("retry-after")) || 1000 : 0;
              // 冷却建议不是实际退避耗时，不能写成 backoff_ms。
              if (requestId) safe(() => service.store.attempt(requestId, { is429 }));
              if (is429) safe(async () => {
                await service.gate.cooldown(model.provider, cooldown);
                await service.store.recordGateEvent({ provider: model.provider, type: "rate_limited", detail: { requestId, cooldownMs: cooldown } });
              });
            }
          } } : options;
        const source = await original.call(this, model, context, gatedOptions);
        for await (const event of source) {
          if (event.type === "done" || event.type === "error") {
            finalMessage = event.type === "done" ? event.message : event.error;
            if (requestId && !usageReported) void record(finalMessage);
            void reportUsage(finalMessage);
          }
          out.push(event);
        }
        // 不 await source.result()：损坏的流若没发终态会永久 pending。
        if (!finalMessage) throw new Error("供应商流结束但未返回终态");
        out.end(finalMessage);
      } catch (error) {
        if (!finalMessage) {
          finalMessage = failure(error);
          if (requestId) void record(finalMessage);
          void reportUsage(finalMessage);
          out.push({ type: "error", reason: finalMessage.stopReason, error: finalMessage });
        }
        out.end(finalMessage);
      } finally { try { lease?.release(); } catch {} }
    })();
    return out;
  };
}
