import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSource } from './helpers/public-source.js';
import { JSDOM } from 'jsdom';

const source = await publicSource('todo');
const tick = () => new Promise(setImmediate);
const parent = { id: 'p', level: 1, title: '父任务', status: 'running', summary: '目标摘要' };
const child = { id: 'c', level: 2, parentId: 'p', title: '<script>danger</script>', status: 'running', summary: '核对产物' };
const snapshot = (version = 1) => ({ listId: 'list', version, header: {},
  counts: { targets: { total: 1, running: 1 } }, coverage: { complete: false },
  items: [parent], hasMore: false, nextOffset: null });
function setup({ handler, preference, children = [child] } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', runScripts: 'outside-only' });
  if (preference != null) dom.window.localStorage.setItem('axiom.todoExpanded', preference);
  dom.window.eval(source + '\nwindow.makeTodo = createTodoUI;');
  const root = dom.window.document.getElementById('root'), calls = [];
  const fallback = (_type, args) => args.section ? { ...snapshot(), verification: [] }
    : args.itemId ? { ...snapshot(), item: args.itemId === 'p' ? parent : child, items: args.itemId === 'p' ? children : [] }
    : snapshot();
  const ui = dom.window.makeTodo({ root, request: async (type, args) => {
    calls.push({ type, ...args });
    return handler ? handler(type, args, fallback) : fallback(type, args);
  } });
  return { dom, root, ui, calls };
}

test('Todo defaults to two visible levels; clicks show only the selected task detail', async () => {
  const { dom, root, ui, calls } = setup();
  try {
    ui.show('a', snapshot());
    await tick();
    assert.equal(root.querySelector('#todo-list').hidden, false);
    assert.equal(root.querySelector('.todo-heading').textContent, '任务清单');
    assert.deepEqual([...root.querySelectorAll('.todo-identity svg')].map(svg => svg.dataset.icon), ['chevron', 'checklist']);
    assert.equal(root.querySelectorAll('.todo-row').length, 2);
    assert.equal(root.querySelector('.todo-detail'), null);
    assert.equal(root.querySelector('.todo-child').textContent, child.title);
    assert.equal(root.querySelector('script'), null);
    assert.equal(root.textContent.includes('目标摘要'), false, 'summaries belong in detail, not list rows');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].itemId, 'p');
    assert.equal(calls[0].detail, undefined, 'do not prefetch descriptions or evidence');
    const title = root.querySelector('.todo-item-title');
    title.click(); await tick();
    assert.equal(title.getAttribute('aria-expanded'), 'true');
    assert.match(root.querySelector('.todo-detail').textContent, /目标摘要/);
    assert.equal(root.querySelectorAll('.todo-child').length, 1);
    title.click();
    assert.equal(title.getAttribute('aria-expanded'), 'false');
    assert.equal(root.querySelectorAll('.todo-child').length, 1, 'closing parent detail must not hide steps');
    const childButton = root.querySelector('.todo-child .todo-item-title');
    childButton.click(); await tick();
    assert.equal(childButton.getAttribute('aria-expanded'), 'true');
    assert.match(root.querySelector('.todo-child .todo-detail').textContent, /核对产物/);
    assert.equal(root.querySelector('.todo-list > .todo-row > .todo-detail'), null);
    assert.equal(calls.at(-1).itemId, 'c');
    assert.equal(root.querySelectorAll('.todo-row').length, 2, 'detail must not duplicate children');
  } finally { dom.window.close(); }
});

test('Todo respects saved collapse, persists explicit toggle and clears rows on session change', async () => {
  const { dom, root, ui, calls } = setup({ preference: '0' });
  try {
    ui.show('a', snapshot()); await tick();
    assert.equal(root.querySelector('#todo-list').hidden, true);
    assert.equal(root.querySelectorAll('.todo-row').length, 0);
    assert.equal(calls.length, 0);
    root.querySelector('.todo-toggle').click(); await tick();
    assert.equal(dom.window.localStorage.getItem('axiom.todoExpanded'), '1');
    assert.equal(root.querySelectorAll('.todo-row').length, 2);
    ui.show('b', { ...snapshot(), listId: 'other' }); await tick();
    assert.equal(root.querySelectorAll('.todo-row').length, 2);
    ui.show('empty', null);
    assert.equal(root.hidden, true);
    assert.equal(root.querySelectorAll('.todo-row').length, 0);
  } finally { dom.window.close(); }
});

test('Todo updates child states, removes/reorders steps and keeps stable focused buttons', async () => {
  let children = [child, { ...child, id: 'c2', title: '第二项' }], version = 1;
  const { dom, root, ui } = setup({ handler: (_type, args, fallback) => ({ ...fallback(_type, args), version,
    ...(args.itemId === 'p' ? { items: children } : {}) }) });
  try {
    ui.show('a', snapshot()); await tick();
    const button = root.querySelector('.todo-item-title');
    button.focus();
    for (const [status, name, symbol] of [['pending', '待处理', 'pending'], ['blocked', '受阻', 'blocked'], ['done', '已完成', 'check']]) {
      version++;
      children = children.map(i => ({ ...i, status }));
      ui.show('a', { ...snapshot(version), items: [{ ...parent, status }] }); await tick();
      assert.equal(root.querySelector('.todo-item-title'), button);
      assert.equal(dom.window.document.activeElement, button);
      assert.equal(button.getAttribute('aria-label'), `父任务，${name}`);
      assert.equal(button.querySelector('svg').dataset.icon, symbol);
      assert.equal(root.querySelector('.todo-child').dataset.status, status);
      assert.equal(root.querySelector('.todo-child svg').dataset.icon, symbol);
    }
    const second = root.querySelector('[data-id="c2"]');
    const childButton = second.querySelector('button');
    childButton.focus();
    version++;
    ui.show('a', snapshot(version)); await tick();
    assert.equal(dom.window.document.activeElement, childButton, 'unchanged child order preserves focus');
    children.reverse(); version++;
    ui.show('a', snapshot(version)); await tick();
    assert.equal(root.querySelector('.todo-children').firstElementChild, second);
    assert.equal(dom.window.document.activeElement, childButton, 'actual reordering preserves focus');
    children = [children[0]]; version++;
    ui.show('a', snapshot(version)); await tick();
    assert.equal(root.querySelector('[data-id="c"]'), null);
    assert.equal(root.querySelector('[data-id="c2"]'), second);
  } finally { dom.window.close(); }
});

test('Todo does not mistake nested child detail for the parent detail', async () => {
  const { dom, root, ui } = setup();
  try {
    ui.show('a', snapshot()); await tick();
    const parentButton = root.querySelector('.todo-item-title'), childButton = root.querySelector('.todo-child .todo-item-title');
    childButton.click(); await tick();
    parentButton.click(); await tick();
    assert.equal(root.querySelectorAll('.todo-detail').length, 2);
    parentButton.click();
    assert.equal(root.querySelectorAll('.todo-detail').length, 1);
    assert.equal(childButton.getAttribute('aria-expanded'), 'true');
    assert.match(root.querySelector('.todo-detail').textContent, /核对产物/);
  } finally { dom.window.close(); }
});

test('Todo rapid detail toggle cancels late details without duplicate requests or false aria state', async () => {
  let resolve;
  const { dom, root, ui, calls } = setup({ handler: (type, args, fallback) => args.detail
    ? new Promise(r => { resolve = r; }) : fallback(type, args) });
  try {
    ui.show('a', snapshot()); await tick();
    const button = root.querySelector('.todo-item-title');
    button.click(); button.click();
    resolve({ ...snapshot(), item: parent }); await tick();
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.hasAttribute('aria-busy'), false);
    assert.equal(root.querySelector('.todo-detail'), null);
    assert.equal(calls.filter(c => c.section).length, 0);
  } finally { dom.window.close(); }
});

test('Todo isolates stale reads/failures across collapse, session and version changes', async () => {
  const pending = [];
  const { dom, root, ui } = setup({ handler: (_type, args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })) });
  try {
    ui.show('a', snapshot());
    ui.show('b', { ...snapshot(), listId: 'other' });
    pending[0].reject(new Error('old session failure')); await tick();
    assert.equal(root.textContent.includes('old session failure'), false);
    pending[1].resolve({ ...snapshot(), items: [child] }); await tick();
    assert.equal(root.querySelectorAll('.todo-child').length, 1);
    root.querySelector('.todo-item-title').click();
    root.querySelector('.todo-toggle').click();
    pending[2].resolve({ ...snapshot(), item: parent }); await tick();
    assert.equal(root.querySelectorAll('.todo-row').length, 0);
    root.querySelector('.todo-toggle').click();
    pending[3].resolve(snapshot()); await tick();
    ui.show('b', { ...snapshot(2), listId: 'other' });
    pending[4].resolve({ ...snapshot(), items: [{ ...child, title: '过期步骤' }] }); await tick();
    assert.equal(root.textContent.includes('过期步骤'), false);
    pending[5].resolve({ ...snapshot(2), items: [child] }); await tick();
    assert.equal(root.querySelector('.todo-child').textContent, child.title);
  } finally { dom.window.close(); }
});

test('Todo child reads are bounded, independent of details, and failures offer retry', async () => {
  let active = 0, maximum = 0;
  const releases = [];
  const { dom, root, ui, calls } = setup({ handler: (_type, args) => {
    active++; maximum = Math.max(maximum, active);
    return new Promise((resolve, reject) => releases.push((fail = false) => {
      active--; if (fail) reject(new Error('读取失败')); else resolve({ ...snapshot(), items: [] });
    }));
  } });
  try {
    ui.show('a', { ...snapshot(), items: Array.from({ length: 8 }, (_, i) => ({ ...parent, id: `p${i}` })) });
    assert.equal(calls.length, 4);
    releases[0](true); await tick();
    const retry = root.querySelector('[data-id="p0"] > .todo-action');
    assert.equal(retry.hidden, false);
    assert.equal(retry.disabled, false);
    assert.equal(retry.textContent, '重试读取步骤');
    for (let i = 1; i < 8; i++) { releases[i](); await tick(); }
    assert.equal(maximum, 4);
    retry.click(); releases[8](); await tick();
    assert.equal(retry.hidden, true);
    assert.equal(calls.every(c => c.limit === 20 && !c.detail), true);
  } finally { dom.window.close(); }
});

test('Todo both levels keep pagination usable without opening details', async () => {
  const extra = { ...parent, id: 'extra', title: '第二页' };
  const { dom, root, ui, calls } = setup({ handler: (_type, args) => {
    if (args.itemId === 'extra') return { ...snapshot(), item: extra, items: [] };
    if (args.itemId) return { ...snapshot(), item: parent,
      items: [args.offset ? { ...child, id: 'c2' } : child], hasMore: !args.offset, nextOffset: args.offset ? null : 1 };
    return { ...snapshot(), items: [args.offset ? extra : parent], hasMore: !args.offset, nextOffset: args.offset ? null : 1 };
  } });
  try {
    ui.show('a', { ...snapshot(), hasMore: true, nextOffset: 1 }); await tick();
    const childMore = root.querySelector('.todo-list > .todo-row > .todo-action');
    assert.equal(childMore.hidden, false);
    childMore.click(); await tick();
    assert.equal(root.querySelectorAll('.todo-child').length, 2);
    assert.equal(childMore.hidden, true);
    assert.equal(calls.at(-1).offset, 1);
    const more = root.lastElementChild;
    assert.equal(more.hidden, false);
    more.click(); assert.equal(more.disabled, true); await tick();
    assert.equal(root.querySelectorAll('.todo-list > .todo-row').length, 2);
    assert.equal(more.disabled, false);
    assert.equal(more.hidden, true);
    assert.equal(root.querySelector('.todo-detail'), null);
  } finally { dom.window.close(); }
});

test('Todo bounded broadcasts revalidate loaded tail pages and recover focus on deleted children', async () => {
  let version = 1;
  const extra = { ...parent, id: 'extra', title: '尾页目标' };
  const { dom, root, ui } = setup({ handler: (type, args, fallback) => ({ ...fallback(type, args), version,
    ...(!args.itemId ? { items: [extra] } : version > 1 ? { items: [] } : {}) }) });
  try {
    ui.show('a', { ...snapshot(), hasMore: true, nextOffset: 1 }); await tick();
    root.lastElementChild.click(); await tick();
    assert.equal(root.querySelectorAll('.todo-list > .todo-row').length, 2);
    root.querySelector('.todo-child .todo-item-title').focus();
    version++;
    ui.show('a', { ...snapshot(version), hasMore: true, nextOffset: 1 }); await tick();
    assert.ok(root.querySelector('[data-id="extra"]'), 'previous tail is revalidated, not thrown away on every update');
    assert.equal(root.querySelector('.todo-child'), null);
    assert.equal(dom.window.document.activeElement, root.querySelector('.todo-item-title'));
    assert.equal(root.lastElementChild.hidden, true);
  } finally { dom.window.close(); }
});

test('Todo serializes target revalidation and pagination, invalidating older reads', async () => {
  let version = 1, release;
  const b = { ...parent, id: 'b' }, c = { ...parent, id: 'tail-c' };
  const { dom, root, ui, calls } = setup({ handler: (_type, args) => {
    if (args.itemId) return { ...snapshot(version), items: [] };
    if (version === 2 && args.offset === 1) return new Promise(r => { release = r; });
    return { ...snapshot(version), items: [args.offset === 2 ? c : b], hasMore: args.offset !== 2, nextOffset: args.offset === 2 ? null : 2 };
  } });
  try {
    ui.show('a', { ...snapshot(), hasMore: true, nextOffset: 1 }); await tick();
    const more = root.lastElementChild;
    more.click(); await tick();
    version = 2;
    ui.show('a', { ...snapshot(version), hasMore: true, nextOffset: 1 });
    assert.equal(more.disabled, true, 'cannot extend the range while it is being revalidated');
    const count = calls.length;
    more.click(); await tick();
    assert.equal(calls.length, count);
    release({ ...snapshot(version), items: [b], hasMore: true, nextOffset: 2 }); await tick();
    assert.equal(more.disabled, false);
    more.click(); await tick();
    assert.deepEqual([...root.querySelectorAll('.todo-list > .todo-row')].map(n => n.dataset.id), ['p', 'b', 'tail-c']);
    // A newer full snapshot cancels even same-generation target reads.
    ui.show('a', { ...snapshot(3), items: [parent] }); await tick();
    assert.equal(root.querySelector('[data-id="tail-c"]'), null);
    assert.equal(more.hidden, true);
  } finally { dom.window.close(); }
});

test('Todo failed step revalidation discards unverified tail and retries the failed offset', async () => {
  let version = 1, fail = false;
  const deleted = { ...child, id: 'deleted' }, replacement = { ...child, id: 'replacement' };
  const { dom, root, ui, calls } = setup({ handler: (_type, args) => {
    if (args.offset === 1 && fail) throw new Error('tail failed');
    return { ...snapshot(version), items: [args.offset ? version === 1 ? deleted : replacement : child],
      hasMore: !args.offset, nextOffset: args.offset ? null : 1 };
  } });
  try {
    ui.show('a', snapshot()); await tick();
    const more = root.querySelector('.todo-list > .todo-row > .todo-action');
    more.click(); await tick();
    root.querySelector('[data-id="deleted"] button').focus();
    version = 2; fail = true;
    ui.show('a', snapshot(version)); await tick();
    assert.equal(root.querySelector('[data-id="deleted"]'), null);
    assert.equal(dom.window.document.activeElement, root.querySelector('.todo-item-title'));
    assert.equal(root.querySelectorAll('.todo-child').length, 1);
    assert.equal(more.textContent, '重试读取步骤');
    assert.equal(more.disabled, false);
    fail = false; more.click(); await tick();
    assert.equal(calls.at(-1).offset, 1);
    assert.deepEqual([...root.querySelectorAll('.todo-child')].map(n => n.dataset.id), ['c', 'replacement']);
    assert.equal(more.hidden, true);
  } finally { dom.window.close(); }
});

test('Todo open details survive successive broadcasts without accepting late detail content', async () => {
  let version = 1, release;
  const { dom, root, ui } = setup({ handler: (type, args, fallback) => {
    if (version === 2 && args.detail) return new Promise(r => { release = r; });
    return { ...fallback(type, args), version, ...(args.detail ? { item: { ...parent, summary: `result ${version}` } } : {}) };
  } });
  try {
    ui.show('a', snapshot()); await tick();
    const title = root.querySelector('.todo-item-title'); title.click(); await tick();
    const detail = root.querySelector('.todo-detail');
    version = 2; ui.show('a', snapshot(version)); await tick();
    version = 3; ui.show('a', snapshot(version)); await tick();
    release({ ...snapshot(2), item: { ...parent, summary: 'stale result' } }); await tick();
    assert.equal(root.querySelector('.todo-detail'), detail);
    assert.equal(title.getAttribute('aria-expanded'), 'true');
    assert.match(detail.textContent, /result 3/);
    assert.doesNotMatch(detail.textContent, /stale result/);
  } finally { dom.window.close(); }
});

test('Todo complete child steps do not imply completed parent; empty details are explicit', async () => {
  const { dom, root, ui } = setup({ children: [{ ...child, status: 'done', summary: '' }], handler: (type, args, fallback) => ({
    ...fallback(type, args), ...(args.detail ? { item: { ...child, summary: '' } } : {}),
  }) });
  try {
    ui.show('a', snapshot()); await tick();
    assert.match(root.querySelector('.todo-children').textContent, /步骤已完成，待目标验收/);
    root.querySelector('.todo-child .todo-item-title').click(); await tick();
    assert.match(root.querySelector('.todo-detail').textContent, /暂无任务详情/);
    assert.equal(root.querySelector('.todo-list > .todo-row').dataset.status, 'running');
  } finally { dom.window.close(); }
});

test('Todo actions retain pause/resume and disconnected state independent of collapse', async () => {
  let paused = false;
  const { dom, root, ui, calls } = setup({ handler: (type, args, fallback) => {
    if (type === 'todo.action') { paused = args.action === 'pause'; return { ...snapshot(), header: { paused } }; }
    return fallback(type, args);
  } });
  try {
    ui.show('a', snapshot()); await tick();
    const action = root.querySelector('.todo-header > .todo-action');
    action.click(); await tick();
    assert.equal(action.textContent, '恢复');
    assert.equal(calls.find(c => c.type === 'todo.action').action, 'pause');
    assert.equal(root.querySelectorAll('.todo-child').length, 1);
    action.click(); await tick();
    assert.equal(action.textContent, '暂停');
    ui.setConnected(false);
    assert.equal(action.disabled, true);
    assert.equal(root.querySelector('.todo-item-title').disabled, true);
    ui.setConnected(true);
    assert.equal(action.disabled, false);
  } finally { dom.window.close(); }
});
