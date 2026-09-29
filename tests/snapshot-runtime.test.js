import test from 'node:test';
import assert from 'node:assert/strict';
import { Sessions } from '../src/sessions.js';

for (const value of [undefined, {model:'test/model',billing:{totalCost:0}}]) test(`snapshot evaluates runtime once (${!!value})`, async () => {
  let calls = 0;
  const factory = async () => ({config: () => ({model:'test/model'}), subscribe: () => () => {},
    runtime: () => { calls++; return value; }, abort: async () => {}, dispose: async () => {}});
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create();
    calls = 0;
    const state = sessions.snapshot(id);
    assert.equal(calls, 1);
    assert.deepEqual(state.runtime, value);
    assert.deepEqual(state.config.runtime, value);
    sessions.configData(sessions.get(id));
    assert.equal(calls, 2, 'standalone config still computes runtime');
  } finally { await sessions.close(); }
});
