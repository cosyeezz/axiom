import { existsSync, readFileSync, openSync, fsyncSync, closeSync, writeSync, mkdirSync } from 'node:fs';
import { claimJournalOwner } from './data-owner.js';
import { createRawArchive, contentHash, historyError } from './raw-history.js';

/** Only disk-confirmed journal entries are eligible for archival. SDK getEntries includes volatile entries. */
export function readDurableJournal(file) {
  if (!file || !existsSync(file)) return null;
  const fd = openSync(file, 'r+');
  let text;
  try { fsyncSync(fd); text = readFileSync(fd, 'utf8'); } finally { closeSync(fd); }
  if (!text.endsWith('\n')) throw historyError('SOURCE_CORRUPT', 'Authoritative journal has an incomplete tail');
  let entries;
  try { entries = text.split('\n').filter(Boolean).map(line => JSON.parse(line)); } catch { throw historyError('SOURCE_CORRUPT'); }
  const [header, ...body] = entries;
  if (header?.type !== 'session' || typeof header.id !== 'string') throw historyError('SOURCE_CORRUPT');
  const identities = new Map();
  for (const entry of body) {
    if (!entry?.id) throw historyError('SOURCE_CORRUPT');
    const hash = contentHash(entry), prior = identities.get(entry.id);
    if (prior && prior !== hash) throw historyError('ARCHIVE_IDENTITY_CONFLICT');
    identities.set(entry.id, hash);
  }
  return { header, entries: body };
}

/** Pinned SDK adapter: remove first-assistant persistence deferral, never rewrite existing journals. */
export function installDurableJournal(manager) {
  if (!manager.getSessionFile?.()) return () => {};
  if (typeof manager._persist !== 'function' || !Array.isArray(manager.fileEntries)) throw historyError('SOURCE_CORRUPT', 'Unsupported SDK journal adapter');
  const previous = manager._persist;
  let failure;
  manager._persist = function(entry) {
    if (failure) throw failure;
    try {
      const file = this.getSessionFile();
      if (!this.flushed) {
        const fd = openSync(file, 'wx');
        try {
          const bytes = Buffer.from(this.fileEntries.map(value => JSON.stringify(value) + '\n').join(''));
          let offset = 0;
          while (offset < bytes.length) { const n = writeSync(fd, bytes, offset, bytes.length - offset); if (!n) throw historyError('COMMIT_UNCERTAIN'); offset += n; }
          fsyncSync(fd);
        } finally { closeSync(fd); }
        this.flushed = true;
      } else {
        previous.call(this, entry);
        const fd = openSync(file, 'r+');
        try { fsyncSync(fd); } finally { closeSync(fd); }
      }
    } catch (cause) {
      failure = Object.assign(historyError('COMMIT_UNCERTAIN', 'Journal write failed; reopen before continuing'), { cause });
      throw failure;
    }
  };
  return () => { if (failure) throw failure; };
}

export function confirmDurableAppend(file, entryId) {
  try {
    const journal = readDurableJournal(file);
    if (!journal || journal.entries.at(-1)?.id !== entryId || journal.entries.at(-1)?.type !== 'compaction') throw historyError('COMMIT_UNCERTAIN', 'Compaction is not the confirmed journal tail');
    return true;
  } catch (cause) {
    throw Object.assign(historyError('COMMIT_UNCERTAIN', '压缩提交未确认持久化；停止会话，须重新打开日志恢复'), { cause, entryId });
  }
}

export async function createJournalArchive({ file, directory = `${file}.history`, agentId = null }) {
  mkdirSync(directory, { recursive: true });
  const release = await claimJournalOwner(directory);
  let archive, sessionId;
  const sync = async () => {
    const journal = readDurableJournal(file);
    if (!journal) return false; // A new SDK session has not committed its first assistant yet.
    if (sessionId && sessionId !== journal.header.id) throw historyError('ARCHIVE_IDENTITY_CONFLICT');
    sessionId = journal.header.id;
    if (!archive) archive = await createRawArchive(directory, { sourceJournalId: sessionId, sourceSessionId: sessionId, agentId, authoritativeEntries: journal.entries });
    archive.reconcile(journal.entries);
    return true;
  };
  let queue = Promise.resolve(), failure, closed = false;
  const reconcile = () => {
    if (closed) return Promise.reject(historyError('ARCHIVE_NOT_DURABLE'));
    const operation = queue.then(() => { if (failure) throw failure; return sync(); });
    queue = operation.catch(error => { failure = error; });
    return operation;
  };
  return {
    reconcile,
    async barrier() { await reconcile(); if (!archive) throw historyError('SOURCE_MISSING', 'Journal has no durable entries yet'); archive.barrier(); },
    records: () => archive?.records() ?? [],
    async close() { if (closed) return; closed = true; try { await queue; await archive?.close(); if (failure) throw failure; } finally { await release(); } },
  };
}
