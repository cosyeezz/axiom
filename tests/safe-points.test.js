import { test } from 'node:test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { forkSafePoint } from '../src/pi.js';
import assert from 'node:assert/strict';
import { safePoints, requireSafePoint, navigationState } from '../src/safe-points.js';

test('native fork persists user-only prefix and never mutates source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-point-'));
  try {
    const file = join(dir, 'source.jsonl');
    const header = { type: 'session', version: 3, id: 'source', timestamp: new Date().toISOString(), cwd: dir };
    const user = { type: 'message', id: 'user1', parentId: null, timestamp: header.timestamp, message: { role: 'user', content: 'first', timestamp: Date.now() } };
    const original = [header, user].map(JSON.stringify).join('\n') + '\n';
    await writeFile(file, original);
    const source = SessionManager.open(file);
    const fork = await forkSafePoint(source, 'user1');
    assert.notEqual(fork.sessionFile, file);
    assert.equal(source.getSessionFile(), file);
    assert.equal(source.getLeafId(), 'user1');
    assert.equal(await readFile(file, 'utf8'), original);
    const restored = SessionManager.open(fork.sessionFile);
    assert.equal(restored.getBranch()[0].message.content, 'first');
    assert.equal(navigationState(restored.getBranch()).entryId, 'user1');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('safe points keep complete tool batches and include compaction itself', () => {
  const entries = [
    { id: 'u', type: 'message', message: { role: 'user', content: 'hello' } },
    { id: 'a', type: 'message', message: { role: 'assistant', content: [{ type: 'toolCall', id: '1' }, { type: 'toolCall', id: '2' }] } },
    { id: 'r1', type: 'message', message: { role: 'toolResult', toolCallId: '1' } },
    { id: 'r2', type: 'message', message: { role: 'toolResult', toolCallId: '2' } },
    { id: 'c', type: 'compaction', summary: 'summary' },
    { id: 'next', type: 'message', message: { role: 'user', content: 'edit me' } },
  ];
  assert.deepEqual(safePoints(entries).map(point => point.entryId), ['u', 'r2', 'c', 'next']);
  assert.throws(() => requireSafePoint(entries, 'r1'));
  assert.equal(requireSafePoint(entries, 'c').draft.content, 'edit me');
  assert.equal(requireSafePoint(entries, 'u').draft, null);
  const marker = { type: 'custom', customType: 'axiom_revert', data: { entryId: 'c', draft: null } };
  assert.equal(navigationState([...entries, marker]).entryId, 'c');
  assert.equal(navigationState([...entries, marker, entries[0]]), null);
});
