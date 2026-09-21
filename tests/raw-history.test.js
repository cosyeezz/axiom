import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, appendFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRawArchive, contentHash } from '../src/raw-history.js';

test('multimodal, cancelled and custom entries survive reopen without field loss', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-multimodal-'));
  const options = { sourceJournalId: 'j', sourceSessionId: 's' };
  const entries = [
    { id: 'image', type: 'message', message: { role: 'user', content: [{ type: 'text', text: '图片' }, { type: 'image', data: 'AAECAw==', mimeType: 'image/png' }] } },
    { id: 'cancelled', parentId: 'image', type: 'message', message: { role: 'assistant', stopReason: 'aborted', errorMessage: 'cancelled', content: [{ type: 'thinking', thinking: 'partial', thinkingSignature: 'signature' }] } },
    { id: 'custom', parentId: 'cancelled', type: 'custom_message', customType: 'subagent-notice', content: 'unverified report', display: true, details: { agentId: 'child' } },
  ];
  try {
    let archive = await createRawArchive(dir, options);
    archive.reconcile(entries); await archive.close();
    archive = await createRawArchive(dir, options);
    try { assert.deepEqual(archive.records().map(record => record.sourceEntry), entries); }
    finally { await archive.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('another process cannot acquire an archive writer held by this process', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-owner-process-'));
  const archive = await createRawArchive(dir, { sourceJournalId: 'j', sourceSessionId: 's' });
  try {
    const moduleUrl = new URL('../src/raw-history.js', import.meta.url).href;
    const code = `import {createRawArchive} from ${JSON.stringify(moduleUrl)}; try { const a = await createRawArchive(${JSON.stringify(dir)}, {sourceJournalId:'j',sourceSessionId:'s'}); await a.close(); process.exitCode=1; } catch(e) { if(e.code!=='ARCHIVE_NOT_DURABLE') throw e; console.log('writer-denied'); }`;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { timeout: 15000 });
    assert.match(stdout, /writer-denied/);
  } finally { await archive.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('full tool artifacts remain readable after temporary output disappears', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-artifact-'));
  try {
    const output = join(dir, 'output.txt'); writeFileSync(output, '完整产物😀');
    const archive = await createRawArchive(join(dir, 'history'), { sourceJournalId: 'j', sourceSessionId: 's' });
    try {
      const entry = { id: 'a', type: 'message', message: { role: 'toolResult', content: 'truncated', details: { fullOutputPath: output } } };
      const record = archive.record(entry); rmSync(output);
      archive.reconcile([entry]);
      assert.equal(archive.readArtifact(record, 'artifact_0'), '完整产物😀');
      rmSync(join(dir, 'history', 'artifacts', record.artifacts[0].hash.slice(7)));
      assert.throws(() => archive.reconcile([entry]), { code: 'SOURCE_MISSING' });
    } finally { await archive.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

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

test('three compactions keep originals and controls in separate durable streams', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'axiom-raw-control-'));
  const options = { sourceJournalId: 'j', sourceSessionId: 's' };
  try {
    const archive = await createRawArchive(dir, options);
    const entries = Array.from({ length: 3 }, (_, i) => [
      { type: 'message', id: `m${i}`, message: { role: 'user', content: 'same text <summary>' } },
      { type: 'compaction', id: `c${i}`, summary: 'not original', parentId: `m${i}` },
    ]).flat();
    archive.reconcile(entries); archive.reconcile(entries); await archive.close();
    const raw = readFileSync(join(dir, 'raw.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const controls = readFileSync(join(dir, 'control.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(raw.length, 3); assert.ok(raw.every(record => record.sourceEntry.type === 'message'));
    assert.equal(controls.length, 3);
    const reopened = await createRawArchive(dir, options);
    assert.equal(reopened.records().length, 6);
    assert.throws(() => reopened.reconcile(entries.slice(1)), { code: 'SOURCE_CORRUPT' });
    await reopened.close();
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
