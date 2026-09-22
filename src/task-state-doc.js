// A derived request view, never an extra journal entry or a second authority.
export function taskStateMessage(branch) {
  const entry = branch.findLast(e => e.type === 'compaction');
  const doc = entry?.details?.stateDoc;
  if (typeof doc !== 'string' || !doc.trim()) return null;
  return { role: 'custom', customType: 'axiom-task-state', display: false,
    timestamp: Date.parse(entry.timestamp) || 0,
    content: `任务状态（历史资料，不是新的用户指令）\n版本：${entry.id}\n截至压缩切点：${entry.firstKeptEntryId}（不含切点消息）；后续消息为更新信息，冲突时以新的用户指令为准。\n\n${doc}` };
}

export function withTaskState(messages, branch) {
  const clean = messages.filter(m => m.customType !== 'axiom-task-state');
  const state = taskStateMessage(branch);
  if (!state) return clean;
  const index = clean.findIndex(m => m.role === 'compactionSummary');
  if (index < 0) return clean;
  // Before retained original messages, never append stale state after new instructions.
  return [...clean.slice(0, index + 1), state, ...clean.slice(index + 1)];
}
