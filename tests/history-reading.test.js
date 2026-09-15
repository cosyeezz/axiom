import test from 'node:test';
import assert from 'node:assert/strict';
import { bootHistoryPage, until } from './helpers/history-page.js';

test('未挂载阅读锚点按身份取一页，不全量恢复', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const anchor = page.records[80].entryId;
  page.app.views.set('long', { draft: '保留草稿', follow: false, scroll: 0, anchor, anchorOffset: 12 });
  page.app.snapshot(page.app.historyState());
  await until(() => page.requests.some(r => r.type === 'session.history' && r.target === anchor), '按身份定位');
  await until(() => page.app.historyState().history.start === 80, '目标页');
  assert.equal(page.app.historyState().messages[0].messageId, anchor);
  assert.equal(page.$('prompt').value, '保留草稿');
  assert.equal(page.messages(), 60);
  assert.equal(page.app.watermark('long'), 500);
});

test('工具结果独占页时仍可查看详情，不依赖前页调用 DOM', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const state = page.app.historyState();
  page.app.snapshot({ ...state, messages: [{ agentId: 'main', messageId: 'result-only', message: {
    role: 'toolResult', toolCallId: 'cross-page', toolName: 'read', content: [{ type: 'text', text: '跨页工具结果' }],
  } }], history: { ...state.history, start: 239 } });
  const detail = page.$('output').querySelector('.tool-record');
  assert.ok(detail);
  detail.open = true;
  detail.dispatchEvent(new page.window.Event('toggle'));
  assert.match(detail.textContent, /跨页工具结果/);
});
