import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSource } from './helpers/public-source.js';
import { JSDOM } from 'jsdom';

const source = await publicSource('todo');
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
    assert.equal(root.querySelector('[data-status="running"].todo-count').textContent, '1 进行中');
    assert.equal(root.querySelector('.todo-heading').textContent, '任务清单');
    assert.equal(root.querySelectorAll('.todo-count[data-status]').length, 1);
    const identity = root.querySelector('.todo-identity');
    assert.deepEqual([...identity.querySelectorAll('svg')].map(svg => svg.dataset.icon), ['chevron', 'checklist']);
    assert.equal(identity.querySelector('.todo-heading').textContent, '任务清单');
    assert.equal(root.querySelector('.todo-toggle').title, '展开任务清单');
    root.querySelector('.todo-toggle').click();
    assert.equal(root.querySelector('#todo-list').hidden, false);
    assert.equal(dom.window.localStorage.getItem('axiom.todoExpanded'), '1');
    await new Promise(setImmediate);
    assert.equal(root.querySelector('.todo-row > small').hidden, true);
    const title = root.querySelector('.todo-item-title');
    assert.equal(title.querySelector('.todo-state-icon').getAttribute('aria-hidden'), 'true');
    assert.equal(title.querySelector('svg').dataset.icon, 'clock');
    assert.equal(title.querySelector('.todo-item-label').textContent, '父任务');
    assert.equal(title.getAttribute('aria-label'), '父任务，进行中');
    assert.equal(root.querySelector('.todo-toggle').title, '收起任务清单');
    title.click();
    await new Promise(setImmediate);
    assert.equal(root.querySelector('.todo-item-title').getAttribute('aria-expanded'), 'true');
    assert.equal(root.querySelector('.todo-child').textContent, '<script>danger</script>核对产物');
    assert.equal(root.querySelector('script'), null);
    ui.show('b', snapshot('paused'));
    assert.equal(root.querySelector('#todo-list').hidden, false);
    ui.show('empty', null);
    assert.equal(root.hidden, true);
    assert.equal(root.querySelector('#todo-list').children.length, 0);
  } finally { dom.window.close(); }
});

test('Todo delta updates keep the row button and update icon, text and accessible status together', () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  try {
    dom.window.localStorage.setItem('axiom.todoExpanded', '1');
    dom.window.eval(source + '\nwindow.makeTodo = createTodoUI;');
    const root = dom.window.document.getElementById('root');
    const ui = dom.window.makeTodo({ root, request: async () => snapshot() });
    ui.show('a', snapshot());
    const button = root.querySelector('.todo-item-title');
    button.focus();
    for (const [version, status, icon, label] of [
      [2, 'pending', 'pending', '待处理'], [3, 'blocked', 'blocked', '受阻'], [4, 'done', 'check', '已完成'],
    ]) {
      ui.show('a', { ...snapshot(), version, items: undefined,
        changed: [{ id: 'p', level: 1, title: '<b>安全文本</b>', status, blocker: status === 'blocked' ? '缺少输入' : '' }] });
      assert.equal(root.querySelector('.todo-item-title'), button);
      assert.equal(dom.window.document.activeElement, button);
      assert.equal(button.getAttribute('aria-label'), `<b>安全文本</b>，${label}`);
      assert.equal(button.querySelector('svg').dataset.icon, icon);
      assert.equal(button.querySelector('b'), null);
      assert.equal(button.getAttribute('aria-expanded'), 'false');
      assert.equal(root.querySelector('.todo-summary').hidden, status !== 'blocked');
    }
  } finally { dom.window.close(); }
});

test('Todo ignores stale session failures but exposes current read failures', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  try {
    dom.window.localStorage.setItem('axiom.todoExpanded', '1');
    dom.window.eval(source + '\nwindow.makeTodo = createTodoUI;');
    const root = dom.window.document.getElementById('root');
    let reject;
    const ui = dom.window.makeTodo({ root, request: () => new Promise((_, no) => { reject = no; }) });
    ui.show('a', snapshot());
    root.querySelector('.todo-item-title').click();
    ui.show('b', { ...snapshot(), listId: 'other' });
    reject(new Error('old session failure'));
    await new Promise(setImmediate);
    assert.equal(root.querySelector('.todo-reason').hidden, true);
    assert.equal(root.textContent.includes('old session failure'), false);
    root.querySelector('.todo-item-title').click();
    reject(new Error('current failure'));
    await new Promise(setImmediate);
    assert.equal(root.querySelector('.todo-reason').hidden, false);
    assert.equal(root.querySelector('.todo-reason').textContent, 'current failure');
  } finally { dom.window.close(); }
});

test('Todo top-level and child pagination remain operable after loading', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  try {
    dom.window.eval(source + '\nwindow.makeTodo = createTodoUI;');
    const root = dom.window.document.getElementById('root'), calls = [];
    const extra = { id: 'extra', level: 1, title: '第二页', status: 'pending' };
    const ui = dom.window.makeTodo({ root, request: async (_type, args) => {
      calls.push(args);
      if (args.section) return { verification: [] };
      if (args.itemId) return args.offset
        ? { items: [{ ...child, id: 'c2' }], hasMore: false, nextOffset: null }
        : { item: snapshot().items[0], items: [child], hasMore: true, nextOffset: 20 };
      return args.offset
        ? { ...snapshot(), items: [extra], hasMore: false, nextOffset: null }
        : { ...snapshot(), hasMore: true, nextOffset: 20 };
    } });
    ui.show('a', snapshot());
    root.querySelector('.todo-toggle').click();
    await new Promise(setImmediate);
    const more = root.lastElementChild;
    assert.equal(more.hidden, false);
    assert.equal(more.disabled, false);
    more.click();
    assert.equal(more.disabled, true);
    await new Promise(setImmediate);
    assert.equal(root.querySelectorAll('.todo-list > .todo-row').length, 2);
    assert.equal(more.hidden, true);
    assert.equal(calls.at(-1).offset, 20);
    root.querySelector('.todo-item-title').click();
    await new Promise(setImmediate);
    const childMore = root.querySelector('.todo-detail > .todo-action');
    assert.equal(childMore.disabled, false);
    childMore.click();
    await new Promise(setImmediate);
    assert.equal(root.querySelectorAll('.todo-child').length, 2);
    assert.equal(childMore.hidden, true);
    assert.equal(calls.at(-1).itemId, 'p');
    assert.equal(calls.at(-1).offset, 20);
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
