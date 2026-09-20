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

// 回归防守：后台装配的存在性检查读的是 Sessions 内部 items Map，替身实现（浏览器预览桩、
// 局部测试桩）没有这个字段。之前直接 sessions.items.has(id) 会在 setImmediate 里抛未捕获
// TypeError 整进程崩掉，连回执都已经发出去了，客户端只看到连接断开。
test("Sessions 替身缺少 items 时 session.attach 不崩进程", { timeout: 10000 }, async () => {
  const state = { sessionId: "preview", cwd: process.cwd(), title: "预览", status: "idle", messages: [], compactions: [], tasks: {}, config: {} };
  let loaded = 0;
  const sessions = {
    list: () => [{ id: state.sessionId, cwd: state.cwd, title: state.title, status: state.status, updatedAt: Date.now() }],
    get: () => state,
    ensureLoaded: async () => { loaded++; return state; },
    snapshot: () => state,
    subscribe: () => () => {},
    close: async () => {},
  };
  const app = createServerApp(sessions);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  let ws;
  const crashes = [];
  const onCrash = (error) => crashes.push(error);
  process.on("uncaughtException", onCrash);
  try {
    ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, ["axiom"]);
    await once(ws, "open");
    const reply = await new Promise((resolve) => {
      const listen = (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === "response" && msg.id === "attach") { ws.off("message", listen); resolve(msg); }
      };
      ws.on("message", listen);
      ws.send(JSON.stringify({ id: "attach", type: "session.attach", sessionId: state.sessionId }));
    });
    assert.equal(reply.ok, true);
    // setImmediate 里的后台装配跑完再断言：没有崩溃，且替身照旧被调用。
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(crashes.map((error) => error.message), []);
    assert.equal(loaded > 0, true, "缺 items 不阻止后台装配");
    assert.equal(ws.readyState, WebSocket.OPEN);
  } finally {
    process.off("uncaughtException", onCrash);
    ws?.terminate(); await app.close();
  }
});
