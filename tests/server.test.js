import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { Sessions } from "../src/sessions.js";
import { createServerApp } from "../src/server.js";
import { command } from "../src/protocol.js";
import { CHUNK_PROTOCOL } from "../public/transport-framing.js";

test("negotiated ping skips maintenance IO, stays authorized while stopping and ports remain independent", async () => {
  let allowed = true, lookups = 0;
  const sessions = () => ({ list: () => [], close: async () => {} });
  const app = createServerApp(sessions(), { getOperation: async () => { lookups++; throw new Error("slow/private maintenance"); } });
  const other = createServerApp(sessions());
  const remote = app.createRemoteServer(async () => allowed);
  const servers = [app.server, other.server, remote];
  const sockets = [];
  try {
    for (const server of servers) { server.listen(0, "127.0.0.1"); await once(server, "listening"); }
    for (const server of servers) {
      const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, [CHUNK_PROTOCOL, "axiom"]);
      sockets.push(ws); await once(ws, "open"); assert.equal(ws.protocol, CHUNK_PROTOCOL);
    }
    const request = async (ws, type) => {
      const response = once(ws, "message"); ws.send(JSON.stringify({ id: "test", type }));
      return JSON.parse((await response)[0]);
    };
    app.prepareStop();
    for (const ws of sockets) {
      const result = await request(ws, "connection.ping");
      assert.equal(result.ok, true); assert.equal(result.data.alive, true);
      assert.match(result.data.connectionId, /^[a-f0-9-]{36}$/);
    }
    assert.equal(lookups, 0);
    const ids = await Promise.all(sockets.map(ws => request(ws, "connection.ping")));
    assert.equal(new Set(ids.map(x => x.data.connectionId)).size, 3);
    const closed = once(sockets[2], "close"); allowed = false;
    sockets[2].send(JSON.stringify({ id: "revoked", type: "connection.ping" })); await closed;
    assert.equal((await request(sockets[0], "connection.ping")).ok, true);
    assert.equal((await request(sockets[1], "connection.ping")).ok, true);
    assert.throws(() => command.parse({ id: "x", type: "connection.ping", extra: true }));
  } finally {
    for (const ws of sockets) ws.terminate();
    await app.close(); await other.close();
  }
});

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
    for (const path of ["/", "/app.js", "/transport-framing.js", "/todo.js", "/todo.css", "/style.css", "/file-picker.js", "/file-picker.css", "/memory-tags.js", "/answer-tags.js", "/markdown-scan.js", "/vendor/marked.js"]) {
      const first = await fetch(http + path);
      assert.equal(first.status, 200, `静态资源不可用：${path}`);
      if (path.endsWith(".js")) assert.match(first.headers.get("content-type"), /javascript/, path);
      assert.match(first.headers.get("cache-control"), /no-cache/);
      assert.match(
        first.headers.get("content-security-policy"),
        /frame-ancestors 'none'/,
      );
      const csp = first.headers.get("content-security-policy");
      assert.match(csp, /(?:^|; )worker-src 'self' blob:(?:;|$)/);
      assert.match(csp, /^default-src 'self';/);
      assert.doesNotMatch(csp, /(?:script-src|default-src)[^;]*blob:/);
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
    // 2026-09-17：Host 不再限 loopback（AXIOM_HOST 可绑内网/远程供桌面壳直连）；
    // 同源 Origin 或无 Origin 均放行，跨源 Origin 仍 401（上一断言）。
    const sameOrigin = new WebSocket(url, { origin: http });
    await once(sameOrigin, "open");
    sameOrigin.close();
    await once(sameOrigin, "close");
    const remoteHost = new WebSocket(url, { headers: { Host: "192.168.1.8:9000" }, origin: "http://192.168.1.8:9000" });
    await once(remoteHost, "open");
    remoteHost.close();
    await once(remoteHost, "close");
    ws = await connect();
    sessions.createAgent.capabilities = async () => Object.fromEntries(["skills", "mcp", "plugins"].map((kind) =>
      [kind, [{ id: "global", scope: "global" }, { id: "project", scope: "project" }]]));
    const globalCatalog = await request(ws, { id: "global-catalog", type: "capabilities.list" });
    const projectCatalog = await request(ws, { id: "project-catalog", type: "capabilities.list", cwd: process.cwd() });
    assert.equal(globalCatalog.ok, true);
    assert.equal(projectCatalog.ok, true);
    for (const kind of ["skills", "mcp", "plugins"]) {
      assert.deepEqual(globalCatalog.data[kind].map((entry) => entry.id), ["global"]);
      assert.deepEqual(projectCatalog.data[kind].map((entry) => entry.id), ["global", "project"]);
    }
    delete sessions.createAgent.capabilities;
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
    // session.duplicate：协议校验 + 分发（无存储实例拒绝并回传错误）。
    assert.throws(() => command.parse({ id: "dup-invalid", type: "session.duplicate" }));
    const dupRejected = await request(ws, { id: "dup-no-storage", type: "session.duplicate", sessionId });
    assert.equal(dupRejected.ok, false);
    assert.match(dupRejected.error, /未启用会话存储/);
    const dupUnknown = await request(ws, { id: "dup-unknown", type: "session.duplicate", sessionId: "missing-session" });
    assert.equal(dupUnknown.ok, false);
    assert.match(dupUnknown.error, /Unknown session/);
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
    const second = await sessions.create();
    const switched = await request(ws, { id: 'switch', type: 'session.attach', sessionId: second });
    assert.equal(switched.data.sessionId, second);
    assert.equal(switched.data.epoch, attached.data.epoch);
    assert.equal(sessions.get(sessionId).listeners.size, 0);
    assert.equal(sessions.get(second).listeners.size, 1);
    ws.close(); await once(ws, 'close');
    for (let i = 0; i < 100 && sessions.get(second).listeners.size; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(sessions.get(second).listeners.size, 0);
  } finally {
    ws?.terminate();
    await app.close();
  }
  assert.equal(disposed, true);
});
