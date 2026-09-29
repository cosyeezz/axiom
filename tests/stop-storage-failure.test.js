import test from 'node:test';
import assert from 'node:assert/strict';
import { Sessions } from '../src/sessions.js';

for (const method of ['safeStop', 'cancel']) test(`${method} during startup persistence prevents a late run`, async () => {
 const calls = [];
 const sessions = new Sessions(async () => ({ config: () => ({}), subscribe: () => () => {},
  prompt: async () => calls.push('prompt'), result: () => '', abort: async () => calls.push('abort'),
  requestSafeStop: () => calls.push('safe'), dispose: async () => {} }));
 const persist = sessions.persist.bind(sessions);
 let release;
 try {
  const id = await sessions.create(), item = sessions.get(id);
  await new Promise(setImmediate);
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  sessions.persist = async (...args) => { if (first) { first = false; await gate; } return persist(...args); };
  await sessions.prompt(id, 'must not start');
  const stopped = sessions[method](id);
  await new Promise(setImmediate);
  release(); await stopped; await item.work;
  assert.deepEqual(calls, [method === 'cancel' ? 'abort' : 'safe']);
  assert.equal(item.notificationsPaused, true);
  sessions.persist = persist;
  await sessions.prompt(id, 'explicit resume'); await item.work;
  assert.equal(calls.at(-1), 'prompt');
 } finally { release?.(); sessions.persist = persist; await sessions.close(); }
});

test('concurrent cancellation shares execution control even while persistence is pending', async () => {
 const signals = [];
 const factory = async () => ({ config: () => ({}), subscribe: () => () => {},
  abort: async () => { signals.push('abort'); }, dispose: async () => {} });
 const sessions = new Sessions(factory);
 const persist = sessions.persist.bind(sessions);
 let release;
 try {
  const id = await sessions.create(), item = sessions.get(id);
  await new Promise(setImmediate);
  item.status = 'running';
  const gate = new Promise(resolve => { release = resolve; });
  sessions.persist = async () => { await gate; throw new Error('disk failure'); };
  const first = assert.rejects(sessions.cancel(id), /disk failure/);
  const second = assert.rejects(sessions.cancel(id), /disk failure/);
  await new Promise(setImmediate);
  assert.deepEqual(signals, ['abort']);
  assert.equal(item.status, 'cancelling');
  release(); await Promise.all([first, second]);
  assert.equal(item.status, 'idle');
 } finally { release?.(); sessions.persist = persist; await sessions.close(); }
});

for (const method of ['cancel', 'safeStop']) for (const failure of ['todo', 'hold', 'persist']) {
 test(`${method} still signals agent when ${failure} save fails`, async () => {
  const signals = [], events = [];
  const factory = async () => ({ config: () => ({ model:'test/model' }), subscribe: () => () => {},
   abort: async () => { signals.push('abort'); }, requestSafeStop: () => { signals.push('safe'); },
   prompt: async () => { throw new Error('must not prompt'); }, result: () => '', dispose: async () => {} });
  const sessions = new Sessions(factory);
  const id = await sessions.create(), item = sessions.get(id);
  const persist = sessions.persist.bind(sessions), hold = sessions.holdTodoNotifications.bind(sessions), pause = item.todo.pause.bind(item.todo);
  try {
   await new Promise(setImmediate);
   item.status = 'running'; item.todo.header = { listId:'fake' }; item.listeners.add(e => events.push(e));
   item.todo.pause = () => { if (failure === 'todo') throw new Error('todo disk failure'); };
   sessions.holdTodoNotifications = async () => { if (failure === 'hold') throw new Error('hold disk failure'); };
   sessions.persist = async () => { if (failure === 'persist') throw new Error('persist disk failure'); };
   await assert.rejects(sessions[method](id), /disk failure/);
   assert.deepEqual(signals, [method === 'cancel' ? 'abort' : 'safe']);
   assert.equal(item.notificationsPaused, true); assert.equal(item.memoryPaused, true);
   assert(events.some(e => e.type === 'error' && /disk failure/.test(JSON.stringify(e))));
   assert.equal(item.cancelling, undefined);
  } finally {
   item.todo.header = null; item.todo.pause = pause; item.status = 'idle';
   sessions.persist = persist; sessions.holdTodoNotifications = hold;
   await sessions.close();
  }
 });
}
