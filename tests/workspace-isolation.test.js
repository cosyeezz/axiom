import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { Sessions } from "../src/sessions.js";
import { createServerApp } from "../src/server.js";

test("parallel workspaces keep agents, subscriptions, cancellation and files isolated", { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-parallel-"));
  const agents = new Map();
  const factory = async (_tools, selection) => {
    let finish, listener;
    const agent = {
      subscribe(fn) { listener = fn; return () => {}; },
      prompt() { return new Promise((resolve) => { finish = resolve; }); },
      abort: async () => finish?.(), dispose() {}, result: () => "ok",
      emit: () => listener({ type: "agent.delta", data: { type: "text_delta", contentIndex: 0, delta: selection.cwd } }),
    };
    agents.set(selection.cwd, agent);
    return agent;
  };
  const sessions = new Sessions(factory);
  const app = createServerApp(sessions);
  const sockets = [];
  let sequence = 0;
  const request = (ws, type, data = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence);
    const receive = (raw) => {
      const message = JSON.parse(raw);
      if (message.type !== "response" || message.id !== id) return;
      ws.off("message", receive);
      message.ok ? resolve(message.data) : reject(new Error(message.error));
    };
    ws.on("message", receive);
    ws.send(JSON.stringify({ id, type, ...data }));
  });
  try {
    const paths = [join(root, "a"), join(root, "b")];
    for (const [i, path] of paths.entries()) { await mkdir(path); await writeFile(join(path, `${i}.txt`), String(i)); }
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    for (let i = 0; i < 2; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, ["axiom"]);
      sockets.push(ws); await once(ws, "open");
    }
    const states = await Promise.all(sockets.map((ws, i) => request(ws, "session.create", { cwd: paths[i] })));
    const events = [[], []];
    sockets.forEach((ws, i) => ws.on("message", (raw) => { const event = JSON.parse(raw); if (event.type !== "response") events[i].push(event); }));
    await Promise.all(sockets.map((ws, i) => request(ws, "prompt", { sessionId: states[i].sessionId, text: "run" })));
    assert.ok(states.every((s) => sessions.get(s.sessionId).status === "running"));
    for (const agent of agents.values()) agent.emit();
    await Promise.all(sockets.map((ws) => request(ws, "sessions.list")));
    events.forEach((received, i) => {
      assert.ok(received.some((e) => e.type === "agent.delta"));
      assert.ok(received.every((e) => e.sessionId === states[i].sessionId));
    });
    for (const [i, ws] of sockets.entries()) {
      const listing = await request(ws, "workspace.browse", { sessionId: states[i].sessionId, path: "" });
      assert.deepEqual(listing.entries.map((e) => e.name), [`${i}.txt`]);
      await assert.rejects(request(ws, "workspace.browse", { sessionId: states[i].sessionId, path: "../" }));
    }
    await request(sockets[0], "session.attach", { sessionId: states[1].sessionId });
    assert.ok(states.every((s) => sessions.get(s.sessionId).status === "running"), "attach does not cancel either workspace");
    await request(sockets[1], "cancel", { sessionId: states[1].sessionId });
    assert.equal(sessions.get(states[0].sessionId).status, "running");
    assert.equal(sessions.get(states[1].sessionId).status, "idle");
  } finally {
    sockets.forEach((ws) => ws.terminate());
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
