import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageWindow, messageText } from '../src/compaction-excerpt.js';
test('complete source and unicode-safe windows', () => {
  const text = '😀'.repeat(3000) + '目标' + '尾'.repeat(3000);
  assert.equal(messageText({ message: { content: [{ type: 'text', text }] } }), text);
  assert.equal(Array.from(messageWindow(text, '目标').text).length, 2000);
  assert.equal(messageWindow('短消息', '短').complete, true);
  assert.equal(messageWindow(text, '没有').matched, false);
  assert.match(messageWindow(text, '没有').text, /中间省略/);
});
