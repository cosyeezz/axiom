import test from 'node:test';
import assert from 'node:assert/strict';
import { bootHistoryPage, settle, until } from './helpers/history-page.js';

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

test('未锚定任务不追加到页尾：运行中的入底部栏且行禁用，已完成的不可见', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.app.snapshot({ ...page.app.historyState(), tasks: [
    { id: 'finished', task: '页外旧任务', status: 'completed' },
    { id: 'active', task: '当前任务', status: 'running' },
  ] });
  const cards = page.$('output').querySelectorAll(':scope > .task-card');
  assert.equal(cards.length, 0, '页内无锚点的任务入口一律不进主轴（不再末尾追加）');
  const runs = page.$('task-runs');
  assert.equal(runs.hidden, false, '运行中任务保留底部栏入口');
  assert.equal(runs.children.length, 1);
  assert.match(runs.firstElementChild.textContent, /当前任务/);
  assert.equal(runs.firstElementChild.disabled, true, '入口不在当前页：行禁用并提示翻页');
  assert.match(runs.firstElementChild.title, /翻到所在页/);
});

test('旧页前向翻页可达：分页条可见、按钮整页前进、位置文本更新', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  await page.app.loadHistory({ edge: 'first' });
  await until(() => page.app.historyState().history.start === 0, '第一页');
  page.paint();
  assert.equal(page.$('history-pages').hidden, false, '旧页分页条可见（前向入口不再隐藏）');
  assert.match(page.pageText(), /^1–60 \/ 共 240 条/, '位置文本');
  assert.equal(page.$('history-after').disabled, false, '前向按钮可用');
  assert.equal(page.$('history-newest').hidden, false, '回最新可见');
  page.$('history-after').click();
  await until(() => page.app.historyState().history.start === 60, '下一页到达');
  page.paint();
  assert.equal(page.messages(), 60, '整页替换仍是一页');
  assert.match(page.pageText(), /^61–120 \/ 共 240 条/);
  assert.match(page.$('output').querySelector('.message').textContent, /历史60/, '新页从 60 开始（向前阅读从页顶开始）');
});

test('近底部自动预取下一页；dirty 时不做前向预取', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  await page.app.loadHistory({ edge: 'first' });
  await until(() => page.app.historyState().history.start === 0, '第一页');
  page.paint();
  const transcript = page.$('transcript');
  // jsdom 无布局：用可控 rect 模拟「距底 100px」的滚动位置。
  Object.defineProperty(transcript, 'scrollHeight', { configurable: true, get: () => 1000 });
  Object.defineProperty(transcript, 'clientHeight', { configurable: true, get: () => 800 });
  transcript.scrollTop = 900;
  transcript.dispatchEvent(new page.window.Event('scroll'));
  await until(() => page.requests.some(r => r.type === 'session.history' && r.after), '前向预取请求发出');
  await until(() => page.app.historyState().history.start === 60, '下一页到达');
  page.paint();
  // 页顶预取（既有行为）会自动回读上一页：等它落地后再断言。
  await until(() => page.app.historyFlags().loading === false, '页顶回读完成');
  assert.equal(page.count('历史60'), 1, '前向预取的页已整页替换到位');
  // dirty（有新消息）时 nextCursor 可能是假游标 pending：前向预取必须让位。
  const afterRequests = () => page.requests.filter(r => r.type === 'session.history' && r.after).length;
  const frozen = afterRequests();
  page.app.event({ sessionId: 'long', type: 'session.state', seq: 502, data: { status: 'running' } });
  await until(() => page.app.historyFlags().dirty === true, '旧页变 dirty');
  transcript.scrollTop = 950;
  transcript.dispatchEvent(new page.window.Event('scroll'));
  await settle();
  assert.equal(afterRequests(), frozen, 'dirty 时不发前向预取（假游标不进请求）');
});

test('切走再切回：真实 switchSession 恢复旧页阅读位置', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  await page.app.loadHistory({ target: page.records[80].entryId });
  await until(() => page.app.historyState().history.start === 80, '目标页');
  page.paint();
  // jsdom 的 getBoundingClientRect 全 0，saveView 取不到锚点：给消息节点和滚动容器装可控 rect。
  for (const node of page.$('output').querySelectorAll('.message'))
    node.getBoundingClientRect = () => ({ top: 20, bottom: 60, left: 0, right: 0, width: 0, height: 40, x: 0, y: 20 });
  page.$('transcript').getBoundingClientRect = () => ({ top: 0, bottom: 500, left: 0, right: 0, width: 0, height: 500, x: 0, y: 0 });
  // 真实通路：switchSession 的 changing 守卫贯穿 snapshot，挂起恢复只能在 finally 冲刷。
  await page.app.switchSession(() => page.app.request('session.attach', { sessionId: 'long' }));
  await until(() => page.requests.some(r => r.type === 'session.history' && r.target === page.records[80].entryId), '恢复请求发出');
  await until(() => page.app.historyState().history.start === 80, '回到原页');
  page.paint();
  assert.equal(page.messages(), 60);
  assert.equal(page.app.historyState().messages[0].messageId, page.records[80].entryId, '回到锚点所在页');
});

test('后台期间有新消息：旧页视角回前台保留位置并提示，不自动追新', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  await page.app.loadHistory({ edge: 'first' });
  await until(() => page.app.historyState().history.start === 0, '第一页');
  page.paint();
  const attaches = () => page.requests.filter(r => r.type === 'session.attach' || (r.type === 'session.history' && !r.before && !r.after && !r.target)).length;
  const before = attaches();
  page.setHidden(true);
  page.app.event({ sessionId: 'long', type: 'agent.delta', seq: 501, data: { type: 'text_delta', delta: 'x' }, agentId: 'main' });
  await until(() => page.app.historyFlags().dirty === true, '旧页变 dirty');
  page.setHidden(false);
  assert.equal(page.app.historyState().history.start, 0, '仍停在旧页');
  assert.equal(attaches(), before, '回来不自动发整页快照');
  assert.equal(page.$('history-pages').hidden, false, '分页条显示提示');
  assert.match(page.pageText(), /有新消息/);
  assert.equal(page.$('history-newest').hidden, false, '提供回最新入口');
});

test('截断任务在弹窗顶部声明“仅装载最近部分”', async t => {
  const page = bootHistoryPage();
  t.after(page.close);
  page.open();
  await until(() => page.app.connected(), '连接');
  page.app.snapshot({ ...page.app.historyState(),
    messages: [{ agentId: 'main', entryId: 'm0', messageId: 'm0', message: { role: 'user', content: '委派超长任务' } }],
    tasks: [{ id: 'taskA', task: '超长任务', status: 'completed' }],
    history: { ...page.app.historyState().history, nextCursor: null, truncatedTasks: ['taskA'] },
  });
  const dialog = page.$('task-overlays').querySelector('dialog');
  assert.ok(dialog, '任务弹窗存在');
  const note = dialog.querySelector('.task-truncated');
  assert.ok(note, '弹窗顶部有截断声明');
  assert.match(note.textContent, /页上限/);
});
