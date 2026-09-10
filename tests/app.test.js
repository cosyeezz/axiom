import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";

const pickerSource = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");

test("header path icons do not inherit the global button minimum height", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/style.css", import.meta.url), "utf8");
  const dom = new JSDOM(html);
  try {
    const style = dom.window.document.createElement("style");
    style.textContent = css;
    dom.window.document.head.append(style);
    const computed = (selector) => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    assert.equal(computed(".header-title").gap, "2px");
    assert.equal(computed(".header-title h1").lineHeight, "20px");
    for (const id of ["copy-workspace", "reveal-workspace"]) {
      assert.equal(computed(`#${id}`).height, "24px");
      assert.equal(computed(`#${id}`).minHeight, "24px");
    }
  } finally { dom.window.close(); }
});

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
  const config = { model: "test/model", thinking: "off", levels: ["off"], skills: [
    { name: "codebase-map", description: "代码导航" }, { name: "ponytail", description: "最小实现" },
  ] };
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
  let lastCreation, lastDefaults, copiedPath;
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (text) => { copiedPath = text; } } });
  let defaults = { model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  let failDefaults = false, needsTrust = false;
  let withdrawnImages;
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
          case "files.browse":
            data = { path: req.sessionId ? req.path : "C:\\other", parent: req.path ? "" : null,
              entries: req.sessionId ? (req.path ? [{ name: "app.js", path: "src/app.js", directory: false }] : [{ name: "src", path: "src", directory: true }]) : [],
              nextOffset: null, breadcrumbs: [], locations: [] };
            break;
          case "workspace.reveal": data = { opened: true }; break;
          case "workspace.browse":
            data = { path: req.path, entries: req.path ? [{ name: "app.js", path: "src/app.js", directory: false }] : [{ name: "src", path: "src", directory: true }] };
            break;
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
          case "service.status":
            data = { managed: true, error: "" };
            break;
          case "service.restart":
            this.receive({ type: "response", id: req.id, ok: false, error: "请先停止正在运行的会话" });
            return;
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
            data = { steering: ["撤回插话"], followUp: ["撤回追加"], ...(withdrawnImages ? { images: withdrawnImages } : {}) };
            this.receive({ type: "session.queue", sessionId: req.sessionId, data: { steering: [], followUp: [] } });
            break;
          case "prompt":
            this.receive({ type: "agent.message.end", sessionId: req.sessionId, data: { message: { role: "user", content: [{ type: "text", text: req.text }, ...(req.images || [])] } } });
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
    window.eval(`${pickerSource}\n${source}`);
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
    const firstActions = $("sessions").querySelector(".session-actions");
    assert.equal($("sessions").querySelector(".session-group").textContent, "待处理");
    assert.equal(firstActions.children[0].title, "完成并隐藏");
    assert.equal(firstActions.children[1].className, "session-rename");
    assert.equal(firstActions.children[0].querySelector("path").getAttribute("d"), "M5 12l4 4L19 6");
    const beforeHide = requests.length;
    const drag = (row, target) => {
      const dataTransfer = { setData() {} };
      row.ondragstart({ dataTransfer });
      const over = new window.Event("dragover", { cancelable: true });
      Object.defineProperty(over, "dataTransfer", { value: dataTransfer });
      target.dispatchEvent(over);
      assert.equal(over.defaultPrevented, true);
      assert.equal(target.classList.contains("session-drop-target"), true);
      target.dispatchEvent(new window.Event("drop", { cancelable: true }));
      row.ondragend();
      assert.equal(target.classList.contains("session-drop-target"), false);
    };
    drag($("sessions").querySelector(".session-row"), $("hidden-session-area"));
    assert.equal($("hidden-session-area").open, false, "hidden area stays collapsed");
    assert.equal($("sessions").querySelectorAll(".session-row").length, 1);
    assert.equal($("hidden-sessions").querySelector(".session-item span").textContent, "a");
    assert.deepEqual(JSON.parse(window.localStorage.getItem("axiom.hiddenSessions")), ["a"]);
    assert.equal($("session-title").textContent, "a", "hiding does not switch the active conversation");
    window.eval("renderSessions() ");
    assert.equal($("hidden-sessions").querySelectorAll(".session-row").length, 1, "refresh preserves hiding");
    $("search").value = "b";
    $("search").oninput();
    assert.equal($("hidden-sessions").childNodes.length, 0);
    $("search").value = "";
    $("search").oninput();
    $("hidden-session-area").open = true;
    drag($("hidden-sessions").querySelector(".session-row"), $("sessions"));
    $("sessions").querySelector(".session-hide").click();
    $("hidden-sessions").querySelector(".session-hide").click();
    assert.deepEqual(JSON.parse(window.localStorage.getItem("axiom.hiddenSessions")), []);
    assert.equal($("sessions").querySelectorAll(".session-row").length, 2);
    assert.equal(requests.length, beforeHide, "hiding/restoring never deletes or cancels sessions");
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
    assert.equal($("composer-skill").disabled, false);
    assert.equal($("composer-skill").options[1].title, "代码导航");
    assert.equal($("composer-skill").hidden, true);
    assert.equal($("stop").textContent.trim(), "Stop ■");
    $("copy-workspace").click(); await settle();
    assert.equal(copiedPath, "C:\\work");
    $("reveal-workspace").click(); await settle();
    assert.equal(requests.findLast((req) => req.type === "workspace.reveal").sessionId, "a");
    $("open-workspace").click(); await settle();
    assert.equal($("file-picker").open, true);
    $("file-picker-confirm").click(); await settle();
    assert.equal($("open-workspace").disabled, false);
    assert.equal(requests.findLast((req) => req.type === "session.create").cwd, "C:\\other");
    lastCreation = undefined;
    window.document.querySelector('[data-context="skill"]').click();
    assert.equal($("context-picker").open, true);
    $("context-search").value = "代码导航";
    $("context-search").dispatchEvent(new window.Event("input"));
    assert.equal($("context-results").children.length, 1);
    $("context-results").firstChild.click();
    assert.match($("context-chips").textContent, /codebase-map/);
    $("context-chips").firstChild.click();
    assert.equal($("prompt").value, "");
    window.document.querySelector('[data-context="file"]').click();
    await settle();
    $("file-picker-results").querySelector("button").click();
    await settle();
    $("file-picker-results").querySelector("button").click();
    $("file-picker-confirm").click(); await settle();
    assert.match($("context-chips").textContent, /src\/app.js/);
    input("参考文件");
    $("composer").requestSubmit(); await settle();
    assert.match(requests.findLast((req) => req.type === "prompt").text, /文件："src\/app.js"/);
    assert.equal($("context-chips").children.length, 0);
    const completionKey = (key) => $("prompt").dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    input("/pony");
    assert.match($("prompt-completion").textContent, /ponytail/);
    const beforeCompletion = requests.filter((req) => req.type === "prompt").length;
    completionKey("Enter");
    assert.equal($("prompt").value, "");
    assert.match($("context-chips").textContent, /ponytail/);
    assert.equal(requests.filter((req) => req.type === "prompt").length, beforeCompletion, "completion Enter never sends");
    $("context-chips").firstChild.click();
    input("/"); completionKey("ArrowDown"); completionKey("Tab");
    assert.match($("context-chips").textContent, /ponytail/);
    $("context-chips").firstChild.click();
    input("user@example.com");
    assert.equal($("prompt-completion").hidden, true);
    input("https://example.com");
    assert.equal($("prompt-completion").hidden, true);
    input("@"); await settle();
    assert.match($("prompt-completion").textContent, /文件夹：src/);
    completionKey("Enter");
    assert.equal($("prompt").required, false, "folder-only reference can submit");
    $("composer").requestSubmit(); await settle();
    assert.match(requests.findLast((req) => req.type === "prompt").text, /文件夹："src"/);
    input("参考 @sr"); await settle(); completionKey("ArrowRight"); await settle();
    assert.equal($("prompt").value, '参考 @"src/');
    assert.match($("prompt-completion").textContent, /文件：src\/app.js/);
    completionKey("Tab");
    assert.equal($("prompt").value, "参考 ");
    assert.match($("context-chips").textContent, /src\/app.js/);
    input("@src/app"); await settle(); completionKey("Enter");
    assert.equal($("context-chips").children.length, 1, "references deduplicate");
    $("context-chips").firstChild.click();
    input("@src/app"); input("普通正文"); await settle();
    assert.equal($("prompt-completion").hidden, true, "late browse replies cannot reopen completion");
    input("/"); completionKey("Escape");
    assert.equal($("prompt-completion").hidden, true);
    input("");
    const skillCard = window.card("你");
    window.renderMessage(skillCard, { role: "user", content: '<skill name="codebase-map" location="/skills/SKILL.md">\n# Skill body\n</skill>\n\n检查项目' });
    assert.equal(skillCard.node.previousElementSibling, skillCard.skillBlocks);
    assert.equal(skillCard.skillBlocks.parentElement, $("output"));
    assert.equal(skillCard.node.querySelector(".skill-invocation"), null);
    assert.equal(skillCard.skillBlocks.querySelector("summary").textContent, "[skill] codebase-map");
    const invocation = skillCard.skillBlocks.querySelector(".skill-invocation");
    assert.equal(invocation.open, false);
    assert.equal(skillCard.buffer, "检查项目");
    invocation.open = true;
    invocation.ontoggle();
    assert.match(skillCard.skillBlocks.textContent, /Skill body/);
    const previousSkills = skillCard.skillBlocks;
    window.renderMessage(skillCard, { role: "user", content: '<skill name="only" location="/skills/SKILL.md">\nbody\n</skill>' });
    assert.equal(previousSkills.isConnected, false);
    assert.equal(skillCard.node.hidden, true);
    assert.equal(skillCard.skillBlocks.isConnected, true);
    window.renderMessage(skillCard, { role: "user", content: "普通消息" });
    assert.equal(skillCard.node.hidden, false);
    assert.equal(skillCard.skillBlocks.isConnected, false);
    skillCard.node.remove();
    input("检查代码");
    $("composer-skill").value = "codebase-map";
    $("composer-skill").dispatchEvent(new window.Event("change"));
    assert.equal($("prompt").value, "检查代码");
    assert.match($("context-chips").textContent, /codebase-map/);
    $("composer-skill").value = "ponytail";
    $("composer-skill").dispatchEvent(new window.Event("change"));
    assert.equal($("prompt").value, "检查代码");
    assert.match($("context-chips").textContent, /ponytail/);
    $("composer-skill").value = "";
    $("composer-skill").dispatchEvent(new window.Event("change"));
    assert.equal($("prompt").value, "检查代码");
    input("/skill:codebase-map 检查代码");
    assert.equal($("composer-skill").value, "codebase-map");
    assert.equal($("prompt").value, "检查代码");
    $("composer").requestSubmit();
    await settle();
    assert.equal(requests.findLast((req) => req.type === "prompt").text, "/skill:codebase-map 检查代码");
    assert.equal($("composer-skill").value, "");
    sockets[1].receive({ type: "session.status", sessionId: "a", data: { status: "idle" } });
    input("");
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
    assert.equal($("status").textContent, "已连接");
    assert.equal($("restart-quick").disabled, false);
    assert.equal($("restart-rebuild").disabled, false);
    const restartRequests = () => requests.filter((r) => r.type === "service.restart");
    window.confirm = () => { throw new Error("must use styled dialog"); };
    for (const mode of ["quick", "rebuild"]) {
      const before = restartRequests().length;
      $(`restart-${mode}`).click();
      assert.equal($("restart-dialog").open, true);
      assert.equal(window.document.activeElement, $("restart-cancel"));
      assert.match($("restart-description").textContent, mode === "quick" ? /不安装依赖/ : /数分钟/);
      assert.equal(restartRequests().length, before);
      $("restart-cancel").click();
      assert.equal($("restart-dialog").open, false);
      $("restart-form").requestSubmit();
      assert.equal(restartRequests().length, before);
      $(`restart-${mode}`).click();
      $("restart-dialog").close(); // Native Escape closes without submitting.
      assert.equal(restartRequests().length, before);
      $(`restart-${mode}`).click();
      $("restart-form").requestSubmit();
      $("restart-form").requestSubmit();
      assert.equal($("restart-dialog").open, false);
      assert.equal(restartRequests().length, before + 1);
      assert.equal(restartRequests().at(-1).mode, mode);
      await settle();
      assert.match($("service-feedback").textContent, /请先停止/);
      assert.equal($(`restart-${mode}`).disabled, false);
    }
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
      assert.equal($("status").textContent, "已连接");
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
    assert.equal($("capture-screen"), null, "screen capture has been removed");
    const png = new window.File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], "screen.png", { type: "image/png" });
    input("");
    await window.eval("loadImages")([png]);
    assert.equal($("image-attachments").querySelectorAll("img").length, 1);
    assert.equal($("prompt").required, false, "image-only prompts can submit");
    const attachment = $("image-attachments").querySelector("img");
    attachment.click();
    assert.equal($("image-preview").open, true);
    assert.equal($("image-preview-image").src, attachment.src);
    $("image-preview-image").click();
    assert.equal($("image-preview").open, true, "image clicks do not dismiss preview");
    $("image-preview-close").click();
    assert.equal($("image-preview").open, false);
    assert.equal($("image-preview-image").hasAttribute("src"), false);
    assert.equal(attachment.tabIndex, 0);
    for (const key of ["Enter", " "]) {
      attachment.dispatchEvent(new window.KeyboardEvent("keydown", { key, cancelable: true }));
      assert.equal($("image-preview").open, true, "keyboard opens preview");
      $("image-preview").click();
      assert.equal($("image-preview").open, false, "backdrop closes preview");
    }
    window.document.querySelectorAll(".session-item")[0].click();
    await settle();
    assert.equal($("image-attachments").hidden, true, "images are isolated by session");
    window.document.querySelectorAll(".session-item")[1].click();
    await settle();
    assert.equal($("image-attachments").querySelectorAll("img").length, 1, "switching back restores attachments");
    $("composer").requestSubmit();
    await settle();
    assert.equal(requests.findLast((req) => req.type === "prompt").images[0].mimeType, "image/png");
    assert.equal(requests.findLast((req) => req.type === "prompt").text, "");
    assert.equal($("image-attachments").hidden, true);
    assert.equal($("output").querySelectorAll(".message-images img").length, 1);
    const sentImage = $("output").querySelector(".message-images img");
    sentImage.click();
    assert.equal($("image-preview").open, true, "sent images also support preview");
    assert.equal($("image-preview-image").src, sentImage.src);
    $("image-preview").close(); // Native Escape closes dialogs; JSDOM does not implement it.
    assert.equal($("image-preview-image").hasAttribute("src"), false);
    let prevented = false;
    $("prompt").onpaste({ clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => png }] }, preventDefault() { prevented = true; } });
    for (let i = 0; i < 100 && !$("image-attachments").children.length; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(prevented, true);
    assert.equal($("image-attachments").children.length, 1);
    $("image-attachments").querySelector("button").click();
    assert.equal($("image-attachments").hidden, true);
    await window.eval("loadImages")([new window.File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })]);
    assert.match($("error").textContent, /仅支持/);
    assert.equal($("image-attachments").hidden, true);
    await window.eval("loadImages")([png, png, png, png, png]);
    assert.match($("error").textContent, /最多/);
    assert.equal($("image-attachments").hidden, true);
    const queuedImage = { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" };
    withdrawnImages = { steering: [[queuedImage]], followUp: [null] };
    window.eval("renderQueue")({ steering: [""], followUp: [], images: withdrawnImages });
    assert.match($("message-queue").textContent, /图片 × 1/);
    await window.eval("withdrawQueue")();
    assert.equal($("image-attachments").querySelectorAll("img").length, 1, "withdrawing restores images, not just text");
    $("search").value = "missing";
    $("search").dispatchEvent(new window.Event("input"));
    assert.match($("sessions").textContent, /没有找到/);
  } finally {
    dom.window.close();
  }
});

// Compaction: per-scope settings, in-place folding, dedupe and snapshot restore.
test("compaction settings edit per scope and fold transcripts in place", async () => {
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
  window.matchMedia = () => ({ matches: true });
  const markdownSource = (await readFile(new URL("../public/markdown.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  window.renderMarkdown = new Function("marked", "DOMPurify", `${markdownSource}; return renderMarkdown;`)(marked, createPurify(window));
  window.createStreamRenderer = (render, after) =>
    createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame);
  const compactionDefaults = { enabled: false, tokenThreshold: 100000, percentThreshold: 70, model: null, thinking: "off", keepRecentTokens: 20000 };
  const baseConfig = { model: "test/model", thinking: "off", levels: ["off"], skills: [] };
  const state = {
    sessionId: "a",
    title: "a",
    cwd: "C:\\work",
    status: "idle",
    config: { ...baseConfig },
    messages: [
      { agentId: "main", message: { role: "user", content: '<skill name="sample" location="/SKILL.md">\nbody\n</skill>\n问题一' }, entryId: "m1" },
      { agentId: "main", message: { role: "assistant", content: "回答一" }, entryId: "m2" },
      { agentId: "main", message: { role: "user", content: "问题二" }, entryId: "m3" },
      { agentId: "main", message: { role: "assistant", content: "回答二" }, entryId: "m4" },
    ],
    live: {},
    tasks: [],
    compactions: [],
  };
  let defaults = { compaction: { ...compactionDefaults, tokenThreshold: 50000 }, model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  let lastDefaults, lastCreation;
  const requests = [];
  const sockets = [];
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
          case "service.status":
            data = { managed: true, error: "" };
            break;
          case "models.list":
            data = [
              { key: "test/model", provider: "test", name: "Model", levels: ["off", "low"] },
              { key: "other/child", provider: "other", name: "Child", levels: ["off", "medium", "high"] },
            ];
            break;
          case "sessions.list":
            data = [{ id: state.sessionId, title: state.title, cwd: state.cwd, status: "idle", updatedAt: Date.now() }];
            break;
          case "session.attach":
            data = state;
            break;
          case "session.create":
            lastCreation = req;
            state.sessionId = "created";
            state.messages = [];
            state.compactions = [];
            state.config = { ...baseConfig, ...(req.compaction ? { compaction: req.compaction } : {}) };
            data = state;
            break;
          case "session.configure":
            if (req.compaction?.enabled && req.compaction.tokenThreshold == null && req.compaction.percentThreshold == null) {
              this.receive({ type: "response", id: req.id, ok: false, error: "启用自动压缩时至少设置一个触发阈值" });
              return;
            }
            if (req.compaction) state.config = { ...state.config, compaction: req.compaction };
            data = { ...state.config, model: req.model, subagentModel: null };
            break;
          case "session.defaults.get":
            data = defaults;
            break;
          case "session.defaults.configure":
            lastDefaults = req;
            data = defaults = { ...defaults, ...Object.fromEntries(Object.keys(defaults).map((key) => [key, req[key]])) };
            break;
          case "capabilities.list":
            data = { needsTrust: false, warnings: [], skills: [], mcp: [], plugins: [] };
            break;
          case "prompt": {
            const entryId = `m${state.messages.length + 1}`;
            state.messages.push({ agentId: "main", message: { role: "user", content: req.text }, entryId });
            this.receive({ type: "agent.message.end", sessionId: state.sessionId, data: { message: { role: "user", content: req.text }, entryId } });
            data = { runId: "run" };
            break;
          }
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
  const emit = (type, data) => sockets.at(-1).receive({ type, sessionId: state.sessionId, data });
  try {
    window.eval(`${pickerSource}\n${source}`);
    sockets[0].open();
    await settle();
    paint();
    assert.equal($("workspace").hidden, false);
    assert.equal(window.document.querySelectorAll("#output > .message").length, 4);

    // 折叠保持阅读锚点：按保留消息的位移补偿滚动位置，不强制到底部。
    const keptAnchor = window.document.querySelectorAll("#output > .message")[2];
    let anchorTop = 500;
    keptAnchor.getBoundingClientRect = () => ({ top: anchorTop });
    const firstFolded = window.document.querySelectorAll("#output > .message")[0];
    let firstHidden = false;
    Object.defineProperty(firstFolded, "hidden", {
      configurable: true,
      get: () => firstHidden,
      set: (v) => {
        firstHidden = v;
        anchorTop = 450; // 折叠区域塌缩，锚点上移
        if (v) firstFolded.setAttribute("hidden", "");
        else firstFolded.removeAttribute("hidden");
      },
    });
    $("transcript").scrollTop = 1000;

    // 成功事件后原地折叠：卡片插在被折叠首条之前，原消息 DOM 隐藏但保留。
    emit("agent.compaction", {
      id: "c1",
      summary: "**早前** 讨论要点 <img src=x onerror=\"alert(1)\">",
      firstKeptEntryId: "m3",
      compactedMessageIds: ["m1", "m2"],
      tokensBefore: 9000,
      estimatedTokensAfter: 1200,
    });
    const cards = () => window.document.querySelectorAll("#output > .compaction-card");
    assert.equal(cards().length, 1);
    assert.equal($("output").querySelector(".skill-invocation").parentElement.hidden, true);
    assert.equal(cards()[0], $("output").firstElementChild, "summary card sits at the old boundary");
    assert.match($("output").lastElementChild.textContent, /回答二/, "kept messages follow the card in place");
    const visible = window.document.querySelectorAll("#output > .message:not([hidden])");
    assert.deepEqual([...visible].map((node) => node.textContent.trim()), ["你思考过程问题二", "AXIOM思考过程回答二"]);
    const summaryBody = cards()[0].querySelector(".compaction-summary");
    assert.match(summaryBody.textContent, /早前/);
    assert.equal(summaryBody.querySelector("img"), null, "summaries render through the sanitizing pipeline");
    assert.match(cards()[0].querySelector("summary").textContent, /9,000.*1,200/s);
    assert.equal($("transcript").scrollTop, 950, "folding compensates the viewport anchor instead of forcing the bottom");
    assert.equal(cards()[0].open, false, "compaction cards stay folded by default");
    delete firstFolded.hidden;

    // 重复事件不重复。
    emit("agent.compaction", { id: "c1", summary: "dup", compactedMessageIds: ["m1", "m2"] });
    assert.equal(cards().length, 1);

    // 累计摘要独立成卡：覆盖旧边界，但近期消息不被折叠。
    emit("agent.compaction", {
      id: "c2",
      summary: "累计摘要",
      firstKeptEntryId: "m4",
      compactedMessageIds: ["m1", "m2", "m3"],
      tokensBefore: 1200,
    });
    assert.match(cards()[0].querySelector(".compaction-summary").textContent, /早前/); assert.match(cards()[1].querySelector(".compaction-summary").textContent, /累计摘要/);
    assert.match($("output").lastElementChild.textContent, /回答二/, "each cumulative summary keeps its own card");
    assert.equal(window.document.querySelectorAll("#output > .message:not([hidden])").length, 1, "recent messages survive");

    // 新消息通过 agent.message.end 的 entryId 参与后续折叠。
    input("问题三");
    $("composer").requestSubmit();
    await settle();
    emit("agent.compaction", { id: "c3", summary: "包含新消息", firstKeptEntryId: "m5", compactedMessageIds: ["m4", "m5"] });
    assert.equal(cards().length, 3);
    assert.equal(window.document.querySelectorAll("#output > .message:not([hidden])").length, 0);

    // 重连按 compactions 恢复同一视图。
    state.compactions = [
      { id: "c1", summary: "**早前** 讨论要点", firstKeptEntryId: "m3", compactedMessageIds: ["m1", "m2"], tokensBefore: 9000, estimatedTokensAfter: 1200 },
      { id: "c2", summary: "累计摘要", firstKeptEntryId: "m4", compactedMessageIds: ["m1", "m2", "m3"], tokensBefore: 1200 },
      { id: "c3", summary: "包含新消息", firstKeptEntryId: "m5", compactedMessageIds: ["m4", "m5"], tokensBefore: 1500 },
    ];
    sockets.at(-1).close();
    await settle();
    assert.equal($("login").hidden, false);
    $("connect").click();
    sockets.at(-1).open();
    await settle();
    paint();
    assert.equal(cards().length, 3, "reconnect restores every compaction card");
    assert.equal([...cards()].every((card) => !card.open), true, "restored cards stay folded");
    assert.equal(window.document.querySelectorAll("#output > .message").length, 0);

    // 输入校验：非法值明确报错而非静默置空或回退默认；百分比允许小数；两个阈值都为空才禁用启用。
    const probe = window.compactionEditor({ ...compactionDefaults, enabled: true }, () => "test/model");
    const probeFields = () => probe.node.querySelectorAll("input[type=number]");
    const fireProbe = () => { for (const field of probeFields()) field.dispatchEvent(new window.Event("change")); };
    probeFields()[0].value = "-5"; fireProbe();
    assert.equal(probe.valid(), false);
    assert.match(probe.error(), /Token 阈值需为大于 0 的整数/);
    probeFields()[0].value = "2.5"; fireProbe();
    assert.match(probe.error(), /Token 阈值/, "non-integer tokens are rejected");
    probeFields()[0].value = "80000";
    probeFields()[1].value = "0"; fireProbe();
    assert.match(probe.error(), /百分比阈值需为大于 0 且不超过 100/);
    probeFields()[1].value = "150"; fireProbe();
    assert.match(probe.error(), /百分比阈值/);
    probeFields()[1].value = "55.5"; fireProbe();
    assert.equal(probe.valid(), true, "decimal percent within range is valid");
    assert.deepEqual(probe.read().percentThreshold, 55.5);
    probeFields()[2].value = "2.5"; fireProbe();
    assert.match(probe.error(), /保留最近 tokens 需为大于 0 的整数/);
    probeFields()[2].value = ""; fireProbe();
    assert.deepEqual(probe.read().keepRecentTokens, 20000, "empty keep falls back to the default");
    probeFields()[0].value = ""; probeFields()[1].value = ""; fireProbe();
    assert.match(probe.error(), /至少设置一个触发阈值/, "only two empty thresholds invalidate enabled");

    // 自动压缩仅在默认/新会话表单配置，不随当前会话模型切换提交。
    $("open-settings").click();
    await settle();
    assert.equal($("session-compaction"), null, "current-session compaction settings are removed");
    const editor = $("create-compaction");
    const selects = editor.querySelectorAll("select");
    assert.equal(selects[0].value, "", "compaction model defaults to following the main model");
    $("provider").value = "other";
    $("provider").dispatchEvent(new window.Event("change"));
    await settle();
    $("model").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(requests.findLast((r) => r.type === "session.configure").compaction, undefined);
    $("provider").value = "test";
    $("provider").dispatchEvent(new window.Event("change"));
    await settle();
    $("model").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(requests.findLast((r) => r.type === "session.configure").compaction, undefined);
    selects[0].value = "other/child";
    selects[0].dispatchEvent(new window.Event("change"));
    assert.deepEqual([...selects[1].options].map((option) => option.value), ["off", "medium", "high"], "thinking levels follow the compaction model");
    selects[1].value = "medium";
    selects[1].dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(requests.findLast((r) => r.type === "session.configure").compaction, undefined);

    // 默认配置：编辑后自动保存；无效组合不覆盖旧值。
    const defaultsEditor = $("create-compaction");
    assert.equal(defaultsEditor.querySelector("input[type=checkbox]").checked, false);
    defaultsEditor.querySelector("input[type=checkbox]").checked = true;
    defaultsEditor.querySelectorAll("input[type=number]")[0].value = "60000";
    for (const field of defaultsEditor.querySelectorAll("input, select"))
      field.dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.equal(lastDefaults.compaction.enabled, true);
    assert.equal(lastDefaults.compaction.tokenThreshold, 60000);
    for (const number of defaultsEditor.querySelectorAll("input[type=number]")) number.value = "";
    defaultsEditor.querySelectorAll("input[type=number]")[0].dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.match($("create-feedback").textContent, /至少设置一个触发阈值/);
    assert.equal(lastDefaults.compaction.tokenThreshold, 60000, "invalid defaults are not saved");
    assert.match($("defaults-preview").textContent, /自动压缩 · 未设阈值 触发 · 保留最近 20,000 tokens/);

    // 自定义新会话：沿用当前会话压缩配置，提交时随 session.create 发送。
    $("settings").close();
    $("custom-new").click();
    await settle();
    assert.equal($("create-session").open, true);
    const customEditor = $("create-compaction");
    assert.equal(customEditor.querySelector("input[type=checkbox]").checked, false, "defaults edits do not change the running session");
    customEditor.querySelector("input[type=checkbox]").checked = true;
    customEditor.querySelectorAll("input[type=number]")[0].value = "70000";
    customEditor.querySelectorAll("input[type=number]")[0].dispatchEvent(new window.Event("change", { bubbles: true }));
    $("create-form").requestSubmit();
    await settle();
    assert.equal(lastCreation.useDefaults, false);
    assert.equal(lastCreation.compaction.enabled, true);
    assert.equal(lastCreation.compaction.tokenThreshold, 70000);
    assert.equal($("create-session").open, false);
  } finally {
    dom.window.close();
  }
});
