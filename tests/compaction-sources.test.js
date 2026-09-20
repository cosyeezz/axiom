import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copySourceArchive, rewriteSourceRefs } from '../src/compaction-sources.js';

test('copied source references survive deletion of the original owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-source-copy-'));
  try {
    const original = join(root, 'original.jsonl'), copy = join(root, 'copy.jsonl');
    await mkdir(`${original}.sources`);
    const source = join(`${original}.sources`, 'snapshot.txt');
    await writeFile(source, 'FULL_EVIDENCE');
    await copySourceArchive(original, copy);
    const entry = rewriteSourceRefs({ summary: `read ${source}`, details: { snapshotPath: source } }, [[original, copy]]);
    await rm(`${original}.sources`, { recursive: true });
    assert.equal(await readFile(entry.details.snapshotPath, 'utf8'), 'FULL_EVIDENCE');
    assert.ok(entry.summary.includes(`${copy}.sources`));
    assert.ok(!entry.summary.includes(`${original}.sources`));
  } finally { await rm(root, { recursive: true, force: true }); }
});
