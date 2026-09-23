import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serveGate, connectGate } from "../src/gate-ipc.js";
import { RequestGate } from "../src/request-gate.js";

test("两个IPC客户端共用额度，断线回收租约", async () => {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-test-${randomUUID()}` : join(tmpdir(), `gate-${randomUUID()}.sock`);
  const gate = new RequestGate({ limits: { p: { concurrency: 1 } } });
  const server = await serveGate({ endpoint, token: "secret", service: { gate } });
  let a, b;
  try {
    a = await connectGate({ endpoint, token: "secret" }); b = await connectGate({ endpoint, token: "secret" });
    await a.request("acquire", { provider: "p", kind: "concurrency" });
    const second = b.request("acquire", { provider: "p", kind: "concurrency" });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(gate.snapshot()[0].active, 1); assert.equal(gate.snapshot()[0].concurrencyQueue, 1);
    a.close(); const lease = await second;
    assert.equal(gate.snapshot()[0].active, 1);
    await b.request("release", { leaseId: lease.leaseId });
    assert.equal(gate.snapshot()[0].active, 0);
  } finally { a?.close(); b?.close(); await server.close(); gate.close(); }
});
test("取消单个远程排队请求而不关闭连接", async () => {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-test-${randomUUID()}` : join(tmpdir(), `gate-${randomUUID()}.sock`);
  const gate = new RequestGate({ limits: { p: { concurrency: 1 } } });
  const server = await serveGate({ endpoint, token: "secret", service: { gate } });
  const a = await connectGate({ endpoint, token: "secret" });
  const b = await connectGate({ endpoint, token: "secret" });
  try {
    const first = await a.request("acquire", { provider: "p", kind: "concurrency" });
    let acquireId;
    const pending = b.request("acquire", { provider: "p", kind: "concurrency" }, 2000, { onRequestId: id => { acquireId = id; } });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(gate.snapshot()[0].concurrencyQueue, 1);
    await b.request("cancel", { acquireId });
    await assert.rejects(pending);
    assert.equal(gate.snapshot()[0].concurrencyQueue, 0);
    await a.request("release", { leaseId: first.leaseId });
    const next = await b.request("acquire", { provider: "p", kind: "concurrency" });
    await b.request("release", { leaseId: next.leaseId });
  } finally { a.close(); b.close(); await server.close(); gate.close(); }
});
test("acquire RPC 超时只取消该笔排队，不影响同连接其他租约", async () => {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-test-${randomUUID()}` : join(tmpdir(), `gate-${randomUUID()}.sock`);
  const gate = new RequestGate({ limits: { p: { concurrency: 1 } } });
  const server = await serveGate({ endpoint, token: "secret", service: { gate } });
  let a, b;
  try {
    a = await connectGate({ endpoint, token: "secret" });
    b = await connectGate({ endpoint, token: "secret" });
    const first = await b.request("acquire", { provider: "p", kind: "concurrency" });
    await assert.rejects(b.request("acquire", { provider: "p", kind: "concurrency" }, 30), /超时/);
    for (let i = 0; i < 50 && gate.snapshot()[0].concurrencyQueue; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(gate.snapshot()[0].concurrencyQueue, 0);
    assert.equal(b.connected, true);
    assert.equal(gate.snapshot()[0].active, 1);
    const other = a.request("acquire", { provider: "p", kind: "concurrency" });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(gate.snapshot()[0].concurrencyQueue, 1);
    await b.request("release", { leaseId: first.leaseId });
    const next = await other;
    await a.request("release", { leaseId: next.leaseId });
    assert.equal(gate.snapshot()[0].active, 0);
  } finally { a?.close(); b?.close(); await server.close(); gate.close(); }
});
test("多条各自合规的帧可一次传输，超长单帧断开", async () => {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-test-${randomUUID()}` : join(tmpdir(), `gate-${randomUUID()}.sock`);
  const gate = new RequestGate();
  const server = await serveGate({ endpoint, token: "secret", service: { gate } });
  const socket = net.createConnection(endpoint);
  try {
    await new Promise(resolve => socket.once("connect", resolve));
    socket.setEncoding("utf8");
    let received = "";
    const responses = new Promise((resolve, reject) => {
      socket.on("data", chunk => { received += chunk; if (received.split("\n").length >= 4) resolve(received); });
      socket.once("error", reject);
      socket.once("close", () => reject(new Error("合法帧被拒绝")));
    });
    const frame = id => JSON.stringify({ id, token: "secret", method: "limits", filler: "x".repeat(32000) }) + "\n";
    socket.write(frame("a") + frame("b") + frame("c"));
    const lines = (await responses).trim().split("\n").map(JSON.parse);
    assert.deepEqual(lines.map(line => line.id), ["a", "b", "c"]);
    const closed = new Promise(resolve => socket.once("close", resolve));
    socket.write(frame("large").replace('"filler":"', '"filler":"' + "x".repeat(70000)));
    await closed;
  } finally { socket.destroy(); await server.close(); gate.close(); }
});
test("错误令牌不允许访问", async () => {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-test-${randomUUID()}` : join(tmpdir(), `gate-${randomUUID()}.sock`);
  const gate = new RequestGate(); const server = await serveGate({ endpoint, token: "secret", service: { gate } });
  const client = await connectGate({ endpoint, token: "wrong" });
  try { await assert.rejects(client.request("acquire", { provider: "p", kind: "concurrency" })); }
  finally { client.close(); await server.close(); gate.close(); }
});
