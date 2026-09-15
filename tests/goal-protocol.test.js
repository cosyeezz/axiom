import test from 'node:test';
import assert from 'node:assert/strict';
import { command } from '../src/protocol.js';

test('Goal commands are scoped, bounded and reject unknown actions', () => {
  const base = { id: 'request', type: 'goal.action', sessionId: 'session' };
  for (const action of ['enter', 'confirm', 'adjust', 'pause', 'resume', 'restart', 'exit'])
    assert.equal(command.parse({ ...base, action }).action, action);
  for (const value of [
    { ...base, action: 'complete' }, { ...base, action: 'pause', sessionId: undefined },
    { ...base, action: 'adjust', text: 'x'.repeat(30001) },
    { ...base, action: 'enter', global: true },
  ]) assert.equal(command.safeParse(value).success, false);
});
