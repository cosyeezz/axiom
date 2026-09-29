// 发送序列化 Worker 化（Phase D4）：估算超 1MiB 的命令 stringify 移入后台 Worker，
// 主线程只付结构化克隆成本；发送顺序由保序链保证（大消息先入队、小消息跟其后）。
// send 前复检 bufferedAmount，保 send_limit 确定性失败语义；单消息原子不可分片。
// 无 Worker 环境自动退化同步路径。
import test from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../public/transport.js";

function rig(options = {}) {
  const sockets = [], timers = new Map(), logs = [], workers = [];
  let tick = 0, blobSeq = 0;
  class Socket {
    readyState = 0; bufferedAmount = 0; sent = [];
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    send(raw) { this.sent.push(raw); }
    message(message) { this.onmessage({ data: JSON.stringify(message) }); }
    close(code) { this.readyState = 3; this.onclose?.({ code }); }
  }
  class Serializer {
    onmessage = null; onerror = null; terminated = false; posted = [];
    constructor(url) { this.url = url; workers.push(this); }
    postMessage(data) { this.posted.push(data); }
    terminate() { this.terminated = true; }
  }
  const created = [], revoked = [];
  const realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => `blob:fake-${++blobSeq}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  const transport = createTransport({ url: "ws://test", WebSocket: Socket, Serializer,
    setTimer: (fn, delay) => { const id = ++tick; timers.set(id, { fn, delay }); return id; },
    clearTimer: (id) => timers.delete(id), report: (entry) => logs.push(entry),
    ...options,
    initialize: options.initialize ?? (() => { created.push(1); }) });
  const open = async () => { const p = transport.connect(); sockets.at(-1).open(); await p; return sockets.at(-1); };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const restore = () => { URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; };
  return { transport, sockets, timers, logs, workers, revoked, open, flush, restore, Serializer };
}

const BIG = "x".repeat((1 << 20) + 1000); // 估算超 1MiB 阈值

test("大命令走后台序列化：Worker 收到命令、socket 收到等价字符串", async (t) => {
  const r = rig(); t.after(() => { r.restore(); r.transport.dispose(); });
  const ws = await r.open();
  const p = r.transport.request({ type: "session.import", data: BIG });
  await r.flush();
  // 惰性创建 Worker 并结构化克隆传命令。
  assert.equal(r.workers.length, 1, "大命令应创建序列化 Worker");
  assert.equal(r.workers[0].posted.length, 1);
  const { key, command } = r.workers[0].posted[0];
  assert.equal(command.type, "session.import");
  // Worker 侧完成后回传 raw+bytes（真实 Worker 里做 stringify，这里模拟等价产物）。
  const raw = JSON.stringify(command);
  r.workers[0].onmessage({ data: { key, raw, bytes: raw.length } });
  await r.flush();
  assert.equal(ws.sent.length, 1);
  assert.deepEqual(JSON.parse(ws.sent[0]), { type: "session.import", data: BIG, id: "1" });
  ws.message({ type: "response", id: "1", ok: true, data: 1 });
  assert.equal(await p, 1);
});

test("保序：大消息先入队、随后的小消息跟在其后，不乱序", async (t) => {
  const r = rig(); t.after(() => { r.restore(); r.transport.dispose(); });
  const ws = await r.open();
  const big = r.transport.request({ type: "session.import", data: BIG });
  const small = r.transport.request({ type: "prompt", text: "小命令" });
  await r.flush();
  // 小命令在同一条链上等待大命令先发（否则同步路径会抢跑）。
  assert.equal(ws.sent.length, 0, "小命令等待前方大命令完成");
  const { key, command } = r.workers[0].posted[0];
  r.workers[0].onmessage({ data: { key, raw: JSON.stringify(command), bytes: JSON.stringify(command).length } });
  await r.flush();
  assert.equal(ws.sent.length, 2, "两条都已发送");
  assert.equal(JSON.parse(ws.sent[0]).type, "session.import");
  assert.equal(JSON.parse(ws.sent[1]).type, "prompt");
  ws.message({ type: "response", id: "1", ok: true, data: 1 });
  ws.message({ type: "response", id: "2", ok: true, data: 2 });
  assert.equal(await big, 1);
  assert.equal(await small, 2);
});

test("send 前复检缓冲水位：超限按 send_limit 失败，单消息不分片", async (t) => {
  const r = rig({ maxBytes: 64 }); t.after(() => { r.restore(); r.transport.dispose(); });
  const ws = await r.open();
  ws.bufferedAmount = 4096; // 已占用大量缓冲
  await assert.rejects(r.transport.request({ type: "prompt", text: "hello" }), { code: "send_limit" });
  assert.equal(ws.sent.length, 0);
  await r.flush();
  assert.equal(ws.sent.length, 0, "失败后不补发");
  assert.equal(r.transport.getDiagnostics().pending, 0);
});

test("无 Worker 环境退化同步路径，行为等价", async (t) => {
  const sockets = [], timers = new Map();
  class Socket {
    readyState = 0; sent = [];
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    send(raw) { this.sent.push(raw); }
    message(message) { this.onmessage({ data: JSON.stringify(message) }); }
    close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
  }
  const transport = createTransport({ url: "ws://test", WebSocket: Socket, Serializer: undefined,
    setTimer: (fn) => { const id = timers.size + 1; timers.set(id, { fn }); return id; },
    clearTimer: (id) => timers.delete(id) });
  t.after(() => transport.dispose());
  const p = transport.connect(); sockets[0].open(); await p;
  const req = transport.request({ type: "session.import", data: BIG }); // 超 1MiB 也走主线程
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(sockets[0].sent.length, 1, "同步路径（链上微任务后）发送");
  const parsed = JSON.parse(sockets[0].sent[0]);
  assert.equal(parsed.data, BIG);
  sockets[0].message({ type: "response", id: parsed.id, ok: true, data: 5 });
  assert.equal(await req, 5);
});

test("dispose 终止后台序列化器并回收 blob URL", async (t) => {
  const r = rig(); t.after(r.restore);
  await r.open();
  const req = r.transport.request({ type: "session.import", data: BIG });
  const check = assert.rejects(req, { code: "disconnected" }); // dispose 断开结算
  await r.flush();
  const worker = r.workers[0];
  assert.equal(worker.terminated, false);
  r.transport.dispose();
  assert.equal(worker.terminated, true, "dispose 终止 Worker");
  await check;
});

for (const mode of ["constructor", "postMessage", "onerror", "onmessageerror", "timeout"]) {
  test(`Worker ${mode} 故障只在发送前降级，后续大小消息不阻塞也不重发`, async (t) => {
    const r = rig(mode === "constructor" ? { Serializer: class { constructor() { throw new Error("CSP secret"); } } } : {});
    t.after(() => { r.transport.dispose(); r.restore(); });
    if (mode === "postMessage") r.Serializer.prototype.postMessage = () => { throw new Error("clone secret"); };
    const ws = await r.open();
    const big = r.transport.request({ type: "prompt", images: [BIG] });
    const small = r.transport.request({ type: "cancel" });
    await r.flush();
    if (["onerror", "onmessageerror"].includes(mode)) r.workers[0][mode]({});
    if (mode === "timeout") [...r.timers.values()].find((timer) => timer.delay === 10000).fn();
    await r.flush();
    await r.flush();
    assert.equal(ws.sent.length, 2);
    assert.deepEqual(ws.sent.map((raw) => JSON.parse(raw).id), ["1", "2"]);
    assert.deepEqual(JSON.parse(ws.sent[0]).images, [BIG]);
    assert.equal(r.revoked.length, 1);
    if (r.workers.length) assert.equal(r.workers[0].terminated, true);
    ws.message({ type: "response", id: "1", ok: true });
    ws.message({ type: "response", id: "2", ok: true });
    await Promise.all([big, small]);
    const retry = r.transport.request({ type: "prompt", images: [BIG] });
    await r.flush();
    assert.equal(ws.sent.length, 3);
    assert.equal(r.workers.length, mode === "constructor" ? 0 : 1, "坏 Worker 不会被复用或反复创建");
    ws.message({ type: "response", id: "3", ok: true });
    await retry;
    assert.equal(r.timers.size, 0);
    assert.doesNotMatch(JSON.stringify(r.logs), /secret|xxxx/);
  });
}

for (const mode of ["abort", "timeout", "disconnect", "dispose"]) {
  test(`序列化未完成时 ${mode} 是确定未发送，解除队列且忽略迟到结果`, async (t) => {
    const r = rig(); t.after(() => { r.transport.dispose(); r.restore(); });
    const ws = await r.open(), controller = new AbortController();
    const big = r.transport.request({ type: "prompt", images: [BIG] }, { signal: controller.signal });
    const check = assert.rejects(big, { code: mode === "abort" ? "aborted" : mode === "timeout" ? "timeout" : "disconnected", unknown: false });
    await r.flush();
    const worker = r.workers[0], late = worker.onmessage;
    const { key, command } = worker.posted[0];
    if (mode === "abort") controller.abort();
    if (mode === "timeout") [...r.timers.values()].find((timer) => timer.delay === 120000).fn();
    if (mode === "disconnect") ws.close(1000);
    if (mode === "dispose") r.transport.dispose();
    await check;
    assert.equal(worker.terminated, true);
    assert.equal(r.timers.size, 0);
    late({ data: { key, raw: JSON.stringify(command), bytes: BIG.length } });
    await r.flush();
    assert.equal(ws.sent.length, 0);
    if (mode !== "dispose") {
      const next = mode === "disconnect" ? await r.open() : ws;
      const small = r.transport.request({ type: "cancel" });
      await r.flush(); await r.flush();
      assert.equal(next.sent.length, 1);
      assert.equal(JSON.parse(next.sent[0]).type, "cancel");
      next.message({ type: "response", id: "2", ok: true });
      await small;
    }
  });
}

for (const mode of ["success-then-error", "malformed", "error-then-late-success"]) {
  test(`Worker ${mode} 交错回调不重复发送`, async (t) => {
    const r = rig(); t.after(() => { r.transport.dispose(); r.restore(); });
    const ws = await r.open();
    const result = r.transport.request({ type: "prompt", images: [BIG] });
    await r.flush();
    const worker = r.workers[0], message = worker.onmessage, error = worker.onerror;
    const { key, command } = worker.posted[0], raw = JSON.stringify(command);
    const event = { data: { key, raw, bytes: raw.length } };
    if (mode === "success-then-error") { message(event); error(); }
    if (mode === "malformed") message({ data: { key, raw: 42, bytes: -1 } });
    if (mode === "error-then-late-success") error();
    message(event); message(event);
    await r.flush(); await r.flush();
    assert.equal(ws.sent.length, 1);
    assert.equal(ws.sent[0], raw);
    ws.message({ type: "response", id: "1", ok: true });
    await result;
    assert.equal(r.timers.size, 0);
  });
}

test("本地序列化也失败时确定未发送，不阻塞下一条消息", async (t) => {
  const r = rig({ Serializer: null }); t.after(() => { r.transport.dispose(); r.restore(); });
  const ws = await r.open(), circular = {}; circular.self = circular;
  await assert.rejects(r.transport.request({ type: "prompt", circular }), { code: "serialize_failed", unknown: false });
  const next = r.transport.request({ type: "cancel" });
  await r.flush();
  assert.equal(ws.sent.length, 1);
  ws.message({ type: "response", id: "2", ok: true });
  await next;
});
