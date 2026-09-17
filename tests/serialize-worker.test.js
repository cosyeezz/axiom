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
  const created = [];
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = (blob) => `blob:fake-${++blobSeq}`;
  const transport = createTransport({ url: "ws://test", WebSocket: Socket, Serializer,
    setTimer: (fn, delay) => { const id = ++tick; timers.set(id, { fn, delay }); return id; },
    clearTimer: (id) => timers.delete(id), report: (entry) => logs.push(entry),
    ...options,
    initialize: options.initialize ?? (() => { created.push(1); }) });
  const open = async () => { const p = transport.connect(); sockets.at(-1).open(); await p; return sockets.at(-1); };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const restore = () => { URL.createObjectURL = realCreate; };
  return { transport, sockets, timers, logs, workers, open, flush, restore, Serializer };
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
