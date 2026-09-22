import { createHash } from 'node:crypto';
import { claimArchiveOwner } from './data-owner.js';
import { mkdirSync, openSync, closeSync, readFileSync, writeSync, fsyncSync, existsSync, lstatSync, renameSync, statfsSync } from 'node:fs';
import { join } from 'node:path';

export function historyError(code, message = code) { return Object.assign(new Error(message), { code }); }
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const contentHash = value => `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')}`;
const isOriginal = entry => ['message', 'custom_message'].includes(entry?.type);
const keyOf = origin => canonical([origin.sourceJournalId, origin.entryId]);
function writeAll(fd, data) {
  const bytes = Buffer.from(data); let offset = 0;
  while (offset < bytes.length) { const n = writeSync(fd, bytes, offset, bytes.length - offset); if (!n) throw historyError('ARCHIVE_NOT_DURABLE'); offset += n; }
  fsyncSync(fd);
}

/** A journal projection, never an alternative authority for execution state. */
export async function createRawArchive(directory, { sourceJournalId, sourceSessionId, agentId = null, authoritativeEntries, copiedFrom = null } = {}) {
  if (!sourceJournalId || !sourceSessionId) throw historyError('SOURCE_MISSING');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink()) throw historyError('SCOPE_DENIED');
  let release;
  try { release = await claimArchiveOwner(directory); } catch (error) { throw historyError('ARCHIVE_NOT_DURABLE', error.message); }
  const rawPath = join(directory, 'raw.jsonl');
  const controlPath = join(directory, 'control.jsonl');
  const artifactsDir = join(directory, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true, mode: 0o700 });
  if (lstatSync(artifactsDir).isSymbolicLink()) { await release(); throw historyError('SCOPE_DENIED'); }
  const records = new Map(); let fd, controlFd, failure, closed = false;
  const archiveId = createHash('sha256').update(sourceJournalId).digest('hex').slice(0, 24);
  try {
    for (const path of [rawPath, controlPath]) if (existsSync(path)) {
      if (lstatSync(path).isSymbolicLink()) throw historyError('SCOPE_DENIED');
      const data = readFileSync(path);
      let complete = data;
      if (data.length && data.at(-1) !== 10) {
        if (!Array.isArray(authoritativeEntries)) throw historyError('SOURCE_CORRUPT', 'Incomplete archive tail requires journal reconciliation');
        complete = data.subarray(0, data.lastIndexOf(10) + 1);
      }
      for (const line of complete.toString('utf8').split('\n').filter(Boolean)) {
        let record; try { record = JSON.parse(line); } catch { throw historyError('SOURCE_CORRUPT'); }
        if ((path === rawPath) !== isOriginal(record.sourceEntry) || record.schemaVersion !== 1 || record.sourceEntryHash !== contentHash(record.sourceEntry)) throw historyError('SOURCE_CORRUPT');
        if (record.origin?.sourceJournalId !== sourceJournalId || record.archiveId !== archiveId || record.origin.sourceSessionId !== sourceSessionId) throw historyError('ARCHIVE_IDENTITY_CONFLICT', 'Archive directory contains foreign journal records');
        const key = keyOf(record.origin), prior = records.get(key);
        if (prior && prior.sourceEntryHash !== record.sourceEntryHash) throw historyError('ARCHIVE_IDENTITY_CONFLICT');
        records.set(key, record);
      }
      if (complete !== data) {
        const authoritative = new Map(authoritativeEntries.map(entry => [entry.id, contentHash(entry)]));
        for (const record of records.values()) if (record.origin.sourceJournalId !== sourceJournalId || authoritative.get(record.origin.entryId) !== record.sourceEntryHash) throw historyError('SOURCE_CORRUPT', 'Journal cannot prove archive prefix');
        const quarantine = `${path}.incomplete-${Date.now()}`;
        renameSync(path, quarantine);
        const recovered = openSync(path, 'wx', 0o600);
        try { writeAll(recovered, complete); } finally { closeSync(recovered); }
      }
    }
    fd = openSync(rawPath, 'a', 0o600);
    controlFd = openSync(controlPath, 'a', 0o600);
  } catch (error) { if (fd !== undefined) closeSync(fd); await release(); throw error; }
  const assertOpen = () => { if (failure || closed) throw failure ?? historyError('ARCHIVE_NOT_DURABLE', 'Archive closed'); };
  function record(sourceEntry, verifiedHash) {
      assertOpen();
      const disk = statfsSync(directory);
      if (disk.bavail * disk.bsize < 16 * 1024 * 1024) throw historyError('ARCHIVE_NOT_DURABLE', 'Archive disk reserve below 16 MiB; no history deleted');
      if (!sourceEntry?.id) throw historyError('SOURCE_MISSING');
      const origin = { sourceJournalId, sourceSessionId, entryId: sourceEntry.id, agentId };
      const key = keyOf(origin), hash = verifiedHash ?? contentHash(sourceEntry), prior = records.get(key);
      if (prior) { if (prior.sourceEntryHash !== hash) throw historyError('ARCHIVE_IDENTITY_CONFLICT'); return prior; }
      const artifacts = [];
      const output = sourceEntry.message?.details?.fullOutputPath;
      if (typeof output === 'string') {
        if (!existsSync(output)) throw historyError('SOURCE_MISSING', 'Full tool output is missing');
        if (!lstatSync(output).isFile() || lstatSync(output).isSymbolicLink()) throw historyError('SCOPE_DENIED');
        const bytes = readFileSync(output), hash = createHash('sha256').update(bytes).digest('hex');
        const target = join(artifactsDir, hash);
        if (!existsSync(target)) { const artifactFd = openSync(target, 'wx', 0o600); try { writeAll(artifactFd, bytes); } finally { closeSync(artifactFd); } }
        artifacts.push({ part: 'artifact_0', hash: `sha256:${hash}`, bytes: bytes.length });
      }
      const copied = copiedFrom?.get(sourceEntry.id);
      const aliases = copied ? (Array.isArray(copied) ? copied : [copied]) : [];
      const record = { ...(aliases.length ? { copiedFrom: aliases.at(-1), copiedFromAll: aliases } : {}), artifacts, schemaVersion: 1, canonicalVersion: 1, archiveId, seq: records.size + 1, origin, sourceEntry: JSON.parse(JSON.stringify(sourceEntry)), sourceEntryHash: hash, capturedAt: new Date().toISOString() };
      try { writeAll(isOriginal(sourceEntry) ? fd : controlFd, `${JSON.stringify(record)}\n`); } catch (error) { failure = historyError('ARCHIVE_NOT_DURABLE', error.message); throw failure; }
      records.set(key, record); return record;
  }
  return {
    archiveId,
    record: sourceEntry => record(sourceEntry),
    reconcile(entries) {
      assertOpen();
      const verified = entries.map(entry => [entry, contentHash(entry)]);
      const current = new Map(verified.map(([entry, hash]) => [entry.id, hash]));
      for (const record of records.values()) {
        const hash = current.get(record.origin.entryId);
        if (hash === undefined) throw historyError('SOURCE_CORRUPT', 'Authoritative journal removed an archived identity');
        if (hash !== record.sourceEntryHash) throw historyError('ARCHIVE_IDENTITY_CONFLICT');
      }
      for (const [entry, hash] of verified) record(entry, hash);
      for (const record of records.values()) for (const artifact of record.artifacts ?? []) this.readArtifact(record, artifact.part);
      this.barrier();
    },
    barrier() { assertOpen(); try { fsyncSync(fd); fsyncSync(controlFd); } catch (error) { failure = historyError('ARCHIVE_NOT_DURABLE', error.message); throw failure; } },
    readArtifact(record, part) {
      assertOpen();
      const artifact = record.artifacts?.find(value => value.part === part);
      if (!artifact || !/^sha256:[a-f0-9]{64}$/.test(artifact.hash)) throw historyError('PART_INVALID');
      const file = join(artifactsDir, artifact.hash.slice(7));
      if (!existsSync(file)) throw historyError('SOURCE_MISSING');
      if (lstatSync(file).isSymbolicLink()) throw historyError('SCOPE_DENIED');
      const bytes = readFileSync(file);
      if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== artifact.hash || bytes.length !== artifact.bytes) throw historyError('HASH_MISMATCH');
      return bytes.toString('utf8');
    },
    records: () => [...records.values()],
    async close() { if (closed) return; try { this.barrier(); } finally { closed = true; try { closeSync(fd); closeSync(controlFd); } finally { await release(); } } },
  };
}
