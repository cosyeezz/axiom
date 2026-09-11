import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";

const pickerSource = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const contrastSource = (await readFile(new URL("../public/text-contrast.js", import.meta.url), "utf8")).replace(/^export /gm, "");

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
    const runs = dom.window.document.getElementById("task-runs");
    assert.equal(runs.hidden, true, "run summary ships hidden until a subagent starts");
    runs.hidden = false;
    runs.innerHTML = '<span class="task-run"><span class="task-run-spin"></span><span class="task-run-text">任务</span></span>';
    assert.equal(computed(".task-run-text").textOverflow, "ellipsis", "run rows truncate long task text");
    assert.equal(computed(".task-run-text").whiteSpace, "nowrap");
    assert.equal(computed(".task-run-spin").animationName, "task-run-spin", "spinner is a CSS animation, no inline style");
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
  states.push({ sessionId: "c", title: "c", cwd: "C:\\work", status: "running", config, messages: [], tasks: [], live: {} });
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
  let lastCreation, lastDefaults, lastImport, copiedPath;
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (text) => { copiedPath = text; } } });
  let defaults = { model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  let failDefaults = false, needsTrust = false;
  let withdrawnImages;
  let failList = false;
  let failConfig = false;
  let presets = [
    { id: "p1", name: "审查预设", selection: { model: "test/model", thinking: "high", capabilities: null, subagentModel: null, subagentThinking: null, subagentCapabilities: null, compaction: null } },
    { id: "p2", name: "沙盒预设", cwd: "C:\\untrusted", selection: { model: "test/model", thinking: null, capabilities: null, subagentModel: null, subagentThinking: null, subagentCapabilities: null, compaction: null } },
    { id: "p3", name: "失效预设", selection: { model: "test/model", thinking: null, capabilities: { skills: ["gone-skill"], mcp: [], plugins: [] }, subagentModel: null, subagentThinking: null, subagentCapabilities: null, compaction: null } },
  ];
  let failPresetSave = false, lastPresetSave;
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
              entries: req.sessionId ? (req.path ? [{ name: "app.js", path: "src/app.js", directory: false }] : [{ name: "src", path: "src", directory: true }]) : [{ name: "pi.jsonl", path: "C:\\pi\\sessions\\pi.jsonl", directory: false }],
              nextOffset: null, breadcrumbs: [], locations: [] };
            break;
          case "workspace.reveal": data = { opened: true }; break;
          case "workspace.browse":
            data = { path: req.path, entries: req.path ? [{ name: "app.js", path: "src/app.js", directory: false }] : [{ name: "src", path: "src", directory: true }] };
            break;
          case "capabilities.list":
            data = { needsTrust: req.trustProject ? false : needsTrust || req.cwd === "C:\\untrusted", warnings: [], skills: [{ id: "skill-a", name: "Skill A" }, { id: "skill-b", name: "Skill B" }], mcp: [{ id: "browser", name: "Browser" }], plugins: [{ id: "search", name: "Search" }] };
            break;
          case "session.presets.list":
            data = { presets };
            break;
          case "session.presets.save":
            lastPresetSave = req;
            if (failPresetSave) {
              this.receive({ type: "response", id: req.id, ok: false, error: "preset unavailable" });
              return;
            }
            if (req.presetId) Object.assign(presets.find((preset) => preset.id === req.presetId), { name: req.name, cwd: req.cwd, selection: req.selection });
            else presets.push({ id: `p${presets.length + 1}`, name: req.name, ...(req.cwd ? { cwd: req.cwd } : {}), selection: req.selection });
            data = {};
            break;
          case "session.presets.delete":
            presets = presets.filter((preset) => preset.id !== req.presetId);
            data = {};
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
            const selected = { ...(req.useDefaults === false ? {} : defaults), ...req };
            data = { ...states[0], config: { ...config, model: selected.model || config.model, subagentModel: selected.subagentModel ?? null, capabilitySelection: selected.capabilities ?? null, subagentCapabilities: selected.subagentCapabilities ?? null } };
            break;
          case "service.status":
            data = { managed: true, error: "", version: "9.9.9", importDir: "C:\\pi\\sessions", dev: true, sourceDir: "F:/Axiom" };
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
          case "session.import":
            lastImport = req;
            data = { sessionId: "imported", title: "imported", cwd: "C:\\pi", status: "idle", config, messages: [], tasks: [], live: {} };
            break;
          case "session.rename":
            states.find((s) => s.sessionId === req.sessionId).title = req.title;
            break;
          case "queue.withdraw":
            data = { steering: ["撤回插话"], followUp: ["撤回追加"], ...(withdrawnImages ? { images: withdrawnImages } : {}) };
            if (req.recall) {
              states.find((s) => s.sessionId === req.sessionId).messages = [];
              data = { steering: [], followUp: [], recalled: { entryId: "u1", text: "撤回的输入", images: null } };
            }
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
    window.eval(`${contrastSource}\n${pickerSource}\n${source}`);
    const copySelection = window.eval("copySelection");
    $("prompt").value = "copy selected text";
    $("prompt").setSelectionRange(5, 13);
    await copySelection({ type: "pointerup", button: 0, target: $("prompt") });
    assert.equal(copiedPath, "selected");
    $("selection-copy").value = "off";
    $("selection-copy").onchange();
    assert.equal(window.localStorage.getItem("axiom.selectionCopy"), "off");
    copiedPath = "unchanged";
    await copySelection({ type: "pointerup", button: 0, target: $("prompt") });
    assert.equal(copiedPath, "unchanged");
    $("selection-copy").value = "on";
    $("selection-copy").onchange();
    await copySelection({ type: "keyup", key: "c", target: $("prompt") });
    await copySelection({ type: "pointerup", button: 2, target: $("prompt") });
    assert.equal(copiedPath, "unchanged", "clear shortcut and context menu do not copy");
    const originalWriteText = window.navigator.clipboard.writeText;
    window.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
    await copySelection({ type: "keyup", key: "Shift", target: $("prompt") });
    assert.match($("error").textContent, /右键菜单复制/);
    window.navigator.clipboard.writeText = originalWriteText;
    $("prompt").value = "";
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
    assert.equal($("service-dev").hidden, false);
    assert.match($("service-dev").title, /F:\/Axiom/);
    assert.equal($("workspace").hidden, false);
    assert.equal(requests.filter((req) => req.type === "session.presets.list").length, 1, "connect fetches the preset list");
    assert.equal($("send").disabled, true);
    assert.equal($("send").textContent, "Send");
    assert.equal(window.document.querySelector("header .menu"), null);
    const firstActions = $("sessions").querySelector(".session-actions");
    assert.deepEqual([...$("sessions").querySelectorAll(".session-group:not(.workspace-group)")].map((n) => n.textContent), ["今天", "待处理"], "idle by time first, running last");
    assert.equal(firstActions.children[0].title, "完成并隐藏");
    assert.equal(firstActions.children[1].className, "session-open");
    assert.equal(firstActions.children[2].className, "session-rename");
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
    assert.equal($("sessions").querySelectorAll(".session-row").length, 2);
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
    assert.equal($("sessions").querySelectorAll(".session-row").length, 3);
    assert.equal(requests.length, beforeHide, "hiding/restoring never deletes or cancels sessions");
    const rowTitles = () => [...$("sessions").querySelectorAll(".session-row .session-item span")].map((n) => n.textContent);
    assert.deepEqual(rowTitles(), ["a", "b", "c"], "idle by recency, running last");
    const reorder = (from, to) => {
      const dataTransfer = { setData() {} };
      from.ondragstart({ dataTransfer });
      const over = new window.Event("dragover", { cancelable: true });
      Object.defineProperty(over, "dataTransfer", { value: dataTransfer });
      to.dispatchEvent(over);
      assert.equal(over.defaultPrevented, true);
      assert.equal(to.classList.contains("session-reorder-target"), true);
      to.dispatchEvent(new window.Event("drop", { cancelable: true }));
      from.ondragend();
      assert.equal(to.classList.contains("session-reorder-target"), false);
    };
    const sessionRows = $("sessions").querySelectorAll(".session-row");
    reorder(sessionRows[1], sessionRows[0]);
    assert.deepEqual(rowTitles(), ["b", "a", "c"], "dragged row lands before drop target");
    assert.deepEqual(JSON.parse(window.localStorage.getItem("axiom.sessionOrder")), ["b", "a", "c"]);
    window.eval("renderSessions() ");
    assert.deepEqual(rowTitles(), ["b", "a", "c"], "order survives rerender");
    reorder($("sessions").querySelectorAll(".session-row")[1], $("sessions").querySelectorAll(".session-row")[0]);
    assert.deepEqual(rowTitles(), ["a", "b", "c"], "dragging back restores order");
    window.localStorage.removeItem("axiom.sessionOrder");
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
    states.push({ ...states[0], sessionId: "other-workspace", cwd: "C:\\other" });
    await window.eval('switchSession(() => request("session.attach", { sessionId: "other-workspace" }))');
    assert.equal($("sessions").querySelectorAll(".workspace-group").length, 2, "opening a workspace keeps the previous workspace visible");
    assert.ok(rowTitles().includes("a"), "old workspace sessions remain directly accessible");
    assert.match($("sessions").querySelector(".workspace-group").textContent, /运行中/, "background activity stays visible");
    assert.equal(window.sessionStorage.getItem("axiom.session"), "other-workspace", "selection is tab-local");
    assert.equal(window.localStorage.getItem("axiom.session"), null, "switching does not overwrite other tabs' selection");
    assert.equal(new window.URLSearchParams(window.location.hash.slice(1)).get("session"), "other-workspace");
    let opened;
    window.open = (...args) => { opened = args; };
    $("sessions").querySelector(".session-open").click();
    assert.deepEqual(opened, ["/#session=a", "_blank", "noopener"]);
    const crossWorkspace = "other-workspace";
    $("prompt").value = "other workspace draft";
    $("sessions").querySelector(".session-item").click(); await settle();
    assert.equal($("workspace-label").textContent, "C:\\work");
    assert.equal($("prompt").value, "");
    await window.eval(`switchSession(() => request("session.attach", { sessionId: ${JSON.stringify(crossWorkspace)} }))`);
    assert.equal($("prompt").value, "other workspace draft", "cross-workspace switching restores the correct draft");
    $("prompt").value = "";
    $("search").value = "C:\\other"; $("search").oninput();
    assert.equal($("sessions").querySelectorAll(".workspace-group").length, 1, "search includes workspace paths");
    $("search").value = ""; $("search").oninput();
    assert.equal(requests.some((req) => req.type === "cancel"), false, "opening and switching workspaces never cancels background work");
    await window.eval('switchSession(() => request("session.attach", { sessionId: "a" }))');
    states.pop();
    await window.eval("refreshSessions()");
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
    assert.equal(skillCard.skillBlocks.querySelector(".skill-badge").textContent, "SKILL");
    assert.equal(skillCard.skillBlocks.querySelector(".skill-name").textContent, "codebase-map");
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
    // 预设列表：connect 拉取，启动/编辑按钮共用 .preset-group。
    assert.equal(window.document.querySelector(".preset-group").contains($("preset-list")), true);
    const presetNames = () => [...window.document.querySelectorAll(".preset-group .preset-launch")].map((button) => button.textContent);
    assert.deepEqual(presetNames(), ["审查预设", "沙盒预设", "失效预设"]);
    assert.deepEqual([...window.document.querySelectorAll(".preset-group .preset-launch")].map((button) => button.title), ["使用当前工作目录", "C:\\untrusted", "使用当前工作目录"]);
    assert.equal(window.document.querySelectorAll(".preset-group .preset-edit").length, 3);
    // 保存预设：needsTrust 不阻止保存；未保存的预设没有删除按钮。
    needsTrust = true;
    $("custom-new").click();
    await settle();
    assert.equal($("create-session").open, true);
    assert.equal($("create-title").textContent, "预设会话配置");
    assert.equal($("create-submit").textContent, "保存预设");
    assert.equal($("preset-fields").hidden, false);
    assert.equal($("preset-delete").hidden, true, "unsaved presets have nothing to delete");
    assert.equal($("preset-name").required, true);
    assert.equal($("create-submit").disabled, false, "saving presets is allowed even when the directory is untrusted");
    assert.equal($("create-main-model").value, "test/model", "preset editor keeps current model instead of new defaults");
    assert.equal($("create-main-mode").value, "all");
    assert.equal($("create-subagent-mode").value, "all");
    needsTrust = false;
    $("create-main-mode").value = "custom";
    $("create-main-mode").dispatchEvent(new window.Event("change"));
    const checkboxes = window.document.querySelectorAll('.capability-agent:first-child input[data-kind="skills"]');
    checkboxes[1].checked = false;
    checkboxes[1].dispatchEvent(new window.Event("change"));
    $("create-subagent-provider").value = "other";
    $("create-subagent-provider").dispatchEvent(new window.Event("change"));
    $("preset-name").value = "  评审工作台  ";
    const presetSaves = () => requests.filter((req) => req.type === "session.presets.save").length;
    lastCreation = undefined;
    failPresetSave = true;
    $("create-form").requestSubmit();
    await settle();
    assert.equal($("create-session").open, true, "failed saves keep the editor open");
    assert.match($("create-feedback").textContent, /保存失败.*preset unavailable/);
    assert.equal($("create-submit").disabled, false, "failed saves re-enable submit");
    assert.equal(lastCreation, undefined, "saving a preset never creates a session");
    failPresetSave = false;
    $("create-form").requestSubmit();
    await settle();
    assert.equal($("create-session").open, false);
    assert.equal(lastPresetSave.name, "评审工作台", "preset names are trimmed");
    assert.equal(Object.hasOwn(lastPresetSave, "presetId"), false);
    assert.equal(Object.hasOwn(lastPresetSave, "cwd"), false, "cwd is only stored for fixed-directory presets");
    assert.deepEqual(lastPresetSave.selection.capabilities.skills, ["skill-a"]);
    assert.equal(lastPresetSave.selection.subagentModel, "other/child");
    assert.equal(lastPresetSave.selection.compaction.enabled, false);
    assert.deepEqual(presetNames(), ["审查预设", "沙盒预设", "失效预设", "评审工作台"]);
    // 直接启动：信任目录直接创建，不带 trustProject。
    lastCreation = undefined;
    window.document.querySelectorAll(".preset-group .preset-launch")[3].click();
    await settle();
    assert.equal($("create-session").open, false, "trusted presets launch without a dialog");
    assert.equal(lastCreation.useDefaults, false);
    assert.equal(Object.hasOwn(lastCreation, "trustProject"), false, "direct launch never sends trust");
    assert.equal(lastCreation.model, "test/model");
    assert.equal(lastCreation.subagentModel, "other/child");
    assert.equal(lastCreation.cwd, "C:\\work", "without a fixed cwd the preset uses the current directory");
    // 编辑：重命名并固定目录。
    window.document.querySelectorAll(".preset-group .preset-edit")[3].click();
    await settle();
    assert.equal($("create-session").open, true);
    assert.equal($("preset-name").value, "评审工作台");
    assert.equal($("preset-delete").hidden, false);
    assert.equal($("create-main-model").value, "test/model", "editing reloads the saved selection");
    $("preset-name").value = "评审工作台 v2";
    $("preset-fixed-cwd").checked = true;
    $("create-form").requestSubmit();
    await settle();
    assert.equal(lastPresetSave.presetId, "p4");
    assert.equal(lastPresetSave.cwd, "C:\\work", "fixed-directory presets store their cwd");
    assert.deepEqual(presetNames(), ["审查预设", "沙盒预设", "失效预设", "评审工作台 v2"]);
    // 删除预设。
    $("preset-delete").click();
    await settle();
    assert.equal($("create-session").open, false);
    assert.equal(requests.findLast((req) => req.type === "session.presets.delete").presetId, "p4");
    assert.deepEqual(presetNames(), ["审查预设", "沙盒预设", "失效预设"]);
    // 失效能力启动：launching 确认表单，修改仅本次有效，不回写预设。
    lastCreation = undefined;
    const savesAtLaunch = presetSaves();
    window.document.querySelectorAll(".preset-group .preset-launch")[2].click();
    await settle();
    assert.equal($("create-session").open, true, "unavailable capabilities open the launch confirmation");
    assert.equal($("create-title").textContent, "启动预设：失效预设");
    assert.equal($("create-submit").textContent, "创建会话");
    assert.equal($("preset-fields").hidden, true, "launching never edits the preset");
    assert.equal($("create-submit").disabled, false, "launching submit is only blocked by needsTrust");
    assert.match($("create-agents").textContent, /当前目录不可用 · gone-skill/);
    const goneBox = [...window.document.querySelectorAll('.capability-agent:first-child input[data-kind="skills"]')].find((box) => box.checked);
    assert.notEqual(goneBox, undefined, "unavailable selections survive into the confirmation");
    goneBox.checked = false;
    goneBox.dispatchEvent(new window.Event("change"));
    $("create-form").requestSubmit();
    await settle();
    assert.equal($("create-session").open, false);
    assert.equal(lastCreation.useDefaults, false);
    assert.deepEqual(lastCreation.capabilities.skills, [], "launch-time edits apply to this run only");
    assert.equal(lastCreation.trustProject, false);
    assert.equal(lastCreation.cwd, "C:\\work");
    assert.equal(presetSaves(), savesAtLaunch, "launching never rewrites the preset");
    assert.deepEqual(presetNames(), ["审查预设", "沙盒预设", "失效预设"]);
    // 未信任目录启动：确认信任后仅本次携带 trustProject。
    lastCreation = undefined;
    window.document.querySelectorAll(".preset-group .preset-launch")[1].click();
    await settle();
    assert.equal($("create-session").open, true, "untrusted presets open a trust confirmation");
    assert.equal($("create-title").textContent, "启动预设：沙盒预设");
    assert.equal($("preset-fields").hidden, true);
    assert.equal($("create-submit").disabled, true, "creation waits for explicit trust while launching");
    assert.equal(lastCreation, undefined);
    $("create-trust").checked = true;
    $("create-trust").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal($("create-submit").disabled, false);
    $("create-form").requestSubmit();
    await settle();
    assert.equal($("create-session").open, false);
    assert.equal(lastCreation.useDefaults, false);
    assert.equal(lastCreation.trustProject, true, "trust is granted for this launch only");
    assert.equal(lastCreation.cwd, "C:\\untrusted");
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
    assert.equal(historicalTask.querySelector(".message > .markdown").textContent, "");
    assert.match(historicalTask.querySelector(".runtime-summary").textContent, /80.0%.*1,200 \/ 10,000 tokens · 12.0%.*other · child · high/);
    assert.equal(historicalTask.querySelector(".task-top .runtime-summary")?.parentElement.nextElementSibling.className, "task-body");
    assert.equal(historicalTask.querySelector(".task-system-prompt pre").textContent, "Historical system prompt");
    assert.equal(historicalTask.querySelector(".task-description").textContent, "Historical task");
    assert.doesNotMatch($("session-runtime").textContent, /80.0%/, "child usage never leaks to the main agent");
    historicalTrigger.click();
    paint();
    assert.equal(historicalTask.open, true);
    assert.equal(historicalTask.querySelector(".message > .markdown").textContent.trim(), "historical result");
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
      window.document.querySelector(".message.user > .markdown").textContent.trim(),
      "accepted task",
      "list refresh failure must not remove an accepted message",
    );
    failList = false;

    const emit = (type, data, extra = {}) =>
      sockets[2].receive({ type, sessionId: "a", data, ...extra });
    assert.equal($("status").textContent, "已连接");
    assert.equal($("restart-quick").disabled, false);
    assert.equal($("restart-rebuild").disabled, false);
    assert.equal($("restart-update").disabled, false);
    const restartRequests = () => requests.filter((r) => r.type === "service.restart");
    window.confirm = () => { throw new Error("must use styled dialog"); };
    for (const mode of ["quick", "rebuild", "update"]) {
      const before = restartRequests().length;
      $(`restart-${mode}`).click();
      assert.equal($("restart-dialog").open, true);
      assert.equal(window.document.activeElement, $("restart-cancel"));
      assert.match($("restart-description").textContent,
        mode === "quick" ? /不安装依赖/ : mode === "update" ? /已是最新/ : /数分钟/);
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
    // 三次 Esc：把已进入上下文的输入退回输入框（服务端回退分支，客户端按新快照重绘消息区）。
    states[0].messages = [{ agentId: "main", entryId: "u1", message: { role: "user", content: "撤回的输入" } }];
    emit("session.state", { status: "idle" });
    await settle();
    input("撤回的输入");
    $("composer").requestSubmit();
    await settle();
    assert.match($("output").textContent, /撤回的输入/);
    emit("session.state", { status: "running" });
    const attaches = () => requests.filter((r) => r.type === "session.attach").length;
    const attachCount = attaches();
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    await new Promise((resolve) => setTimeout(resolve, 330));
    await settle();
    assert.equal(requests.findLast((r) => r.type === "queue.withdraw").recall, undefined, "double Esc stops without touching the context");
    assert.equal(attaches(), attachCount);
    for (let i = 0; i < 3; i++) window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    await new Promise((resolve) => setTimeout(resolve, 330));
    await settle();
    paint();
    assert.equal(requests.findLast((r) => r.type === "queue.withdraw").recall, true, "triple Esc recalls the sent input");
    assert.equal(attaches(), attachCount + 1, "transcript is redrawn from the rewound session");
    assert.match($("prompt").value, /撤回的输入/, "recalled input goes back into the box");
    assert.doesNotMatch($("output").textContent, /撤回的输入/, "the recalled message is gone from the transcript");
    input("");
    emit(
      "task.state",
      { task: "Inspect code", status: "running" },
      { taskId: "child" },
    );
    assert.equal($("task-runs").hidden, false, "active subagents get one summary row above the composer");
    assert.equal($("task-runs").children.length, 1);
    assert.match($("task-runs").firstElementChild.textContent, /Inspect code/);
    assert.notEqual($("task-runs").querySelector(".task-run-spin"), null);
    assert.equal($("task-runs").firstElementChild.title, "定位子代理：Inspect code");
    const run = $("task-runs").firstElementChild;
    const targetCard = window.document.querySelector('[aria-controls="task-child"]');
    let scrolled;
    targetCard.scrollIntoView = (options) => { scrolled = options; };
    assert.equal(run.tagName, "BUTTON", "run summary supports keyboard activation");
    run.click();
    $("transcript").dispatchEvent(new window.Event("scroll"));
    assert.equal($("latest").hidden, false, "programmatic scroll does not resume follow near the bottom");
    assert.equal(scrolled.block, "center");
    assert.equal(window.document.activeElement, targetCard);
    assert.equal($("task-child").open, false, "summary locates the original card without opening the dialog");
    $("transcript").scrollTop = 123;
    window.scrollLatest();
    paint();
    assert.equal($("transcript").scrollTop, 123, "jump pauses auto-follow");
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
    assert.equal(task.querySelector(".message > .markdown").textContent, "");
    trigger.click();
    paint();
    assert.equal(task.open, true);
    const text = task.querySelector(".message > .markdown");
    for (const selector of ["h1", "strong", "li", "pre code", "table"]) assert(text.querySelector(selector), selector);
    assert.equal(text.querySelector("img,[onerror]"), null);
    const thought = task.querySelector(".message details");
    assert.equal(thought.hidden, false);
    assert.equal(thought.querySelector(".thinking-content").textContent, "");
    thought.open = true;
    thought.dispatchEvent(new window.Event("toggle"));
    paint();
    assert.equal(thought.querySelector(".thinking-content").textContent.trim(), "private thought");
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
    assert.equal(thought.querySelector(".thinking-content").textContent.trim(), "final thought");
    emit("agent.message.end", { message: finalMessage });
    assert.equal($("output").querySelector(".message:not(.user) > .markdown").innerHTML, text.innerHTML, "main and child messages have identical Markdown rendering");
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
    assert.equal($("task-runs").hidden, true, "finished tasks leave the summary");
    assert.equal($("task-runs").children.length, 0);
    assert.equal(task.querySelector(".task-error").textContent, "Provider failed");
    assert.equal(task.querySelector(".task-error").hidden, false);
    emit("task.state", { task: "Second task", status: "running" }, { taskId: "sibling" });
    assert.equal($("task-runs").children.length, 1, "starting/running tasks each keep one row");
    emit("task.state", { task: "Third task", status: "starting" }, { taskId: "third" });
    assert.equal($("task-runs").children.length, 2, "concurrent tasks have separate rows");
    emit("task.state", { task: "Third task", status: "cancelled" }, { taskId: "third" });
    assert.equal($("task-runs").children.length, 1, "cancellation removes only its own row");
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
    emit("task.state", { task: "Second task", status: "completed" }, { taskId: "sibling" });
    assert.equal($("task-runs").hidden, true, "the second finished task clears the summary too");
    emit("task.state", { task: "Still running in old session", status: "running" }, { taskId: "third" });
    assert.equal($("task-runs").children.length, 1);
    window.document.querySelectorAll(".session-item")[1].click();
    await settle();
    assert.match($("session-runtime").textContent, /暂无数据/, "switching sessions clears previous usage");
    assert.equal($("task-runs").hidden, true, "switching sessions resets the run summary");
    assert.equal($("task-runs").children.length, 0, "restored completed history never enters the summary");
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
    assert.equal(requests.findLast((req) => req.type === "prompt").text, "[image1]");
    assert.equal($("image-attachments").hidden, true);
    assert.equal($("output").querySelectorAll(".message-images img").length, 1);
    const sentImage = $("output").querySelector(".message-images img");
    sentImage.click();
    assert.equal($("image-preview").open, true, "sent images also support preview");
    assert.equal($("image-preview-image").src, sentImage.src);
    $("image-preview").close(); // Native Escape closes dialogs; JSDOM does not implement it.
    assert.equal($("image-preview-image").hasAttribute("src"), false);
    input("前文后文");
    $("prompt").setSelectionRange(2, 2);
    let prevented = false;
    $("prompt").onpaste({ clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => png }] }, preventDefault() { prevented = true; } });
    assert.equal($("prompt").value, "前文[image1]后文", "paste reserves its exact position before reading finishes");
    assert.equal($("prompt").selectionStart, 10);
    $("prompt").setRangeText("继续", 10, 10, "end");
    for (let i = 0; i < 100 && !$("image-attachments").children.length; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(prevented, true);
    assert.equal($("image-attachments").children.length, 1);
    assert.equal($("prompt").value, "前文[image1]继续后文");
    await window.eval("loadImages")([png]);
    assert.equal($("prompt").value, "前文[image1]继续[image2]后文");
    $("image-attachments").querySelector("button").click();
    assert.equal($("prompt").value, "前文继续[image1]后文", "removing an image renumbers remaining references");
    assert.match($("image-attachments").textContent, /\[image1\]/);
    $("image-attachments").querySelector("button").click();
    assert.equal($("prompt").value, "前文继续后文");
    assert.equal($("image-attachments").hidden, true);
    $("prompt").setSelectionRange(0, 2);
    await window.eval("loadImages")([new window.File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })]);
    assert.match($("error").textContent, /仅支持/);
    assert.equal($("prompt").value, "前文继续后文", "invalid image restores replaced selection");
    assert.equal($("image-attachments").hidden, true);
    await window.eval("loadImages")([png, png, png, png, png]);
    assert.match($("error").textContent, /最多/);
    assert.equal($("image-attachments").hidden, true);
    const loadingImage = window.eval("loadImages")([png]);
    const imageDraft = $("prompt").value;
    window.document.querySelectorAll(".session-item")[0].click();
    await settle();
    await loadingImage;
    assert.equal($("image-attachments").hidden, true, "async image read must not leak into another session");
    window.document.querySelectorAll(".session-item")[1].click();
    await settle();
    assert.equal($("prompt").value, imageDraft);
    assert.equal($("image-attachments").children.length, 1);
    const queuedImage = { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" };
    withdrawnImages = { steering: [[queuedImage]], followUp: [null] };
    window.eval("renderQueue")({ steering: [""], followUp: [], images: withdrawnImages });
    assert.match($("message-queue").textContent, /图片 × 1/);
    await window.eval("withdrawQueue")();
    assert.equal($("image-attachments").querySelectorAll("img").length, 2, "withdrawing restores images, not just text");
    const oldWithdraw = window.eval("request");
    window.eval("request = async () => ({ steering: ['第一条[image1]', '第二条[image1]'], followUp: [], images: { steering: [[{type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo='}], [{type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo='}]], followUp: [] } })");
    await window.eval("withdrawQueue")();
    assert.match($("prompt").value, /第一条\[image3\]\n\n第二条\[image4\]/, "withdrawn messages are rebased against draft and each other");
    window.request = oldWithdraw;
    $("search").value = "missing";
    $("search").dispatchEvent(new window.Event("input"));
    assert.match($("sessions").textContent, /没有找到/);
    // 导入 pi 会话：选择器从 pi 会话目录开始，确认后按服务端路径导入并切换工作空间。
    $("search").value = "";
    $("search").dispatchEvent(new window.Event("input"));
    $("import-session").click(); await settle();
    assert.equal($("file-picker").open, true);
    assert.equal(requests.findLast((req) => req.type === "files.browse").path, "C:\\pi\\sessions");
    assert.match($("file-picker-results").textContent, /pi\.jsonl/);
    $("file-picker-results").querySelector("button").click();
    $("file-picker-confirm").click(); await settle();
    assert.equal(lastImport.type, "session.import");
    assert.equal(lastImport.path, "C:\\pi\\sessions\\pi.jsonl");
    assert.equal($("session-title").textContent, "imported");
    assert.equal($("workspace-label").textContent, "C:\\pi", "导入后跟随会话自身工作空间");
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
  let lastDefaults, lastCreation, lastPresetSave;
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
          case "session.presets.list":
            data = { presets: [] };
            break;
          case "session.presets.save":
            lastPresetSave = req;
            data = {};
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
    window.eval(`${contrastSource}\n${pickerSource}\n${source}`);
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
    assert.deepEqual([...visible].map((node) => node.querySelector(":scope > .markdown").textContent.trim()), ["问题二", "回答二"]);
    const summaryBody = cards()[0].querySelector(".compaction-summary");
    assert.match(summaryBody.textContent, /早前/);
    assert.equal(summaryBody.querySelector("img"), null, "summaries render through the sanitizing pipeline");
    assert.match(cards()[0].querySelector("summary").textContent, /9,000.*1,200/s);
    assert.equal($("transcript").scrollTop, 950, "folding compensates the viewport anchor instead of forcing the bottom");
    assert.equal(cards()[0].open, false, "compaction cards stay folded by default");
    delete firstFolded.hidden;

    // 重试过程自动聚合，成功折叠，原生 details 仍可手动展开；错误文本不能注入 HTML。
    const retry = { id: "r1", attempt: 1, maxRetries: 30, status: "waiting", delayMs: 96000, nextRetryAt: Date.now() + 96000, error: "429 <img src=x onerror=alert(1)>" };
    emit("agent.retry", retry);
    emit("agent.retry", retry);
    const retryCard = $("output").querySelector(".retry-card");
    assert.equal(retryCard.open, true);
    assert.equal(retryCard.querySelectorAll("li").length, 1);
    assert.match(retryCard.textContent, /96 秒/);
    assert.equal(retryCard.querySelector("img"), null);
    emit("agent.retry", { ...retry, attempt: 2, delayMs: 192000 });
    emit("agent.retry", { id: "r1", attempt: 2, status: "succeeded" });
    assert.equal(retryCard.open, false);
    assert.equal(retryCard.querySelectorAll("li").length, 2);
    retryCard.open = true;
    assert.equal(retryCard.open, true);
    retryCard.remove();

    for (const content of ["[Axiom 子任务完成通知] 内部消息", [{ type: "text", text: "[Axiom 子任务完成通知] 内部消息" }]]) {
      emit("agent.message.end", { message: { role: "user", content } });
      assert.equal($("output").lastElementChild.hidden, true, "internal task notifications stay out of the transcript");
      $("output").lastElementChild.remove();
    }

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

    // 预设保存：压缩配置随 selection 保存，保存预设不再直接创建会话。
    $("settings").close();
    $("custom-new").click();
    await settle();
    assert.equal($("create-session").open, true);
    assert.equal($("create-submit").textContent, "保存预设");
    const customEditor = $("create-compaction");
    assert.equal(customEditor.querySelector("input[type=checkbox]").checked, false, "defaults edits do not change the running session");
    customEditor.querySelector("input[type=checkbox]").checked = true;
    customEditor.querySelectorAll("input[type=number]")[0].value = "70000";
    customEditor.querySelectorAll("input[type=number]")[0].dispatchEvent(new window.Event("change", { bubbles: true }));
    $("preset-name").value = "压缩预设";
    $("create-form").requestSubmit();
    await settle();
    assert.equal($("create-session").open, false);
    assert.equal(lastPresetSave.name, "压缩预设");
    assert.equal(Object.hasOwn(lastPresetSave, "cwd"), false);
    assert.equal(lastPresetSave.selection.compaction.enabled, true, "compaction edits travel with the saved selection");
    assert.equal(lastPresetSave.selection.compaction.tokenThreshold, 70000);
    assert.equal(lastCreation, undefined, "saving a preset never creates a session");
  } finally {
    dom.window.close();
  }
});
