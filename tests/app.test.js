import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
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
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
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
  const markdownSource = (await readFile(new URL("../public/markdown.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  const renderMarkdown = new Function("marked", "DOMPurify", `${markdownSource}; return renderMarkdown;`)(marked, createPurify(window));
  let renders = 0;
  window.renderMarkdown = (node, text) => {
    renders++;
    renderMarkdown(node, text);
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
    { id: "history-child", task: "Historical task", status: "completed", runtime: {
      model: "other/child", thinking: "high", systemPrompt: "Historical system prompt",
      usage: { input: 100, cacheRead: 800, cacheWrite: 100 },
      context: { tokens: 1200, contextWindow: 10000, percent: 12 },
    } },
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
  const requests = [];
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
      requests.push(req);
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
          case "session.rename":
            states.find((s) => s.sessionId === req.sessionId).title = req.title;
            break;
          case "queue.withdraw":
            data = { steering: ["撤回插话"], followUp: ["撤回追加"] };
            this.receive({ type: "session.queue", sessionId: req.sessionId, data: { steering: [], followUp: [] } });
            break;
          case "prompt":
            this.receive({ type: "agent.message.end", sessionId: req.sessionId, data: { message: { role: "user", content: req.text } } });
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
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(sockets.length, 2, "failed initial connection retries without refresh");
    $("connect").click();
    assert.equal(sockets.length, 2, "manual retry cannot create a concurrent socket");
    sockets[1].open();
    await settle();
    paint();
    assert.equal($("workspace").hidden, false);
    assert.equal($("send").disabled, true);
    assert.equal($("send").textContent, "Send");
    assert.equal(window.document.querySelector("header .menu"), null);
    window.document.querySelectorAll(".session-rename")[1].click();
    assert.equal($("session-name").value, "b");
    $("session-name").value = "Renamed other session";
    $("session-action-form").requestSubmit();
    await settle();
    assert.equal(requests.findLast((r) => r.type === "session.rename").sessionId, "b");
    assert.equal($("session-title").textContent, "a", "editing another row does not switch sessions");
    window.document.querySelectorAll(".session-delete")[1].click();
    assert.match($("session-action-description").textContent, /Renamed other session/);
    assert.equal($("session-action-submit").classList.contains("danger"), true);
    assert.equal(window.document.activeElement, $("session-action-cancel"));
    $("session-action-cancel").click();
    assert.match($("session-runtime").textContent, /缓存命中 暂无数据.*上下文 暂无数据.*test · model · off/);
    assert.equal($("thinking").selectedOptions[0].textContent, "off");
    assert.equal(window.runtimeSummary({ model: "zai-coding-cn/glm-5.3-flash", thinking: "max" })[2], "zai-coding-cn · glm-5.3-flash · max");
    assert.match(window.runtimeSummary({ usage: { input: 100, cacheRead: 0, cacheWrite: 0 } })[0], /0.0%/);
    assert.match(window.runtimeSummary({ usage: { input: 0, cacheRead: 0 } })[0], /暂无数据/);
    assert.match(window.runtimeSummary({ context: { tokens: null, contextWindow: 10000, percent: null } })[1], /— \/ 10,000 tokens · 待更新/);
    assert.equal($("session-runtime").previousElementSibling.className, "actions");
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
    assert.equal($("settings-session"), null);
    assert.equal($("active-capabilities"), null);
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
    assert.equal($("create-subagent-thinking").querySelector('option[value="max"]').textContent, "max");
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
    assert.equal($("defaults-preview").compareDocumentPosition($("defaults-editor")) & window.Node.DOCUMENT_POSITION_FOLLOWING, window.Node.DOCUMENT_POSITION_FOLLOWING);
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
    const historicalTrigger = window.document.querySelector(".task-card");
    const historicalTask = $(historicalTrigger.getAttribute("aria-controls"));
    assert.equal(historicalTrigger.tagName, "BUTTON");
    assert.equal(historicalTrigger.querySelector(".message"), null, "the main transcript only holds a subagent entry");
    assert.match(historicalTrigger.textContent, /SUBAGENT.*已完成/s);
    assert.equal($("task-overlays").contains(historicalTask), true);
    assert.equal(historicalTask.open, false);
    assert.equal(historicalTask.querySelector(".markdown").textContent, "");
    assert.match(historicalTask.querySelector(".runtime-summary").textContent, /80.0%.*1,200 \/ 10,000 tokens · 12.0%.*other · child · high/);
    assert.equal(historicalTask.querySelector(".task-top .runtime-summary")?.parentElement.nextElementSibling.className, "task-body");
    assert.equal(historicalTask.querySelector(".task-system-prompt pre").textContent, "Historical system prompt");
    assert.equal(historicalTask.querySelector(".task-description").textContent, "Historical task");
    assert.doesNotMatch($("session-runtime").textContent, /80.0%/, "child usage never leaks to the main agent");
    historicalTrigger.click();
    paint();
    assert.equal(historicalTask.open, true);
    assert.equal(historicalTask.querySelector(".markdown").textContent.trim(), "historical result");
    input("other draft");
    window.document.querySelectorAll(".session-item")[0].click();
    await settle();
    paint();
    assert.equal(historicalTask.open, false, "switching sessions closes the old overlay");
    assert.equal($("task-overlays").children.length, 0, "switching releases old task DOM");
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
    assert.equal($("create-submit").hidden, true);
    $("create-subagent-mode").value = "all";
    $("create-subagent-mode").dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.equal(defaults.subagentCapabilities, null, "change auto-saves through WebSocket without submit click");
    assert.match($("create-feedback").textContent, /已保存到本机/);
    assert.match($("defaults-preview").textContent, /Skills：skill-a/);
    assert.equal($("settings").open, true);
    assert.equal($("create-session").open, false);
    $("create-session").close();
    $("settings").close();
    input("  accepted task \n");
    failList = true;
    $("composer").requestSubmit();
    assert.equal($("subagent-model").disabled, false);
    await settle();
    assert.equal(
      $("prompt").value,
      "",
      "whitespace must not prevent clearing acknowledged draft",
    );
    assert.equal(
      window.document.querySelector(".message.user .markdown").textContent.trim(),
      "accepted task",
      "list refresh failure must not remove an accepted message",
    );
    failList = false;

    const emit = (type, data, extra = {}) =>
      sockets[2].receive({ type, sessionId: "a", data, ...extra });
    assert.equal($("status").textContent, "Running");
    assert.equal($("status").dataset.connected, "true");
    emit("session.queue", { steering: ["插话内容"], followUp: ["追加内容"] });
    assert.equal($("message-queue").children.length, 2);
    assert.match($("message-queue").textContent, /Steer.*Follow-up/);
    for (const [id, queueType] of [["send-steer", "steer"], ["send-followup", "followUp"]]) {
      input(`queued ${queueType}`);
      assert.equal($(id).hidden, false);
      assert.equal($(id).disabled, false);
      $(id).click();
      await settle();
      assert.equal(requests.findLast((r) => r.type === "prompt").queueType, queueType);
      assert.equal($("prompt").value, "");
      assert.equal($("status").textContent, "Running");
    }
    input("保留草稿");
    $("message-queue").querySelector("button").click();
    await settle();
    assert.equal($("prompt").value, "保留草稿\n\n撤回插话\n\n撤回追加");
    assert.equal($("message-queue").hidden, true);
    const cancels = requests.filter((r) => r.type === "cancel").length;
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    await new Promise((resolve) => setTimeout(resolve, 330));
    await settle();
    assert.equal(requests.filter((r) => r.type === "cancel").length, cancels, "single Esc only withdraws");
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    assert.equal(requests.filter((r) => r.type === "cancel").length, cancels + 1, "double Esc cancels");
    input("");
    emit(
      "task.state",
      { task: "Inspect code", status: "running" },
      { taskId: "child" },
    );
    const runtime = {
      model: "other/child", thinking: "high", systemPrompt: '<img src=x onerror="alert(1)">\nSystem instructions',
      usage: { input: 100, cacheRead: 800, cacheWrite: 100 },
      context: { tokens: 1200, contextWindow: 10000, percent: 12 },
    };
    emit("agent.runtime", runtime, { agentId: "child" });
    assert.match($("session-runtime").textContent, /暂无数据/);
    emit("agent.runtime", { ...runtime, model: "test/model" });
    assert.match($("session-runtime").textContent, /80.0%.*test · model · high/);
    emit("agent.runtime", { ...runtime, model: "unrelated/model" }, { sessionId: "b" });
    assert.doesNotMatch($("session-runtime").textContent, /unrelated/, "ignore events belonging to a different session");
    emit(
      "agent.message.start",
      { message: { role: "assistant", content: [] } },
      { agentId: "child" },
    );
    const beforeHidden = renders;
    const answer = "# Child result\n\n**bold**\n\n- item\n\n```js\nconst n = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n<img src=x onerror=alert(1)>";
    emit("agent.delta", { type: "text_delta", delta: answer }, { agentId: "child" });
    emit("agent.delta", { type: "thinking_delta", delta: "private thought" }, { agentId: "child" });
    paint();
    const trigger = window.document.querySelector(".task-card");
    const task = $(trigger.getAttribute("aria-controls"));
    assert.equal(renders, beforeHidden, "closed overlays skip Markdown parsing");
    assert.match(task.querySelector(".runtime-summary").textContent, /80.0%.*other · child/);
    assert.equal(trigger.querySelector(".runtime-summary"), null, "runtime information is pinned in the overlay, not duplicated in the transcript");
    assert.equal(task.querySelector(".task-system-prompt pre").textContent, runtime.systemPrompt);
    assert.equal(task.querySelector(".task-system-prompt img"), null, "system prompts are plain text, not executable markup");
    assert.equal(task.querySelector(".markdown").textContent, "");
    trigger.click();
    paint();
    assert.equal(task.open, true);
    const text = task.querySelector(".markdown");
    for (const selector of ["h1", "strong", "li", "pre code", "table"]) assert(text.querySelector(selector), selector);
    assert.equal(text.querySelector("img,[onerror]"), null);
    const thought = task.querySelector(".message details");
    assert.equal(thought.hidden, false);
    assert.equal(thought.querySelector("pre").textContent, "");
    thought.open = true;
    thought.dispatchEvent(new window.Event("toggle"));
    paint();
    assert.equal(thought.querySelector("pre").textContent, "private thought");
    const titleNode = text.querySelector("h1");
    emit("agent.delta", { type: "text_delta", delta: "\n\nnext paragraph" }, { agentId: "child" });
    paint();
    assert.match(text.textContent, /next paragraph/);
    assert.equal(text.querySelector("h1"), titleNode, "streamed subagent output reuses the main block renderer");
    const beforeEscape = requests.filter((req) => req.type === "cancel").length;
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(requests.filter((req) => req.type === "cancel").length, beforeEscape, "Escape in a task overlay must not cancel the running session");
    task.close(); // JSDOM has no native dialog Escape handling.
    paint();
    const beforeClosed = renders;
    const finalMessage = { role: "assistant", content: [{ type: "text", text: `${answer}\n\nfinal result` }, { type: "thinking", thinking: "final thought" }] };
    emit("agent.message.end", { message: finalMessage }, { agentId: "child" });
    paint();
    assert.equal(renders, beforeClosed, "final messages remain lazy while the overlay is closed");
    trigger.click();
    task.dispatchEvent(new window.Event("close")); // A delayed close event must not clear a reopened overlay.
    paint();
    assert.match(text.textContent, /final result/);
    assert.equal(text.querySelector("h1"), titleNode);
    assert.equal(thought.querySelector("pre").textContent, "final thought");
    emit("agent.message.end", { message: finalMessage });
    assert.equal($("output").querySelector(".message:not(.user) .markdown").innerHTML, text.innerHTML, "main and child messages have identical Markdown rendering");
    const body = task.querySelector(".task-body");
    Object.defineProperties(body, { scrollHeight: { value: 1200 }, clientHeight: { value: 300 } });
    window.scrollLatest();
    paint();
    assert.equal(body.scrollTop, 1200, "reopened overlays still follow new output");
    const topButton = task.querySelector('.task-top [data-scroll="top"]');
    const bottomButton = task.querySelector('.task-top [data-scroll="bottom"]');
    topButton.click();
    assert.equal(body.scrollTop, 0, "top navigation is pinned outside the scrolling body");
    window.scrollLatest();
    paint();
    assert.equal(body.scrollTop, 0, "jumping to the top pauses automatic following");
    bottomButton.click();
    assert.equal(body.scrollTop, 1200, "bottom navigation jumps to the latest content");
    body.scrollTop = 500;
    window.scrollLatest();
    paint();
    assert.equal(body.scrollTop, 1200, "jumping to the bottom resumes automatic following");
    body.scrollTop = 100;
    body.dispatchEvent(new window.Event("scroll"));
    emit("task.state", { task: "Inspect code", status: "failed", error: "Provider failed", runtime }, { taskId: "child" });
    paint();
    assert.equal(task.open, true, "updates preserve the open overlay");
    assert.equal(body.scrollTop, 100, "runtime updates do not pull readers back to the bottom");
    assert.equal(trigger.dataset.status, "failed");
    assert.equal(task.querySelector(".task-error").textContent, "Provider failed");
    assert.equal(task.querySelector(".task-error").hidden, false);
    emit("task.state", { task: "Second task", status: "running" }, { taskId: "sibling" });
    emit("agent.runtime", { model: "other/sibling", thinking: "low" }, { agentId: "sibling" });
    assert.equal(task.open, true, "new subagents never steal the active overlay");
    assert.doesNotMatch(task.textContent, /other · sibling/);
    const sibling = $("task-sibling");
    assert.equal(sibling.open, false);
    task.click();
    assert.equal(task.open, true, "clicking inside the overlay does not dismiss it");
    task.dispatchEvent(new window.MouseEvent("click", { clientX: -1, clientY: -1 }));
    assert.equal(task.open, false, "clicking the backdrop closes the overlay");
    window.document.querySelectorAll(".task-card")[1].click();
    paint();
    assert.equal(sibling.open, true);
    assert.match(sibling.querySelector(".runtime-summary").textContent, /other · sibling · low/);
    assert.doesNotMatch(sibling.textContent, /System instructions|final result/);
    window.document.querySelectorAll(".session-item")[1].click();
    await settle();
    assert.match($("session-runtime").textContent, /暂无数据/, "switching sessions clears previous usage");
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
