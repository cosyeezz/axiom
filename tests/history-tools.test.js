import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryReader } from '../src/history-tools.js';
import { canonical, contentHash } from '../src/raw-history.js';

test('exact message reads are scoped, bounded, and independent in a batch', () => {
  const sourceEntry = { id: 'one', message: { role: 'user', content: '😀'.repeat(3000) + 'needle' + '尾'.repeat(3000) } };
  const record = { archiveId: 'a'.repeat(24), origin: { sourceJournalId: 'j', entryId: 'one' }, sourceEntry, sourceEntryHash: contentHash(sourceEntry) };
  let allowed = true;
  const reader = createHistoryReader({ records: () => [record], allowed: () => allowed });
  const result = reader.readMessage({ sources: [{ messageId: 'one', keyword: 'needle' }, { messageId: 'absent', keyword: 'x' }] });
  assert.equal(result.messages[0].matched, true);
  assert.equal(Array.from(result.messages[0].text).length, 2000);
  assert.equal(result.messages[1].error, 'SOURCE_MISSING');
  allowed = false;
  assert.equal(reader.readMessage({ messageId: 'one', keyword: 'needle' }).messages[0].error, 'SOURCE_MISSING');
  assert.throws(() => reader.readMessage({ sources: Array(4).fill({}) }));
});

test('search pages enumerate repeated occurrences, freeze append scope and reauthorize', () => {
  const make = id => { const sourceEntry = { id, message: { role: 'toolResult', toolName: 'read', content: '中文😀 中文😀 中文😀' } }; return { archiveId: 'b'.repeat(24), origin: { sourceJournalId: 'j', entryId: id }, sourceEntry, sourceEntryHash: contentHash(sourceEntry) }; };
  const records = [make('a')]; let permitted = true;
  const reader = createHistoryReader({ records: () => records, allowed: () => permitted });
  const first = reader.search({ query: '中文', limit: 1 });
  assert.equal(first.matches.length, 1); assert.ok(first.cursor);
  records.push(make('b'));
  const second = reader.search({ query: '中文', limit: 1, cursor: first.cursor });
  const third = reader.search({ query: '中文', limit: 1, cursor: second.cursor });
  assert.equal(third.cursor, null); assert.equal(third.truncated, false);
  assert.equal(first.matches[0].part, 'part_0');
  assert.deepEqual(first.matches[0].returnedRange, [0, 6]);
  const page = reader.read({ ref: first.matches[0].ref, part: 'part_0' });
  assert.equal(page.text, records[0].sourceEntry.message.content);
  assert.equal(page.returnedRange[1], Buffer.byteLength(page.text));
  permitted = false;
  assert.throws(() => reader.search({ query: '中文', limit: 1, cursor: first.cursor }), { code: 'SCOPE_DENIED' });
});

test('identical entry ids across agents never grant cross-agent read access', () => {
  const make = agentId => { const sourceEntry = { type: 'message', id: 'same', message: { role: 'user', content: agentId } }; return { archiveId: (agentId === 'main' ? 'a' : 'b').repeat(24), origin: { sourceJournalId: agentId, entryId: 'same', agentId }, sourceEntry, sourceEntryHash: contentHash(sourceEntry) }; };
  const records = [make('main'), make('child')];
  const reader = createHistoryReader({ records: () => records, allowed: record => record.origin.agentId === 'main' });
  assert.throws(() => reader.read({ ref: reader.reference(records[1]) }), { code: 'SCOPE_DENIED' });
  assert.equal(reader.search({ query: 'child' }).matches.length, 0);
  assert.match(reader.read({ ref: reader.reference(records[0]) }).text, /main/);
});

test('summaryEvidence reproduces the source text and hash used by state validation', () => {
  const sourceEntry = { type: 'message', id: 'a', message: { role: 'user', content: '保留约束😀', timestamp: 1 } };
  const record = { archiveId: 'a'.repeat(24), origin: { sourceJournalId: 'j', entryId: 'a' }, sourceEntry, sourceEntryHash: contentHash(sourceEntry) };
  const reader = createHistoryReader({ records: () => [record], allowed: () => true });
  const result = reader.read({ ref: reader.reference(record), part: 'summaryEvidence' });
  assert.match(result.text, /保留约束😀/);
  assert.equal(result.contentHash, contentHash(result.text));
  assert.equal(result.part, 'summaryEvidence');
});

test('history pages preserve Unicode and count the full envelope; cursors are authenticated', () => {
  const sourceEntry = { id: 'a', message: { role: 'toolResult', content: '中文😀\r\n'.repeat(300) + 'end' } };
  const record = { archiveId: 'a'.repeat(24), origin: { sourceJournalId: 'j', entryId: 'a' }, sourceEntry, sourceEntryHash: contentHash(sourceEntry) };
  const reader = createHistoryReader({ records: () => [record], allowed: () => true });
  const ref = reader.reference(record); let cursor, collected = '', pages = 0;
  do {
    const page = reader.read({ ref, cursor, limit: 1500 });
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 1500);
    collected += page.text; cursor = page.cursor; pages++;
    if (pages === 1) assert.throws(() => reader.read({ ref, cursor: cursor + 'x' }), { code: 'INVALID_CURSOR' });
    assert.ok(pages < 100);
  } while (cursor);
  assert.equal(collected, canonical(sourceEntry));
  assert.ok(pages > 1);
  assert.throws(() => reader.read({ ref, limit: 1 }), { code: 'READ_BUDGET_TOO_SMALL' });
  assert.throws(() => reader.read({ ref: '../secret' }), { code: 'REF_INVALID' });
  const denied = createHistoryReader({ records: () => [record], allowed: () => false });
  assert.throws(() => denied.read({ ref }), { code: 'SCOPE_DENIED' });
  assert.deepEqual(denied.search({ query: '中文' }).matches, []);
});
