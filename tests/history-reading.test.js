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

test('阅读旧页收到运行状态仍更新分区控件，不触发快照恢复', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  await page.app.loadHistory({ edge: 'first' });
  const before = page.requests.length;
  page.app.event({ sessionId: 'long', type: 'session.state', seq: 501, data: { status: 'running' } });
  assert.equal(page.app.watermark('long'), 501);
  assert.equal(page.requests.length, before, '控件归并不应失败并重新 attach');
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


test('压缩消息的阅读锚点绑定到摘要卡片', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const state = page.app.historyState();
  page.app.snapshot({ ...state, messages: [{ agentId: 'main', entryId: 'folded', messageId: 'folded',
    message: { role: 'user', content: '已压缩原文' } }], compactions: [
    { id: 'summary', summary: '摘要', compactedMessageIds: ['folded'] },
  ] });
  assert.equal(page.app.historyState().messages[0].item.node, page.$('output').querySelector('.compaction-card'));
});

test('旧页不显示末尾重试入口，最新页仍可重试', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const state = page.app.historyState();
  const messages = [{ agentId: 'main', messageId: 'question', message: { role: 'user', content: '未完成请求' } }];
  page.app.snapshot({ ...state, messages, history: { ...state.history, nextCursor: 'newer' } });
  assert.equal(page.$('output').querySelector('.retry-prompt'), null);
  page.app.snapshot({ ...state, messages, history: { ...state.history, nextCursor: null } });
  assert.ok(page.$('output').querySelector('.retry-prompt'));
});

test('页外已完成子代理不追加到页尾，活动子代理仍可见', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.app.snapshot({ ...page.app.historyState(), tasks: [
    { id: 'finished', task: '页外旧任务', status: 'completed' },
    { id: 'active', task: '当前任务', status: 'running' },
  ] });
  const cards = page.$('output').querySelectorAll(':scope > .task-card');
  assert.equal(cards.length, 1);
  assert.match(cards[0].textContent, /当前任务/);
});
