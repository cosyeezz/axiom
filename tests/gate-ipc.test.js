import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
test("错误令牌不允许访问", async () => {
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-test-${randomUUID()}` : join(tmpdir(), `gate-${randomUUID()}.sock`);
  const gate = new RequestGate(); const server = await serveGate({ endpoint, token: "secret", service: { gate } });
  const client = await connectGate({ endpoint, token: "wrong" });
  try { await assert.rejects(client.request("acquire", { provider: "p", kind: "concurrency" })); }
  finally { client.close(); await server.close(); gate.close(); }
});
