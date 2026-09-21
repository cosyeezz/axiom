import test from 'node:test';
import assert from 'node:assert/strict';
import { requestBudget, compactionError } from '../src/compaction-budget.js';
test('full request budget reserves output and estimation independently', () => {
  const value = requestBudget({ model: { contextWindow: 4096, maxTokens: 512 }, messages: [{ role: 'user', content: 'hello' }], systemPrompt: 'system', tools: [{ name: 'read' }] });
  assert.equal(value.hard, 4096 - 512 - Math.ceil(4096 * .05));
  assert.ok(value.target < value.start && value.start < value.hard);
  assert.ok(value.fixed > 0 && value.tokens > value.fixed && value.safe);
  assert.equal(requestBudget({ model: { contextWindow: 100, maxTokens: 100 } }).safe, false);
  assert.equal(requestBudget({ model: { contextWindow: 4096, maxTokens: 100 }, systemPrompt: 'x'.repeat(20000) }).safe, false);
});
test('errors distinguish retry, replan and stop', () => {
  assert.equal(compactionError('ARCHIVE_NOT_DURABLE').action, 'retry');
  assert.equal(compactionError('WINDOW_UNSAFE').action, 'replan');
  assert.equal(compactionError('COMMIT_UNCERTAIN').action, 'stop');
});
