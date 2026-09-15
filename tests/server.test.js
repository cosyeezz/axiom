import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { Sessions } from "../src/sessions.js";
import { createServerApp } from "../src/server.js";
import { command } from "../src/protocol.js";

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
    const http = `http://127.0.0.1:${app.server.address().port}`;
    for (const path of ["/", "/app.js", "/style.css", "/file-picker.js", "/file-picker.css", "/memory-tags.js", "/answer-tags.js", "/goal-markers.js", "/markdown-scan.js", "/vendor/marked.js"]) {
      const first = await fetch(http + path);
      assert.equal(first.status, 200, `静态资源不可用：${path}`);
      if (path.endsWith(".js")) assert.match(first.headers.get("content-type"), /javascript/, path);
      assert.match(first.headers.get("cache-control"), /no-cache/);
      assert.match(
        first.headers.get("content-security-policy"),
        /frame-ancestors 'none'/,
      );
      const etag = first.headers.get("etag");
      assert(etag);
      assert((await first.text()).length > 0);
      const cached = await fetch(http + path, {
        headers: { "If-None-Match": etag },
      });
      assert.equal(cached.status, 304);
      assert.equal(await cached.text(), "");
      const changed = await fetch(http + path, {
        headers: { "If-None-Match": '"old"' },
      });
      assert.equal(changed.status, 200);
      await changed.arrayBuffer();
    }
    const bad = new WebSocket(url, { origin: "https://untrusted.example" });
    bad.on("error", () => {});
    const [req, res] = await once(bad, "unexpected-response");
    assert.equal(res.statusCode, 401);
    req.destroy();
    bad.terminate();
    ws = await connect();
    const empty = { skills: [], mcp: [], plugins: [] };
    const defaults = await request(ws, { id: "defaults-save", type: "session.defaults.configure", capabilities: empty });
    assert.equal(defaults.ok, true);
    assert.deepEqual(defaults.data.capabilities, empty);
    const created = await request(ws, { id: "1", type: "session.create" });
    assert.equal(created.ok, true);
    assert.deepEqual(created.data.config.capabilitySelection, empty);
    const sessionId = created.data.sessionId;
    const retryTask = sessions.retryTask;
    sessions.retryTask = async (id, taskId) => {
      assert.equal(id, sessionId);
      assert.equal(taskId, "child");
      return { taskId, accepted: true };
    };
    try {
      assert.throws(() => command.parse({ id: "task-retry-invalid", type: "task.retry", sessionId }));
      const retried = await request(ws, { id: "task-retry", type: "task.retry", sessionId, taskId: "child" });
      assert.equal(retried.ok, true);
      assert.deepEqual(retried.data, { taskId: "child", accepted: true });
    } finally { sessions.retryTask = retryTask; }
    assert.equal(
      (await request(ws, { id: "2", type: "prompt", sessionId, text: "go" }))
        .ok,
      true,
    );
    ws.close();
    await once(ws, "close");
    assert.equal(sessions.get(sessionId).status, "running");
    ws = await connect();
    const restored = await request(ws, { id: "defaults-get", type: "session.defaults.get" });
    assert.deepEqual(restored.data, defaults.data, "defaults survive client reconnects");
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
