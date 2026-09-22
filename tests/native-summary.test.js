import { test } from "node:test";
import assert from "node:assert/strict";
import { observeSummaryStream, summarizeNative } from "../src/native-summary.js";

const model = { id: "mock", provider: "test", api: "openai-completions", maxTokens: 4096, contextWindow: 128000 };
test('native first/update/split uses SDK prompts with optional display instructions', async () => {
  for (const split of [false, true]) {
    const calls = [];
    const runtime = { getAuth: async () => undefined, streamSimple: async function* (m, context) {
      calls.push(context);
      yield { type: 'done', message: { role: 'assistant', content: [{ type: 'text', text: '## Goal\nkeep task' }], stopReason: 'stop', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } };
    } };
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'keep original instruction' }], timestamp: 1 }];
    const result = await summarizeNative({ model, modelRuntime: runtime, previousSummary: 'last applied summary', previousStateDoc: 'old constraints', messages, preparation: {
      firstKeptEntryId: 'tail', messagesToSummarize: messages, turnPrefixMessages: split ? messages : [], isSplitTurn: split,
      previousSummary: split ? 'previous goal' : undefined, tokensBefore: 10000,
      settings: { reserveTokens: 4096 }, fileOps: { read: new Set(['src/a.js']), written: new Set(), edited: new Set() }
    } });
    assert.equal(calls.length, split ? 2 : 1);
    assert.equal(result.stateDoc, undefined);
    assert.match(JSON.stringify(calls[0]), /axiom_compact_title/);
    for (const context of calls) {
      assert.match(context.systemPrompt, /summarization assistant/);
      assert.equal(context.tools, undefined);
    }
    assert.match(result.summary, /src\/a.js/);
    if (split) { assert.match(result.summary, /Turn Context/); assert.ok(JSON.stringify(calls[0]).includes('previous-summary')); }
  }
});
const final = { role: "assistant", content: [{ type: "text", text: "x".repeat(3000) }], stopReason: "stop" };
test('native summary has no extra state request, fallback flag or citation protocol', async () => {
  const contexts = [];
  const runtime = { getAuth: async () => undefined, streamSimple: async function* (m, context) {
    contexts.push(context); yield { type: 'done', message: { ...final, usage: { input: 1, output: 1, totalTokens: 2, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } };
  } };
  const result = await summarizeNative({ model, modelRuntime: runtime, customInstructions: null, preparation: { firstKeptEntryId: 'tail', messagesToSummarize: [{ role: 'user', content: 'history' }], turnPrefixMessages: [], isSplitTurn: false, tokensBefore: 10000, settings: { reserveTokens: 4096 }, fileOps: { read: new Set(), written: new Set(), edited: new Set() } } });
  assert.equal(result.nativeFallback, undefined);
  assert.equal(contexts.length, 1);
  assert.equal(JSON.stringify(contexts).includes('[原文：'), false);
});

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

// Local HTTP integration: no external provider or real credentials.
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const nativePreparation = {
  firstKeptEntryId: "tail",
  messagesToSummarize: [{ role: "user", content: [{ type: "text", text: "hello world history" }] }],
  turnPrefixMessages: [], isSplitTurn: false, tokensBefore: 100,
  settings: { reserveTokens: 512 }, fileOps: { read: new Set(), written: new Set(), edited: new Set() },
};
const waitFor = (check, ms = 5000) => new Promise((resolve, reject) => {
  const start = Date.now();
  const tick = () => check() ? resolve() : Date.now() - start > ms ? reject(new Error("timeout")) : setTimeout(tick, 20);
  tick();
});
async function createLocalRuntime(dir, port) {
  writeFileSync(join(dir, "models.json"), JSON.stringify({ providers: { test: {
    name: "Test", baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions",
    apiKey: "sk-local-private-42", models: [{ id: "test-model", name: "Test Model", contextWindow: 8192, maxTokens: 100 }],
  } } }));
  const modelRuntime = await ModelRuntime.create({ authPath: join(dir, "auth.json"), modelsPath: join(dir, "models.json") });
  const model = (await modelRuntime.getAvailable()).find(m => `${m.provider}/${m.id}` === "test/test-model");
  assert.ok(model);
  return { modelRuntime, model };
}

test("native HTTP 401 preserves error without exposing client credentials or retrying", async () => {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Unauthorized: incorrect API key", type: "invalid_request_error" } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const dir = mkdtempSync(join(tmpdir(), "axiom-native-401-"));
  const events = [];
  try {
    const runtime = await createLocalRuntime(dir, server.address().port);
    await assert.rejects(summarizeNative({ ...runtime, thinking: "off", preparation: nativePreparation, onProgress: event => events.push(event) }), error => {
      assert.match(error.message, /401/);
      assert.match(error.message, /Unauthorized/);
      assert.ok(!error.message.includes("sk-local-private-42"));
      return true;
    });
    assert.equal(requests, 1);
    assert.equal(JSON.stringify(events).includes("sk-local-private-42"), false);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("native abort closes the pending HTTP response connection", async () => {
  let sawRequest = false, closed = false;
  const server = createServer((req, res) => {
    sawRequest = true;
    // IncomingMessage.close can mean request-body completion; observe response instead.
    res.on("close", () => { closed = true; });
    req.resume();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const dir = mkdtempSync(join(tmpdir(), "axiom-native-abort-"));
  const controller = new AbortController();
  let promise;
  try {
    const runtime = await createLocalRuntime(dir, server.address().port);
    promise = summarizeNative({ ...runtime, thinking: "off", preparation: nativePreparation, signal: controller.signal });
    promise.catch(() => {});
    await waitFor(() => sawRequest);
    assert.equal(closed, false);
    controller.abort();
    await assert.rejects(promise, error => { assert.equal(error.name, "AbortError"); return true; });
    await waitFor(() => closed);
  } finally {
    controller.abort();
    server.closeAllConnections();
    await promise?.catch(() => {});
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
