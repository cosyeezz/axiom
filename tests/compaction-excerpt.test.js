import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSummaryExcerpts, messageWindow, messageText } from '../src/compaction-excerpt.js';
const evidence = [{ entryId: 'abc12345', role: 'user', text: '不要分页。保留原文。' }];
test('inline evidence maps exact text to stable message ID', () => {
  const value = resolveSummaryExcerpts('禁止分页。[原文：“不要分页。”]', evidence);
  assert.equal(value.summary, '禁止分页。[消息:abc12345]');
  assert.equal(value.items[0].quote, '不要分页。');
  assert.equal(resolveSummaryExcerpts(value.summary, evidence, value.summary).summary, value.summary);
});
test('invalid evidence and invented or inaccessible IDs reject', () => {
  for (const text of ['[原文：“允许分页”]', '[原文：“损坏]', '[消息:abc12345]']) assert.throws(() => resolveSummaryExcerpts(text, evidence), /SUMMARY_INVALID/);
  assert.throws(() => resolveSummaryExcerpts('[消息:abc12345]', [], '[消息:abc12345]'));
});
test('code examples are not citations; multiple matches stay explicit', () => {
  assert.equal(resolveSummaryExcerpts('`[原文：“不存在”]`', evidence).items.length, 0);
  const value = resolveSummaryExcerpts('[原文：“不要分页。”]', [...evidence, { ...evidence[0], entryId: 'def67890' }]);
  assert.equal(value.summary, '[消息:abc12345,def67890]');
});
test('complete source and unicode-safe windows', () => {
  const text = '😀'.repeat(3000) + '目标' + '尾'.repeat(3000);
  assert.equal(messageText({ message: { content: [{ type: 'text', text }] } }), text);
  assert.equal(Array.from(messageWindow(text, '目标').text).length, 2000);
  assert.equal(messageWindow('短消息', '短').complete, true);
  assert.equal(messageWindow(text, '没有').matched, false);
  assert.match(messageWindow(text, '没有').text, /中间省略/);
});
