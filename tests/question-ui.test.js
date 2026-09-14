import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const source = (await readFile(new URL('../public/question.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
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
