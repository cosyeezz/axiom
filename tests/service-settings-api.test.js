import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createServerApp } from "../src/server.js";

test("maintenance credentials and CSP are local-only; update checks never restart", { timeout: 10000 }, async () => {
  let restarts = 0;
  const maintenance = { url: "http://127.0.0.1:54321", token: "private-token" };
  const app = createServerApp({ list: () => [], close: async () => {} }, {
    maintenance, sourceDir: "/private/source", instanceId: "new-instance", version: "1.2.3",
    restart: async () => { restarts++; },
    checkUpdate: async () => ({ available: true, sha: "a".repeat(40) }),
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const remote = app.createRemoteServer(async () => true);
  remote.listen(0, "127.0.0.1");
  await once(remote, "listening");
  const sockets = [];
  try {
    for (const [server, local] of [[app.server, true], [remote, false]]) {
      const base = `http://127.0.0.1:${server.address().port}`;
      const page = await fetch(base);
      assert.equal(page.headers.get("content-security-policy").includes(maintenance.url), local);
      assert.equal((await page.text()).includes(maintenance.token), false);
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
      assert.equal(data.managed, local);
      assert.deepEqual(data.maintenance, local ? maintenance : undefined);
      assert.equal((await request("service.update.check")).ok, local);
    }
    assert.equal(restarts, 0);
    // 同一 tick 双发：异步鉴权之后仍必须重新检查维护锁。
    const local = sockets[0];
    const responses = [];
    const both = new Promise(resolve => local.on("message", raw => {
      const message = JSON.parse(raw);
      if (["first", "second"].includes(message.id)) {
        responses.push(message);
        if (responses.length === 2) resolve();
      }
    }));
    for (const id of ["first", "second"]) local.send(JSON.stringify({ id, type: "service.restart", mode: "quick" }));
    await both;
    assert.equal(restarts, 1);
    assert.equal(responses.filter(r => r.ok).length, 1);
    const refreshed = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, ["axiom"]);
    sockets.push(refreshed);
    await once(refreshed, "open");
    const statusReply = once(refreshed, "message");
    refreshed.send(JSON.stringify({ id: "during-maintenance", type: "service.status" }));
    const status = JSON.parse((await statusReply)[0]);
    assert.equal(status.ok, true);
    assert.deepEqual(status.data.maintenance, maintenance); // 刷新页面仍能取得独立维护入口。
    const health = await fetch(`http://127.0.0.1:${app.server.address().port}/health`).then(r => r.json());
    assert.equal(health.instanceId, "new-instance");
  } finally {
    sockets.forEach(ws => ws.terminate());
    await app.close();
  }
});
