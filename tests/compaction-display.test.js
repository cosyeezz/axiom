import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDisplay, DISPLAY_INSTRUCTIONS } from '../src/compaction-display.js';

test('display metadata is optional and removed from the SDK summary body', () => {
  const body = '# Goal\nContinue the task.';
  const parsed = parseDisplay(body + '\n<axiom_compact_title>任务进展</axiom_compact_title>\n<axiom_compact_desc>已完成设计，待验证。</axiom_compact_desc>');
  assert.equal(parsed.summary, body);
  assert.deepEqual(parsed.progress, { title: '任务进展', description: '已完成设计，待验证。' });
  assert.deepEqual(parseDisplay(body), { summary: body });
  assert.match(DISPLAY_INSTRUCTIONS, /axiom_compact_title/);
});

test('invalid optional metadata cannot reject a summary', () => {
  const parsed = parseDisplay('# Goal\nKeep me.\n<axiom_compact_title>' + '长'.repeat(31) + '</axiom_compact_title>\n<axiom_compact_desc>短描述</axiom_compact_desc>');
  assert.equal(parsed.summary, '# Goal\nKeep me.');
  assert.equal(parsed.progress, undefined);
});

test('malformed display wrappers cannot contaminate previousSummary', () => {
  for (const raw of ['# Goal\nKeep\n<axiom_compact_title>unclosed', '# Goal\nKeep</axiom_compact_desc>', '<axiom_compact_title>body</axiom_compact_title>']) {
    const value = parseDisplay(raw);
    assert.ok(value.summary);
    assert.doesNotMatch(value.summary, /<\/?axiom_compact_/);
    assert.equal(value.progress, undefined);
  }
});

test('quoted metadata is ordinary historical content', () => {
  const body = '# Goal\n```xml\n<axiom_compact_title>示例</axiom_compact_title>\n```';
  assert.deepEqual(parseDisplay(body), { summary: body });
});
