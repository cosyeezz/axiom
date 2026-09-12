import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createServerApp } from "../src/server.js";

test("stop rejects foreign origins and busy sessions, accepts one managed shutdown", async () => {
  let status = 'running', stopped = 0;
  const app = createServerApp({ list: () => [{ status }], close: async () => {} }, {
    stop: () => stopped++, supervisorPid: process.pid,
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const url = `http://127.0.0.1:${app.server.address().port}/service/stop`;
  try {
    assert.equal((await fetch(url)).status, 403);
    assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(url, { method: 'POST' })).status, 409);
    assert.equal(stopped, 0);
    status = 'idle';
    const response = await fetch(url, { method: 'POST' });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { service: 'axiom', pid: process.pid });
    assert.equal(stopped, 1);
    assert.equal((await fetch(url, { method: 'POST' })).status, 409);
  } finally { await app.close(); }
});

test("service restart validates mode, rejects active work and duplicate requests", async () => {
  let status = "running";
  const modes = [];
  const service = {
    restart: async (mode) => modes.push(mode), error: "previous build failed", importDir: "C:\\pi\\sessions",
  };
  const app = createServerApp({ list: () => [{ status }], close: async () => {} }, service);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, ["axiom"]);
  await once(ws, "open");
  const request = async (type, extra = {}) => {
    const response = once(ws, "message");
    ws.send(JSON.stringify({ id: "test", type, ...extra }));
    return JSON.parse((await response)[0]);
  };
  try {
    assert.deepEqual((await request("service.status")).data, { managed: true, error: "previous build failed", version: "", importDir: "C:\\pi\\sessions", dev: false });
    service.dev = true;
    service.sourceDir = "/development/axiom";
    const devStatus = (await request("service.status")).data;
    assert.equal(devStatus.dev, true);
    assert.equal(devStatus.sourceDir, undefined);
    assert.equal((await request("service.update.check")).ok, false);
    assert.equal((await request("service.restart", { mode: "update", sha: "a".repeat(40) })).ok, false);
    assert.equal((await request("service.restart", { mode: "shell" })).ok, false);
    assert.match((await request("service.restart", { mode: "quick" })).error, /正在运行/);
    assert.equal(modes.length, 0);
    status = "idle";
    assert.equal((await request("service.restart", { mode: "rebuild" })).ok, true);
    assert.deepEqual(modes, ["rebuild"]);
    const duplicate = await request("service.restart", { mode: "quick" });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.id, "test", "维护中拒绝必须带回请求 ID，不能让前端一直等待");
    assert.equal(modes.length, 1);
    app.resume();
    service.dev = false;
    service.checkUpdate = async () => ({ available: true, sha: "a".repeat(40), local: "old", remote: "new" });
    assert.equal((await request("service.update.check")).data.sha, "a".repeat(40));
    assert.equal((await request("service.restart", { mode: "update" })).ok, false);
    assert.equal((await request("service.restart", { mode: "update", sha: "bad" })).ok, false);
    service.restart = async () => { throw new Error("supervisor unavailable"); };
    assert.equal((await request("service.restart", { mode: "quick" })).ok, false);
    assert.equal((await request("service.status")).ok, true);
  } finally { ws.terminate(); await app.close(); }
});

