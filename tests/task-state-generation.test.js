import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeNative } from '../src/native-summary.js';
const model = { id: 'test', provider: 'test', api: 'openai-completions', maxTokens: 4096, contextWindow: 128000 };
const preparation = () => ({ firstKeptEntryId: 'tail', messagesToSummarize: [{ role: 'user', content: 'original task' }], turnPrefixMessages: [], isSplitTurn: false, tokensBefore: 10000, settings: { reserveTokens: 4096 }, fileOps: { read: new Set(), written: new Set(), edited: new Set() } });
const done = text => ({ type: 'done', message: { role: 'assistant', content: [{ type: 'text', text }], stopReason: 'stop', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 } } });
test('state error rejects entire generation; no automatic native retry', async () => {
  let calls = 0;
  const runtime = { getAuth: async () => undefined, streamSimple: async function* () {
    if (++calls === 2) throw new Error('state offline');
    yield done('summary');
  } };
  await assert.rejects(summarizeNative({ preparation: preparation(), model, modelRuntime: runtime }), /状态生成/);
  assert.equal(calls, 2);
});
test('state cancellation rejects entire generation', async () => {
  const controller = new AbortController(); let calls = 0;
  const runtime = { getAuth: async () => undefined, streamSimple: async function* () {
    if (++calls === 2) controller.abort();
    yield done('text');
  } };
  await assert.rejects(summarizeNative({ preparation: preparation(), model, modelRuntime: runtime, signal: controller.signal }), { name: 'AbortError' });
});
test('oversized inherited state is rejected before making state provider request', async () => {
  let calls = 0;
  const runtime = { getAuth: async () => undefined, streamSimple: async function* () { calls++; yield done('summary'); } };
  await assert.rejects(summarizeNative({ preparation: preparation(), model: { ...model, contextWindow: 16000 }, modelRuntime: runtime, previousStateDoc: 'x'.repeat(200000) }), { code: 'WINDOW_UNSAFE' });
  assert.equal(calls, 1);
});
