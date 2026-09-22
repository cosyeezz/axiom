import test from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../public/transport.js";
import { createSender } from "../src/transport.js";

function rig(options = {}) {
  const sockets = [], timers = new Map(), logs = [];
  let tick = 0;
  class Socket {
    readyState = 0; bufferedAmount = 0; sent = [];
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    message(message) { this.onmessage({ data: JSON.stringify(message) }); }
    close(code) { this.readyState = 3; this.onclose?.({ code }); }
  }
  const transport = createTransport({ url: "ws://test", WebSocket: Socket,
    setTimer: (fn, delay) => { const id = ++tick; timers.set(id, { fn, delay }); return id; },
    clearTimer: id => timers.delete(id), report: entry => logs.push(entry), ...options });
  const open = async () => { const p = transport.connect(); sockets.at(-1).open(); await p; return sockets.at(-1); };
  return { transport, sockets, timers, logs, open };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("one connection; dispose is terminal; normal close does not reconnect", async () => {
  const r = rig();
  const first = r.transport.connect(), second = r.transport.connect();
  assert.equal(first, second); assert.equal(r.sockets.length, 1);
  r.sockets[0].open(); await first;
  r.sockets[0].close(1000); assert.equal(r.timers.size, 0);
  await r.open(); r.transport.dispose();
  assert.equal(r.timers.size, 0);
  await assert.rejects(r.transport.connect(), { code: "disposed" });
});

test("typed/filter subscriptions isolate sync/async failures and invalidate late commits", async () => {
  const r = rig(); await r.open(); let good = 0, config = 0, late = 0, release;
  r.transport.subscribe("agent.delta", { sessionId: "a" }, () => { throw new Error("secret"); });
  r.transport.subscribe("agent.delta", {}, async () => { throw new Error("credential"); });
  r.transport.subscribe("agent.delta", { sessionId: "a", agentId: "main" }, () => good++);
  r.transport.subscribe("models.config.changed", {}, () => config++);
  const off = r.transport.subscribe("agent.delta", { sessionId: "a" }, async (_, context) => {
    await new Promise(resolve => { release = resolve; }); context.commit(() => late++);
  });
  r.transport.receive({ type: "agent.delta", sessionId: "a" }); off(); release(); await flush();
  assert.equal(good, 1); assert.equal(config, 0); assert.equal(late, 0);
  assert.equal(r.logs.filter(x => x.code === "listener_failed").length, 2);
  assert.doesNotMatch(JSON.stringify(r.logs), /secret|credential/); r.transport.dispose();
});

test("pending cleanup on receipt, duplicate, timeout, abort, send failure and disconnect; never replay", async () => {
  const r = rig(); const ws = await r.open();
  const p = r.transport.request({ type: "prompt", text: "side effect" });
  await flush(); // 发送走保序链（微任务），回执注入前先冲刷。
  ws.message({ type: "response", id: ws.sent.at(-1).id, ok: true, data: 7 });
  ws.message({ type: "response", id: ws.sent.at(-1).id, ok: true, data: 8 });
  assert.equal(await p, 7); assert.equal(r.timers.size, 0);
  const timed = r.transport.request({ type: "cancel" });
  const checkTimed = assert.rejects(timed, { code: "timeout", unknown: true });
  [...r.timers.values()][0].fn(); await checkTimed;
  const controller = new AbortController();
  const aborted = r.transport.request({ type: "cancel" }, { signal: controller.signal });
  const checkAbort = assert.rejects(aborted, { code: "aborted" }); controller.abort(); await checkAbort;
  const disconnected = r.transport.request({ type: "prompt" });
  const checkDisconnect = assert.rejects(disconnected, { code: "disconnected", unknown: true });
  ws.close(1006); await checkDisconnect;
  assert.equal(r.transport.getDiagnostics().pending, 0);
  const retry = [...r.timers.values()][0]; r.timers.clear(); retry.fn(); await flush();
  r.sockets.at(-1).open(); await flush(); assert.deepEqual(r.sockets.at(-1).sent, []);
  r.sockets.at(-1).send = () => { throw new Error("private"); };
  await assert.rejects(r.transport.request({ type: "prompt" }), { code: "send_failed" });
  assert.equal(r.transport.getDiagnostics().pending, 0); r.transport.dispose();
});

test("snapshot response closes the microtask gap, preserves seq 10 body before seq 11 terminal and resets epoch", async () => {
  const seen = []; const r = rig({ reduce: event => seen.push(event.seq) }); const ws = await r.open();
  r.transport.commitSnapshot({ sessionId: "s", seq: 9, instanceId: "old" });
  const p = r.transport.request({ type: "session.attach", sessionId: "s" });
  await flush(); // 发送走保序链（微任务），回执注入前先冲刷。
  ws.message({ type: "response", id: ws.sent.at(-1).id, ok: true, data: { sessionId: "s", seq: 9, instanceId: "old" } });
  ws.message({ type: "agent.delta", sessionId: "s", seq: 10, priority: 1 });
  ws.message({ type: "agent.end", sessionId: "s", seq: 11, priority: 0 });
  assert.deepEqual(seen, []);
  r.transport.beginSnapshot(); r.transport.commitSnapshot(await p);
  r.transport.receive({ type: "agent.end", sessionId: "s", seq: 11 }); assert.deepEqual(seen, [10, 11]);
  r.transport.commitSnapshot({ sessionId: "s", seq: 0, instanceId: "new" });
  r.transport.receive({ type: "agent.delta", sessionId: "s", seq: 1 }); assert.deepEqual(seen, [10, 11, 1]);
  r.transport.dispose();
});

test("authoritative failure never advances watermark; queues and retries are bounded", async () => {
  const r = rig({ reduce: () => { throw new Error("body secret"); }, maxRetries: 2 }); await r.open();
  r.transport.commitSnapshot({ sessionId: "s", seq: 9 });
  r.transport.receive({ type: "agent.delta", sessionId: "s", seq: 10 });
  assert.equal(r.transport.getWatermark("s"), 9);
  for (let i = 0; i < 3 && r.timers.size; i++) {
    const timer = [...r.timers.values()][0]; r.timers.clear(); timer.fn(); await flush();
    r.sockets.at(-1).close(1006); await flush();
  }
  assert.equal(r.transport.getConnectionState(), "limited"); assert.equal(r.timers.size, 0);
  r.transport.dispose();
  const q = rig({ maxEvents: 1 }); await q.open(); q.transport.beginSnapshot();
  q.transport.receive({ type: "agent.delta", sessionId: "s" });
  q.transport.receive({ type: "agent.delta", sessionId: "s" });
  assert.equal(q.transport.getDiagnostics().queued, 0); assert(q.logs.some(x => x.code === "receive_limit")); q.transport.dispose();
});

test("direct/broadcast/deletion share bounded sends; slow/throwing client cannot stop fast client", () => {
  const reports = []; const sender = createSender({ maxBytes: 100, report: x => reports.push(x) });
  const socket = (bufferedAmount = 0) => ({ readyState: 1, bufferedAmount, sent: [], send(raw, cb) { this.sent.push(raw); cb?.(); }, terminate() { this.stopped = true; }, close(code) { this.code = code; } });
  const slow = socket(99), fast = socket(), broken = socket(); broken.send = () => { throw new Error("secret"); };
  sender.broadcast([slow, broken, fast], { type: "session.deleted", sessionId: "s" });
  assert(slow.stopped); assert(broken.stopped); assert.equal(fast.sent.length, 1);
  const large = socket(); assert.equal(sender.send(large, { body: "x".repeat(101) }), false); assert.equal(large.code, 1009);
  assert.doesNotMatch(JSON.stringify(reports), /secret|body/);
});

test("broadcast uses UTF-8 limits per client and preserves exclusions and async failures", () => {
  const message = { body: "中文😀" }, raw = JSON.stringify(message);
  const bytes = Buffer.byteLength(raw);
  assert.ok(bytes > raw.length);
  const socket = () => ({ readyState: 1, bufferedAmount: 0, sent: [],
    send(value, callback) { this.sent.push(value); this.callback = callback; },
    terminate() { this.stopped = true; }, close(code) { this.code = code; } });
  const sender = createSender({ maxBytes: bytes, report() {} });
  const fast = socket(), slow = socket(), excluded = socket(), closed = socket(), failed = socket();
  slow.bufferedAmount = 1; closed.readyState = 3;
  sender.broadcast([fast, slow, excluded, closed, failed], message, excluded);
  assert.deepEqual(fast.sent, [raw]);
  assert.equal(slow.stopped, true);
  assert.deepEqual(excluded.sent, []); assert.deepEqual(closed.sent, []);
  failed.callback(new Error("asynchronous send failure"));
  sender.broadcast([fast, failed], message);
  assert.deepEqual(fast.sent, [raw, raw]); assert.deepEqual(failed.sent, [raw]);
  const oversize = socket();
  createSender({ maxBytes: bytes - 1, report() {} }).broadcast([oversize], message);
  assert.equal(oversize.code, 1009); assert.deepEqual(oversize.sent, []);
});

test("oversize close stops automatic snapshot download loop", async () => {
  const r = rig(); const ws = await r.open();
  r.transport.beginSnapshot(); r.transport.receive({ type: "agent.delta", sessionId: "s" });
  ws.close(1009);
  assert.equal(r.transport.getSnapshotQueue(), null);
  assert.equal(r.transport.getConnectionState(), "limited"); assert.equal(r.timers.size, 0); r.transport.dispose();
});
