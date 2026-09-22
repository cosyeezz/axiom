import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = (await readFile(new URL('../public/todo.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
const snapshot = (mode = 'enabled') => ({ mode, reason: '', items: [
  { id: 'p', parentId: null, title: '父任务', status: 'running', note: '' },
  { id: 'c', parentId: 'p', title: '<script>danger</script>', status: 'running', note: '核对产物' },
] });

test('Todo panel renders safe two-level text, leaf counts and global collapse preference', () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  try {
    dom.window.eval(source + '\nwindow.makeTodo = createTodoUI;');
    const root = dom.window.document.getElementById('root');
    const ui = dom.window.makeTodo({ root, request: async () => {} });
    ui.show('a', snapshot());
    assert.equal(root.hidden, false);
    assert.equal(root.querySelector('#todo-list').hidden, true);
    assert.equal(root.querySelector('[data-status="running"].todo-count').textContent, '1');
    root.querySelector('.todo-toggle').click();
    assert.equal(root.querySelector('#todo-list').hidden, false);
    assert.equal(dom.window.localStorage.getItem('axiom.todoExpanded'), '1');
    assert.equal(root.querySelector('.todo-child').textContent, '<script>danger</script>核对产物');
    assert.equal(root.querySelector('script'), null);
    ui.show('b', snapshot('paused'));
    assert.equal(root.querySelector('#todo-list').hidden, false);
    ui.show('empty', null);
    assert.equal(root.hidden, true);
    assert.equal(root.children.length, 0);
  } finally { dom.window.close(); }
});

test('Todo actions send current session pause/resume and respect disconnected state', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  try {
    dom.window.eval(source + '\nwindow.makeTodo = createTodoUI;');
    const root = dom.window.document.getElementById('root'), calls = [];
    const ui = dom.window.makeTodo({ root, request: async (type, args) => calls.push([type, JSON.parse(JSON.stringify(args))]) });
    ui.show('a', snapshot()); root.querySelector('.todo-action').click();
    await Promise.resolve();
    assert.deepEqual(calls[0], ['todo.action', { sessionId: 'a', action: 'pause' }]);
    ui.show('b', snapshot('paused')); root.querySelector('.todo-action').click();
    await Promise.resolve();
    assert.deepEqual(calls[1], ['todo.action', { sessionId: 'b', action: 'resume' }]);
    ui.setConnected(false);
    assert.equal(root.querySelector('.todo-action').disabled, true);
  } finally { dom.window.close(); }
});
