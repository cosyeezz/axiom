import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSummaryInput } from '../src/compaction-input.js';
test('summary selection preserves large-output tails and accounts for omitted UTF-8 ranges', () => {
  const text = 'HEAD' + '😀中'.repeat(3000) + 'TAIL-EVIDENCE';
  const input = [{ entryId: 'm1', role: 'toolResult', text }];
  const [view] = selectSummaryInput(input, 2048);
  assert.ok(view.text.startsWith('HEAD'));
  assert.ok(view.text.endsWith('TAIL-EVIDENCE'));
  assert.ok(!view.text.includes('\ufffd'));
  assert.equal(view.includedRanges[1][1], Buffer.byteLength(text));
  assert.deepEqual(view.omittedRanges[0], [view.includedRanges[0][1], view.includedRanges[1][0]]);
  assert.equal(input[0].text, text);
  assert.throws(() => selectSummaryInput(input, 10), { code: 'WINDOW_UNSAFE' });
});
