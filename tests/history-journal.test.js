import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJournalArchive, readDurableJournal, confirmDurableAppend, installDurableJournal } from '../src/history-journal.js';
test('journal bridge archives only disk-confirmed entries and rejects changed journal identity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-journal-')), file = join(dir, 'session.jsonl');
  const mirror = await createJournalArchive({ file });
  try {
    await assert.rejects(() => createJournalArchive({ file }), /占用/);
    assert.equal(await mirror.reconcile(), false);
    assert.deepEqual(mirror.records(), []);
    const header = { type: 'session', id: 'session-a' }, entry = { type: 'message', id: 'a', parentId: null, message: { role: 'user', content: '原文' } };
    writeFileSync(file, [header, entry].map(JSON.stringify).join('\n') + '\n');
    await mirror.barrier(); assert.deepEqual(mirror.records()[0].sourceEntry, entry);
    writeFileSync(file, JSON.stringify({ ...header, id: 'other' }) + '\n');
    await assert.rejects(() => mirror.reconcile(), { code: 'ARCHIVE_IDENTITY_CONFLICT' });
    await assert.rejects(() => mirror.close(), { code: 'ARCHIVE_IDENTITY_CONFLICT' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('first user entry is durable before any assistant and survives reopen', async () => {
  const { SessionManager } = await import('@earendil-works/pi-coding-agent');
  const dir = mkdtempSync(join(tmpdir(), 'axiom-first-user-'));
  try {
    const manager = SessionManager.create(dir, dir);
    const healthy = installDurableJournal(manager);
    const id = manager.appendMessage({ role: 'user', content: 'must survive', timestamp: Date.now() });
    healthy();
    const journal = readDurableJournal(manager.getSessionFile());
    assert.equal(journal.entries.at(-1).id, id);
    const reopened = SessionManager.open(manager.getSessionFile(), dir, dir);
    assert.equal(reopened.getBranch().at(-1).message.content, 'must survive');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('durable compaction acknowledgement requires the exact complete tail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-commit-')), file = join(dir, 'session.jsonl');
  try {
    assert.throws(() => confirmDurableAppend(file, 'c1'), { code: 'COMMIT_UNCERTAIN' });
    const journal = [{ type: 'session', id: 's1' }, { type: 'compaction', id: 'c1', summary: 'state' }].map(JSON.stringify).join('\n') + '\n';
    writeFileSync(file, journal);
    assert.equal(confirmDurableAppend(file, 'c1'), true);
    assert.throws(() => confirmDurableAppend(file, 'c2'), { code: 'COMMIT_UNCERTAIN' });
    writeFileSync(file, journal + '{');
    assert.throws(() => confirmDurableAppend(file, 'c1'), { code: 'COMMIT_UNCERTAIN' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('fork projection preserves copied identity without granting arbitrary parent access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-fork-'));
  try {
    const parent = join(dir, 'parent.jsonl'), child = join(dir, 'child.jsonl');
    const entry = { type: 'message', id: 'm', message: { role: 'user', content: 'same event' } };
    writeFileSync(parent, [{ type: 'session', id: 'parent' }, entry].map(JSON.stringify).join('\n') + '\n');
    writeFileSync(child, [{ type: 'session', id: 'child', parentSession: parent }, entry].map(JSON.stringify).join('\n') + '\n');
    const archive = await createJournalArchive({ file: child });
    try { await archive.barrier(); assert.deepEqual(archive.records()[0].copiedFrom, { sourceJournalId: 'parent', entryId: 'm' }); }
    finally { await archive.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('journal incomplete tail is never treated as valid history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-journal-'));
  try { const file = join(dir, 'session.jsonl'); writeFileSync(file, '{'); assert.throws(() => readDurableJournal(file), { code: 'SOURCE_CORRUPT' }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
