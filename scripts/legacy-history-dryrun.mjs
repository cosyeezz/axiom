import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Deliberately independent of journal writers: even an fsync/open(r+) is forbidden here.
export function inspectLegacyHistory(root) {
  root = resolve(root);
  const report = { mode: 'dry-run', root, journals: [], manifests: [], missingAttachments: [], conflicts: [], referenceMappings: [], limitations: ['Legacy snapshots have limited coverage; no complete-original claim.', 'No inferred reference mappings; no files or databases are written.'] };
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(file); continue; }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.jsonl')) {
        const bytes = readFileSync(file), text = bytes.toString('utf8'), lines = text.split('\n');
        const tail = lines.pop();
        const journal = { file, sourceIdentity: null, fingerprint: createHash('sha256').update(bytes).digest('hex'), validRecords: 0, trailingPartialBytes: Buffer.byteLength(tail), invalidLines: [], duplicateIds: [] };
        const ids = new Map();
        lines.forEach((line, index) => {
          if (!line.trim()) return;
          let value;
          try { value = JSON.parse(line); } catch { journal.invalidLines.push(index + 1); return; }
          journal.validRecords++;
          if (value.type === 'session') journal.sourceIdentity = value.id ?? null;
          if (value.id) {
            if (ids.has(value.id)) {
              journal.duplicateIds.push(value.id);
              if (ids.get(value.id) !== line) report.conflicts.push({ file, id: value.id, line: index + 1 });
            }
            ids.set(value.id, line);
          }
          for (const block of value.message?.content ?? []) {
            if (block && typeof block === 'object' && typeof block.path === 'string' && !existsSync(resolve(dir, block.path))) report.missingAttachments.push({ file, line: index + 1, path: block.path });
          }
        });
        report.journals.push(journal);
      } else if (entry.name.endsWith('.json') && file.includes('manifest')) {
        try {
          const manifest = JSON.parse(readFileSync(file, 'utf8'));
          report.manifests.push({ file, id: manifest.id ?? null, legacy: true });
          report.referenceMappings.push({ file, status: 'unmapped', reason: 'No verified unique journal-entry linkage' });
        } catch { report.conflicts.push({ file, reason: 'Invalid legacy manifest JSON' }); }
      }
    }
  };
  if (!statSync(root).isDirectory()) throw new Error('Expected a history directory');
  walk(root);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('--')) {
    console.error('Usage: node scripts/legacy-history-dryrun.mjs <directory> (read-only; execution is not supported)');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(inspectLegacyHistory(args[0]), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
