import test from 'node:test';
import assert from 'node:assert/strict';
import { bootHistoryPage, until } from './helpers/history-page.js';

test('前插恢复压缩与重试，后续实时重试仍锚在最新消息', async t => {
  const page = bootHistoryPage(); t.after(page.close); page.open();
  await until(() => page.app.connected(), '连接');
  const current = page.app.historyState();
  page.app.setRequest(async () => ({ ...current,
    messages: [
      { agentId: 'main', entryId: 'old-u', messageId: 'old-u', message: { role: 'user', content: '旧输入' } },
      { agentId: 'main', entryId: 'old-a', messageId: 'old-a', message: { role: 'assistant', content: '旧回答' } },
    ],
    history: { ...current.history, start: 178 },
    compactions: [{ id: 'old-summary', compactedMessageIds: ['old-u'], summary: '旧摘要' }],
    retries: [{ id: 'old-retry', agentId: 'main', messageCount: 2, anchorEntryId: 'old-a', status: 'completed', history: [] }],
  }));
  await page.app.loadHistory({ before: current.history.prevCursor });
  assert.match(page.$('output').querySelector('.compaction-card').textContent, /旧摘要/);
  assert.equal(page.$('output').querySelectorAll('.retry-card').length, 1);
  assert.equal(page.app.mainEntries().at(-1), '历史-239');
});
