import test from 'node:test';
import assert from 'node:assert/strict';
import { bootSessionPage, until } from './helpers/session-page.js';

const send = (page, index) => page.app.event({ sessionId: 'long', agentId: 'main', type: 'agent.message.end', seq: 501 + index,
  data: { entryId: `new-${index}`, messageId: `new-${index}`, message: { role: 'user', content: `新输入${index}` } } });

test('持续追加大量消息：subagent 弹窗与旧消息节点不销毁，也不重取快照', async t => {
  const page = bootSessionPage(); t.after(page.close); page.open();
  await until(() => page.app.connected(), '连接');
  const original = page.$('output').querySelector('.message');
  page.app.event({ sessionId: 'long', type: 'task.state', taskId: 'child', data: { task: '分析', status: 'running' } });
  page.$('output').querySelector('.task-card').click();
  const dialog = page.$('task-child');
  const attaches = page.requests.filter(r => r.type === 'session.attach').length;
  for (let i = 0; i < 80; i++) send(page, i);
  page.paint();
  assert.equal(page.count('新输入79'), 1);
  assert.equal(page.messages(), 320, '240 条历史 + 80 条新消息全部在场');
  assert.equal(original.isConnected, true, '旧节点不因追加而重建');
  assert.equal(page.$('task-child'), dialog);
  assert.equal(dialog.open, true);
  assert.equal(page.requests.filter(r => r.type === 'session.attach').length, attaches, '追加走增量事件，不重取快照');
});

test('重取快照在飞时到达的实时消息不丢：闸后补放且不吃草稿', async t => {
  const page = bootSessionPage({ hold: (req, requests) => req.type === 'session.attach' && requests.filter(r => r.type === 'session.attach').length > 1 });
  t.after(page.close); page.open(); await until(() => page.app.connected(), '连接');
  // 服务端改写历史（撤回）→ 前端整份重取；重取在飞期间到达的实时消息进闸，不能丢。
  page.app.event({ sessionId: 'long', type: 'session.history.reset', seq: 501, data: { reason: 'recall' } });
  await until(() => page.held() === 1, '重取请求在飞');
  send(page, 0);
  assert.equal(page.count('新输入0'), 0, '快照未提交前只排队，不提前落地');
  page.$('prompt').value = '请求期间草稿';
  page.release();
  await until(() => page.app.attachFlags().attaching === false, '重取落地');
  page.paint();
  assert.equal(page.count('新输入0'), 1, '闸内事件在提交后恰好补放一次');
  assert.equal(page.messages(), 241, '整段历史重挂 + 补放的新消息');
  assert.equal(page.$('prompt').value, '请求期间草稿', '重取不吃掉草稿');
  assert.equal(page.app.watermark('long'), 501, '补放后水位推进到事件 seq');
});

test('一次全量挂载：首屏即全部历史，无补齐请求', async t => {
  const page = bootSessionPage(); t.after(page.close); page.open();
  await until(() => page.app.connected(), '连接');
  page.paint();
  assert.equal(page.messages(), 240, '首屏就是整段历史');
  assert.equal(page.count('历史0'), 1, '最早一条在场');
  assert.equal(page.count('历史239'), 1, '最新一条在场');
  assert.equal(page.requests.filter(r => r.type === 'session.attach').length, 1, '不需要二次取数补齐');
});
