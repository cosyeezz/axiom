import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectLegacyHistory } from '../scripts/legacy-history-dryrun.mjs';

test('legacy dry-run inventories conflicts and partial tails without changing bytes or files', () => {
  const root = mkdtempSync(join(tmpdir(), 'axiom-legacy-dry-'));
  try {
    writeFileSync(join(root, 'session.jsonl'), '{"type":"session","id":"s1"}\n{"type":"message","id":"m1","message":{"content":[{"path":"missing.png"}]}}\n{"type":"message","id":"m1"}\n{"partial":');
    writeFileSync(join(root, 'old.manifest.json'), '{"id":"obs_old"}');
    const before = new Map(readdirSync(root).map(name => [name, readFileSync(join(root, name))]));
    const report = inspectLegacyHistory(root);
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.journals[0].sourceIdentity, 's1');
    assert.equal(report.conflicts.length, 1);
    assert.equal(report.missingAttachments.length, 1);
    assert.ok(report.journals[0].trailingPartialBytes > 0);
    assert.equal(report.referenceMappings[0].status, 'unmapped');
    assert.deepEqual(readdirSync(root), [...before.keys()]);
    for (const [name, bytes] of before) assert.deepEqual(readFileSync(join(root, name)), bytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
