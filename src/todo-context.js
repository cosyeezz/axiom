// Restore at explicit context boundaries, never as a per-request context hook.
export function createTodoContextBridge(session, context) {
  let pending = null;
  const branch = () => session.sessionManager.getBranch();
  const appended = boundaryId => branch().some(e => e.type === 'custom_message' && e.customType === 'todo-context' && e.details?.boundaryId === boundaryId);
  const queue = boundaryId => { if (context && boundaryId && !appended(boundaryId)) pending = boundaryId; };
  if (context) queue(branch().findLast(e => e.type === 'compaction')?.id);
  return {
    queue,
    request(reason) {
      if (!context || reason !== 'resume') return;
      const anchor = branch().findLast(e => e.type !== 'custom_message' || e.customType !== 'todo-context')?.id ?? 'root';
      queue(`resume@${anchor}`);
    },
    async apply() {
      if (!pending || !context) return;
      const boundaryId = pending;
      if (appended(boundaryId)) { pending = null; return; }
      if (session.isStreaming || session.isRetrying) throw new Error('TODO_RESTORE_BUSY');
      const packet = context(boundaryId.startsWith('resume@') ? 'resume' : 'compaction');
      if (!packet) { pending = null; return; }
      if (packet.content.length > 12000) throw new Error('TODO_RESTORE_TOO_LARGE');
      await session.sendCustomMessage({customType:'todo-context',content:packet.content,display:false,details:{listId:packet.listId,version:packet.version,boundaryId}});
      const matches = m => m.role === 'custom' && m.customType === 'todo-context' && m.details?.boundaryId === boundaryId;
      if (!appended(boundaryId) || !session.agent.state.messages.some(matches) || !session.sessionManager.buildSessionContext().messages.some(matches)) throw new Error('TODO_RESTORE_NOT_IN_CONTEXT');
      if (pending === boundaryId) pending = null;
    },
    resolve(ref) {
      const entries = branch();
      if (ref?.toolCallId) {
        const entry = entries.find(e => e.type === 'message' && e.message?.role === 'toolResult' && e.message.toolCallId === ref.toolCallId);
        return entry ? {entryId:entry.id,toolName:entry.message.toolName} : null;
      }
      if (ref?.messageId) {
        const entry = entries.find(e => e.id === ref.messageId && e.type === 'message');
        return entry ? {entryId:entry.id,toolName:null} : null;
      }
      return null;
    },
  };
}
