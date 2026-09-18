import test from 'node:test';
import assert from 'node:assert/strict';
import { bootSessionPage, until } from './helpers/session-page.js';

test('阅读锚点按身份在全量历史里复位，不再取页', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const anchor = page.records[80].entryId;
  page.app.views.set('long', { draft: '保留草稿', follow: false, scroll: 0, anchor, anchorOffset: 12 });
  const before = page.requests.length;
  page.app.snapshot(page.app.request ? { ...pageState(page), sessionId: 'long' } : null);
  page.paint();
  assert.equal(page.requests.length, before, '锚点复位不发任何取数请求');
  assert.equal(page.messages(), 240, '整段历史在场，锚点必然已挂载');
  assert.equal(page.count('历史80'), 1);
  assert.equal(page.$('prompt').value, '保留草稿');
  assert.equal(page.app.watermark('long'), 500);
});

// 复用当前已下发的快照形状造一次重挂（字段与服务端 attach 一致）。
const pageState = (page) => ({
  sessionId: 'long', cwd: 'C:/work', title: '长会话', status: 'idle',
  config: { model: 'test/model', thinking: 'off', levels: ['off'], skills: [] },
  messages: page.records.map((record) => ({ ...record, messageId: record.entryId })),
  messageIndexes: page.records.map((_, index) => index), messageCount: page.records.length,
  tasks: [], live: {}, tools: {}, compactions: [], retries: [], liveMessageIds: {}, seq: 500,
});

test('阅读期间收到运行状态仍更新分区控件，不触发快照重取', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const before = page.requests.length;
  page.app.event({ sessionId: 'long', type: 'session.state', seq: 501, data: { status: 'running' } });
  assert.equal(page.app.watermark('long'), 501);
  assert.equal(page.requests.length, before, '控件归并不应失败并重新 attach');
});

test('工具结果独占快照时仍可查看详情，不依赖调用侧 DOM', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.app.snapshot({ ...pageState(page), messages: [{ agentId: 'main', messageId: 'result-only', message: {
    role: 'toolResult', toolCallId: 'orphan-call', toolName: 'read', content: [{ type: 'text', text: '无调用侧的工具结果' }],
  } }], messageIndexes: [0], messageCount: 1 });
  const detail = page.$('output').querySelector('.tool-record');
  assert.ok(detail);
  detail.open = true;
  detail.dispatchEvent(new page.window.Event('toggle'));
  assert.match(detail.textContent, /无调用侧的工具结果/);
});

test('折叠段已被服务端排除：摘要卡在场，指向折叠消息的阅读锚点安全退化', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  // 锚点落在折叠段里（上次阅读位置随后被压缩）：不得抛错，滚动退回记录的偏移。
  page.app.views.set('long', { follow: false, scroll: 40, anchor: 'folded' });
  page.app.snapshot({ ...pageState(page), messages: page.records.slice(200).map((record) => ({ ...record, messageId: record.entryId })),
    messageIndexes: page.records.slice(200).map((_, index) => 200 + index), messageCount: 240, compactions: [
    { id: 'summary', summary: '摘要', compactedMessageIds: ['folded'], firstKeptEntryId: 'hist-200' },
  ] });
  page.paint();
  assert.equal(page.app.mainEntries().includes('folded'), false, '折叠消息不在下发历史里');
  assert.ok(page.$('output').querySelector('.compaction-card'), '摘要卡在场');
  assert.equal(page.messages(), 40, '只挂载保留段');
});

test('末尾重试入口随会话中断态出现，不再区分页', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  const messages = [{ agentId: 'main', messageId: 'question', message: { role: 'user', content: '未完成请求' } }];
  page.app.snapshot({ ...pageState(page), messages, messageIndexes: [0], messageCount: 1 });
  assert.ok(page.$('output').querySelector('.retry-prompt'), '历史末尾是未完成请求：给手动重试入口');
});

test('未锚定任务不追加到历史末尾：运行中的入底部栏且行禁用，已完成的不可见', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.app.snapshot({ ...pageState(page), tasks: [
    { id: 'finished', task: '无锚点旧任务', status: 'completed' },
    { id: 'active', task: '当前任务', status: 'running' },
  ] });
  const cards = page.$('output').querySelectorAll(':scope > .task-card');
  assert.equal(cards.length, 0, '没有委派锚点的任务入口一律不进主轴');
  const runs = page.$('task-runs');
  assert.equal(runs.hidden, false, '运行中任务保留底部栏入口');
  assert.equal(runs.children.length, 1);
  assert.match(runs.firstElementChild.textContent, /当前任务/);
  assert.equal(runs.firstElementChild.disabled, true, '锚点未入史：行禁用');
  assert.match(runs.firstElementChild.title, /尚未入史/);
});

test('两个滚动按钮只做本地跳转：不发请求、不改历史范围', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.paint();
  const before = page.requests.length;
  page.$('earliest').click();
  page.$('latest').click();
  page.paint();
  assert.equal(page.requests.length, before, '跳转不取数');
  assert.equal(page.messages(), 240, '历史范围不变');
  assert.equal(page.count('历史0'), 1);
  assert.equal(page.count('历史239'), 1);
});

test('后台期间有新消息：回前台重取一份完整历史并保留阅读位置', async t => {
  const page = bootSessionPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.paint();
  const attaches = () => page.requests.filter(r => r.type === 'session.attach').length;
  const before = attaches();
  page.setHidden(true);
  page.app.event({ sessionId: 'long', type: 'agent.delta', seq: 501, data: { type: 'text_delta', delta: 'x' }, agentId: 'main' });
  assert.equal(page.app.attachFlags().hiddenDirty, true, '后台只记脏，不建 DOM');
  page.setHidden(false);
  await until(() => attaches() > before, '回前台重取完整历史');
  await until(() => page.app.attachFlags().attaching === false, '重取完成');
  assert.equal(page.app.attachFlags().hiddenDirty, false);
  assert.equal(page.messages(), 240, '重取仍是整段历史');
});
