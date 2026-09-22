import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTaskState, taskStateMessage } from '../src/task-state-doc.js';

test('state belongs to latest compaction, is inserted before retained messages without mutation', () => {
  const branch = [{ type: 'compaction', id: 'c1', firstKeptEntryId: 'boundary', details: { stateDoc: '# 约束\n不分页' } }];
  const messages = [{ role: 'compactionSummary', summary: 'native' }, { role: 'user', content: 'new decision' }];
  const projected = withTaskState(messages, branch);
  assert.equal(projected[0], messages[0]);
  assert.equal(projected[1].customType, 'axiom-task-state');
  assert.match(projected[1].content, /boundary/);
  assert.equal(projected[2], messages[1]);
  assert.equal(messages.length, 2);
  assert.deepEqual(withTaskState(projected, branch), projected);
  assert.equal(taskStateMessage([]), null);
  assert.equal(taskStateMessage([...branch, { type: 'compaction', details: {} }]), null);
});

test('main and sub sessions project only their own committed state', () => {
  const main = [{ type: 'compaction', details: { stateDoc: 'main only' } }];
  const sub = [{ type: 'compaction', details: { stateDoc: 'sub only' } }];
  const base = [{ role: 'compactionSummary', summary: 'native' }];
  assert.match(withTaskState(base, main)[1].content, /main only/);
  assert.doesNotMatch(withTaskState(base, main)[1].content, /sub only/);
  assert.match(withTaskState(base, sub)[1].content, /sub only/);
  assert.deepEqual(withTaskState([], main), []);
});
