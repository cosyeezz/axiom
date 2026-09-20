import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { Sessions } from "../src/sessions.js";
import { createServerApp } from "../src/server.js";

test("create responds during slow startup, prompt waits, empty draft does not persist", { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-background-server-"));
  let release, started, prompted;
  const gate = new Promise(resolve => { release = resolve; });
  const starting = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const factory = async () => {
    calls++; started(); await gate;
    let listener;
    return {
      config: () => ({ model: "test/one", thinking: "off" }),
      subscribe: fn => { listener = fn; return () => {}; },
      prompt: async text => { prompted = text; listener({ type: "agent.message.end", data: { message: { role: "user", content: text } } }); },
      abort: async () => {}, result: () => "ok", dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "test/one" }];
  const sessions = new Sessions(factory, undefined, join(root, "sessions"));
  const app = createServerApp(sessions);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  let ws;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, ["axiom"]);
    await once(ws, "open");
    const request = value => new Promise(resolve => {
      const listen = raw => {
        const msg = JSON.parse(raw);
        if (msg.type === "response" && msg.id === value.id) { ws.off("message", listen); resolve(msg); }
      };
      ws.on("message", listen); ws.send(JSON.stringify(value));
    });
    const created = await request({ id: "create", type: "session.create", cwd: root });
    assert.equal(created.ok, true);
    const id = created.data.sessionId;
    await starting;
    assert.equal(sessions.get(id).loaded, false);
    assert.equal(sessions.store.hasSession(id), false);
    let answered = false;
    const sending = request({ id: "send", type: "prompt", sessionId: id, text: "hello" }).then(reply => { answered = true; return reply; });
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(answered, false); assert.equal(prompted, undefined);
    release();
    assert.equal((await sending).ok, true);
    await sessions.get(id).work;
    assert.equal(prompted, "hello");
    assert.equal(calls, 1);
    assert.equal(sessions.store.hasSession(id), true);
    const idle = await request({ id: "idle", type: "session.create", cwd: root });
    await sessions.ensureLoaded(idle.data.sessionId);
    assert.equal(sessions.store.hasSession(idle.data.sessionId), false);
  } finally {
    release(); ws?.terminate(); await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
