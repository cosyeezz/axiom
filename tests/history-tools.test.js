import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryReader } from '../src/history-tools.js';
import { canonical, contentHash } from '../src/raw-history.js';

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
