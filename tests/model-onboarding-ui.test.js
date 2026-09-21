import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// 空模型目录启动的前端回归：保持连接引导首次配置；保存模型后无需重启即可新建会话。
const stripImports = (source) => source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const modelSources = await Promise.all(["model-picker", "model-auth", "model-manager"].map(async (name) => {
  const source = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
  const exports = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  return `Object.assign(window, (() => { ${stripImports(source)}\nreturn {${exports.join(",")}}; })());`;
})).then((parts) => parts.join("\n"));
const pickerSource = stripImports(await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8"));
const memoryTagsSource = await publicSource("markdown-scan", "memory-tags", "goal-markers");
const appSource = memoryTagsSource + "\n" + stripImports(await readFile(new URL("../public/question.js", import.meta.url), "utf8")) + "\n" + stripImports(await readFile(new URL("../public/service-settings.js", import.meta.url), "utf8")) + "\n" + await publicSource("app");

const config = { model: null, thinking: "off", levels: ["off"], skills: [] };
const harness = async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  window.matchMedia = () => ({ matches: false });
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  window.renderMarkdown = (node, text) => { node.textContent = text; };
  window.createMarkdownPageCache = () => ({ entries: new Map(), bytes: 0, stats: { hit: 0, miss: 0, store: 0, evict: 0 }, get: () => null, store: () => {} });
  window.createStreamRenderer = (render, after) => createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame);
  const sockets = [], requests = [];
  let catalog = [];
  let created = 0, createError = "";
  const sessions = [];
  const newState = () => ({
    sessionId: `new${++created}`, title: `新会话${created}`, cwd: "C:\\work", status: "idle",
    config: { ...config, model: "test/model" }, messages: [], tasks: [], live: {},
  });
  class Socket {
    static OPEN = 1;
    readyState = 0;
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    close() { this.readyState = 3; this.onclose(); }
    receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
    send(raw) {
      const req = JSON.parse(raw);
      requests.push(req);
      queueMicrotask(() => {
        if (req.type === "session.create" && createError)
          return this.receive({ type: "response", id: req.id, ok: false, error: createError });
        let data;
        switch (req.type) {
          case "service.status": data = { managed: true, error: "", version: "9.9.9", importDir: "", dev: false }; break;
          case "models.list": data = catalog; break;
          case "models.favorites.get": data = { provider: [], model: [], thinking: [] }; break;
          case "models.config.get": data = { fingerprint: "f1", path: "models.json", providers: [], catalog }; break;
          case "sessions.list": data = sessions.map((s) => ({ ...s, id: s.sessionId, updatedAt: Date.now() })); break;
          case "session.attach": data = sessions.find((s) => s.sessionId === req.sessionId); break;
          case "session.create": { const state = newState(); sessions.push(state); data = state; break; }
          case "session.defaults.list": data = { workspaces: [] }; break;
          case "capabilities.list": data = { needsTrust: false, warnings: [], skills: [], mcp: [], plugins: [] }; break;
          case "session.defaults.get": data = { model: null, subagentModel: null, thinking: null, subagentThinking: null, capabilities: null, subagentCapabilities: null }; break;
          default: data = {};
        }
        this.receive({ type: "response", id: req.id, ok: true, data });
      });
    }
  }
  window.WebSocket = Socket;
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  window.eval(`${modelSources}\n${pickerSource}\n${appSource}`);
  return {
    window, $, sockets, requests, settle,
    open: async () => { await settle(); sockets.at(-1).open(); await settle(); },
    setCatalog: (items) => { catalog = items; },
    setCreateError: (message) => { createError = message; },
    createdCount: () => requests.filter((req) => req.type === "session.create").length,
    push: () => sockets.at(-1).receive({ type: "models.config.changed" }),
  };
};

test("首次建会话配置失败仍能进入设置和更新，不关闭连接或丢草稿", async () => {
  const t = await harness();
  const { window, $, sockets, open, settle } = t;
  try {
    t.setCatalog([{ key: "test/model", provider: "test", levels: ["off"] }]);
    t.setCreateError("Unsupported compaction thinking level");
    $("prompt").value = "保留草稿";
    await open();
    assert.equal(sockets[0].readyState, 1);
    assert.equal($("login").hidden, true);
    assert.equal($("workspace").hidden, false);
    assert.equal($("settings").open, true);
    assert.equal($("open-settings").disabled, false);
    assert.equal($("send").disabled, true);
    assert.match($("error").textContent, /服务仍已连接/);
    assert.equal($("prompt").value, "保留草稿");
    $("settings-service-tab").click();
    assert.equal($("service-panel").hidden, false);
    t.setCreateError("");
    $("settings").close();
    $("new").click();
    await settle();
    assert.equal($("session-title").textContent, "新会话1");
    assert.equal(sockets.length, 1);
  } finally { window.close(); }
});

test("空模型目录：保持已连接并引导首次配置，不创建会话不断线重连", async () => {
  const t = await harness();
  const { window, $, sockets, requests, settle, open, setCatalog, createdCount, push } = t;
  try {
    await open();
    assert.equal(sockets.length, 1, "全程只有一个连接");
    assert.equal($("login").hidden, true);
    assert.equal($("workspace").hidden, false);
    assert.equal($("status").textContent, "已连接");
    assert.equal(createdCount(), 0, "空目录不创建会话");
    assert.equal($("settings").open, true, "自动打开设置");
    assert.equal($("models-panel").hidden, false, "定位到模型与供应商");
    assert.match($("error").textContent, /尚无可用模型/);
    assert.equal($("send").disabled, true);
    assert.equal($("new").disabled, true);
    assert.equal($("open-settings").disabled, false);
    // 关闭引导后仍能手动打开 设置 → 模型与供应商。
    $("settings").close();
    $("open-settings").click();
    assert.equal($("settings").open, true);
    $("settings-models-tab").click();
    assert.equal($("models-panel").hidden, false);
    $("settings").close();
    // 保存模型（onSaved 与推送并发重复刷新）：无需重启，点新会话即可开始。
    $("prompt").value = "引导期草稿";
    setCatalog([{ key: "test/model", provider: "test", name: "Model" }]);
    push();
    push();
    await settle();
    assert.equal(createdCount(), 0, "保存后不自动创建，由用户点新会话");
    assert.equal(sockets.length, 1, "无断线重连");
    assert.match($("error").textContent, /模型已保存/);
    assert.equal($("new").disabled, false);
    assert.equal($("prompt").value, "引导期草稿", "草稿保留");
    $("new").click();
    await settle();
    assert.equal(createdCount(), 1);
    assert.equal($("session-title").textContent, "新会话1");
    assert.equal($("status").textContent, "已连接");
  } finally { window.close(); }
});

test("空模型目录且本地有原会话引用：不清会话引用与草稿，配置后可正常新建", async () => {
  const t = await harness();
  const { window, $, sockets, requests, settle, open, setCatalog, createdCount, push } = t;
  try {
    window.sessionStorage.setItem("axiom.session", "old");
    await open();
    assert.equal(createdCount(), 0);
    assert.equal(requests.filter((r) => r.type === "session.attach").length, 0, "空目录不附着会话");
    assert.equal(window.sessionStorage.getItem("axiom.session"), "old", "原会话引用保留");
    assert.match($("error").textContent, /尚无可用模型/);
    $("prompt").value = "未发送的草稿";
    sockets[0].close();
    await settle();
    assert.equal($("login").hidden, false, "断线后显示重连入口");
    $("connect").click();
    await open();
    assert.equal(sockets.length, 2);
    assert.equal(createdCount(), 0, "重连不反复创建会话");
    assert.equal($("prompt").value, "未发送的草稿", "草稿跨重连保留");
    assert.match($("error").textContent, /尚无可用模型/);
    setCatalog([{ key: "test/model", provider: "test", name: "Model" }]);
    push();
    await settle();
    assert.equal($("new").disabled, false);
    $("new").click();
    await settle();
    assert.equal(createdCount(), 1);
    assert.equal($("session-title").textContent, "新会话1");
    assert.equal($("status").textContent, "已连接");
  } finally { window.close(); }
});
