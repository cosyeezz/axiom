import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";

// Exercise the real page handlers without a live model or an extra test framework.
test("page preserves drafts, recovers failed connections and paints tasks on demand", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const source = (
    await readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ).replace(/^import .*;\r?\n/gm, "");
  const dom = new JSDOM(html, {
    url: "http://localhost",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);
  const sockets = [];
  const frames = new Map();
  let frameId = 0;
  window.requestAnimationFrame = (fn) => {
    frames.set(++frameId, fn);
    return frameId;
  };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const paint = () => {
    const batch = [...frames.values()];
    frames.clear();
    for (const fn of batch) fn();
  };
  const media = { matches: true };
  window.matchMedia = () => media;
  window.renderMarkdown = (node, text) => {
    node.textContent = text;
  };
  window.createStreamRenderer = (render, after) =>
    createStreamRenderer(
      render,
      after,
      window.requestAnimationFrame,
      window.cancelAnimationFrame,
    );
  const config = { model: "test/model", thinking: "off", levels: ["off"] };
  const states = ["a", "b"].map((id) => ({
    sessionId: id,
    title: id,
    cwd: "C:\\work",
    status: "idle",
    config,
    messages: [],
    tasks: [],
    live: {},
  }));
  states[1].tasks = [
    { id: "history-child", task: "Historical task", status: "completed" },
  ];
  states[1].messages = [
    {
      agentId: "main",
      message: { role: "user", content: "historical prompt" },
    },
    {
      agentId: "history-child",
      message: { role: "assistant", content: "historical result" },
    },
  ];
  let failList = false;
  class Socket {
    static OPEN = 1;
    readyState = 0;
    constructor() {
      sockets.push(this);
    }
    open() {
      this.readyState = 1;
      this.onopen();
    }
    close() {
      this.readyState = 3;
      this.onclose();
    }
    receive(message) {
      this.onmessage({ data: JSON.stringify(message) });
    }
    send(raw) {
      const req = JSON.parse(raw);
      queueMicrotask(() => {
        let data;
        switch (req.type) {
          case "models.list":
            data = [
              { key: "test/model", provider: "test", name: "Model" },
              { key: "other/child", provider: "other", name: "Child" },
            ];
            break;
          case "session.configure":
            data = { ...config, subagentModel: req.subagentModel };
            states.find((s) => s.sessionId === req.sessionId).config = data;
            break;
          case "sessions.list":
            if (failList) {
              this.receive({
                type: "response",
                id: req.id,
                ok: false,
                error: "list unavailable",
              });
              return;
            }
            data = states.map((s) => ({
              id: s.sessionId,
              ...s,
              updatedAt: Date.now(),
            }));
            break;
          case "session.attach":
            data = states.find((s) => s.sessionId === req.sessionId);
            break;
          case "prompt":
            data = { runId: "run" };
            break;
        }
        this.receive({ type: "response", id: req.id, ok: true, data });
      });
    }
  }
  window.WebSocket = Socket;
  const settle = () => new Promise(setImmediate);
  const input = (text) => {
    $("prompt").value = text;
    $("prompt").dispatchEvent(new window.Event("input"));
  };
  try {
    window.eval(source);
    sockets[0].close(); // Close before open: retry must not remain hidden.
    await settle();
    assert.equal($("login").hidden, false);
    assert.equal($("send").disabled, true);
    $("connect").click();
    sockets[1].open();
    await settle();
    paint();
    assert.equal($("workspace").hidden, false);
    assert.equal($("send").disabled, true);
    assert.equal($("subagent-model").value, "");
    $("subagent-model").value = "other/child";
    $("subagent-model").dispatchEvent(new window.Event("change"));
    assert.equal($("subagent-model").disabled, true);
    await settle();
    assert.equal(states[0].config.subagentModel, "other/child");
    assert.equal($("model").value, "test/model");
    input("first draft\nsecond line");
    assert.equal($("send").disabled, false);
    window.document.querySelectorAll(".session-item")[1].click();
    await settle();
    paint();
    assert.equal(
      $("output").firstElementChild.className,
      "message user",
      "restored tasks follow their parent prompt",
    );
    assert.equal($("subagent-model").value, "");
    const historicalTask = window.document.querySelector(".task-card");
    assert.equal(historicalTask.querySelector(".markdown").textContent, "");
    historicalTask.open = true;
    historicalTask.dispatchEvent(new window.Event("toggle"));
    paint();
    assert.equal(
      historicalTask.querySelector(".markdown").textContent,
      "historical result",
    );
    input("other draft");
    window.document.querySelectorAll(".session-item")[0].click();
    await settle();
    paint();
    assert.equal($("prompt").value, "first draft\nsecond line");
    assert.equal($("subagent-model").value, "other/child");

    sockets[1].close();
    assert.equal($("workspace").hidden, false);
    assert.equal($("send").disabled, true);
    assert.equal($("subagent-model").disabled, true);
    input("edited offline");
    $("connect").click();
    sockets[2].open();
    await settle();
    paint();
    assert.equal($("prompt").value, "edited offline");
    assert.equal($("subagent-model").value, "other/child");
    input("  accepted task \n");
    failList = true;
    $("composer").requestSubmit();
    assert.equal($("subagent-model").disabled, true);
    await settle();
    assert.equal(
      $("prompt").value,
      "",
      "whitespace must not prevent clearing acknowledged draft",
    );
    assert.equal(
      window.document.querySelector(".message.user .markdown").textContent,
      "accepted task",
      "list refresh failure must not remove an accepted message",
    );
    failList = false;

    const emit = (type, data, extra = {}) =>
      sockets[2].receive({ type, sessionId: "a", data, ...extra });
    emit(
      "task.state",
      { task: "Inspect code", status: "running" },
      { taskId: "child" },
    );
    emit(
      "agent.message.start",
      { message: { role: "assistant", content: [] } },
      { agentId: "child" },
    );
    emit(
      "agent.delta",
      { type: "text_delta", delta: "full child result" },
      { agentId: "child" },
    );
    paint();
    const task = window.document.querySelector(".task-card");
    assert.equal(task.querySelector(".markdown").textContent, "");
    task.open = true;
    task.dispatchEvent(new window.Event("toggle"));
    paint();
    assert.equal(
      task.querySelector(".markdown").textContent,
      "full child result",
    );
    $("toggle-sidebar").click();
    assert.equal($("sidebar-backdrop").hidden, false);
    window.document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    assert.equal($("sidebar-backdrop").hidden, true);
    $("search").value = "missing";
    $("search").dispatchEvent(new window.Event("input"));
    assert.match($("sessions").textContent, /没有找到/);
  } finally {
    dom.window.close();
  }
});
