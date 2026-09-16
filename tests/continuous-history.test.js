import test from 'node:test';
import assert from 'node:assert/strict';
import { bootHistoryPage, until } from './helpers/history-page.js';

const send = (page, index) => page.app.event({ sessionId: 'long', agentId: 'main', type: 'agent.message.end', seq: 501 + index,
  data: { entryId: `new-${index}`, messageId: `new-${index}`, message: { role: 'user', content: `新输入${index}` } } });

test('超过页预算持续追加，subagent弹窗与旧消息节点不销毁', async t => {
  const page = bootHistoryPage(); t.after(page.close); page.open();
  await until(() => page.app.connected(), '连接');
  const original = page.$('output').querySelector('.message');
  page.app.event({ sessionId: 'long', type: 'task.state', taskId: 'child', data: { task: '分析', status: 'running' } });
  page.$('output').querySelector('.task-card').click();
  const dialog = page.$('task-child');
  const attaches = page.requests.filter(r => r.type === 'session.attach').length;
  for (let i = 0; i < 80; i++) send(page, i);
  page.paint();
  assert.equal(page.count('新输入79'), 1);
  assert.equal(original.isConnected, true);
  assert.equal(page.$('task-child'), dialog);
  assert.equal(dialog.open, true);
  assert.equal(page.requests.filter(r => r.type === 'session.attach').length, attaches);
});

test('前插历史在飞时实时输入照常绘制，回包不覆盖新消息和草稿', async t => {
  const page = bootHistoryPage({ hold: req => req.type === 'session.history' });
  t.after(page.close); page.open(); await until(() => page.app.connected(), '连接');
  const original = page.$('output').querySelector('.message');
  const pending = page.app.loadHistory({ before: page.app.historyState().history.prevCursor });
  await until(() => page.held() === 1, '请求');
  send(page, 0);
  assert.equal(page.count('新输入0'), 1);
  page.$('prompt').value = '请求期间草稿';
  page.release(); await pending; page.paint();
  assert.equal(page.count('新输入0'), 1);
  assert.equal(page.messages(), 121);
  assert.equal(original.isConnected, true);
  assert.equal(page.$('prompt').value, '请求期间草稿');
  assert.equal(page.app.watermark('long'), 501);
  assert.equal(page.app.historyState().history.nextCursor, null);
});

test('首屏未填满时自动加载更早历史', async t => {
  const page = bootHistoryPage(); t.after(page.close); page.open();
  await until(() => page.app.connected(), '连接');
  Object.defineProperty(page.$('transcript'), 'clientHeight', { value: 800 });
  Object.defineProperty(page.$('transcript'), 'scrollHeight', { get: () => page.messages() * 5 });
  page.paint();
  await until(() => page.messages() === 120, '自动补齐首屏');
  page.paint();
  await until(() => page.messages() === 180, '继续填满');
});
