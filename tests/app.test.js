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
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
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
  let lastCreation, lastDefaults;
  let defaults = { model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  let failDefaults = false, needsTrust = false;
  let failCreation = false;
  let failList = false;
  let failConfig = false;
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
          case "capabilities.list":
            data = { needsTrust, warnings: [], skills: [{ id: "skill-a", name: "Skill A" }, { id: "skill-b", name: "Skill B" }], mcp: [{ id: "browser", name: "Browser" }], plugins: [{ id: "search", name: "Search" }] };
            break;
          case "session.defaults.get":
            data = defaults;
            break;
          case "session.defaults.configure":
            lastDefaults = req;
            if (failDefaults) {
              this.receive({ type: "response", id: req.id, ok: false, error: "defaults unavailable" });
              return;
            }
            defaults = Object.fromEntries(Object.keys(defaults).map((key) => [key, req[key]]));
            data = defaults;
            break;
          case "session.create":
            lastCreation = req;
            if (failCreation) {
              this.receive({ type: "response", id: req.id, ok: false, error: "plugin unavailable" });
              return;
            }
            const selected = { ...(req.useDefaults === false ? {} : defaults), ...req };
            data = { ...states[0], config: { ...config, model: selected.model || config.model, subagentModel: selected.subagentModel ?? null, capabilitySelection: selected.capabilities ?? null, subagentCapabilities: selected.subagentCapabilities ?? null } };
            break;
          case "models.list":
            data = [
              { key: "test/model", provider: "test", name: "Model" },
              { key: "other/child", provider: "other", name: "Child" },
            ];
            break;
          case "session.configure":
            if (failConfig) {
              this.receive({ type: "response", id: req.id, ok: false, error: "configuration unavailable" });
              return;
            }
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
    assert.equal($("subagent-model").disabled, true);
    assert.equal($("composer").contains($("subagent-model")), false);
    assert.equal($("new").textContent.trim(), "＋ 新会话");
    for (const [id, name] of [
      ["C:\\Users\\user\\skills\\ponytail\\SKILL.md", "ponytail"],
      ["/home/user/node_modules/pi-web-access/index.ts", "pi-web-access"],
      ["C:\\node_modules\\@scope\\plugin\\pi-extension\\index.js", "@scope/plugin"],
      ["/home/user/extensions/local/index.ts", "local"],
      ["/home/user/extensions/search.ts", "search.ts"],
      ["playwright", "playwright"],
    ]) assert.equal(window.capabilityName(id), name);
    $("open-settings").click();
    assert.equal($("settings").open, true);
    assert.equal($("settings-session").textContent, "a");
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal($("sidebar-backdrop").hidden, true, "settings Escape must not toggle sidebar");
    $("subagent-provider").value = "other";
    $("subagent-provider").dispatchEvent(new window.Event("change"));
    assert.equal($("subagent-model").disabled, true);
    await settle();
    assert.equal(states[0].config.subagentModel, "other/child");
    assert.equal($("model").value, "test/model");
    assert.equal($("subagent-model").options.length, 1);
    assert.equal($("subagent-model").disabled, false);
    failConfig = true;
    $("subagent-provider").value = "";
    $("subagent-provider").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal($("subagent-provider").value, "other");
    assert.match($("settings-feedback").textContent, /保存失败/);
    failConfig = false;
    $("subagent-provider").value = "";
    $("subagent-provider").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(states[0].config.subagentModel, null);
    assert.equal($("subagent-model").disabled, true);
    $("subagent-provider").value = "other";
    $("subagent-provider").dispatchEvent(new window.Event("change"));
    await settle();
    await settle();
    assert.equal($("defaults-editor").contains($("create-form")), true);
    assert.equal($("create-session").open, false);
    assert.equal($("create-title").textContent, "默认新会话配置");
    assert.equal($("create-submit").textContent, "保存默认配置");
    assert.equal($("create-main-provider").value, "", "defaults do not take the current model implicitly");
    assert.equal($("create-trust-row").hidden, true);
    assert.equal(window.document.querySelectorAll('.settings-nav button').length, 1);
    assert.equal($("create-subagent-mode").querySelector('option[value="inherit"]').textContent, "跟随主代理能力");
    $("create-main-thinking").value = "high";
    $("create-subagent-thinking").value = "off";
    $("create-main-provider").value = "other";
    $("create-main-provider").dispatchEvent(new window.Event("change"));
    $("create-main-mode").value = "custom";
    $("create-main-mode").dispatchEvent(new window.Event("change"));
    window.document.querySelectorAll('.capability-agent:first-child input[data-kind="skills"]')[1].checked = false;
    $("create-subagent-mode").value = "custom";
    $("create-subagent-mode").dispatchEvent(new window.Event("change"));
    for (const checkbox of window.document.querySelectorAll('.capability-agent:last-child input')) checkbox.checked = false;
    failDefaults = true;
    $("create-form").requestSubmit();
    await settle();
    assert.equal($("create-session").open, false);
    assert.match($("create-feedback").textContent, /保存失败.*defaults unavailable/);
    assert.equal(defaults.capabilities, null);
    assert.equal($("create-submit").disabled, false);
    failDefaults = false;
    $("create-form").requestSubmit();
    await settle();
    assert.equal($("create-session").open, false);
    assert.equal($("settings").open, true);
    assert.equal(lastCreation, undefined, "saving defaults never creates or switches sessions");
    assert.equal(defaults.model, "other/child");
    assert.equal(defaults.thinking, "high");
    assert.equal(defaults.subagentThinking, "off");
    assert.deepEqual(defaults.capabilities.skills, ["skill-a"]);
    assert.deepEqual(defaults.subagentCapabilities, { skills: [], mcp: [], plugins: [] });
    assert.equal(Object.hasOwn(lastDefaults, "trustProject"), false);
    assert.equal($("model").value, "test/model");
    assert.equal($("subagent-model").value, "other/child");
    needsTrust = true;
    defaults.capabilities.skills.push("missing-skill");
    $("settings").close();
    $("open-settings").click();
    await settle();
    assert.equal($("create-main-model").value, "other/child");
    assert.equal($("create-main-mode").value, "custom");
    assert.equal(window.document.querySelectorAll('.capability-agent:first-child input[data-kind="skills"]:checked').length, 2);
    assert.match($("create-agents").textContent, /当前目录不可用 · missing-skill/, "unavailable defaults are not silently removed");
    assert.equal(window.document.querySelectorAll('.capability-agent:last-child input:checked').length, 0);
    assert.equal($("create-trust-row").hidden, true);
    assert.equal($("create-submit").disabled, false, "defaults may save trusted global capabilities");
    needsTrust = false;
    defaults.capabilities.skills.pop();
    $("create-session").close();
    $("settings").close();
    $("new").click();
    await settle();
    assert.equal($("model").value, "other/child");
    assert.equal(Object.hasOwn(lastCreation, "capabilities"), false, "ordinary creation resolves defaults on the server");
    assert.match($("active-capabilities").textContent, /Skills：无\nMCP：无\nExtensions：无/);
    window.document.querySelectorAll(".session-item")[0].click();
    await settle();
    $("custom-new").click();
    await settle();
    assert.equal($("create-session").open, true);
    assert.equal($("create-title").textContent, "自定义新会话");
    assert.equal($("create-submit").textContent, "创建会话");
    assert.equal($("create-main-model").value, "test/model", "custom creation keeps current model instead of new defaults");
    assert.equal($("create-main-mode").value, "all");
    assert.equal($("create-subagent-mode").value, "all");
    $("create-main-mode").value = "custom";
    $("create-main-mode").dispatchEvent(new window.Event("change"));
    const checkboxes = window.document.querySelectorAll('.capability-agent:first-child input[data-kind="skills"]');
    checkboxes[1].checked = false;
    checkboxes[1].dispatchEvent(new window.Event("change"));
    $("create-subagent-provider").value = "other";
    $("create-subagent-provider").dispatchEvent(new window.Event("change"));
    failCreation = true;
    $("create-form").requestSubmit();
    await settle();
    assert.equal($("create-session").open, true);
    assert.match($("create-feedback").textContent, /plugin unavailable/);
    assert.deepEqual(lastCreation.capabilities.skills, ["skill-a"]);
    assert.equal(lastCreation.subagentCapabilities, null);
    assert.equal(lastCreation.subagentModel, "other/child");
    assert.equal(lastCreation.useDefaults, false);
    assert.equal($("create-submit").disabled, false);
    failCreation = false;
    $("create-session").close();
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
    $("open-settings").click();
    await settle();
    assert.equal($("create-main-mode").value, "custom", "reconnection retrieves saved defaults");
    assert.equal($("create-main-model").value, "other/child");
    $("create-subagent-mode").value = "inherit";
    $("create-subagent-mode").dispatchEvent(new window.Event("change"));
    $("create-form").requestSubmit();
    await settle();
    assert.equal(defaults.subagentCapabilities, "inherit");
    assert.equal($("settings").open, true);
    assert.equal($("create-session").open, false);
    $("create-session").close();
    $("settings").close();
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
