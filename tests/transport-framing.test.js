import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { createSender } from "../src/transport.js";
import { createTransport } from "../public/transport.js";
import { CHUNK_PROTOCOL, CHUNK_TYPE, CHUNK_BYTES, FRAME_BYTES, createChunkReceiver } from "../public/transport-framing.js";

const turn = () => new Promise(resolve => setImmediate(resolve));
function socket() {
  return { protocol: CHUNK_PROTOCOL, readyState: 1, bufferedAmount: 0, sent: [],
    send(raw, cb) { this.sent.push(raw); cb(); },
    terminate() { this.stopped = true; }, close(code) { this.code = code; } };
}
async function drain(ws, count) {
  for (let i = 0; i < 5000 && ws.sent.length < count; i++) await turn();
  assert.equal(ws.sent.length, count);
}

test("UTF-8 safe chunk boundaries, escaping and FIFO keep immutable queued messages", async () => {
  const sender = createSender({ report() {} }), ws = socket(), receiver = createChunkReceiver();
  const seen = [];
  let callback;
  ws.send = (raw, cb) => { ws.sent.push(raw); callback = cb; };
  const large = { type: "response", id: "big", ok: true, data: ('中😀\\\"\n\u0000é').repeat(18000) + "\ud800" };
  const snapshot = structuredClone(large);
  sender.send(ws, { type: "first" });
  sender.send(ws, large); large.data = "changed after enqueue";
  sender.send(ws, { type: "agent.delta", seq: 10 });
  sender.send(ws, { type: "agent.end", seq: 11 });
  sender.send(ws, { type: "session.deleted" });
  for (let i = 0; i < 100 && seen.length < 5; i++) {
    const raw = ws.sent.at(-1);
    assert(Buffer.byteLength(raw) <= FRAME_BYTES);
    const result = receiver.accept(JSON.parse(raw), true);
    if (result) seen.push(result);
    callback(); await turn();
  }
  assert.deepEqual(seen, [{ type: "first" }, snapshot, { type: "agent.delta", seq: 10 }, { type: "agent.end", seq: 11 }, { type: "session.deleted" }]);
  assert.equal(receiver.pending, false);
});

test("chunk threshold and logical limit are UTF-8 byte boundaries; legacy stays unframed", async () => {
  const make = bytes => ({ type: "test", data: "x".repeat(bytes - Buffer.byteLength(JSON.stringify({ type: "test", data: "" }))) });
  for (const bytes of [CHUNK_BYTES - 1, CHUNK_BYTES, CHUNK_BYTES + 1]) {
    const ws = socket(); createSender({ report() {} }).send(ws, make(bytes));
    await drain(ws, bytes > CHUNK_BYTES ? 2 : 1);
    assert.equal(JSON.parse(ws.sent[0]).type === CHUNK_TYPE, bytes > CHUNK_BYTES);
  }
  const sender = createSender({ maxMessageBytes: CHUNK_BYTES + 1, report() {} });
  const at = socket(), over = socket();
  assert.equal(sender.send(at, make(CHUNK_BYTES + 1)), true); await drain(at, 2);
  assert.equal(sender.send(over, make(CHUNK_BYTES + 2)), false); assert.equal(over.code, 1009);
  const legacy = socket(); legacy.protocol = "axiom";
  createSender({ report() {} }).send(legacy, make(CHUNK_BYTES + 1));
  assert.equal(legacy.sent.length, 1); assert.equal(JSON.parse(legacy.sent[0]).type, "test");
});

test("backpressure waits, bounds bytes/count and watchdog clears stalled callbacks", async () => {
  const timers = new Map(); let next = 0, now = 0;
  const logs = [], sender = createSender({ report: e => logs.push(e), highWaterBytes: 10, stallTimeout: 100,
    maxQueueMessages: 2, maxQueueBytes: 1000, now: () => now,
    setTimer: (fn, ms) => { timers.set(++next, { fn, ms }); return next; }, clearTimer: id => timers.delete(id) });
  const slow = socket(); slow.bufferedAmount = 11;
  sender.send(slow, { type: "one" }); assert.equal(slow.sent.length, 0);
  slow.bufferedAmount = 0;
  const retry = [...timers].find(([, v]) => v.ms === 25); timers.delete(retry[0]); retry[1].fn();
  assert.equal(slow.sent.length, 1); assert.equal(timers.size, 0);
  const blocked = socket(); blocked.send = () => {};
  sender.send(blocked, { type: "one" }); sender.send(blocked, { type: "two" });
  assert.equal(sender.send(blocked, { type: "three" }), false); assert(blocked.stopped); assert.equal(timers.size, 0);
  const byteLimit = socket();
  assert.equal(sender.send(byteLimit, { type: "test", data: "x".repeat(1000) }), false); assert(byteLimit.stopped);
  const stalled = socket(); stalled.send = () => {};
  sender.send(stalled, { type: "test" }); now = 100;
  const watchdog = [...timers][0]; timers.delete(watchdog[0]); watchdog[1].fn();
  assert(stalled.stopped); assert.equal(timers.size, 0); assert(logs.some(e => e.code === "send_stalled"));
});

test("serialization, sync/callback failures and broadcast slow peers fail closed without payload logs", async () => {
  const logs = [], sender = createSender({ report: e => logs.push(e), maxQueueMessages: 1 });
  const circular = { type: "secret" }; circular.self = circular;
  const bad = socket(); assert.equal(sender.send(bad, circular), false); assert(bad.stopped);
  const throws = socket(); throws.send = () => { throw new Error("private-token"); };
  const callbackError = socket(); callbackError.send = (_, cb) => cb(new Error("private-token"));
  const slow = socket(); slow.send = () => {};
  const fast = socket(), except = socket(), closed = socket(); closed.readyState = 3;
  sender.broadcast([throws, callbackError, slow, fast, except, closed], { type: "test" }, except);
  sender.broadcast([slow, fast], { type: "next" }); await turn();
  assert(throws.stopped && callbackError.stopped && slow.stopped);
  assert.equal(fast.sent.length, 2); assert.equal(except.sent.length, 0); assert.equal(closed.sent.length, 0);
  assert.doesNotMatch(JSON.stringify(logs), /private-token|secret|self/);
});

test("strict assembler rejects invalid envelopes, gaps, interleaving, nesting and over-declaration", () => {
  const one = { type: CHUNK_TYPE, v: 1, id: "1", index: 0, totalBytes: 15, final: true, data: '{"type":"test"}' };
  assert.deepEqual(createChunkReceiver().accept(one, true), { type: "test" });
  assert.throws(() => createChunkReceiver().accept(one, false));
  for (const patch of [{ v: 2 }, { id: "secret" }, { index: -1 }, { index: 1 }, { index: 0.5 }, { final: 1 },
    { data: "" }, { data: {} }, { totalBytes: 0 }, { totalBytes: Infinity }, { totalBytes: 129 * 1024 * 1024 },
    { totalBytes: 16 }, { data: "{" }, { data: "x".repeat(CHUNK_BYTES + 1) }]) {
    assert.throws(() => createChunkReceiver().accept({ ...one, ...patch }, true), JSON.stringify(patch).slice(0, 80));
  }
  const nested = JSON.stringify(one);
  assert.throws(() => createChunkReceiver().accept({ ...one, data: nested, totalBytes: Buffer.byteLength(nested) }, true));
  const first = { ...one, totalBytes: CHUNK_BYTES + 5, final: false, data: "x".repeat(CHUNK_BYTES) };
  for (const next of [one, { type: "event" }, { ...one, index: 2 }, { ...one, index: 1, id: "2" },
    { ...one, index: 1, totalBytes: first.totalBytes, data: "123456" }]) {
    const receiver = createChunkReceiver(); receiver.accept(first, true);
    assert.throws(() => receiver.accept(next, true)); assert.equal(receiver.pending, false);
  }
  const receiver = createChunkReceiver(); receiver.accept(first, true); receiver.clear();
  assert.deepEqual(receiver.accept(one, true), { type: "test" });
});

test("new client with legacy server negotiates axiom and retains status heartbeat", async t => {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", handleProtocols: () => "axiom" });
  await once(wss, "listening");
  t.after(() => new Promise(resolve => { for (const ws of wss.clients) ws.terminate(); wss.close(resolve); }));
  const requests = [];
  wss.on("connection", ws => ws.on("message", raw => {
    const request = JSON.parse(raw); requests.push(request.type);
    ws.send(JSON.stringify({ type: "response", id: request.id, ok: true, data: {} }));
  }));
  const client = createTransport({ url: `ws://127.0.0.1:${wss.address().port}`, WebSocket,
    heartbeatInterval: 0, report() {} });
  try {
    await client.connect(); await client.resume();
    assert.equal(client.getDiagnostics().protocol, "axiom"); assert.deepEqual(requests, ["service.status"]);
  } finally { client.dispose(); }
});

test("real ws transfers 34/66 MiB snapshots through <=512 KiB messages, then sequenced events and ping", { timeout: 120000 }, async t => {
  const sender = createSender({ report() {} });
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", handleProtocols: p => p.has(CHUNK_PROTOCOL) ? CHUNK_PROTOCOL : "axiom" });
  await once(wss, "listening");
  t.after(() => new Promise(resolve => { for (const ws of wss.clients) ws.terminate(); wss.close(resolve); }));
  let frames = 0, largest = 0;
  wss.on("connection", ws => ws.on("message", raw => {
    const request = JSON.parse(raw);
    if (request.type === "session.attach") {
      sender.send(ws, { type: "response", id: request.id, ok: true, data: { sessionId: "s", seq: 9,
        body: "x".repeat(request.mib * 1024 * 1024) + "中文😀" } });
      sender.send(ws, { type: "agent.delta", sessionId: "s", seq: 10 });
      sender.send(ws, { type: "agent.end", sessionId: "s", seq: 11 });
    } else sender.send(ws, { type: "response", id: request.id, ok: true, data: { alive: true } });
  }));
  class BrowserSocket extends WebSocket {
    constructor(url, protocols) {
      super(url, protocols, { maxPayload: FRAME_BYTES });
      this.on("message", raw => { frames++; largest = Math.max(largest, raw.length); });
    }
  }
  for (const mib of [34, 66]) {
    const seen = [];
    const client = createTransport({ url: `ws://127.0.0.1:${wss.address().port}`, WebSocket: BrowserSocket,
      heartbeatInterval: 0, report() {}, reduce: event => seen.push(event.seq) });
    try {
      await client.connect(); assert.equal(client.getDiagnostics().protocol, CHUNK_PROTOCOL);
      const result = await client.request({ type: "session.attach", mib });
      assert.equal(result.body.length, mib * 1024 * 1024 + 4); assert(result.body.endsWith("中文😀"));
      client.commitSnapshot(result);
      await client.resume(); // Lightweight ping must be behind, not interleaved with the snapshot.
      assert.deepEqual(seen, [10, 11]); assert.equal(client.getConnectionState(), "open");
    } finally { client.dispose(); }
  }
  assert(frames > 1500); assert(largest <= FRAME_BYTES);
});
