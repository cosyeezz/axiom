import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = (await readFile(new URL('../public/todo.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
const child = { id: 'c', level: 2, parentId: 'p', title: '<script>danger</script>', status: 'running', summary: '核对产物' };
const snapshot = (mode = 'enabled') => ({ listId: 'list', version: 1, header: { paused: mode === 'paused' },
  counts: { targets: { total: 1, running: 1 } }, coverage: { complete: true },
  items: [{ id: 'p', level: 1, title: '父任务', status: 'running', summary: '' }] });

test('Todo panel renders safe two-level text, target counts and global collapse preference', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  try {
    dom.window.eval(source + '\nwindow.makeTodo = createTodoUI;');
    const root = dom.window.document.getElementById('root');
    const ui = dom.window.makeTodo({ root, request: async (_type, args) => args.section
      ? { verification: [] }
      : args.itemId ? { item: snapshot().items[0], items: [child], hasMore: false } : snapshot() });
    ui.show('a', snapshot());
    assert.equal(root.hidden, false);
    assert.equal(root.querySelector('#todo-list').hidden, true);
    assert.equal(root.querySelector('[data-status="running"].todo-count').textContent, '1');
    root.querySelector('.todo-toggle').click();
    assert.equal(root.querySelector('#todo-list').hidden, false);
    assert.equal(dom.window.localStorage.getItem('axiom.todoExpanded'), '1');
    await new Promise(setImmediate);
    root.querySelector('.todo-item-title').click();
    await new Promise(setImmediate);
    assert.equal(root.querySelector('.todo-child').textContent, '<script>danger</script>核对产物');
    assert.equal(root.querySelector('script'), null);
    ui.show('b', snapshot('paused'));
    assert.equal(root.querySelector('#todo-list').hidden, false);
    ui.show('empty', null);
    assert.equal(root.hidden, true);
    assert.equal(root.querySelector('#todo-list').children.length, 0);
  } finally { dom.window.close(); }
});

test('Todo actions send current session pause/resume and respect disconnected state', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  try {
    dom.window.eval(source + '\nwindow.makeTodo = createTodoUI;');
    const root = dom.window.document.getElementById('root'), calls = [];
    const ui = dom.window.makeTodo({ root, request: async (type, args) => calls.push([type, JSON.parse(JSON.stringify(args))]) });
    ui.show('a', snapshot()); root.querySelector('.todo-action').click();
    await new Promise(setImmediate);
    assert.deepEqual(calls[0], ['todo.action', { sessionId: 'a', action: 'pause' }]);
    ui.show('b', snapshot('paused')); root.querySelector('.todo-action').click();
    await new Promise(setImmediate);
    assert.deepEqual(calls[1], ['todo.action', { sessionId: 'b', action: 'resume' }]);
    ui.setConnected(false);
    assert.equal(root.querySelector('.todo-action').disabled, true);
  } finally { dom.window.close(); }
});
