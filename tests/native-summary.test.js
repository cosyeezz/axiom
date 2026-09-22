import { test } from "node:test";
import assert from "node:assert/strict";
import { observeSummaryStream, summarizeNative, EXCERPT_INSTRUCTIONS } from "../src/native-summary.js";

const model = { id: "mock", provider: "test", api: "openai-completions", maxTokens: 4096, contextWindow: 128000 };
test('native first/update/split requests retain SDK prompts and get minimal citation instructions', async () => {
  for (const split of [false, true]) {
    const calls = [];
    const runtime = { getAuth: async () => undefined, streamSimple: async function* (m, context) {
      calls.push(context);
      yield { type: 'done', message: { role: 'assistant', content: [{ type: 'text', text: '## Goal\nkeep task' }], stopReason: 'stop', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } };
    } };
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'keep original instruction' }], timestamp: 1 }];
    const result = await summarizeNative({ model, modelRuntime: runtime, preparation: {
      firstKeptEntryId: 'tail', messagesToSummarize: messages, turnPrefixMessages: split ? messages : [], isSplitTurn: split,
      previousSummary: split ? 'previous goal' : undefined, tokensBefore: 10000,
      settings: { reserveTokens: 4096 }, fileOps: { read: new Set(['src/a.js']), written: new Set(), edited: new Set() }
    } });
    assert.equal(calls.length, split ? 2 : 1);
    for (const context of calls) {
      assert.match(context.systemPrompt, /summarization assistant/);
      assert.ok(context.messages.some(m => m.content.some(b => b.text?.includes(EXCERPT_INSTRUCTIONS))));
      assert.equal(context.tools, undefined);
    }
    assert.match(result.summary, /src\/a.js/);
    if (split) { assert.match(result.summary, /Turn Context/); assert.ok(JSON.stringify(calls[0]).includes('previous-summary')); }
  }
});
const final = { role: "assistant", content: [{ type: "text", text: "x".repeat(3000) }], stopReason: "stop" };
test("native observer preserves request, full text and terminal result", async () => {
  const seen = [];
  const context = { systemPrompt: "native", messages: [{ role: "user", content: "history" }] };
  const options = { apiKey: "never-exposed" };
  const stream = observeSummaryStream(async function* (m, c, o) {
    assert.equal(c, context); assert.equal(o, options);
    yield { type: "text_delta", delta: "x", partial: final };
    yield { type: "done", message: final };
  }, event => seen.push(event));
  assert.equal(await stream(model, context, options).result(), final);
  assert.equal(seen[0].context.systemPrompt, "native");
  assert.equal(JSON.stringify(seen).includes("never-exposed"), false);
  assert.equal(seen.find(e => e.kind === "stream").text.length, 3000);
});
test("native observer turns thrown or unterminated sources into terminal errors", async () => {
  for (const original of [async () => { throw new Error("offline"); }, async function* () {}]) {
    const result = await observeSummaryStream(original)(model, { messages: [] }).result();
    assert.equal(result.stopReason, "error");
  }
});
test("observer failure does not change generation; cancellation stays aborted", async () => {
  const signal = AbortSignal.abort();
  const result = await observeSummaryStream(async () => { throw new Error("cancelled"); }, () => { throw new Error("ui"); })(model, { messages: [] }, { signal }).result();
  assert.equal(result.stopReason, "aborted");
});
