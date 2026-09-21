import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapUsageStream } from "../src/usage-stream.js";

// 最小流契约：终态解析 result，end 唤醒迭代等待者。
function createStream() {
  let ended = false, wake, resolve;
  const queue = [];
  const result = new Promise(done => { resolve = done; });
  return {
    push(event) { queue.push(event); if (["done", "error"].includes(event.type)) { ended = true; resolve(event.message ?? event.error); } wake?.(); },
    end(message) { ended = true; if (message) resolve(message); wake?.(); },
    result: () => result,
    async *[Symbol.asyncIterator]() { while (true) { if (queue.length) yield queue.shift(); else if (ended) return; else await new Promise(done => { wake = done; }); } },
  };
}
const model = { provider: "p", id: "m", api: "openai-completions" };
const message = { role: "assistant", stopReason: "stop", usage: { input: 3, cost: { total: 1 } } };
function fixture(original, { brokenAudit = false, rpm = 0 } = {}) {
  const records = []; let released = 0, attempts = 0;
  const service = { store: {
    begin() { if (brokenAudit) throw new Error("db unavailable"); return "r"; }, admit() {},
    finish(id, data) { records.push(data); }, attempt() { attempts++; }, recordGateEvent() {},
  }, gate: { limits: { p: { rpm } }, acquire: async () => ({ release() { released++; } }), cooldown() {} } };
  return { run: wrapUsageStream(original, { service, createStream }), records, released: () => released, attempts: () => attempts };
}
test("完整转发终态、result和usage，归还令牌", async () => {
  const f = fixture(() => { const stream = createStream(); stream.push({ type: "done", message }); return stream; });
  const out = f.run(model, {}); const events = []; for await (const event of out) events.push(event);
  assert.equal(await out.result(), message); assert.equal(events[0].message, message);
  await Promise.resolve(); assert.equal(f.records[0].usage, message.usage); assert.equal(f.released(), 1);
});
test("同步抛错产生可解析的错误终态", async () => {
  const f = fixture(() => { throw new Error("provider failed"); });
  assert.equal((await f.run(model, {}).result()).errorMessage, "provider failed");
  await Promise.resolve(); assert.equal(f.released(), 1);
  assert.equal(f.records[0].usageKnown, false);
});
test("缺失终态不会等待源result永久挂起", async () => {
  const f = fixture(() => { const stream = createStream(); stream.end(); return stream; });
  assert.equal((await f.run(model, {}).result()).stopReason, "error");
});
test("写库故障不影响输出", async () => {
  const f = fixture(() => { const stream = createStream(); stream.push({ type: "done", message }); return stream; }, { brokenAudit: true });
  assert.equal(await f.run(model, {}).result(), message);
});
test("fetch保留原始参数，每次物理尝试记一次", async () => {
  const response = new Response("ok"); let calls = 0;
  const f = fixture(async (m, c, options) => {
    assert.equal(await options.fetch("https://example.invalid", { method: "POST" }), response);
    const stream = createStream(); stream.push({ type: "done", message }); return stream;
  }, { rpm: 1 });
  await f.run(model, {}, { fetch: async (url, init) => { calls++; assert.equal(init.method, "POST"); return response; } }).result();
  assert.equal(calls, 1); assert.equal(f.attempts(), 1);
});
test("未限RPM与Google保留原options对象", async () => {
  for (const api of ["openai-completions", "google-generative-ai"]) {
    const options = {};
    const f = fixture((m, c, actual) => { assert.equal(actual, options); const stream = createStream(); stream.push({ type: "done", message }); return stream; }, { rpm: api.startsWith("google") ? 1 : 0 });
    await f.run({ ...model, api }, {}, options).result();
  }
});
