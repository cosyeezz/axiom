import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { Sessions } from "../src/sessions.js";
import { createServerApp } from "../src/server.js";

test("local connection without token, foreign origin rejection, recovery and shutdown", async () => {
  let finish,
    listener,
    disposed = false;
  const sessions = new Sessions(async () => ({
    subscribe: (fn) => {
      listener = fn;
      return () => {};
    },
    prompt: () => {
      listener({
        type: "agent.message.start",
        data: { message: { role: "assistant", content: [] } },
      });
      listener({
        type: "agent.delta",
        data: { type: "text_delta", contentIndex: 0, delta: "hello" },
      });
      return new Promise((r) => {
        finish = r;
      });
    },
    result: () => "hello",
    abort: async () => finish?.(),
    dispose: () => {
      disposed = true;
    },
  }));
  const app = createServerApp(sessions);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  const connect = async () => {
    const ws = new WebSocket(url, ["axiom"]);
    await once(ws, "open");
    return ws;
  };
  const request = (ws, value) =>
    new Promise((resolve) => {
      const listen = (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === "response" && msg.id === value.id) {
          ws.off("message", listen);
          resolve(msg);
        }
      };
      ws.on("message", listen);
      ws.send(JSON.stringify(value));
    });
  let ws;
  try {
    const bad = new WebSocket(url, { origin: "https://untrusted.example" });
    bad.on("error", () => {});
    const [req, res] = await once(bad, "unexpected-response");
    assert.equal(res.statusCode, 401);
    req.destroy();
    bad.terminate();
    ws = await connect();
    const created = await request(ws, { id: "1", type: "session.create" });
    assert.equal(created.ok, true);
    const sessionId = created.data.sessionId;
    assert.equal(
      (await request(ws, { id: "2", type: "prompt", sessionId, text: "go" }))
        .ok,
      true,
    );
    ws.close();
    await once(ws, "close");
    assert.equal(sessions.get(sessionId).status, "running");
    ws = await connect();
    const attached = await request(ws, {
      id: "3",
      type: "session.attach",
      sessionId,
    });
    assert.equal(attached.data.live.main.content[0].text, "hello");
    assert.equal(
      (await request(ws, { id: "4", type: "cancel", sessionId })).ok,
      true,
    );
    assert.equal(sessions.get(sessionId).status, "idle");
  } finally {
    ws?.terminate();
    await app.close();
  }
  assert.equal(disposed, true);
});
