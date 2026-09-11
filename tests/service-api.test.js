import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createServerApp } from "../src/server.js";

test("service restart validates mode, rejects active work and duplicate requests", async () => {
  let status = "running";
  const modes = [];
  const app = createServerApp({ list: () => [{ status }], close: async () => {} }, {
    restart: async (mode) => modes.push(mode), error: "previous build failed",
  });
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
    assert.deepEqual((await request("service.status")).data, { managed: true, error: "previous build failed", version: "" });
    assert.equal((await request("service.restart", { mode: "shell" })).ok, false);
    assert.match((await request("service.restart", { mode: "quick" })).error, /正在运行/);
    assert.equal(modes.length, 0);
    status = "idle";
    assert.equal((await request("service.restart", { mode: "rebuild" })).ok, true);
    assert.deepEqual(modes, ["rebuild"]);
    assert.equal((await request("service.restart", { mode: "quick" })).ok, false);
    assert.equal(modes.length, 1);
  } finally { ws.terminate(); await app.close(); }
});
