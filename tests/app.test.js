import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

const pickerSource = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const modelSources = await Promise.all(["model-picker", "model-auth", "model-manager"].map(async (name) => {
  const source = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
  const exports = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  return `Object.assign(window, (() => { ${source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`;
})).then((parts) => parts.join("\n"));
const serviceSource = (await readFile(new URL("../public/service-settings.js", import.meta.url), "utf8")).replace(/^export /gm, "");

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
    const github = dom.window.document.getElementById("github-link");
    assert.equal(github.getAttribute("href"), "https://github.com/cosyeezz/axiom", "右上角图标指向开源页");
    assert.equal(github.getAttribute("rel"), "noopener noreferrer", "新标签页打开不泄露 opener");
    assert.equal(computed("#github-link").height, "32px", "与其他 .icon-button 等高");
    assert.equal(computed("#github-link").textDecoration, "none");
    assert.equal(dom.window.document.getElementById("text-contrast-button"), null, "对比度按钮已移除");
    const runs = dom.window.document.getElementById("task-runs");
    assert.equal(runs.hidden, true, "run summary ships hidden until a subagent starts");
    runs.hidden = false;
    runs.innerHTML = '<span class="task-run"><span class="task-run-spin"></span><span class="task-run-text">任务</span></span>';
    assert.equal(computed(".task-run-text").textOverflow, "ellipsis", "run rows truncate long task text");
    assert.equal(computed(".task-run-text").whiteSpace, "nowrap");
    assert.equal(computed(".task-run-spin").animationName, "task-run-spin", "spinner is a CSS animation, no inline style");
    // 安全停止提示条：图标与省略号都靠 CSS 动画，且不能把标题行撑高（全局 button 有 40px 最小高度）。
    assert.equal(computed(".safe-stop-icon").animationName, "safe-stop-pulse");
    assert.equal(computed(".safe-stop-dots i").animationName, "safe-stop-bounce");
    assert.equal(computed("#session-alert").minHeight, "0px", "标题前提醒点不继承全局按钮高度");
    assert.equal(computed("#session-alert").padding, "0px");
    assert.equal(computed(".title-row").display, "flex", "提醒点与标题同行，且 h1 仍可省略");
    assert.equal(computed(".title-row").minWidth, "0px");
    // 复选框不能吃到全局 input 的 40px 高度：否则控件顶在盒子上沿、同行文字落到下沿，看起来错行。
    // 复选框由脚本生成（能力选择、压缩开关），静态页面里没有，这里补一个再量。
    const box = dom.window.document.createElement("input");
    box.type = "checkbox";
    dom.window.document.body.append(box);
    assert.equal(dom.window.getComputedStyle(box).minHeight, "0px", "复选框不继承输入框的 min-height");
    assert.equal(dom.window.getComputedStyle(box).padding, "0px", "复选框不继承输入框的 padding");
    assert.equal(dom.window.getComputedStyle(box).width, "auto");
    assert.equal(computed("#session-name").minHeight, "40px", "普通输入框尺寸不变");
  } finally { dom.window.close(); }
});

// Exercise the real page handlers without a live model or an extra test framework.
test("page preserves drafts, recovers failed connections and paints tasks on demand", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const source = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "app");
  const virtualConsole = new VirtualConsole();
  const jsdomErrors = [];
  virtualConsole.on("jsdomError", (error) => jsdomErrors.push(error));
  const dom = new JSDOM(html, {
    url: "http://localhost",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
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
  // 只对 reduced-motion 明确对齐（正文整批显示）；其余查询保持原有语义（true）。
  window.matchMedia = (query) =>
    query.includes("prefers-reduced-motion: reduce") ? { matches: true } : media;
  const markdownSource = await publicSource("clipboard", "markdown");
  const markdownApi = new Function("marked", "DOMPurify", `${markdownSource}; return { renderMarkdown, createMarkdownPageCache };`)(marked, createPurify(window));
  const renderMarkdown = markdownApi.renderMarkdown;
  let renders = 0;
  window.renderMarkdown = (node, text) => {
    renders++;
    renderMarkdown(node, text);
  };
  window.createMarkdownPageCache = markdownApi.createMarkdownPageCache;
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
  let lastCreation, lastDefaults, lastImport, lastDuplication, copiedPath;
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { copiedPath = text; } } });
  let defaults = { model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  let failDefaults = false, needsTrust = false;
  let withdrawnImages;
  let failList = false;
  // 打开工作空间与新增目录配置都用 folder 模式的文件选择器，mock 无法区分；
  // 只有新增目录配置用例前才开启目录分支，否则会把打开工作空间的结果顶掉。
  let pickerRoot = false;
  let attachError;
  let failConfig = false, holdConfig = false, heldConfig;
  // 目录级默认配置：cwd -> selection；未配置的目录回落全局 defaults。
  const directoryDefaults = new Map([["C:\\other", { ...defaults, model: "other/child", thinking: "high" }]]);
  let lastDefaultsDelete;
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
            if (pickerRoot && req.directoriesOnly) { // 目录选择器：返回一份「当前目录 + 一个子目录」，用来测新增目录配置。
              data = { path: req.path || "C:\\picked", parent: null, entries: [{ name: "picked", path: `${req.path || "C:\\work"}\\picked`, directory: true }], nextOffset: null, breadcrumbs: [], locations: [] };
              break;
            }
            data = { path: req.sessionId ? req.path : "C:\\other", parent: req.path ? "" : null,
              entries: req.sessionId ? (req.path ? [{ name: "app.js", path: "src/app.js", directory: false }] : [{ name: "src", path: "src", directory: true }]) : [{ name: "pi.jsonl", path: "C:\\pi\\sessions\\pi.jsonl", directory: false }],
              nextOffset: null, breadcrumbs: [], locations: [] };
            break;
          case "session.skills.refresh":
            data = { skills: [...config.skills, { name: "project-new", description: "新增项目技能" }] };
            break;
          case "workspace.reveal": data = { opened: true }; break;
          case "workspace.browse":
            // query 非空时模拟服务端：在整个工作空间内模糊搜索名称（app.js 不在根列表里）。
            data = { path: req.path, entries: req.query
              ? [{ name: "app.js", path: "src/app.js", directory: false }, { name: "src", path: "src", directory: true }].filter((entry) => entry.name.includes(req.query))
              : req.path ? [{ name: "app.js", path: "src/app.js", directory: false }] : [{ name: "src", path: "src", directory: true }] };
            break;
          case "capabilities.list":
            data = { needsTrust: req.trustProject ? false : needsTrust || req.cwd === "C:\\untrusted", warnings: [], skills: [{ id: "skill-a", name: "Skill A", scope: "global" }, { id: "skill-b", name: "Skill B", scope: "project" }], mcp: [{ id: "browser", name: "Browser" }], plugins: [{ id: "search", name: "Search" }] };
            break;
          case "session.defaults.list":
            data = { workspaces: [...directoryDefaults.keys()].sort() };
            break;
          case "session.defaults.get":
            data = structuredClone(req.cwd ? directoryDefaults.get(req.cwd) ?? defaults : defaults);
            break;
          case "session.defaults.configure":
            lastDefaults = req;
            if (failDefaults) {
              this.receive({ type: "response", id: req.id, ok: false, error: "defaults unavailable" });
              return;
            }
            // 与后端一致：新目录从全局默认复制一份独立配置；无 cwd 写全局。
            {
              const base = req.cwd ? directoryDefaults.get(req.cwd) ?? defaults : defaults;
              const next = Object.fromEntries(Object.keys(defaults).map((key) => [key, key in req ? req[key] : base[key]]));
              if (req.cwd) directoryDefaults.set(req.cwd, next);
              else defaults = next;
              data = structuredClone(next);
            }
            break;
          case "session.defaults.delete":
            lastDefaultsDelete = req;
            if (!directoryDefaults.delete(req.cwd)) {
              this.receive({ type: "response", id: req.id, ok: false, error: "该目录没有独立配置" });
              return;
            }
            data = structuredClone(defaults);
            break;
          case "session.create":
            lastCreation = req;
            const selected = { ...(req.useDefaults === false ? {} : defaults), ...req };
            data = { ...states[0], config: { ...config, model: selected.model || config.model, subagentModel: selected.subagentModel ?? null, capabilitySelection: selected.capabilities ?? null, subagentCapabilities: selected.subagentCapabilities ?? null } };
            break;
          case "service.status":
            data = { managed: true, error: "", version: "9.9.9", importDir: "C:\\pi\\sessions", dev: true, maintenance: { url: "http://127.0.0.1:4567", token: "secret" } };
            break;
          case "service.restart":
            this.receive({ type: "response", id: req.id, ok: false, error: "请先停止正在运行的会话" });
            return;
          case "models.favorites.get":
            data = { provider: [], model: [], thinking: [] };
            break;
          case "models.list":
            data = [
              // models.list 始终投影 levels（src/pi.js 的 catalog 投影），界面只列模型真正支持的等级。
              { key: "test/model", provider: "test", name: "Model", levels: ["off"] },
              { key: "other/child", provider: "other", name: "Child", levels: ["off", "medium", "high"] },
            ];
            break;
          case "session.configure":
            if (failConfig) {
              this.receive({ type: "response", id: req.id, ok: false, error: "configuration unavailable" });
              return;
            }
            if (holdConfig) {
              heldConfig = req;
              return;
            }
            data = { ...states.find((s) => s.sessionId === req.sessionId).config,
              ...Object.fromEntries(["model", "thinking", "subagentModel", "subagentThinking"].filter((key) => key in req).map((key) => [key, req[key]])) };
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
              sessionFile: `C:\\axiom\\${s.sessionId}.jsonl`,
              updatedAt: Date.now(),
            }));
            break;
          case "session.attach":
            if (attachError && req.sessionId === "a") {
              this.receive({ type: "response", id: req.id, ok: false, error: attachError });
              return;
            }
            data = states.find((s) => s.sessionId === req.sessionId);
            break;
          case "session.import":
            lastImport = req;
            data = { sessionId: "imported", title: "imported", cwd: req.cwd, status: "idle", config, messages: [], tasks: [], live: {} };
            break;
          case "session.duplicate":
            // 与后端一致：标题原词接序号，任务历史随副本保留，运行状态归零。
            lastDuplication = req;
            {
              const source = states.find((s) => s.sessionId === req.sessionId);
              const copy = structuredClone(source);
              copy.sessionId = "dup";
              copy.title = `${source.title.replace(/\s+\d+$/, "")} 1`;
              copy.status = "idle";
              copy.live = {};
              states.push(copy);
              data = copy;
            }
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
    window.eval(`${modelSources}\n${pickerSource}\n${serviceSource}\n${source}\nwindow.sidebarStripFiles = () => { allSessions = allSessions.map((s) => ({ ...s, sessionFile: null })); renderSessions(); };
    window.sidebarCheck = async () => {
      allSessions = allSessions.map((s) => ({...s, sessionFile: null}));
      await updateSessions();
      return allSessions.find((s) => s.id === 'b').sessionFile;
    };
    window.sidebarConnected = (value) => { connected = value; updateAvailability(); };
    window.sessionState = () => ({ connected, sessionId, error: document.getElementById("error").textContent });
    window.openPageAs = (value) => { sessionId = value; };
    // seenSessions 是模块作用域的 let，后续 window.eval 访问不到，必须由同一段代码暴露写入口。
    window.setSeenSessions = (value) => { seenSessions = value; renderSessions(); };`);
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
    // 重连定时器是 1000ms（public/app.js reconnectDelay）；固定 sleep 只留 100ms 余量，
    // 负载高时定时器晚触发就假失败。改为轮询等待，上限只防卡死。
    for (let i = 0; i < 300 && sockets.length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sockets.length, 2, "failed initial connection retries without refresh");
    $("connect").click();
    assert.equal(sockets.length, 2, "manual retry cannot create a concurrent socket");
    sockets[1].open();
    await settle();
    paint();
    // 原文视图是并排面板（非 modal），按钮紧挨主题切换，用 aria-pressed 表示开合。
    assert.equal($("open-raw-io").nextElementSibling, $("toggle-theme"), "原文按钮紧邻主题切换");
    const fontScale = $("conversation-font-scale");
    assert.equal(fontScale.value, "100");
    for (const scale of ["125", "150", "175", "200", "100"]) {
      fontScale.value = scale;
      fontScale.dispatchEvent(new window.Event("change"));
      assert.equal(window.document.documentElement.dataset.conversationFontScale, scale);
      assert.equal(window.localStorage.getItem("axiom.conversationFontScale"), scale);
    }
    window.eval('applyConversationFontScale("invalid")');
    assert.equal(fontScale.value, "100", "损坏配置回退默认字号");
    $("open-raw-io").click();
    assert.equal($("raw-io").hidden, false);
    assert.equal($("raw-io").tagName, "SECTION", "原文视图是面板不是 modal 对话框");
    assert.equal(window.document.querySelector("dialog#raw-io"), null);
    assert.equal($("open-raw-io").getAttribute("aria-pressed"), "true");
    const rawRows = () => [...$("raw-io-list").querySelectorAll(".raw-message")];
    assert.equal(rawRows().length, 0);
    assert.equal($("raw-io-empty").hidden, false, "空会话给提示而不是伪造事件");
    const rawSession = window.sessionStorage.getItem("axiom.session");
    const rawTag = '<axiom_display>**原文**<img src=x onerror=alert(1)></axiom_display>';
    // 没有 message.start 也必须记录增量：正文渲染器会忽略这种事件。
    sockets[1].receive({ type: "agent.delta", sessionId: rawSession, data: { type: "text_delta", delta: rawTag } });
    paint();
    assert.equal(rawRows().length, 1);
    const streamed = rawRows()[0];
    assert.match(streamed.querySelector(".raw-message-bar").textContent, /模型输出/, "流式消息带标签");
    assert.equal(streamed.querySelector("pre").textContent, rawTag, "标签按原文保留，不解析 Markdown/HTML");
    assert.equal(streamed.querySelector("pre").children.length, 0, "原文只有文本节点");
    assert.equal($("raw-io-list").querySelector("img"), null, "原文不执行 HTML");
    sockets[1].receive({ type: "agent.delta", sessionId: "other-session", data: { type: "text_delta", delta: "不能串会话" } });
    paint();
    assert.equal(rawRows().length, 1, "其他会话的事件不进当前原文面板");
    assert.doesNotMatch($("raw-io-list").textContent, /不能串会话/);
    // 复制按钮沿用已有剪贴板 mock，取的是原文而不是渲染后的正文。
    copiedPath = "unchanged";
    streamed.querySelector(".raw-copy").click();
    await settle();
    assert.equal(copiedPath, rawTag, "复制的是逐字原文");
    // 关闭后再来增量：重开时补画，不丢内容也不在隐藏时白白渲染 DOM。
    $("close-raw-io").click();
    assert.equal($("raw-io").hidden, true);
    assert.equal($("open-raw-io").getAttribute("aria-pressed"), "false");
    assert.equal(window.document.activeElement, $("open-raw-io"), "关闭后焦点回到开关按钮");
    sockets[1].receive({ type: "agent.delta", sessionId: rawSession, agentId: "child", data: { type: "text_delta", delta: "关闭后仍记录子代理" } });
    paint();
    $("open-raw-io").click();
    assert.equal(rawRows().length, 2);
    assert.match(rawRows()[1].querySelector(".raw-message-bar").textContent, /模型输出 · 子代理/, "子代理原文单独标记");
    assert.equal(rawRows()[1].querySelector("pre").textContent, "关闭后仍记录子代理");
    $("close-raw-io").click();
    assert.equal($("service-dev").hidden, false);
    assert.doesNotMatch($("service-dev").outerHTML, /[DF]:[\\/]/, "dev badge must not expose the source path");
    assert.equal($("service-update-section").hidden, true, "dev hides the update group");
    assert.equal(window.sessionStorage.getItem("axiom.maintenance"), JSON.stringify({ url: "http://127.0.0.1:4567", token: "secret" }));
    $("status").click();
    assert.equal($("settings").open, true, "header status opens settings");
    assert.equal($("connection-panel").hidden, false, "header status opens the connection panel");
    assert.equal($("service-panel").hidden, true);
    assert.equal($("defaults-panel").hidden, true);
    // 连接面板：无保存地址时预填当前 origin；解析规则与壳内连接页 desktop/connector 一致。
    assert.equal($("connection-address").value, "http://localhost", "无保存地址时预填当前 origin");
    const normalize = window.eval("normalizeBackendAddress");
    assert.equal(normalize("192.168.1.8:9000"), "http://192.168.1.8:9000");
    assert.equal(normalize("192.168.1.8"), "http://192.168.1.8:4319", "无端口默认 4319");
    assert.equal(normalize("https://example.com:8443"), "https://example.com:8443");
    assert.equal(normalize("http://[::1]:4319"), "http://[::1]:4319", "IPv6 保留括号");
    assert.equal(normalize("javascript://x"), null, "拒绝非 http(s) 协议");
    assert.equal(normalize("http://user:pass@host"), null, "拒绝 userinfo");
    assert.equal(normalize("host:99999"), null, "拒绝非法端口");
    assert.equal(normalize("   "), null, "空地址拒绝");
    // 无效提交：反馈错误、不写入存储；有效提交：保存地址并整页跳转（stub href 捕获目标，避免 jsdom 导航噪音）。
    $("connection-address").value = "javascript://x";
    $("connection-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    assert.match($("connection-feedback").textContent, /地址无效/);
    assert.equal(window.localStorage.getItem("axiom.connection.address"), null);
    $("connection-address").value = "192.168.1.8:9000";
    $("connection-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(window.localStorage.getItem("axiom.connection.address"), "http://192.168.1.8:9000", "提交后保存规范化地址");
    assert.match($("connection-feedback").textContent, /正在跳转/);
    assert.equal(jsdomErrors.some((error) => /navigation/.test(error.message)), true, "提交后触发整页导航到新后端");
    $("settings").close();
    assert.equal($("workspace").hidden, false);
    assert.equal(requests.some((req) => req.type === "session.defaults.list"), false, "只看服务面板不拉取默认配置");
    assert.equal($("send").disabled, true);
    assert.equal($("send").textContent, "发送");
    assert.equal(window.document.querySelector("header .menu"), null);
    const firstActions = $("sessions").querySelector(".session-actions");
    assert.deepEqual([...$("sessions").querySelectorAll(".session-group")].map((n) => n.textContent), ["进行中"], "没有已完成会话时空组不渲染");
    assert.equal(firstActions.children[0].className, "session-pin");
    assert.equal(firstActions.children[0].title, "置顶");
    assert.equal(firstActions.children[1].className, "session-hide");
    assert.equal(firstActions.children[1].title, "标记已完成");
    assert.equal(firstActions.querySelector(".session-open"), null);
    assert.equal(firstActions.children[2].className, "session-duplicate");
    assert.equal(firstActions.children[2].title, "复制会话");
    assert.equal(firstActions.children[2].disabled, true, "running sessions cannot be duplicated");
    assert.equal(firstActions.children[3].className, "session-copy");
    assert.equal(firstActions.children[3].title, "复制文件");
    assert.equal(firstActions.querySelector(".session-rename").title, "重命名");
    assert.equal($("sessions").querySelector(".session-completed"), null, "空已完成组不渲染");
    // 分组可折叠：summary 扛计数徽章，重绘保留手动状态并按工作区写入 localStorage。
    const activeGroup = $("sessions").querySelector('[data-group="active"]');
    assert.equal(activeGroup.querySelector(".session-group").textContent, "进行中");
    assert.equal(activeGroup.querySelector(".session-group-count").textContent, "3");
    assert.equal(activeGroup.open, true, "active group defaults to expanded");
    activeGroup.open = false;
    window.eval("renderSessions()");
    assert.equal($("sessions").querySelector('[data-group="active"]').open, false, "refresh preserves manual disclosure");
    assert.equal(JSON.parse(window.localStorage.getItem("axiom.sessionGroups"))["c:/work"].active, false);
    $("sessions").querySelector('[data-group="active"]').open = true;
    window.eval("renderSessions()");
    assert.equal($("sessions").querySelector('[data-group="active"]').open, true);
    assert.equal(firstActions.children[1].querySelector("svg").dataset.icon, "check");
    const beforeHide = requests.length;
    const row = (id) => $("sessions").querySelector(`[data-session-id="${id}"]`);
    row("a").querySelector(".session-hide").click();
    await settle();
    assert.equal($("sessions").querySelector('[aria-label="已完成"] .session-item span').textContent, "a");
    assert.deepEqual(JSON.parse(window.localStorage.getItem("axiom.hiddenSessions")), ["a"]);
    assert.equal($("session-title").textContent, "a");
    assert.equal($("sessions").querySelector(".session-completed").open, false, "已完成默认折叠");
    $("sessions").querySelector(".session-completed").open = true;
    window.eval("renderSessions()");
    assert.equal($("sessions").querySelector(".session-completed").open, true, "refresh preserves manual disclosure");
    assert.equal($("sessions").querySelector('[aria-label="已完成"] .session-item span').textContent, "a");
    $("search").value = "b";
    $("search").oninput();
    assert.equal($("sessions").querySelectorAll(".session-row").length, 1);
    $("search").value = "";
    $("search").oninput();
    row("a").querySelector(".session-hide").click();
    await settle();
    assert.deepEqual(JSON.parse(window.localStorage.getItem("axiom.hiddenSessions")), []);
    assert.equal(requests.length, beforeHide, "completion markers never delete or cancel sessions");
    const rowTitles = () => [...$("sessions").querySelectorAll(".session-row .session-item span")].map((n) => n.textContent);
    assert.deepEqual(rowTitles(), ["c", "a", "b"], "running session pins to the top, the rest keep last-activity order");
    assert.equal(row("a").draggable, false);
    window.localStorage.setItem("axiom.sessionOrder", '["b","a","c"]');
    window.eval("renderSessions()");
    assert.deepEqual(rowTitles(), ["c", "a", "b"], "legacy custom order is ignored");
    // 置顶：纯本地偏好，排到运行中之前，并在自己的分组里加深底色；取消后恢复原序且持久化。
    row("b").querySelector(".session-more").click();
    row("b").querySelector(".session-pin").click();
    await settle();
    assert.deepEqual(JSON.parse(window.localStorage.getItem("axiom.pinnedSessions")), ["b"]);
    assert.deepEqual(rowTitles(), ["b", "c", "a"], "pinned session sorts above a running one");
    assert.deepEqual([...$("sessions").querySelectorAll(".session-group")].map((n) => n.textContent), ["置顶", "进行中"], "空置顶/已完成组都不渲染");
    assert.ok(row("b").classList.contains("pinned"), "pinned row gets the highlighted class");
    assert.equal(row("b").querySelector(".session-pin-icon").getAttribute("aria-label"), "已置顶");
    assert.equal(row("b").querySelector(".session-more").title, "会话操作：b");
    assert.equal(requests.length, beforeHide, "pinning never talks to the server");
    row("b").querySelector(".session-more").click();
    row("b").querySelector(".session-pin").click();
    await settle();
    assert.deepEqual(JSON.parse(window.localStorage.getItem("axiom.pinnedSessions")), []);
    assert.deepEqual([...$("sessions").querySelectorAll(".session-group")].map((n) => n.textContent), ["进行中"], "empty pinned group disappears");
    assert.deepEqual(rowTitles(), ["c", "a", "b"], "unpinning restores the normal order");
    // 跑完待查看：seen 记在打开之前 → 标主题色点；打开会话即写回时间戳并落盘。
    window.setSeenSessions({ a: 1, b: 1 });
    const attention = row("b").querySelector(".session-attention-dot");
    assert.equal(attention.hidden, false, "finished-but-unopened session shows the attention dot");
    assert.equal(attention.getAttribute("aria-label"), "有待查看的结果");
    assert.equal(row("c").querySelector(".session-running-dot").hidden, false, "running session keeps the green dot");
    window.eval('markSessionSeen("b")');
    assert.ok(JSON.parse(window.localStorage.getItem("axiom.sessionSeen")).b > 0, "opening a session records its seen timestamp");
    window.setSeenSessions({});
    row("b").querySelector(".session-rename").click();
    assert.equal($("session-name").value, "b");
    $("session-name").value = "Renamed other session";
    $("session-action-form").requestSubmit();
    await settle();
    assert.equal(requests.findLast((r) => r.type === "session.rename").sessionId, "b");
    assert.equal($("session-title").textContent, "a", "editing another row does not switch sessions");
    assert.equal(window.document.title, "a · work — Axiom", "browser tabs identify the active conversation and workspace");
    row("b").querySelector(".session-delete").click();
    assert.match($("session-action-description").textContent, /Renamed other session/);
    assert.equal($("session-action-submit").classList.contains("danger"), true);
    assert.equal(window.document.activeElement, $("session-action-cancel"));
    $("session-action-cancel").click();
    assert.equal($("composer-skill").disabled, false);
    assert.equal($("composer-skill").options[1].title, "代码导航");
    assert.equal($("composer-skill").hidden, true);
    assert.equal($("stop").textContent.trim(), "Stop");
    assert.equal($("stop").querySelector('svg[aria-hidden="true"]').dataset.icon, "stop");
    assert.equal(await window.sidebarCheck(), "C:\\axiom\\b.jsonl", "file-only changes refresh cached copy targets");
    window.sidebarConnected(false);
    assert.equal(row("b").querySelector(".session-copy").disabled, false);
    assert.equal(row("b").querySelector('[data-copy="path"]').disabled, false);
    assert.equal(row("b").querySelector(".session-hide").disabled, false);
    assert.equal(row("b").querySelector(".session-delete").disabled, true);
    assert.equal(row("b").querySelector(".session-duplicate").disabled, true, "duplication needs a live connection");
    window.sidebarConnected(true);
    for (const [part, expected] of [["directory", "C:\\axiom\\"], ["name", "b.jsonl"], ["path", "C:\\axiom\\b.jsonl"]]) {
      const menu = row("b").querySelector(".session-options");
      menu.open = true;
      row("b").querySelector(".session-copy").click();
      assert.equal(menu.open, true, "opening copy options keeps parent menu open");
      assert.equal(row("b").querySelector(".session-copy-menu").hidden, false);
      row("b").querySelector(`[data-copy="${part}"]`).click(); await settle();
      assert.equal(copiedPath, expected);
      assert.equal(menu.open, false);
    }
    for (const [file, directory, name] of [["/a/b.jsonl", "/a/", "b.jsonl"], ["/b.jsonl", "/", "b.jsonl"], ["C:\\b.jsonl", "C:\\", "b.jsonl"], ["\\\\host\\share\\b.jsonl", "\\\\host\\share\\", "b.jsonl"]]) {
      for (const [kind, expected] of [["directory", directory], ["name", name], ["path", file]]) {
        await window.eval(`copySessionFile({sessionFile:${JSON.stringify(file)}}, document.createElement('button'), ${JSON.stringify(kind)})`);
        assert.equal(copiedPath, expected);
      }
    }
    await window.eval("copySessionFile({}, document.createElement('button'))");
    assert.match($("error").textContent, /还没有 JSONL/);
    window.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
    await window.eval("copySessionFile({sessionFile:'/a.jsonl'}, document.createElement('button'))");
    assert.match($("error").textContent, /复制失败/);
    window.navigator.clipboard.writeText = originalWriteText;
    $("copy-workspace").click(); await settle();
    assert.equal(copiedPath, "C:\\work");
    $("reveal-workspace").click(); await settle();
    assert.equal(requests.findLast((req) => req.type === "workspace.reveal").sessionId, "a");
    // 复制会话：服务端按落盘历史重建副本并切换过去；没有会话文件的会话先禁用。
    window.eval("window.sidebarStripFiles()");
    assert.equal(row("b").querySelector(".session-duplicate").disabled, true, "sessions without a landed file cannot be duplicated");
    await window.eval("refreshSessions()");
    assert.equal(row("b").querySelector(".session-duplicate").disabled, false);
    row("b").querySelector(".session-more").click();
    row("b").querySelector(".session-duplicate").click();
    await settle();
    assert.equal(lastDuplication.sessionId, "b");
    assert.equal($("session-title").textContent, "Renamed other session 1", "duplication switches to the copy");
    assert.equal(row("dup").querySelector(".session-item span").textContent, "Renamed other session 1");
    window.open = () => {};
    $("open-workspace").click(); await settle();
    assert.equal($("file-picker").open, true);
    $("file-picker-confirm").click(); await settle();
    assert.equal($("open-workspace").disabled, false);
    assert.equal(requests.findLast((req) => req.type === "session.create")?.cwd, "C:\\other", $("error").textContent);
    states.push({ ...states[0], sessionId: "other-workspace", cwd: "C:\\other" });
    await window.eval('switchSession(() => request("session.attach", { sessionId: "other-workspace" }))');
    assert.equal($("workspace-label").textContent, "C:\\other", "other workspaces open inside the application");
    await window.eval('switchSession(() => request("session.attach", { sessionId: "a" }))');
    assert.ok(rowTitles().includes("a"));
    const otherRow = $("sessions").querySelector('[data-session-id="other-workspace"]');
    assert.ok(otherRow, "other workspace session appears in its own workspace group");
    const wsGroup = otherRow.closest('.workspace-group');
    assert.ok(wsGroup, "session is inside a workspace-group");
    assert.equal(wsGroup.open, false, "other workspace is collapsed by default");
    assert.equal(window.sessionStorage.getItem("axiom.session"), "a", "selection is tab-local");
    assert.equal(window.localStorage.getItem("axiom.session"), null, "switching does not overwrite other tabs' selection");
    assert.equal(new window.URLSearchParams(window.location.hash.slice(1)).get("session"), "a");
    let opened;
    window.open = (...args) => { opened = args; };
    row("a").querySelector(".session-copy").click();
    await settle();
    assert.equal(opened, undefined);
    $("prompt").value = "current workspace draft";
    await window.eval('switchSession(() => request("session.attach", { sessionId: "other-workspace" }))');
    assert.equal(opened, undefined);
    assert.equal($("workspace-label").textContent, "C:\\other");
    await window.eval('switchSession(() => request("session.attach", { sessionId: "a" }))');
    assert.equal($("workspace-label").textContent, "C:\\work");
    assert.equal($("prompt").value, "current workspace draft", "opening another tab preserves this draft");
    $("prompt").value = "";
    $("search").value = "C:\\other"; $("search").oninput();
    // 搜索是全局的，但 "C:\\other" 不匹配任何会话标题，也不匹配工作区名
    // 工作区名 "C:\work" 和 "C:\other" 都不在会话标题中，所以 0 行
    assert.equal($("sessions").querySelectorAll(".session-row").length, 0, "non-matching search shows no rows");
    $("search").value = ""; $("search").oninput();
    assert.equal(requests.some((req) => req.type === "cancel"), false, "opening and switching workspaces never cancels background work");
    await window.eval('switchSession(() => request("session.attach", { sessionId: "a" }))');
    states.pop();
    await window.eval("refreshSessions()");
    lastCreation = undefined;
    const openContext = () => {
      const event = new window.Event("beforetoggle");
      event.newState = "open";
      $("context-menu").dispatchEvent(event);
    };
    openContext();
    assert.equal($("context-picker").hidden, true);
    window.document.querySelector('[data-context="skill"]').click();
    assert.equal($("context-picker").tagName, "SECTION", "skills stay inside the plus menu, not a modal");
    assert.equal($("context-picker").parentElement, $("context-menu"));
    assert.equal($("context-picker").hidden, false);
    assert.equal(window.document.querySelector('[data-context="file"]').hidden, false, "category options stay beside the skill list");
    assert.equal(window.document.querySelector('[data-context="skill"]').getAttribute("aria-expanded"), "true");
    $("context-back").click();
    assert.equal($("context-picker").hidden, true);
    assert.equal(window.document.activeElement.dataset.context, "skill");
    window.document.querySelector('[data-context="skill"]').click();
    openContext();
    assert.equal($("context-picker").hidden, true, "reopening plus resets the menu");
    window.document.querySelector('[data-context="skill"]').click();
    await settle();
    assert.match($("context-results").textContent, /project-new/, "opening skills discovers new project skills");
    $("context-search").value = "新增项目技能";
    $("context-search").dispatchEvent(new window.Event("input"));
    $("context-results").firstChild.click();
    assert.match($("context-chips").textContent, /project-new/, "refreshed skills are selectable");
    $("context-chips").firstChild.click();
    window.document.querySelector('[data-context="skill"]').click();
    await settle();
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
    $("composer").requestSubmit(); paint(); await settle();
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
    $("composer").requestSubmit(); paint(); await settle();
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
    // 回归：根目录没有 app.js，@ 输入必须靠服务端在工作空间内递归模糊搜索才能命中。
    input("@app"); await settle();
    assert.match($("prompt-completion").textContent, /文件：src\/app\.js/);
    completionKey("Escape"); input("");
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
    paint();
    await settle();
    assert.equal(requests.findLast((req) => req.type === "prompt").text, "/skill:codebase-map 检查代码");
    $("open-raw-io").click();
    const liveRows = [...$("raw-io-list").querySelectorAll(".raw-message")];
    assert.ok(liveRows.length >= 1);
    assert.match(liveRows.at(-1).querySelector(".raw-message-bar").textContent, /你的输入/, "用户输入带标签");
    assert.equal(liveRows.at(-1).querySelector("pre").textContent, "/skill:codebase-map 检查代码", "输入请求按原文逐条展示");
    assert.doesNotMatch($("raw-io-list").textContent, /关闭后仍记录子代理/, "切换快照清除旧会话事件");
    // 点击左侧消息后可用「定位对话」从原文跳回正文消息（面板收起，对应行标记选中）。
    assert.equal(liveRows.at(-1).querySelector(".raw-locate").hidden, false, "已绑定的消息可回跳");
    liveRows.at(-1).querySelector(".raw-locate").click();
    assert.equal($("raw-io").hidden, true, "定位后收起面板回到对话");
    assert.equal(liveRows.at(-1).classList.contains("raw-selected"), true, "对应原文行被标记选中");
    $("open-raw-io").click();
    // 换会话后原文面板换成该会话的历史消息（来自快照），上一会话的残留不串台。
    await window.eval('switchSession(() => request("session.attach", { sessionId: "b" }))');
    paint();
    const historyRows = [...$("raw-io-list").querySelectorAll(".raw-message")];
    assert.deepEqual(historyRows.map((row) => row.querySelector("pre").textContent), ["historical prompt", "historical result"], "历史消息按原文逐条列出");
    assert.match(historyRows[0].querySelector(".raw-message-bar").textContent, /你的输入/);
    assert.match(historyRows[1].querySelector(".raw-message-bar").textContent, /模型输出 · 子代理/);
    assert.doesNotMatch($("raw-io-list").textContent, /skill:codebase-map/, "会话隔离：另一会话的原文不串台");
    await window.eval('switchSession(() => request("session.attach", { sessionId: "a" }))');
    paint();
    $("close-raw-io").click();
    assert.equal($("composer-skill").value, "");
    sockets[1].receive({ type: "session.status", sessionId: "a", data: { status: "idle" } });
    // 正在看的会话跑完即算已读：idle 事件要写回 seen，否则切走后会被错标成待查看。
    const onScreen = window.sessionState().sessionId;
    window.localStorage.removeItem("axiom.sessionSeen");
    sockets[1].receive({ type: "session.state", sessionId: onScreen, data: { status: "idle" } });
    assert.ok(JSON.parse(window.localStorage.getItem("axiom.sessionSeen"))[onScreen] > 0, "the session on screen is marked seen when it finishes");
    input("");
    assert.match($("session-runtime").textContent, /缓存命中 尚无已报告用量的请求.*上下文 等待首条消息.*test · model · off/);
    assert.equal($("thinking").selectedOptions[0].textContent, "off");
    assert.equal(window.runtimeSummary({ model: "zai-coding-cn/glm-5.3-flash", thinking: "max" })[2], "zai-coding-cn · glm-5.3-flash · max");
    assert.match(window.runtimeSummary({ usage: { input: 100, cacheRead: 0, cacheWrite: 0 } })[0], /0.0%/);
    assert.match(window.runtimeSummary({ usage: { input: 0, cacheRead: 0 } })[0], /供应商未报告缓存用量/);
    assert.match(window.runtimeSummary({ context: { tokens: null, contextWindow: 10000, percent: null } })[1], /— \/ 10,000 tokens · 待更新/);
    assert.equal($("session-runtime").previousElementSibling.className, "actions");
    assert.equal($("subagent-model").value, "");
    assert.equal($("subagent-model").disabled, true);
    assert.equal($("composer").contains($("subagent-model")), false);
    assert.equal($("new").textContent.trim(), "新会话");
    assert.equal($("new").querySelector("svg").dataset.icon, "plus");
    const mainThinking = $("thinking").value;
    $("agent-role").value = "subagent";
    $("agent-role").dispatchEvent(new window.Event("change"));
    assert.equal($("model").value, "");
    assert.equal($("model").disabled, true);
    $("provider").value = "other";
    $("provider").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(states[0].config.subagentModel, "other/child");
    assert.equal(states[0].config.model, "test/model");
    $("thinking").value = "off";
    $("thinking").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(states[0].config.subagentThinking, "off");
    assert.equal(states[0].config.thinking, mainThinking);
    $("thinking").value = "";
    $("thinking").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(states[0].config.subagentThinking, null);
    $("provider").value = "";
    $("provider").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(states[0].config.subagentModel, null);
    $("agent-role").value = "main";
    $("agent-role").dispatchEvent(new window.Event("change"));
    assert.equal($("model").value, "test/model");
    assert.equal($("thinking").value, mainThinking);
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
    assert.equal(requests.filter((req) => req.type === "session.defaults.list").length, 1, "打开设置面板拉取已配置目录");
    assert.equal($("defaults-editor").contains($("create-form")), true);
    assert.match($("create-agents").textContent, /\[全局\] Skill A/);
    assert.match($("create-agents").textContent, /\[当前项目\] Skill B/);
    assert.equal($("defaults-workspace").value, "", "默认编辑全局默认配置");
    assert.equal($("create-main-provider").value, "", "defaults do not take the current model implicitly");
    assert.equal(window.document.querySelectorAll('.settings-nav button').length, 5, "连接 + 默认新会话设置 + 远程控制 + 模型与供应商 + 服务与更新");
    assert.equal($("create-subagent-mode").querySelector('option[value="inherit"]').textContent, "跟随主代理能力");
    // 思考等级只列出「当前选中模型真正支持的等级」：还没选模型时回退到当前会话的等级集合。
    assert.deepEqual([...$("create-subagent-thinking").options].map((option) => option.value), ["", "off"],
      "未选模型时不再罗列 max 等模型并不支持的等级");
    $("create-subagent-thinking").value = "off";
    $("create-main-provider").value = "other";
    $("create-main-provider").dispatchEvent(new window.Event("change"));
    // 选中 other/child（levels: off/medium/high）后，等级列表随即跟上。
    assert.deepEqual([...$("create-main-thinking").options].map((option) => option.value), ["", "off", "medium", "high"],
      "换模型后等级列表跟着换");
    $("create-main-thinking").value = "high";
    $("create-main-mode").value = "custom";
    $("create-main-mode").dispatchEvent(new window.Event("change"));
    window.document.querySelectorAll('.capability-agent:first-child input[data-kind="skills"]')[1].checked = false;
    $("create-subagent-mode").value = "custom";
    $("create-subagent-mode").dispatchEvent(new window.Event("change"));
    for (const checkbox of window.document.querySelectorAll('.capability-agent:last-child input')) checkbox.checked = false;
    failDefaults = true;
    $("create-form").requestSubmit();
    await settle();
    assert.match($("create-feedback").textContent, /保存失败.*defaults unavailable/);
    assert.equal(defaults.capabilities, null);
    failDefaults = false;
    $("create-form").requestSubmit();
    await settle();
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
    assert.equal(window.document.querySelectorAll('.capability-agent:first-child input[data-kind="skills"]:checked').length, 1);
    assert.doesNotMatch($("create-agents").textContent, /missing-skill/, "不能把当前目录清单之外的能力补成可选项");
    assert.equal(window.document.querySelectorAll('.capability-agent:last-child input[data-kind]:checked').length, 0);
    needsTrust = false;
    defaults.capabilities.skills.pop();
    $("settings").close();
    $("new").click();
    await settle();
    assert.equal($("model").value, "other/child");
    assert.equal(Object.hasOwn(lastCreation, "capabilities"), false, "ordinary creation resolves defaults on the server");
    assert.equal($("defaults-preview").compareDocumentPosition($("defaults-editor")) & window.Node.DOCUMENT_POSITION_FOLLOWING, window.Node.DOCUMENT_POSITION_FOLLOWING);
    row("a").querySelector(".session-item").click();
    await settle();
    // 配置范围下拉：只切换要编辑的默认配置，不切换当前会话；目录配置可增可删。
    const configuredPaths = () => [...$("defaults-workspace").options].map((option) => option.value);
    const sessionsSwitched = () => requests.filter((req) => ["session.attach", "session.create"].includes(req.type)).length;
    $("open-settings").click();
    await settle();
    assert.equal($("defaults-panel").hidden, false, "设置默认打开默认新会话面板");
    assert.deepEqual(configuredPaths(), ["", "C:\\other"], "下拉列出全局默认与已配置目录");
    assert.equal($("defaults-delete").hidden, true, "全局默认没有可删除的目录配置");
    const switchedBefore = sessionsSwitched();
    $("defaults-workspace").value = "C:\\other";
    $("defaults-workspace").dispatchEvent(new window.Event("change"));
    await settle();
    assert.equal(sessionsSwitched(), switchedBefore, "切换配置范围不 attach、不新建会话");
    assert.equal(window.sessionState().sessionId, "a", "当前会话不变");
    assert.equal($("session-title").textContent, "a", "页头仍显示当前会话");
    assert.equal($("create-main-model").value, "other/child", "编辑器加载该目录自己的配置");
    assert.equal($("defaults-delete").hidden, false, "目录配置可以删除");
    // 编辑目录配置：保存必须带 cwd，且不污染全局默认。
    const globalDefaultsBefore = structuredClone(defaults);
    $("create-main-thinking").value = "off";
    $("create-main-thinking").dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.equal(lastDefaults.cwd, "C:\\other", "保存目录配置带上 cwd");
    assert.equal(directoryDefaults.get("C:\\other").thinking, "off");
    assert.deepEqual(defaults, globalDefaultsBefore, "目录配置不写全局默认");
    assert.equal(window.sessionState().sessionId, "a", "保存目录配置不切换会话");
    // 新增目录配置：选中的目录从全局默认复制一份独立配置后加入下拉。
    pickerRoot = true;
    $("defaults-directory").click();
    await settle();
    assert.equal($("file-picker").open, true);
    $("file-picker-results").querySelector(".fp-row").click();
    await settle();
    $("file-picker-confirm").click();
    await settle();
    assert.deepEqual(configuredPaths(), ["", "C:\\other", "C:\\other\\picked"], "新目录进入下拉");
    assert.equal($("defaults-workspace").value, "C:\\other\\picked", "选完自动切到新目录配置");
    assert.equal($("defaults-delete").hidden, false);
    assert.equal(sessionsSwitched(), switchedBefore, "选择目录同样不切换会话");
    // 删除目录配置：回落全局默认，当前会话不动。
    $("defaults-delete").click();
    await settle();
    assert.equal(lastDefaultsDelete.cwd, "C:\\other\\picked", "删除的是当前下拉选中的目录");
    assert.deepEqual(configuredPaths(), ["", "C:\\other"]);
    assert.equal($("defaults-workspace").value, "", "删除后回到全局默认");
    assert.equal($("create-main-model").value, "other/child", "编辑器回到全局默认配置");
    assert.equal($("defaults-delete").hidden, true);
    assert.equal(sessionsSwitched(), switchedBefore, "删除目录配置不切换会话");
    $("settings").close();
    input("first draft\nsecond line");
    assert.equal($("send").disabled, false);
    row("b").querySelector(".session-item").click();
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
    assert.match(historicalTrigger.textContent, /子代理.*已完成/s);
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
    row("a").querySelector(".session-item").click();
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
    $("create-subagent-mode").value = "all";
    $("create-subagent-mode").dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.equal(defaults.subagentCapabilities, null, "change auto-saves through WebSocket without submit click");
    assert.match($("create-feedback").textContent, /已保存到本机/);
    assert.match($("defaults-preview").textContent, /Skills：skill-a/);
    assert.equal($("settings").open, true);
    $("settings").close();
    input("  accepted task \n");
    failList = true;
    $("composer").requestSubmit();
    paint();
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
    assert.equal($("service-update-section").hidden, true, "dev hides the update group");
    const restartRequests = () => requests.filter((r) => r.type === "service.restart");
    window.confirm = () => { throw new Error("must use styled dialog"); };
    for (const mode of ["quick", "rebuild"]) {
      const before = restartRequests().length;
      $(`restart-${mode}`).click();
      assert.equal($("restart-dialog").open, true);
      assert.equal(window.document.activeElement, $("restart-cancel"));
      assert.match($("restart-description").textContent,
        mode === "quick" ? /不修复依赖/ : /数分钟/);
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
      await settle(); // 发送走保序链（微任务），断言前冲刷。
      $("restart-form").requestSubmit();
      assert.equal($("restart-dialog").open, false);
      assert.equal(restartRequests().length, before + 1);
      assert.equal(restartRequests().at(-1).mode, mode);
      await settle();
      assert.match($("service-feedback").textContent, /请先停止/);
      assert.equal($(`restart-${mode}`).disabled, false);
    }
    assert.equal($("status").dataset.connected, "true");
    emit("session.queue", { steering: ["内部通知"], followUp: [], internal: { steering: [true], followUp: [] } });
    assert.equal($("message-queue").hidden, true, "internal-only queue is not a user-editable queue");
    emit("session.queue", {
      steering: ["内部通知", "插话内容"], followUp: ["追加内容", "内部追加"],
      internal: { steering: [true, false], followUp: [false, true] },
      images: { steering: [null, [{ type: "image", data: "test" }]], followUp: [] },
    });
    assert.doesNotMatch($("message-queue").textContent, /内部/);
    assert.match($("message-queue").textContent, /图片 × 1/, "filtering keeps image indexes aligned");
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
    assert.equal(requests.findLast((r) => r.type === "cancel").mode, "safe", "快捷键只给安全停止，不能误触丢产出的强停");
    // 三次 Esc：把已进入上下文的输入退回输入框（服务端回退分支，客户端按新快照重绘消息区）。
    states[0].messages = [{ agentId: "main", entryId: "u1", message: { role: "user", content: "撤回的输入" } }];
    emit("session.state", { status: "idle" });
    await settle();
    input("撤回的输入");
    $("composer").requestSubmit();
    paint();
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

    // 两层停止：安全停止等轮次边界（结束前一直挂绿条），强停会丢产出所以要弹窗确认。
    emit("session.state", { status: "running" });
    await settle();
    assert.equal($("stop").hidden, false);
    assert.equal($("force-stop").hidden, false, "硬停始终是逃生门：长命令等不起安全点时还能立即停");
    assert.equal($("force-stop").classList.contains("danger"), true, "会丢产出的动作用警示色");
    assert.equal($("safe-stop-progress").hidden, true);
    assert.equal($("session-alert").hidden, true);
    $("stop").click();
    await settle();
    assert.equal(requests.findLast((r) => r.type === "cancel").mode, "safe");
    assert.equal(requests.findLast((r) => r.type === "queue.withdraw").sessionId, "a", "停止前先撤回队列，不让排队消息在下一次运行开头被默默消化");
    emit("session.state", { status: "running", safeStop: true });
    await settle();
    assert.equal($("safe-stop-progress").hidden, false, "等待期间给个看得见的交代");
    assert.match($("safe-stop-progress").textContent, /安全停止中/);
    assert.equal($("safe-stop-progress").getAttribute("role"), "status");
    assert.equal($("stop").hidden, true, "已在等安全点：再点一次没效果，只留强停");
    assert.equal($("force-stop").hidden, false);
    emit("session.state", { status: "idle", stopped: "safe" });
    await settle();
    assert.equal($("safe-stop-progress").hidden, true);
    assert.equal($("session-alert").hidden, false, "停住了就在标题前留点，用户回来才知道");
    $("session-alert").click();
    await settle();
    assert.equal($("session-alert").hidden, true, "点一下就消");
    emit("session.state", { status: "running" });
    await settle();
    const beforeForce = requests.filter((r) => r.type === "cancel").length;
    $("force-stop").click();
    assert.equal($("force-stop-dialog").open, true);
    assert.equal(window.document.activeElement, $("force-stop-cancel"));
    $("force-stop-cancel").click();
    await settle();
    assert.equal(requests.filter((r) => r.type === "cancel").length, beforeForce, "取消弹窗不停任务");
    $("force-stop").click();
    $("force-stop-form").requestSubmit();
    await settle();
    assert.equal($("force-stop-dialog").open, false);
    assert.equal(requests.findLast((r) => r.type === "cancel").mode, "force", "确认后才真停");
    emit("session.state", { status: "idle" });
    await settle();
    assert.equal($("session-alert").hidden, true, "正常跑完不留提醒点");
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
    // 运行中吸底：流式输出增高后浏览器补发的 scroll 事件不能判成“用户离开了底部”。
    // 用限位的 scrollTop 模拟真实浏览器的贴底（JSDOM 自身不会限位）。
    let transcriptHeight = 1800;
    const transcriptClient = 300;
    let transcriptTop = 0;
    Object.defineProperties($("transcript"), {
      scrollTop: {
        configurable: true,
        get: () => transcriptTop,
        set: (value) => { transcriptTop = Math.max(0, Math.min(value, transcriptHeight - transcriptClient)); },
      },
      scrollHeight: { configurable: true, get: () => transcriptHeight },
      clientHeight: { configurable: true, get: () => transcriptClient },
    });
    $("latest").click();
    paint();
    assert.equal($("transcript").scrollTop, 1500, "回到最新先贴到底部");
    $("transcript").dispatchEvent(new window.Event("scroll"));
    transcriptHeight = 1980; // 补底的滚动事件尚未派发，内容已被流式输出撑高。
    $("transcript").dispatchEvent(new window.Event("scroll"));
    assert.equal($("latest").hidden, true, "补发的滚动事件不暂停吸底");
    window.scrollLatest();
    paint();
    assert.equal($("transcript").scrollTop, 1680, "运行中继续贴底");
    $("transcript").dispatchEvent(new window.WheelEvent("wheel", { deltaY: -240 }));
    $("transcript").scrollTop = 900;
    $("transcript").dispatchEvent(new window.Event("scroll"));
    assert.equal($("latest").hidden, false, "用户上滚才暂停吸底");
    window.scrollLatest();
    paint();
    assert.equal($("transcript").scrollTop, 900, "暂停后不抢走阅读位置");
    $("transcript").scrollTop = 1680;
    $("transcript").dispatchEvent(new window.Event("scroll"));
    assert.equal($("latest").hidden, true, "滚回最底部自动恢复吸底");
    window.scrollLatest();
    paint();
    assert.equal($("transcript").scrollTop, 1680);
    for (const key of ["scrollTop", "scrollHeight", "clientHeight"]) delete $("transcript")[key];
    $("transcript").scrollTop = 0;
    const runtime = {
      model: "other/child", thinking: "high", systemPrompt: '<img src=x onerror="alert(1)">\nSystem instructions',
      tools: [{ name: "read", description: "<img src=x onerror=alert(1)>", parameters: { type: "object" } }],
      usage: { input: 100, cacheRead: 800, cacheWrite: 100 },
      context: { tokens: 1200, contextWindow: 10000, percent: 12 },
    };
    emit("agent.runtime", runtime, { agentId: "child" });
    assert.match($("session-runtime").textContent, /尚无已报告用量的请求/);
    emit("agent.runtime", { ...runtime, model: "test/model" });
    assert.match($("session-runtime").textContent, /80.0%.*test · model · high/);
    assert.equal($("session-system-prompt").textContent, runtime.systemPrompt);
    assert.equal($("session-active-tools").querySelector(".inspector-tool .tool-name").textContent, "read");
    assert.equal($("session-active-tools").querySelector(".inspector-tool p").textContent, runtime.tools[0].description);
    assert.equal($("session-inspector").querySelector("img"), null, "prompt and tool definitions are plain text");
    emit("agent.runtime", { ...runtime, systemPrompt: "child only" }, { agentId: "child" });
    assert.equal($("session-system-prompt").textContent, runtime.systemPrompt, "child runtime cannot overwrite main inspector");
    emit("agent.runtime", { ...runtime, tools: [] });
    assert.equal($("session-active-tools").textContent, "当前没有激活工具。");
    emit("agent.runtime", runtime);
    emit("agent.runtime", runtime, { agentId: "child" });
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
    // 之前的键盘/输入事件会让流式绘制让路；假 rAF 也须等交互窗口结束。
    await new Promise((resolve) => setTimeout(resolve, 550));
    paint();
    assert.equal(task.open, true);
    const text = task.querySelector(".message > .markdown");
    for (const selector of ["h1", "strong", "li", "pre code", "table"]) assert(text.querySelector(selector), selector);
    assert.equal(text.querySelector("img,[onerror]"), null);
    const thought = task.querySelector("details.thinking-record");
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
    await new Promise((resolve) => setTimeout(resolve, 550));
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
    row("b").querySelector(".session-item").click();
    await settle();
    assert.match($("session-runtime").textContent, /尚无已报告用量的请求/, "switching sessions clears previous usage");
    assert.doesNotMatch($("session-system-prompt").textContent, /System instructions/, "switching sessions clears previous prompt");
    assert.equal($("session-active-tools").textContent, "工具信息尚未加载。");
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
    row("a").querySelector(".session-item").click();
    await settle();
    assert.equal($("image-attachments").hidden, true, "images are isolated by session");
    row("b").querySelector(".session-item").click();
    await settle();
    assert.equal($("image-attachments").querySelectorAll("img").length, 1, "switching back restores attachments");
    $("composer").requestSubmit();
    paint();
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
    row("a").querySelector(".session-item").click();
    await settle();
    await loadingImage;
    assert.equal($("image-attachments").hidden, true, "async image read must not leak into another session");
    row("b").querySelector(".session-item").click();
    await settle();
    assert.equal($("prompt").value, imageDraft);
    assert.equal($("image-attachments").children.length, 1);
    // 旧会话的配置回执迟到时已切到另一会话（模拟断线重连后 attach 到别的会话），不得污染当前设置。
    holdConfig = true;
    $("model").onchange();
    await settle();
    assert.equal(heldConfig.sessionId, "b", "stale configure was issued for the previous session");
    await window.eval('(async () => snapshot(await request("session.attach", { sessionId: "a" })))()');
    await settle();
    sockets.at(-1).receive({ type: "response", id: heldConfig.id, ok: true, data: { ...config, queueType: "followUp" } });
    await settle();
    assert.equal($("queue-type").value, "steer", "late response from another session leaves current settings alone");
    $("queue-type").onchange();
    await settle();
    assert.equal(heldConfig.sessionId, "a");
    sockets.at(-1).receive({ type: "response", id: heldConfig.id, ok: true, data: { ...config, queueType: "followUp" } });
    await settle();
    holdConfig = false;
    assert.equal($("queue-type").value, "followUp", "configure still applies for the current session");
    row("b").querySelector(".session-item").click();
    await settle();
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
    assert.match($("sessions").textContent, /没有匹配/);
    // 导入副本绑定当前工作空间，不跳回源目录。
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
    assert.equal(lastImport.cwd, "C:\\work");
    // 确认按钮只发起导入；hash 要等 switchSession 拿到响应后的 snapshot 才会改，
    // 一个 setImmediate 不保证走完这条异步链（既往在此随机失败），改为轮询等待。
    for (let i = 0; i < 300 && !/session=imported/.test(window.location.hash); i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.notEqual(opened?.[0], "/#session=imported", "导入不另开原工作空间");
    assert.match(window.location.hash, /session=imported/);
    assert.equal($("workspace-label").textContent, "C:\\work", "导入副本留在当前工作空间");

    // 启动链必须跳过无法恢复的会话：列表第一条坏掉时不能把整页拖进
    // 「连接断开 → 重连 → 又抛」的死循环（旧写法只 attach 第一条，且异常冒到外层 catch）。
    attachError = "会话历史文件缺失，已保留数据库记录：C:\\axiom\\a.jsonl";
    window.openPageAs(undefined); // 等效新开页面：URL 无 session、storage 无记录
    const socketsBefore = sockets.length;
    sockets.at(-1).close();
    await settle();
    for (let i = 0; i < 300 && sockets.length < socketsBefore + 1; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sockets.length, socketsBefore + 1, "断线后自动重连");
    sockets.at(-1).open();
    await settle();
    assert.deepEqual({ ...window.sessionState() }, { connected: true, sessionId: "b", error: "" },
      "跳过无法恢复的会话后照常连上，且不把单条会话的故障塞进错误区");
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
  const source = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "app");
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
  const markdownSource = await publicSource("clipboard", "markdown");
  // markdown.js 同时导出页级渲染缓存工厂（Phase D2），与渲染器一并注入 eval 版 app。
  const markdownApi = new Function("marked", "DOMPurify", `${markdownSource}; return { renderMarkdown, createMarkdownPageCache };`)(marked, createPurify(window));
  window.renderMarkdown = markdownApi.renderMarkdown;
  window.createMarkdownPageCache = markdownApi.createMarkdownPageCache;
  window.createStreamRenderer = (render, after) =>
    createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame);
  const compactionDefaults = { enabled: true, tokenThreshold: 100000, percentThreshold: 50, model: null, thinking: "off", keepRecentTokens: 5000 };
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
  let defaults = { compaction: { ...compactionDefaults, tokenThreshold: 50000 }, retry: null, model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null };
  // 目录级默认配置：cwd -> selection；未配置的目录回落全局 defaults。
  const directoryDefaults = new Map([["C:\\other", { ...defaults, compaction: { ...compactionDefaults, enabled: true, tokenThreshold: 30000 } }]]);
  let lastDefaults, lastCreation, lastDefaultsDelete;
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
          case "models.favorites.get":
            data = { provider: [], model: [], thinking: [] };
            break;
          case "models.list":
            data = [
              { key: "test/model", provider: "test", name: "Model", levels: ["off", "low"] },
              { key: "other/child", provider: "other", name: "Child", levels: ["off", "medium", "high"] },
            ];
            break;
          case "sessions.list":
            data = [{ id: state.sessionId, title: state.title, cwd: state.cwd, status: "idle", elapsedMs: state.elapsedMs, runningSince: state.runningSince, updatedAt: Date.now() }];
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
          case "session.defaults.list":
            data = { workspaces: [...directoryDefaults.keys()].sort() };
            break;
          case "session.defaults.get":
            data = structuredClone(req.cwd ? directoryDefaults.get(req.cwd) ?? defaults : defaults);
            break;
          case "session.defaults.configure":
            lastDefaults = req;
            // 与后端一致：新目录从全局默认复制一份独立配置；无 cwd 写全局。
            {
              const base = req.cwd ? directoryDefaults.get(req.cwd) ?? defaults : defaults;
              const next = Object.fromEntries(Object.keys(defaults).map((key) => [key, key in req ? req[key] : base[key]]));
              if (req.cwd) directoryDefaults.set(req.cwd, next);
              else defaults = next;
              data = structuredClone(next);
            }
            break;
          case "session.defaults.delete":
            lastDefaultsDelete = req;
            if (!directoryDefaults.delete(req.cwd)) {
              this.receive({ type: "response", id: req.id, ok: false, error: "该目录没有独立配置" });
              return;
            }
            data = structuredClone(defaults);
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
    window.eval(`${modelSources}\n${pickerSource}\n${serviceSource}\n${source}`);
    sockets[0].open();
    await settle();
    paint();
    assert.equal($("workspace").hidden, false);
    assert.equal(window.document.querySelectorAll("#output > .message").length, 4);

    // 折叠保持阅读锚点：按保留消息的位移补偿滚动位置，不强制到底部。
    const keptAnchor = window.document.querySelectorAll("#output > .message")[2];
    let anchorTop = 500;
    // 锚点位置被读两次（折叠前/后）：第二次返回上移后的值，模拟过程信息收走后上方高度塌缩。
    keptAnchor.getBoundingClientRect = () => {
      const top = anchorTop;
      anchorTop = 450;
      return { top };
    };
    $("transcript").scrollTop = 1000;

    // 成功事件后原地折叠：卡片插在被折叠首条之前，段内消息就地降为节选而不隐藏。
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
    // 技能块跟用户原文一起留在页上：服务端的精简版也原样保留用户输入。
    assert.equal($("output").querySelector(".skill-invocation").parentElement.hidden, false);
    assert.equal(cards()[0], $("output").firstElementChild, "summary card sits at the old boundary");
    assert.match($("output").lastElementChild.textContent, /回答二/, "kept messages follow the card in place");
    const visible = window.document.querySelectorAll("#output > .message:not([hidden])");
    assert.deepEqual([...visible].map((node) => node.querySelector(":scope > .markdown").textContent.trim()), ["问题一", "回答一", "问题二", "回答二"], "段内输入与答复仍在原位");
    const lite = window.document.querySelectorAll("#output > .message.compacted");
    assert.equal(lite.length, 2, "只有被压缩的两条带节选标记");
    assert.match(lite[0].querySelector(".message-compacted").textContent, /压缩段节选/);
    const summaryBody = cards()[0].querySelector(".compaction-summary");
    assert.match(cards()[0].querySelector("summary").textContent, /9,000.*1,200/s);
    assert.equal($("transcript").scrollTop, 950, "folding compensates the viewport anchor instead of forcing the bottom");
    assert.equal(cards()[0].open, false, "compaction cards stay folded by default");
    // 摘要正文懒渲染：折叠态不建内容，展开（toggle 异步派发）才渲染。
    assert.equal(summaryBody.textContent, "", "folded cards render nothing inside");
    cards()[0].open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(summaryBody.textContent, /早前/);
    assert.equal(summaryBody.querySelector("img"), null, "summaries render through the sanitizing pipeline");
    cards()[0].open = false;

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

    const userCardsBefore = $("output").querySelectorAll(":scope > .message.user").length;
    for (const message of [
      { role: "user", content: "[Axiom 子任务完成通知] 内部消息" },
      { role: "user", content: [{ type: "text", text: "[Axiom 子任务完成通知] 内部消息" }] },
      { role: "custom", customType: "task-notification", content: "任务通知内容" },
    ]) {
      emit("agent.message.end", { message });
      const last = $("output").lastElementChild;
      assert.equal(last.className, "task-notification", "任务通知以独立通知条渲染");
      assert.equal(last.hidden, false, "通知不隐藏，与用户消息区分而非逐出转写");
      assert.equal(last.querySelector(".task-notification-line").textContent, "任务通知: 子任务完成", "只渲染固定单行文案，不展开原文");
      assert.equal(last.querySelector("pre"), null, "不再整文渲染 JSON");
      assert.match(last.title, /内部消息|任务通知内容/, "原文保留在 title 上供悬停查看");
      assert.equal($("output").querySelectorAll(":scope > .message.user").length, userCardsBefore, "通知不伪装成用户卡片");
      last.remove();
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
    for (const card of cards()) card.open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(cards()[0].querySelector(".compaction-summary").textContent, /早前/); assert.match(cards()[1].querySelector(".compaction-summary").textContent, /累计摘要/);
    for (const card of cards()) card.open = false;
    assert.match($("output").lastElementChild.textContent, /回答二/, "each cumulative summary keeps its own card");
    assert.equal(window.document.querySelectorAll("#output > .message:not([hidden])").length, 4, "recent messages survive");
    assert.equal(window.document.querySelectorAll("#output > .message.compacted").length, 3, "c2 把 m3 也降为节选");

    // 新消息通过 agent.message.end 的 entryId 参与后续折叠。
    input("问题三");
    $("composer").requestSubmit();
    paint();
    await settle();
    emit("agent.compaction", { id: "c3", summary: "包含新消息", firstKeptEntryId: "m5", compactedMessageIds: ["m4", "m5"] });
    assert.equal(cards().length, 3);
    assert.equal(window.document.querySelectorAll("#output > .message.compacted").length, 5, "三张卡覆盖全部五条，全数降为节选但仍在页上");

    // 重连按 compactions 恢复同一视图。
    state.compactions = [
      { id: "c1", summary: "**早前** 讨论要点", firstKeptEntryId: "m3", compactedMessageIds: ["m1", "m2"], tokensBefore: 9000, estimatedTokensAfter: 1200 },
      { id: "c2", summary: "累计摘要", firstKeptEntryId: "m4", compactedMessageIds: ["m1", "m2", "m3"], tokensBefore: 1200 },
      { id: "c3", summary: "包含新消息", firstKeptEntryId: "m5", compactedMessageIds: ["m4", "m5"], tokensBefore: 1500 },
    ];
    // 服务端把被折叠的历史裁成精简版下发（compacted 标记），完整原文点开摘要卡才取。
    state.messages = [
      { agentId: "main", message: { role: "user", content: "问题一" }, entryId: "m1", compacted: true },
      { agentId: "main", message: { role: "assistant", content: "回答一" }, entryId: "m2", compacted: true },
      { agentId: "main", message: { role: "user", content: "问题二" }, entryId: "m3", compacted: true },
      { agentId: "main", message: { role: "assistant", content: "回答二" }, entryId: "m4", compacted: true },
      { agentId: "main", message: { role: "user", content: "问题三" }, entryId: "m5", compacted: true },
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
    assert.equal(window.document.querySelectorAll("#output > .message.compacted").length, 5, "刷新后的节选与实时折叠结果一致");
    assert.equal(window.document.querySelectorAll("#output > .message .message-compacted").length, 5);

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
    assert.deepEqual(probe.read().keepRecentTokens, 5000, "empty keep falls back to the default");
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
    assert.equal(defaultsEditor.querySelector("input[type=checkbox]").checked, true);
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
    assert.match($("defaults-preview").textContent, /自动压缩 · 未设阈值 触发 · 保留最近 5,000 tokens/);

    // 自动重试词表：chip 增删是脚本改状态，必须自己冒泡 change 才能触发默认配置自动保存。
    // 先恢复合法压缩阈值，否则提交在压缩校验处就返回，测不到重试词表。
    defaultsEditor.querySelectorAll("input[type=number]")[0].value = "60000";
    defaultsEditor.querySelectorAll("input[type=number]")[0].dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    const retryInputs = $("create-retry").querySelectorAll("input[type=text]");
    const typeKeyword = (input, value, key = "Enter") => {
      input.value = value;
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    };
    typeKeyword(retryInputs[0], "overloaded");
    await settle();
    assert.deepEqual(lastDefaults.retry, { retryable: ["overloaded"], nonRetryable: [] }, "回车添加关键词即保存");
    assert.equal(retryInputs[0].value, "", "添加后清空输入框");
    typeKeyword(retryInputs[1], "insufficient_quota");
    await settle();
    assert.deepEqual(lastDefaults.retry.nonRetryable, ["insufficient_quota"]);
    assert.match($("defaults-preview").textContent, /自动重试 · 强制重试 1 条 · 强制不重试 1 条/);
    typeKeyword(retryInputs[0], "OVERLOADED");
    await settle();
    assert.deepEqual(lastDefaults.retry.retryable, ["overloaded"], "重复词（不区分大小写）不入表");
    // 只打字没回车就失焦：浏览器的 change 先到 input，补提交后 form 读到的已含这条词。
    retryInputs[0].value = "stream error";
    retryInputs[0].dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.deepEqual(lastDefaults.retry.retryable, ["overloaded", "stream error"], "失焦不静默丢字");
    // 删除：× 按钮与空输入 Backspace 同样触发保存。
    $("create-retry").querySelector(".retry-chip button").click();
    await settle();
    assert.deepEqual(lastDefaults.retry.retryable, ["stream error"]);
    typeKeyword(retryInputs[1], "", "Backspace");
    await settle();
    assert.deepEqual(lastDefaults.retry, { retryable: ["stream error"], nonRetryable: [] });

    // 保存回执不等于重新打开可见：加载已有词表必须首屏渲染，重复回车也不能让它隐形。
    $("settings").close();
    $("open-settings").click();
    await settle();
    assert.deepEqual([...$("create-retry").querySelectorAll(".retry-chip > span")].map((node) => node.textContent), ["stream error"]);
    typeKeyword($("create-retry").querySelector("input"), "STREAM ERROR");
    await settle();
    assert.deepEqual([...$("create-retry").querySelectorAll(".retry-chip > span")].map((node) => node.textContent), ["stream error"], "重复输入已有词后标签仍可见");

    // 目录配置：压缩设置按目录独立保存，删除目录配置后回落全局默认。
    $("settings").close();
    $("open-settings").click();
    await settle();
    const workspacePaths = () => [...$("defaults-workspace").options].map((option) => option.value);
    assert.deepEqual(workspacePaths(), ["", "C:\\other"], "下拉列出全局默认与已配置目录");
    assert.equal($("defaults-delete").hidden, true, "全局默认没有可删除的目录配置");
    $("defaults-workspace").value = "C:\\other";
    $("defaults-workspace").dispatchEvent(new window.Event("change"));
    await settle();
    const scopedCompaction = () => $("create-compaction");
    assert.equal(scopedCompaction().querySelector("input[type=checkbox]").checked, true, "目录配置加载自己的压缩开关");
    assert.equal(scopedCompaction().querySelectorAll("input[type=number]")[0].value, "30000", "目录配置加载自己的压缩阈值");
    assert.equal($("defaults-delete").hidden, false, "目录配置可以删除");
    const globalCompaction = structuredClone(defaults.compaction);
    scopedCompaction().querySelectorAll("input[type=number]")[0].value = "40000";
    scopedCompaction().querySelectorAll("input[type=number]")[0].dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.equal(lastDefaults.cwd, "C:\\other", "目录配置保存带上 cwd");
    assert.equal(directoryDefaults.get("C:\\other").compaction.tokenThreshold, 40000);
    assert.deepEqual(defaults.compaction, globalCompaction, "目录配置不污染全局默认");
    $("defaults-delete").click();
    await settle();
    assert.equal(lastDefaultsDelete.cwd, "C:\\other", "删除的是当前下拉选中的目录配置");
    assert.deepEqual(workspacePaths(), [""], "删除后目录从下拉移除");
    assert.equal($("defaults-workspace").value, "", "删除后回到全局默认");
    assert.equal($("create-compaction").querySelectorAll("input[type=number]")[0].value, "60000", "编辑器回落全局压缩阈值");
    assert.equal($("defaults-delete").hidden, true);
    $("settings").close();

    // 任务计时：与「+」同行最右端，运行中累计、停止后定格、再次运行继续累加。
    assert.equal($("task-timer").hidden, true, "没有运行记录时不占位");
    state.elapsedMs = 63_000;
    state.runningSince = Date.now() - 2_000;
    emit("session.state", { status: "running", elapsedMs: state.elapsedMs, runningSince: state.runningSince });
    await settle();
    assert.equal($("task-timer").hidden, false);
    assert.equal($("task-timer").dataset.running, "true");
    assert.equal($("task-timer-value").textContent, "1m 05s", "运行中把当前这段计入显示");
    state.elapsedMs = 67_000;
    state.runningSince = null;
    emit("session.state", { status: "idle", elapsedMs: 67_000, runningSince: null });
    await settle();
    assert.equal($("task-timer").dataset.running, "false");
    assert.equal($("task-timer-value").textContent, "1m 07s", "停止后定格服务端结算的累计值");
    state.runningSince = Date.now();
    emit("session.state", { status: "running", elapsedMs: 67_000, runningSince: state.runningSince });
    await settle();
    assert.equal($("task-timer-value").textContent, "1m 07s", "再次执行继续累加而不是清零");
    assert.match($("task-timer").title, /累计运行 1m 07s/);
  } finally {
    dom.window.close();
  }
});
