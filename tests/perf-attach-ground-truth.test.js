// attachGroundTruth 资源清理回归（paired-first-screen.mjs）。
//
// 背景：attachGroundTruth 原来只在成功/部分错误路径 clearTimeout+close()，畸形 JSON 会从
// ws.onmessage 里原样抛出（未捕获异常），提前 close 会永远挂到 30s 超时。而且 close() 只是
// 发起关闭、不是「已关闭」的证明，所以未确认的 socket 必须登记给外层 finally 用有限超时确认，
// 未确认就保锁。
//
// 本测试用 node:vm 从脚本取真实函数（attachGroundTruth / closeSocket / withLimit / sha256），
// 注入假 WebSocket 与受控定时器，不启动任何真实服务/浏览器，也绝不等真实 30s 超时。

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../docs/perf-long-conversation/paired-first-screen.mjs", import.meta.url));
const SOURCE = fs.readFileSync(FILE, "utf8");
const BASE = "http://127.0.0.1:4321";

// 按花括号配平切出真实函数（跳过字符串与注释），同 perf-startup-cleanup.test.js。
function extractFunction(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start < 0) start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `源码中找不到 function ${name}(`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      const eol = source.indexOf("\n", i + 2);
      if (eol < 0) break;
      i = eol;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2) + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < source.length; i++) {
        if (source[i] === "\\") i++;
        else if (source[i] === ch) break;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`花括号不配平: ${name}`);
}

function extractLine(source, prefix) {
  const line = source.split("\n").find((l) => l.startsWith(prefix));
  assert.ok(line, `源码中找不到以 ${prefix} 开头的行`);
  return line;
}

function dropLine(source, marker) {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.includes(marker));
  assert.ok(index >= 0, `变异目标缺失: ${marker}`);
  lines.splice(index, 1);
  return lines.join("\n");
}

// 假 WebSocket：只记录行为，不自建连接。emitClose=false 模拟「close() 后永不确认」。
class FakeSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 1; // OPEN
    this.sent = [];
    this.closeCalls = 0;
    this.emitClose = true;
    this.listeners = {};
  }
  get CONNECTING() { return 0; }
  get OPEN() { return 1; }
  get CLOSING() { return 2; }
  get CLOSED() { return 3; }
  addEventListener(type, cb) { (this.listeners[type] ||= []).push(cb); }
  emit(type, event = {}) {
    if (typeof this[`on${type}`] === "function") this[`on${type}`](event);
    for (const cb of this.listeners[type] || []) cb(event);
  }
  send(data) { this.sent.push(data); }
  close() {
    this.closeCalls++;
    if (this.readyState === 3) return;
    this.readyState = 2; // CLOSING：只有收到 close 事件才算 CLOSED
    if (!this.emitClose) return;
    queueMicrotask(() => { this.readyState = 3; this.emit("close", {}); });
  }
}

const payload = (over = {}) => JSON.stringify({
  type: "response",
  id: "gt",
  ok: true,
  data: {
    messages: [
      { message: { role: "user", content: "prefix supercalifragilisticexpialidocious tail" } },
      { message: { role: "assistant", content: "ok" } },
    ],
    tasks: [1, 2],
    live: { a: {} },
    ...over,
  },
});

function harness({ mutateMarker = null } = {}) {
  const source = mutateMarker ? dropLine(SOURCE, mutateMarker) : SOURCE;
  const timers = new Map();
  const sockets = [];
  let seq = 0;
  const sandbox = {
    WebSocket: class extends FakeSocket { constructor(url, protocols) { super(url, protocols); sockets.push(this); } },
    URL,
    crypto,
    console,
    setTimeout: (fn) => { const id = ++seq; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(
    [
      extractLine(source, "const sha256 = "),
      "const openSockets = new Set();",
      extractFunction(source, "withLimit"),
      extractFunction(source, "closeSocket"),
      extractFunction(source, "attachGroundTruth"),
    ].join("\n"),
    context,
    { filename: FILE },
  );
  const registry = vm.runInContext("openSockets", context);
  return {
    sockets,
    attachGroundTruth: (sessionId = "sess") => vm.runInContext("attachGroundTruth", context)(BASE, sessionId),
    closeSocket: (ws, ms) => vm.runInContext("closeSocket", context)(ws, ms),
    registry,
    pendingTimers: () => timers.size,
    // 真实定时器一旦触发就不复存在：只有「已排程未触发」的才算残留
    fireTimers: () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    settle: () => new Promise((r) => setImmediate(r)), // 只让假 socket 的 close 事件微任务落地
    clearTimers: () => timers.clear(),
  };
}

const rejectOf = (promise) => promise.then(() => null, (error) => error);

test("成功路径：单次收口——清定时器、发起关闭、close 事件后离开登记表", async () => {
  const h = harness();
  try {
    const p = h.attachGroundTruth("sess");
    const ws = h.sockets[0];
    assert.equal(ws.url, "ws://127.0.0.1:4321/ws");
    assert.equal(String(ws.protocols), "axiom"); // 跨 vm 界的数组不能直接 deepEqual
    assert.equal(h.registry.size, 1, "自建 socket 必须登记，供外层确认关闭");
    ws.emit("open");
    assert.equal(JSON.parse(ws.sent[0]).type, "session.attach");
    ws.emit("message", { data: payload() });
    const gt = await p;
    assert.equal(gt.messages, 2);
    assert.equal(JSON.stringify(Object.entries(gt.roles).sort()), JSON.stringify([["assistant", 1], ["user", 1]]));
    assert.equal(gt.tasks, 2);
    assert.equal(gt.live, 1);
    assert.equal(gt.tailSnippet, "supercalifragilisticexpialidocious".slice(0, 24));
    assert.ok(gt.tailSnippetSha256, "尾部探针必须带哈希");
    assert.equal(h.pendingTimers(), 0, "成功路径必须清掉 30s 定时器");
    assert.equal(ws.closeCalls, 1);
    await h.settle();
    assert.equal(h.registry.size, 0, "close 事件确认后才离开登记表");
    assert.equal(h.pendingTimers(), 0, "测试结束不得残留定时器");
  } finally { h.clearTimers(); }
});

test("畸形 JSON/服务端报错：必须 reject，绝不从 ws 回调抛出", async () => {
  for (const [data, expected] of [["{oops", /not JSON/], [JSON.stringify({ type: "response", id: "gt", ok: false, error: "attach denied" }), /attach denied/]]) {
    const h = harness();
    try {
      const p = h.attachGroundTruth("sess");
      const ws = h.sockets[0];
      assert.doesNotThrow(() => ws.emit("message", { data }), `回调不得抛出: ${data}`);
      const error = await rejectOf(p);
      assert.match(error.message, expected);
      assert.equal(h.pendingTimers(), 0, "异常路径必须清定时器");
      assert.equal(ws.closeCalls, 1, "异常路径必须发起关闭");
      await h.settle();
      assert.equal(h.registry.size, 0);
      assert.equal(h.pendingTimers(), 0, "测试结束不得残留定时器");
    } finally { h.clearTimers(); }
  }
});

test("ws error / 提前 close：reject 并清定时器，且重复事件不二次结算", async () => {
  for (const kind of ["error", "close"]) {
    const h = harness();
    try {
      const p = h.attachGroundTruth("sess");
      const ws = h.sockets[0];
      assert.doesNotThrow(() => ws.emit(kind));
      const error = await rejectOf(p);
      assert.match(error.message, kind === "error" ? /ws error/ : /closed before ground truth/);
      assert.equal(h.pendingTimers(), 0);
      ws.emit("message", { data: payload() }); // 结算后的事件必须被忽略
      assert.equal(await p.then(() => "ok", () => "rejected"), "rejected");
      await h.settle();
      assert.equal(h.registry.size, 0, `提前 ${kind} 即已确认关闭，不留登记`);
      assert.equal(h.pendingTimers(), 0);
    } finally { h.clearTimers(); }
  }
});

test("超时路径：受控定时器触发超时、清定时器并保登记；未确认关闭则外层必须保锁", async () => {
  const h = harness();
  try {
    const p = h.attachGroundTruth("sess");
    const ws = h.sockets[0];
    ws.emitClose = false; // close() 永不确认（模拟握手挂死）
    assert.equal(h.pendingTimers(), 1, "恰好一个 30s 定时器");
    h.fireTimers(); // 触发真实超时回调，不真等 30s
    const error = await rejectOf(p);
    assert.match(error.message, /timeout/);
    assert.equal(h.pendingTimers(), 0, "超时路径必须清定时器");
    assert.equal(ws.closeCalls, 1, "超时路径必须发起关闭");
    assert.equal(h.registry.size, 1, "close() 不是已关闭的证明 → 必须留在登记表");

    const closePromise = h.closeSocket(ws, 15000);
    assert.equal(h.pendingTimers(), 1, "外层确认同样设上限");
    h.fireTimers();
    const cleanupError = await rejectOf(closePromise);
    assert.match(cleanupError.message, /socket close timed out/);
    assert.equal(h.registry.size, 1, "未确认关闭 → 登记保留（外层据此保锁）");
    assert.equal(h.pendingTimers(), 0);

    // 服务端最终确认关闭的路径：同样必须先发起 close，再等 close 事件
    const p2 = h.attachGroundTruth("sess");
    const ws2 = h.sockets[1];
    h.fireTimers();
    assert.match((await rejectOf(p2)).message, /timeout/);
    await h.closeSocket(ws2, 15000);
    assert.ok(!h.registry.has(ws2) && h.registry.has(ws), "确认关闭的离开登记表，未确认的（ws）仍留着");
    assert.equal(h.pendingTimers(), 0, "测试结束不得残留定时器");
  } finally { h.clearTimers(); }
});

test("承重变异：删掉登记行后，超时的 socket 就再也无法被外层确认（正是上面拦住的行为）", async () => {
  const h = harness({ mutateMarker: "openSockets.add(ws);" });
  try {
    const p = h.attachGroundTruth("sess");
    h.sockets[0].emitClose = false;
    h.fireTimers();
    await rejectOf(p);
    assert.equal(h.registry.size, 0, "无登记 → 外层 finally 无处确认关闭");
    assert.equal(h.sockets[0].closeCalls, 1, "变异只影响登记，不影响关闭");
    assert.equal(h.pendingTimers(), 0, "测试结束不得残留定时器");
  } finally { h.clearTimers(); }
});
