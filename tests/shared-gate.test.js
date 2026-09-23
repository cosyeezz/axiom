import { test } from "node:test";
import assert from "node:assert/strict";
import { remoteService, reconnectingGate, gateLayout, shareGate } from "../src/shared-gate.js";
import { serveGate, connectGate } from "../src/gate-ipc.js";
import { RequestGate } from "../src/request-gate.js";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { Database } from "../src/database.js";
import { UsageStore } from "../src/usage-store.js";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("远程取消立即返回，迟到令牌归还", async () => {
  let grant; const released = [];
  const client = { request(method, data) {
    if (method === "acquire") return new Promise(resolve => { grant = resolve; });
    if (method === "release") released.push(data.leaseId);
    return Promise.resolve({});
  } };
  const service = remoteService(client, { limits: {} });
  const controller = new AbortController();
  const acquire = service.gate.acquire("p", { signal: controller.signal });
  controller.abort(); await assert.rejects(acquire);
  grant({ leaseId: "late" }); await Promise.resolve();
  assert.deepEqual(released, ["late"]);
});
test("刷新取得owner新限额，非排队RPC使用短超时", async () => {
  const calls = [];
  const service = remoteService({ request(method, data, timeout) { calls.push(timeout); return Promise.resolve({ limits: { p: { rpm: 3 } } }); } }, { limits: {} });
  await service.refresh(); assert.equal(service.gate.limits.p.rpm, 3); assert.equal(calls[0], 1000);
});
test("远程取消清除服务端队列且保留客户端连接", async () => {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-cancel-${process.pid}-${Date.now()}` : join(tmpdir(), `axiom-cancel-${process.pid}-${Date.now()}.sock`);
  const layout = { endpoint, token: "secret" };
  const gate = new RequestGate({ limits: { p: { concurrency: 1 } } });
  const server = await serveGate({ ...layout, service: { gate } });
  const client = await connectGate(layout);
  const service = remoteService(client, { limits: gate.limits });
  try {
    const first = await service.gate.acquire("p");
    const abort = new AbortController();
    const queued = service.gate.acquire("p", { signal: abort.signal });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(gate.snapshot()[0].concurrencyQueue, 1);
    abort.abort();
    await assert.rejects(queued);
    for (let i = 0; i < 50 && gate.snapshot()[0].concurrencyQueue; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(gate.snapshot()[0].concurrencyQueue, 0);
    first.release();
    const next = await service.gate.acquire("p");
    next.release();
  } finally { service.close(); await server.close(); gate.close(); }
});
test("共享闸门初始化失败时明确拒绝启动，不清空限额", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-gate-fail-"));
  let configured = false;
  try {
    await assert.rejects(shareGate({ gate: { configure() { configured = true; } } }, join(dir, "missing")), /ENOENT/);
    assert.equal(configured, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("不同数据根使用不同的端点和密钥文件", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-gate-layout-"));
  try {
    const a = join(dir, "a"), b = join(dir, "b");
    await mkdir(a); await mkdir(b);
    const first = await gateLayout(a), same = await gateLayout(a), other = await gateLayout(b);
    assert.deepEqual(first, same);
    assert.notEqual(first.endpoint, other.endpoint);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("并发首次创建只发布完整密钥且所有客户端获得同一密钥", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-gate-token-"));
  try {
    const layouts = await Promise.all(Array.from({ length: 16 }, () => gateLayout(dir)));
    assert.match(layouts[0].token, /^[a-f0-9]{64}$/);
    assert.ok(layouts.every(layout => layout.token === layouts[0].token && layout.endpoint === layouts[0].endpoint));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("断线后旧客户端下一次请求建立新连接", async () => {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-reconnect-${Date.now()}-${process.pid}` : join(tmpdir(), `axiom-reconnect-${Date.now()}-${process.pid}.sock`);
  const gate = new RequestGate({ limits: { p: { concurrency: 1 } } });
  const layout = { endpoint, token: "secret" };
  let server = await serveGate({ ...layout, service: { gate } });
  const client = reconnectingGate(layout, await connectGate(layout));
  try {
    await client.request("limits");
    await server.close();
    server = await serveGate({ ...layout, service: { gate } });
    assert.deepEqual((await client.request("limits")).limits, gate.limits);
  } finally { client.close(); await server.close(); gate.close(); }
});
test("重连后原 acquire 的取消和租约归还仍发往原连接", async () => {
  const callsA = [], callsB = [];
  const grants = [];
  const first = { connected: true, request(method, data, timeout, options) {
    callsA.push([method, data]);
    if (method === "acquire") {
      options.onRequestId(`old-${grants.length}`);
      return new Promise(resolve => grants.push(resolve));
    }
    return Promise.resolve({ limits: {} });
  }, close() {} };
  const second = { connected: true, request(method, data) { callsB.push([method, data]); return Promise.resolve({ limits: {} }); }, close() {} };
  const client = reconnectingGate({}, first, async () => second);
  const remote = remoteService(client, { limits: {} });
  try {
    const abort = new AbortController();
    const pending = remote.gate.acquire("p", { signal: abort.signal });
    await Promise.resolve();
    first.connected = false;
    await remote.refresh();
    abort.abort();
    await assert.rejects(pending);
    assert.ok(callsA.some(([method, data]) => method === "cancel" && data.acquireId === "old-0"));
    grants[0]({ leaseId: "late" });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(callsA.some(([method, data]) => method === "release" && data.leaseId === "late"));
    assert.deepEqual(callsB.map(([method]) => method), ["limits"]);
  } finally { remote.close(); }
});
test("重连后已发租约也只向原连接归还", async () => {
  const callsA = [], callsB = [];
  const first = { connected: true, request(method, data, timeout, options) {
    callsA.push([method, data]);
    if (method === "acquire") { options.onRequestId("old"); return Promise.resolve({ leaseId: "held" }); }
    return Promise.resolve({ limits: {} });
  }, close() {} };
  const second = { connected: true, request(method, data) { callsB.push([method, data]); return Promise.resolve({ limits: {} }); }, close() {} };
  const remote = remoteService(reconnectingGate({}, first, async () => second), { limits: {} });
  try {
    const lease = await remote.gate.acquire("p");
    first.connected = false;
    await remote.refresh();
    lease.release();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(callsA.some(([method, data]) => method === "release" && data.leaseId === "held"));
    assert.deepEqual(callsB.map(([method]) => method), ["limits"]);
  } finally { remote.close(); }
});
test("远程审计记录使用客户端 PID，view 保留两端审计失败数", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-gate-pid-"));
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-pid-${process.pid}-${Date.now()}` : join(dir, "gate.sock");
  const db = new Database(join(dir, "audit.db"));
  const owner = { gate: new RequestGate(), store: new UsageStore(db), auditFailures: 2,
    view() { return { limits: this.gate.limits, auditFailures: this.auditFailures }; },
    close() { this.gate.close(); } };
  const server = await serveGate({ endpoint, token: "secret", service: owner });
  const client = await connectGate({ endpoint, token: "secret" });
  const remote = remoteService(client, { limits: owner.gate.limits });
  try {
    const id = await remote.store.begin({ sessionId: "remote", pid: -1 });
    assert.equal(owner.store.listRequests({}).items.find(row => row.requestId === id).pid, process.pid);
    remote.auditFailures = 3;
    assert.equal((await remote.view()).auditFailures, 5);
    await assert.rejects(client.request("begin", { data: { pid: -1 } }));
  } finally { remote.close(); await server.close(); owner.close(); db.close(); await rm(dir, { recursive: true, force: true }); }
});
test("远程刷新只读限额，view 合并当前客户端的审计失败数", async () => {
  const methods = [];
  const service = remoteService({ request(method) {
    methods.push(method);
    return Promise.resolve({ limits: {}, auditFailures: 2 });
  } }, { limits: {} });
  await service.refresh();
  assert.deepEqual(methods, ["limits"]);
  service.auditFailures = 3;
  assert.equal((await service.view()).auditFailures, 5);
});
