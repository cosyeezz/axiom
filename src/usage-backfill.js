import { createHash } from "node:crypto";

// 仅接收只读读取器提供的 entries；不扫描个人目录、不自动导入。
// 副本保留 entry 的内容与 id，指纹跨文件去重。归属由调用方按创建时间排序后先到先得。
export function backfillEntries(store, entries, { enabledAt, sessionId, agentId = "main" }) {
  if (!Number.isFinite(enabledAt)) throw new Error("缺少实时记账启用时间，拒绝历史导入");
  const result = { imported: 0, deduped: 0, skipped: 0 };
  for (const entry of entries) {
    const message = entry.type === "message" ? entry.message : null;
    const usage = ["assistant", "toolResult"].includes(message?.role) ? message.usage
      : ["compaction", "branch_summary"].includes(entry.type) ? entry.usage : null;
    const at = Date.parse(entry.timestamp);
    if (!usage || !entry.id || !Number.isFinite(at) || at >= enabledAt) { result.skipped++; continue; }
    const provider = message?.role === "assistant" ? message.provider ?? null : null;
    const model = message?.role === "assistant" ? message.model ?? null : null;
    const fingerprint = createHash("sha256").update(JSON.stringify([entry.id, entry.timestamp, entry.type, message?.role,
      provider, model, usage.input, usage.output, usage.cacheRead, usage.cacheWrite, usage.reasoning, usage.totalTokens])).digest("hex");
    const inserted = store.importHistorical(fingerprint, { sessionId, agentId, provider, model, at, usage });
    result[inserted ? "imported" : "deduped"]++;
  }
  return result;
}
