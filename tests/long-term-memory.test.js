import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createMemoryStore, registerMemoryAccess } from '../src/long-term-memory.js';
import { createInstructions } from '../src/instructions.js';
import { instructionTools } from '../src/instruction-tools.js';

const fixture = async fn => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-memory-test-'));
  try { await fn(createMemoryStore({ cwd: join(root, 'project'), root: join(root, 'memory') }), root); }
  finally { await rm(root, { recursive: true, force: true }); }
};
const card = (id, version = 0, more = {}) => ({ scope: 'project', id, version, summary: '测试结果及适用范围', content: '# 自由格式\n事实与来源，无固定字段。', ...more });

test('global/project isolation, index and card pagination, atomic correction and merge', async () => fixture(async (store, root) => {
  assert.deepEqual((await store.index({ scope: 'global' })).cards, []);
  const saved = await store.save(card('first'));
  assert.equal(saved.version, 1);
  const old = saved.path;
  const read = await store.card({ scope: 'project', id: 'first', limit: 4 });
  assert.equal(read.text, '# 自由'); assert.equal(read.nextOffset, 4);
  await store.save(card('second', 1));
  const page = await store.index({ scope: 'project', limit: 1 });
  assert.equal(page.nextOffset, 1); assert.equal(page.cards.length, 1);
  await store.save(card('combined', 2, { merge: ['first', 'second'] }));
  assert.deepEqual((await store.index({ scope: 'project' })).cards.map(c => c.id), ['combined']);
  assert.match(await readFile(old, 'utf8'), /事实/);
  await assert.rejects(store.card({ scope: 'project', id: 'first' }), /NOT_FOUND/);
  const other = createMemoryStore({ cwd: join(root, 'another-project'), root: join(root, 'memory') });
  assert.equal((await other.index({ scope: 'project' })).version, 0);
  await store.save(card('shared', 0, { scope: 'global' }));
  assert.equal((await other.index({ scope: 'global' })).cards[0].id, 'shared');
}));

test('version conflict, concurrent writer, abort and corrupt index never overwrite accepted data', async () => fixture(async store => {
  await store.save(card('accepted'));
  await assert.rejects(store.save(card('stale')), /VERSION_CONFLICT/);
  await assert.rejects(store.save(card('bad-merge', 1, { merge: ['missing'] })), /MERGE_NOT_FOUND/);
  const results = await Promise.allSettled([store.save(card('race-a', 1)), store.save(card('race-b', 1))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /MEMORY_BUSY|VERSION_CONFLICT/);
  const index = await store.index({ scope: 'project' });
  await assert.rejects(store.save(card('aborted', 2), AbortSignal.abort()), /abort/i);
  assert.equal((await store.index({ scope: 'project' })).version, 2);
  await writeFile(index.path, 'not a managed index');
  await assert.rejects(store.save(card('invalid', 2)), /INDEX_INVALID/);
  assert.equal(await readFile(index.path, 'utf8'), 'not a managed index');
}));

test('query has no write/material/history instructions; maintenance rejects paths and cancellation before write', async () => fixture(async store => {
  const query = createInstructions(), maintain = createInstructions();
  registerMemoryAccess(query, store, { profile: { purpose: 'memory-query' } });
  registerMemoryAccess(maintain, store, { profile: { purpose: 'memory-maintain' }, materials: '原文事实 SOURCE' });
  for (const name of ['memory.save', 'memory.material', 'history.read', 'task.start']) await assert.rejects(query.execute('axiom.describe', { name }), /Unknown/);
  assert.equal((await maintain.execute('memory.material', { offset: 5, limit: 6 })).text, 'SOURCE');
  const tool = instructionTools(maintain)[1];
  for (const args of [card('../escape'), card('ok', 0, { scope: '../escape' }), card('ok', 0, { path: '/outside' }), card('ok', -1)]) {
    await assert.rejects(tool.execute('call', { name: 'memory.save', arguments: args }), /Invalid/);
  }
  await assert.rejects(tool.execute('call', { name: 'memory.save', arguments: card('ok') }, AbortSignal.abort()), /abort/i);
  assert.equal((await store.index({ scope: 'project' })).version, 0);
}));

test('directory junctions, hard-linked indices and card links fail closed', async () => fixture(async (store, root) => {
  const outside = join(root, 'outside'); await mkdir(outside);
  const index = await store.index({ scope: 'global' }); await mkdir(dirname(dirname(index.path)), { recursive: true });
  await symlink(outside, dirname(index.path), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(store.save(card('escape', 0, { scope: 'global' })), /LINK_NOT_ALLOWED/);
  assert.equal((await store.index({ scope: 'project' })).version, 0);
  const saved = await store.save(card('ok'));
  const projectIndex = await store.index({ scope: 'project' });
  await link(projectIndex.path, join(outside, 'index-copy'));
  await assert.rejects(store.save(card('blocked', 1)), /LINK_NOT_ALLOWED/);
  await rm(join(outside, 'index-copy'));
  await link(saved.path, join(outside, 'card-copy'));
  await assert.rejects(store.card({ scope: 'project', id: 'ok' }), /LINK_NOT_ALLOWED/);
}));
