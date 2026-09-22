import test from 'node:test';
import assert from 'node:assert/strict';
import { Todo, createTodoStore } from '../src/todo.js';
import { DatabaseSync } from 'node:sqlite';

test('SQLite is authoritative and rejects stale writers without partial updates', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = createTodoStore(db);
    const t = new Todo({ sessionId: 'sqlite', store });
    t.update({ baseVersion: 0, ops: [{ op: 'add', id: 's', title: 'persistent' }] });
    const reopened = new Todo({ sessionId: 'sqlite', store: createTodoStore(db) });
    assert.equal(reopened.snapshot().items[0].title, 'persistent');
    assert.throws(() => reopened.update({ baseVersion: 0, ops: [{ op: 'delete', id: 's' }] }), /版本冲突/);
    assert.equal(db.prepare('SELECT version FROM todos').get().version, 1);
    store.remove('sqlite'); assert.equal(store.load('sqlite'), null);
  } finally { db.close(); }
});

function setup() { const store = createTodoStore(); const todo = new Todo({ sessionId: 'a', store }); return { store, todo }; }
const update = (t, ops) => t.update({ baseVersion: t.snapshot().version, ops });
test('completed and emptied lists retain explicit pause when work is added', () => {
  for (const finish of [{ op: 'status', id: 'a', status: 'done' }, { op: 'delete', id: 'a' }]) {
    const { todo } = setup();
    update(todo, [{ op: 'add', id: 'a', title: 'a' }]);
    update(todo, [finish]);
    todo.pause();
    update(todo, [{ op: 'add', id: 'b', title: 'b' }]);
    assert.equal(todo.snapshot().mode, 'paused');
    assert.equal(todo.actionable, false);
  }
});

test('deleting the last child resets derived parent completion', () => {
  const { todo } = setup();
  update(todo, [{ op: 'add', id: 'p', title: 'p' }, { op: 'add', id: 'c', parentId: 'p', title: 'c' }]);
  update(todo, [{ op: 'status', id: 'c', status: 'done' }]);
  update(todo, [{ op: 'delete', id: 'c' }]);
  assert.equal(todo.snapshot().items[0].status, 'pending');
});

test('Todo atomic edits, stable IDs, two levels and completion aggregation', () => {
  const { todo } = setup();
  update(todo, [{ op: 'add', id: 'p', title: 'parent' }, { op: 'add', id: 'c', title: 'child', parentId: 'p' }]);
  assert.equal(todo.snapshot().mode, 'enabled');
  const before = todo.snapshot();
  assert.throws(() => update(todo, [{ op: 'edit', id: 'c', title: 'changed' }, { op: 'add', title: 'third', parentId: 'c' }]));
  assert.deepEqual(todo.snapshot(), before);
  update(todo, [{ op: 'status', id: 'c', status: 'done' }]);
  assert.equal(todo.snapshot().mode, 'completed');
  assert.ok(todo.snapshot().items.every(i => i.status === 'done'));
  assert.throws(() => update(todo, [{ op: 'edit', id: 'c', title: 'different task' }]));
  update(todo, [{ op: 'reopen', id: 'c' }]);
  assert.equal(todo.snapshot().items[0].status, 'pending');
  update(todo, [{ op: 'delete', id: 'p' }]);
  assert.equal(todo.snapshot().items.length, 0);
});
test('Todo version conflict and per-session isolation', () => {
  const { todo, store } = setup();
  update(todo, [{ op: 'add', id: 'x', title: 'x' }]);
  assert.throws(() => todo.update({ baseVersion: 0, ops: [{ op: 'delete', id: 'x' }] }), /版本冲突/);
  assert.equal(new Todo({ sessionId: 'b', store }).snapshot().items.length, 0);
  assert.equal(new Todo({ sessionId: 'a', store }).snapshot().items.length, 1);
});
test('Todo pause survives edits; blocked work never nudges; no-progress is bounded', () => {
  const { todo } = setup();
  update(todo, [{ op: 'add', id: 'a', title: 'a' }]);
  todo.pause();
  update(todo, [{ op: 'edit', id: 'a', note: 'some note' }]);
  assert.equal(todo.active, false);
  todo.resume();
  update(todo, [{ op: 'status', id: 'a', status: 'blocked', note: 'need user' }]);
  assert.equal(todo.nudge(), false);
  update(todo, [{ op: 'status', id: 'a', status: 'pending' }]);
  assert.equal(todo.nudge(), true);
  assert.equal(todo.nudge(), true);
  assert.equal(todo.nudge(), true);
  assert.equal(todo.nudge(), false);
  assert.equal(todo.snapshot().mode, 'paused');
});
test('Todo tools read bounded slices and main context names the read entry', async () => {
  const { todo } = setup();
  update(todo, [{ op: 'add', id: 'a', title: 'a' }, { op: 'add', id: 'b', title: 'b' }]);
  update(todo, [{ op: 'move', id: 'b', beforeId: 'a' }]);
  const data = JSON.parse((await todo.readTool().execute('call', { limit: 1 })).content[0].text);
  assert.equal(data.total, 2); assert.equal(data.items[0].id, 'b');
  assert.match(todo.context(), /todo_read/);
});
