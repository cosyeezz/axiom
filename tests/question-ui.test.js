import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { publicSource } from './helpers/public-source.js';
const source = await publicSource('question');
const goal = { title: '优化确认界面', description: '保留完整要求 <img src=x onerror=alert(1)>', acceptance: [{ criterionId: 'readable', text: '清晰展示目标', check: 'tool' }] };
function proposalFixture(changes) {
  const dom = new JSDOM('<section id="dock"></section>', { runScripts: 'outside-only' });
  dom.window.eval(source + '\nwindow.makeQuestion = createQuestionUI;');
  const root = dom.window.document.querySelector('#dock');
  dom.window.makeQuestion({ root, reply: async () => {} }).show('s', [{ toolCallId: 'proposal', proposal: { changes }, questions: [{ header: '确认', question: '确认这些目标？', options: [{ label: '同意' }, { label: '拒绝' }] }] }]);
  return { dom, root };
}
test('todo proposal presents complete readable requirements, with safe optional technical source', () => {
  const { dom, root } = proposalFixture([{ before: null, after: goal }]);
  try {
    assert.equal(root.querySelector('.question-goal-title').textContent, goal.title);
    assert.equal(root.querySelector('.question-goal-description').textContent, goal.description);
    assert.match(root.querySelector('.question-criteria').textContent, /清晰展示目标工具验证/);
    assert.equal(root.querySelector('img'), null);
    assert.equal(root.querySelector('.question-technical').open, false);
    assert.equal(root.querySelector('[aria-checked="true"]'), null);
  } finally { dom.window.close(); }
});
test('todo proposal distinguishes changes, deletion and acceptance without losing evidence', () => {
  const { dom, root } = proposalFixture([
    { before: goal, after: { ...goal, title: '新版目标' } },
    { before: goal, after: { ...goal, deletedAt: 123 } },
    { before: { ...goal, status: 'running' }, after: { ...goal, status: 'done', summary: '优化已完成', verification: [{ criterionId: 'readable', result: '截图检查通过', refs: [{ toolCallId: 'evidence-1' }] }] } },
  ]);
  try {
    assert.deepEqual([...root.querySelectorAll('.question-change-kind')].map(n => n.textContent), ['修改目标', '删除目标', '验收目标']);
    assert.match(root.querySelector('.question-change-note').textContent, /本次调整：标题/);
    assert.match(root.querySelector('.question-previous').textContent, /优化确认界面/);
    assert.match(root.querySelector('.question-evidence').textContent, /清晰展示目标截图检查通过工具依据：evidence-1/);
    assert.equal(root.querySelectorAll('.question-goal-description').length, 4);
  } finally { dom.window.close(); }
});
test('question UI keyboard, custom answers, reconnect, session isolation and submission', async () => {
  const dom = new JSDOM('<button id="prompt">输入</button><section id="dock"></section>', { runScripts: 'outside-only' });
  const w = dom.window, d = w.document, calls = [];
  w.eval(source + '\nwindow.makeQuestion = createQuestionUI;');
  const root = d.querySelector('#dock');
  const ui = w.makeQuestion({ root, reply: async (answer) => calls.push(JSON.parse(JSON.stringify(answer))), focusPrompt: () => d.querySelector('#prompt').focus() });
  const request = { toolCallId: 'q', questions: [
    { header: '方式', question: '选哪个？', description: '<script>危险</script>', options: [{ label: 'A' }, { label: 'B', description: '说明' }] },
    { header: '功能', question: '需要什么？', description: '可多选', options: [{ label: 'C' }], multiple: true },
  ] };
  try {
    ui.show('s', []); ui.asked('other', request); assert.equal(root.hidden, true);
    ui.asked('s', request);
    assert.equal(d.activeElement.textContent, 'A');
    assert.equal(root.querySelectorAll('[aria-checked="true"]').length, 0);
    assert.equal(root.querySelector('script'), null);
    const key = (key) => d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));
    key('ArrowDown'); assert.match(d.activeElement.textContent, /^B/); d.activeElement.click();
    key('Enter'); assert.equal(root.querySelector('h3').textContent, '需要什么？');
    d.activeElement.click();
    const input = root.querySelector('textarea'); input.focus(); input.value = '自定义'; input.dispatchEvent(new w.Event('input'));
    key('ArrowLeft'); assert.equal(d.activeElement, input);
    ui.setConnected(true); assert.equal(d.activeElement, input);
    ui.setConnected(false); assert.equal(root.querySelector('.question-submit').disabled, true);
    ui.setConnected(true); assert.equal(root.querySelector('textarea').value, '自定义');
    ui.show('other', []); d.querySelector('#prompt').focus(); ui.asked('s', request);
    assert.equal(root.hidden, true); assert.equal(d.activeElement.id, 'prompt');
    ui.show('s', [request]); assert.equal(d.activeElement.id, 'prompt');
    assert.equal(root.querySelector('textarea').value, '自定义');
    root.querySelector('.question-submit').click(); await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [{ sessionId: 's', toolCallId: 'q', answers: [['B'], ['C', '自定义']] }]);
    assert.equal(root.hidden, true); assert.equal(d.activeElement.id, 'prompt');
  } finally { w.close(); }
});
test('question UI: arrow keys switch tabs after a session round-trip', async () => {
  const dom = new JSDOM('<button id="prompt">输入</button><section id="dock"></section>', { runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  w.eval(source + '\nwindow.makeQuestion = createQuestionUI;');
  const root = d.querySelector('#dock');
  const ui = w.makeQuestion({ root, reply: async () => {}, focusPrompt: () => d.querySelector('#prompt').focus() });
  const request = { toolCallId: 'q', questions: [
    { header: '方式', question: '选哪个？', options: [{ label: 'A' }, { label: 'B' }] },
    { header: '功能', question: '需要什么？', options: [{ label: 'C' }], multiple: true },
  ] };
  const key = (k) => d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  try {
    ui.show('s', []); ui.asked('s', request);
    assert.match(d.activeElement.textContent, /^A/);
    ui.show('other', []);
    assert.equal(root.hidden, true);
    ui.show('s', [request]);
    assert.equal(root.hidden, false);
    root.querySelectorAll('.question-tab')[1].click();
    assert.equal(root.querySelector('h3').textContent, '需要什么？');
    assert.match(d.activeElement.textContent, /^C/);
    key('ArrowLeft');
    assert.equal(root.querySelector('h3').textContent, '选哪个？');
    assert.match(d.activeElement.textContent, /^A/);
    key('ArrowRight');
    assert.equal(root.querySelector('h3').textContent, '需要什么？');
    assert.match(d.activeElement.textContent, /^C/);
  } finally { w.close(); }
});
test('question UI: arrow keys switch tabs after setConnected round-trip', async () => {
  const dom = new JSDOM('<button id="prompt">输入</button><section id="dock"></section>', { runScripts: 'outside-only' });
  const w = dom.window, d = w.document;
  w.eval(source + '\nwindow.makeQuestion = createQuestionUI;');
  const root = d.querySelector('#dock');
  const ui = w.makeQuestion({ root, reply: async () => {}, focusPrompt: () => d.querySelector('#prompt').focus() });
  const request = { toolCallId: 'q', questions: [
    { header: '方式', question: '选哪个？', options: [{ label: 'A' }, { label: 'B' }] },
    { header: '功能', question: '需要什么？', options: [{ label: 'C' }], multiple: true },
  ] };
  const key = (k) => d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  try {
    ui.show('s', []); ui.asked('s', request);
    assert.equal(root.querySelector('.question-submit').disabled, true);
    ui.setConnected(false);
    assert.equal(root.querySelector('.question-submit').disabled, true);
    ui.setConnected(true);
    assert.equal(root.querySelector('.question-submit').disabled, true);
    root.querySelectorAll('.question-tab')[0].click();
    assert.equal(root.querySelector('h3').textContent, '选哪个？');
    assert.match(d.activeElement.textContent, /^A/);
    key('ArrowRight');
    assert.equal(root.querySelector('h3').textContent, '需要什么？');
    assert.match(d.activeElement.textContent, /^C/);
    key('ArrowLeft');
    assert.equal(root.querySelector('h3').textContent, '选哪个？');
    assert.match(d.activeElement.textContent, /^A/);
  } finally { w.close(); }
});
