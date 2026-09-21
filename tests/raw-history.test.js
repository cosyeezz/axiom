import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRawArchive, contentHash } from '../src/raw-history.js';

test('incomplete archive tail requires authoritative proof and preserves quarantined bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-raw-tail-'));
  const options = { sourceJournalId: 'j', sourceSessionId: 's' };
  const entry = { id: 'a', type: 'message', parentId: null, message: { role: 'user', content: '原文' } };
  try {
    const archive = await createRawArchive(dir, options); archive.record(entry); await archive.close();
    appendFileSync(join(dir, 'raw.jsonl'), '{"partial":');
    await assert.rejects(() => createRawArchive(dir, options), { code: 'SOURCE_CORRUPT' });
    await assert.rejects(() => createRawArchive(dir, { ...options, authoritativeEntries: [] }), { code: 'SOURCE_CORRUPT' });
    const recovered = await createRawArchive(dir, { ...options, authoritativeEntries: [entry] });
    recovered.reconcile([entry]); assert.equal(recovered.records().length, 1); await recovered.close();
    const quarantined = readdirSync(dir).find(file => file.includes('.incomplete-'));
    assert.ok(readFileSync(join(dir, quarantined), 'utf8').endsWith('{"partial":'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('raw archive durably preserves entries, identities and graph parents across reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-raw-'));
  const options = { sourceJournalId: 'journal-a', sourceSessionId: 'session-a' };
  try {
    const archive = await createRawArchive(dir, options);
    const entry = { id: 'entry-a', parentId: 'control-a', type: 'message', message: { role: 'user', content: '中文😀\r\nno trailing newline' } };
    archive.record(entry); archive.record(entry); archive.barrier();
    assert.equal(archive.records().length, 1);
    assert.throws(() => archive.record({ ...entry, parentId: 'other' }), { code: 'ARCHIVE_IDENTITY_CONFLICT' });
    await assert.rejects(() => createRawArchive(dir, options), { code: 'ARCHIVE_NOT_DURABLE' });
    await archive.close();
    const reopened = await createRawArchive(dir, options);
    assert.deepEqual(reopened.records()[0].sourceEntry, entry);
    assert.equal(reopened.records()[0].sourceEntryHash, contentHash(entry));
    await reopened.close();
    assert.equal(readFileSync(join(dir, 'raw.jsonl'), 'utf8').split('\n').filter(Boolean).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
