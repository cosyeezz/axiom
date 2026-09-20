import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sessions } from '../src/sessions.js';
import { command } from '../src/protocol.js';

test('configure protocol accepts empty-session assembly selections', () => {
  const request = { id: 'request', type: 'session.configure', sessionId: 'session', model: 'test/one', capabilities: null, subagentCapabilities: 'inherit', retry: null };
  assert.equal(command.safeParse(request).success, true);
  assert.equal(command.safeParse({ ...request, subagentCapabilities: null }).success, true);
  assert.equal(command.safeParse({ ...request, retry: { retryable: [123] } }).success, false);
});
const empty = { skills: [], mcp: [], plugins: [] };
const chosen = { ...empty, skills: ['s'] };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-empty-config-'));
  const state = { instances: [], fail: false, gate: null, disposed: 0 };
  const factory = async (_tools, selected) => {
    if (state.gate) await state.gate;
    if (state.fail) throw new Error('assembly failed');
    state.instances.push(selected);
    return {
      config: () => ({ model: 'test/one', thinking: 'off', retry: selected.retry }),
      subscribe: (fn) => { state.sink = fn; return () => {}; }, prompt: async () => {}, enqueue: async () => {},
      queue: () => ({ steering: [], followUp: [] }), withdraw: () => ({}),
      abort: async () => {}, result: () => 'ok', dispose: async () => { state.disposed++; },
      sessionFile: () => join(root, 'pending.jsonl'), historyEntries: () => [],
    };
  };
  factory.catalog = () => [{ key: 'test/one' }];
  factory.capabilities = async () => ({ skills: [{ id: 's' }], mcp: [], plugins: [] });
  let sessions = new Sessions(factory, undefined, join(root, 'storage'));
  t.after(async () => { await sessions.close(); await rm(root, { recursive: true, force: true }); });
  const id = await sessions.create(root, { capabilities: empty });
  return { state, id, get sessions() { return sessions; }, async reopen() {
    await sessions.close(); sessions = new Sessions(factory, undefined, join(root, 'storage'));
    await sessions.load();
  } };
}
test('empty session reassembles selected capabilities and retry, keeping identity and persistence', async t => {
  const f = await fixture(t);
  assert.equal(f.sessions.snapshot(f.id).config.canReconfigure, true);
  const result = await f.sessions.configure(f.id, { capabilities: chosen, subagentCapabilities: chosen, retry: { retryable: ['temporary'] } });
  assert.equal(result.canReconfigure, true);
  assert.deepEqual(result.capabilitySelection, chosen);
  assert.deepEqual(f.state.instances.at(-1).retry, { retryable: ['temporary'] });
  assert.equal(f.state.disposed, 1);
  await f.reopen();
  assert.equal(f.sessions.snapshot(f.id).config.canReconfigure, true);
  await f.sessions.ensureLoaded(f.id);
  assert.deepEqual(f.sessions.snapshot(f.id).config.capabilitySelection, chosen);
});
test('persist failure during rebuild keeps the old agent and allows retry', async t => {
  const f = await fixture(t), old = f.sessions.get(f.id).agent;
  const realStore = f.sessions.store;
  f.sessions.store = { hasSession: () => true, change() { throw new Error('db locked'); } };
  try { await assert.rejects(f.sessions.configure(f.id, { capabilities: chosen }), /db locked/); }
  finally { f.sessions.store = realStore; }
  assert.equal(f.sessions.get(f.id).agent, old);
  assert.equal(f.sessions.snapshot(f.id).config.canReconfigure, true);
  assert.deepEqual((await f.sessions.configure(f.id, { capabilities: chosen })).capabilitySelection, chosen);
});
test('listeners subscribed before rebuild keep receiving events', async t => {
  const f = await fixture(t), seen = [];
  f.sessions.subscribe(f.id, event => seen.push(event));
  await f.sessions.configure(f.id, { capabilities: chosen });
  f.state.sink({ type: 'agent.tool.start', data: { name: 'x' } });
  assert.equal(seen.at(-1).type, 'agent.tool.start');
  assert.equal(seen.at(-1).sessionId, f.id);
  assert.ok(seen.at(-1).seq >= 1);
});
test('assembly failure preserves old agent and permits retry', async t => {
  const f = await fixture(t), old = f.sessions.get(f.id).agent;
  f.state.fail = true;
  await assert.rejects(f.sessions.configure(f.id, { capabilities: chosen }), /assembly failed/);
  assert.equal(f.sessions.get(f.id).agent, old);
  assert.equal(f.state.disposed, 0);
  assert.equal(f.sessions.snapshot(f.id).config.canReconfigure, true);
  f.state.fail = false;
  await f.sessions.configure(f.id, { capabilities: chosen });
});
test('assembly blocks first prompt and first prompt permanently locks assembly across restart', async t => {
  const f = await fixture(t);
  let release;
  f.state.gate = new Promise(resolve => { release = resolve; });
  const save = f.sessions.configure(f.id, { capabilities: chosen });
  await new Promise(resolve => setTimeout(resolve, 20));
  await assert.rejects(f.sessions.prompt(f.id, 'first'), /busy/);
  release(); await save; f.state.gate = null;
  const prompt = f.sessions.prompt(f.id, 'first');
  await assert.rejects(f.sessions.configure(f.id, { capabilities: empty }), /首次发送/);
  await prompt; await f.sessions.get(f.id).work;
  await f.reopen();
  assert.equal(f.sessions.snapshot(f.id).config.canReconfigure, false);
  await assert.rejects(f.sessions.configure(f.id, { retry: null }), /首次发送/);
});
