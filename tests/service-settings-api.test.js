import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createServerApp } from "../src/server.js";

test("authenticated remote service controls match local; maintenance credentials and CSP stay local-only", async () => {
  let restarts = 0, allowed = true;
  let operation = { ready: true, operation: "quick", operationId: "op-1", status: "running", phases: [] };
  let readFailure = false;
  const maintenance = { url: "http://127.0.0.1:54321", token: "private-token" };
  const app = createServerApp({ list: () => [], close: async () => {} }, {
    maintenance, sourceDir: "/private/source", instanceId: "new-instance", version: "1.2.3",
    restart: async () => { restarts++; return { operationId: "op-1", startedAt: 123 }; },
    getOperation: async () => { if (readFailure) throw new Error("private-token"); return operation; },
    checkUpdate: async () => ({ available: true, sha: "a".repeat(40) }),
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const remote = app.createRemoteServer(async () => allowed);
  remote.listen(0, "127.0.0.1");
  await once(remote, "listening");
  const sockets = [];
  try {
    for (const [server, local] of [[app.server, true], [remote, false]]) {
      const base = `http://127.0.0.1:${server.address().port}`;
      const page = await fetch(base);
      assert.equal(page.headers.get("content-security-policy").includes(maintenance.url), local);
      assert.equal((await page.text()).includes(maintenance.token), false);
      for (const file of ["thinking.js", "thinking-picker.js", "choice-column.js"]) {
        const asset = await fetch(`${base}/${file}`);
        assert.equal(asset.status, 200, file);
        assert.match(asset.headers.get("content-type"), /javascript/);
        assert.match(await asset.text(), /export /, "shared modules are served through production routing");
      }
      const ws = new WebSocket(base.replace("http:", "ws:") + "/ws", ["axiom"]);
      sockets.push(ws);
      await once(ws, "open");
      const request = async (type) => {
        const response = once(ws, "message");
        ws.send(JSON.stringify({ id: "test", type }));
        return JSON.parse((await response)[0]);
      };
      const { data } = await request("service.status");
      assert.equal(data.sourceDir, undefined);
      assert.equal(data.managed, true);
      assert.deepEqual(data.maintenance, local ? maintenance : undefined);
      assert.deepEqual(data.operation, operation);
      assert.equal((await request("service.update.check")).ok, true);
    }
    assert.equal(restarts, 0);
    // 远程与本地竞争同一维护锁；远程同一 tick 双发也只接受一次。
    const responses = [];
    const both = new Promise(resolve => {
      for (const ws of sockets) ws.on("message", raw => {
        const message = JSON.parse(raw);
        if (["first", "second", "local"].includes(message.id)) {
          responses.push(message);
          if (responses.length === 3) resolve();
        }
      });
    });
    for (const id of ["first", "second"]) sockets[1].send(JSON.stringify({ id, type: "service.restart", mode: "quick" }));
    // 收到远程 ACK 后再发本地请求，验证跨入口维护锁。
    await once(sockets[1], "message");
    sockets[0].send(JSON.stringify({ id: "local", type: "service.restart", mode: "quick" }));
    await both;
    assert.equal(restarts, 1);
    assert.equal(responses.filter(r => r.ok).length, 1);
    assert.equal(responses.find(r => r.ok).data.startedAt, 123);
    const remoteRequest = async (type) => {
      const response = once(sockets[1], "message");
      sockets[1].send(JSON.stringify({ id: "status", type }));
      return JSON.parse((await response)[0]);
    };
    assert.equal((await remoteRequest("service.status")).data.operation.status, "running");
    readFailure = true;
    const unavailable = await remoteRequest("service.status");
    assert.equal(unavailable.ok, true);
    assert.equal(unavailable.data.operation, undefined);
    assert.match(unavailable.data.operationError, /尚未确认/);
    assert.doesNotMatch(JSON.stringify(unavailable), /private-token|54321/);
    assert.equal((await remoteRequest("service.update.check")).ok, false, "状态读取失败不能解除维护锁");
    readFailure = false;
    for (const [server, local] of [[app.server, true], [remote, false]]) {
      const refreshed = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, ["axiom"]);
      sockets.push(refreshed);
      await once(refreshed, "open");
      const statusReply = once(refreshed, "message");
      refreshed.send(JSON.stringify({ id: "during-maintenance", type: "service.status" }));
      const status = JSON.parse((await statusReply)[0]);
      assert.equal(status.ok, true);
      assert.equal(status.data.operation.status, "running");
      assert.deepEqual(status.data.maintenance, local ? maintenance : undefined);
      const blockedReply = once(refreshed, "message");
      refreshed.send(JSON.stringify({ id: "still-locked", type: "service.update.check" }));
      assert.equal(JSON.parse((await blockedReply)[0]).ok, false);
    }
    operation = { ...operation, status: "failed", error: "修复准备失败" };
    app.resume(); // 模拟守护准备失败后恢复在线 worker。
    const failed = await remoteRequest("service.status");
    assert.equal(failed.data.operation.status, "failed");
    assert.equal(failed.data.operation.ready, true);
    assert.equal((await remoteRequest("service.update.check")).ok, true);
    const health = await fetch(`http://127.0.0.1:${app.server.address().port}/health`).then(r => r.json());
    assert.equal(health.instanceId, "new-instance");
    allowed = false;
    const closed = once(sockets[1], "close");
    sockets[1].send(JSON.stringify({ id: "revoked", type: "service.status" }));
    await closed; // 状态读取同样必须经过逐消息认证。
  } finally {
    sockets.forEach(ws => ws.terminate());
    await app.close();
  }
});
