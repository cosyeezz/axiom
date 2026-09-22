// Safe points are complete conversation prefixes, never half a tool-call batch.
export function safePoints(entries) {
  const pending = new Set();
  const points = [];
  const nextMessages = new Map();
  let next = null;
  for (let index = entries.length - 1; index >= 0; index--) {
    nextMessages.set(entries[index].id, next);
    if (["message", "compaction"].includes(entries[index].type)) next = entries[index];
  }
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const message = entry.type === "message" ? entry.message : null;
    if (message?.role === "assistant") {
      for (const block of message.content || [])
        if (block.type === "toolCall") pending.add(block.id);
    }
    if (message?.role === "toolResult") pending.delete(message.toolCallId);
    if (pending.size || !(entry.type === "compaction" || message?.role === "user" || message?.role === "toolResult")) continue;
    const next = nextMessages.get(entry.id);
    const draft = next?.type === "message" && next.message.role === "user" ? next.message : null;
    points.push({ entryId: entry.id, kind: entry.type === "compaction" ? "compaction" : message.role, draft });
  }
  return points;
}

export function navigationState(entries) {
  const last = entries.findLast(entry => entry.type === "message" || entry.type === "compaction" || entry.customType === "axiom_revert");
  return last?.customType === "axiom_revert" ? { entryId: last.data.entryId, draft: last.data.draft } : null;
}

export function requireSafePoint(entries, entryId) {
  const point = safePoints(entries).find(point => point.entryId === entryId);
  if (!point) throw new Error("安全点不存在或工具调用尚未完整结束");
  return point;
}
