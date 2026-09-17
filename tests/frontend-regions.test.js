import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// 前端分区（docs/development-plans/04-frontend-regions-dev.md）的区域隔离回归。
// 区域 = DOM 更新边界，权威数据仍归 app.js 全局：这里只断言「跨区不串扰」，
// 不断言内部实现，也不替代浏览器里的焦点/滚动人工验收。
const appSource = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
const pickerSource = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const modelPickerSource = (await readFile(new URL("../public/model-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const modelSources = (await Promise.all(["model-auth", "model-manager"].map(async (name) =>
  (await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, "")))).join("\n");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

const message = (role, text, entryId) => ({
  agentId: "main",
  entryId,
  message: { role, content: [{ type: "text", text }] },
});
const state = (id, title, cwd, messages = []) => ({
  sessionId: id, title, cwd, status: "idle",
  config: { model: "m-a", thinking: "off", levels: ["off"], skills: [], queueType: "steer" },
  runtime: { model: "m-a", thinking: "off" },
  messages, tasks: [], live: {}, compactions: [], retries: [],
});
const STATES = new Map([
  ["s-a", state("s-a", "会话A", "C:\\wa", [message("user", "第一问", "e1"), message("assistant", "第一答", "e2")])],
  ["s-b", state("s-b", "会话B", "C:\\wb")],
]);

async function bootPage({ hash = "session=s-a", sessions = STATES } = {}) {
  const dom = new JSDOM(html, { url: `http://localhost/#${hash}`, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.matchMedia = () => ({ matches: false });
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  window.renderMarkdown = () => {};
  window.createMarkdownPageCache = () => ({ entries: new Map(), bytes: 0, stats: { hit: 0, miss: 0, store: 0, evict: 0 }, get: () => null, store: () => {} });
  window.createStreamRenderer = (render, after) => createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame);
  const requests = [], sockets = [];
  // 可控响应：hold 里的类型先挂起，测试再按 order 释放；其余立即自动应答。
  const hold = new Set();
  const held = [];
  const failures = new Set();
  const respond = (socket, req, outcome) => {
    if (!outcome.ok) return socket.receive({ type: "response", id: req.id, ok: false, error: outcome.error });
    socket.receive({ type: "response", id: req.id, ok: true, data: outcome.data });
  };
  const autoRespond = (socket, req) => {
    if (failures.has(req.type)) return respond(socket, req, { ok: false, error: `${req.type} 失败` });
    switch (req.type) {
      case "service.status": return respond(socket, req, { ok: true, data: { managed: true, error: "", version: "0.0.0", importDir: "" } });
      case "models.favorites.get": return respond(socket, req, { ok: true, data: { provider: [], model: [], thinking: [] } });
      case "models.list": return respond(socket, req, { ok: true, data: [{ key: "m-a", provider: "p", name: "模型A", levels: ["off"] }, { key: "m-b", provider: "p", name: "模型B", levels: ["off"] }] });
      case "session.attach": return respond(socket, req, { ok: true, data: sessions.get(req.sessionId) });
      case "sessions.list": return respond(socket, req, { ok: true, data: [...sessions.values()].map((s) => ({ ...s, id: s.sessionId, updatedAt: 1 })) });
      case "session.create": return respond(socket, req, { ok: true, data: state("new", "新会话", req.cwd) });
      default: return respond(socket, req, { ok: true, data: {} });
    }
  };
  window.WebSocket = class {
    static OPEN = 1;
    readyState = 0;
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    close() { this.readyState = 3; this.onclose(); }
    receive(payload) { this.onmessage({ data: JSON.stringify(payload) }); }
    send(raw) {
      const req = JSON.parse(raw);
      requests.push(req);
      queueMicrotask(() => {
        if (hold.has(req.type)) held.push({ socket: this, req });
        else autoRespond(this, req);
      });
    }
  };
  window.eval(`${modelSources}\n${pickerSource}\n${modelPickerSource}\n${appSource}\nwindow.__regionProbe = {
    seq: () => appliedSeq.get(sessionId),
    failConnection: () => { updateConnection = () => { throw new Error('故障探针'); }; updateAvailability(); },
  };`);
  const drain = async (rounds = 8) => { for (let i = 0; i < rounds; i++) await new Promise(setImmediate); };
  const emit = (payload) => sockets.at(-1).receive(payload);
  const release = (type, outcome = { ok: true, data: {} }) => {
    for (const entry of held.filter((h) => h.req.type === type)) respond(entry.socket, entry.req, outcome);
    held.splice(0, held.length, ...held.filter((h) => h.req.type !== type));
  };
  return { dom, window, $, requests, sockets, hold, held, failures, drain, emit, release,
    connect: async () => { sockets.at(-1).open(); await drain(); } };
}

const values = (page, ids) => Object.fromEntries(ids.map((id) => [id, page.$(id).value]));
const MODEL_IDS = ["provider", "model", "thinking", "subagent-provider", "subagent-model"];

test("后台会话的输出不更新当前会话的模型区", async () => {
  const page = await bootPage();
  try {
    await page.connect();
    const before = values(page, MODEL_IDS);
    assert.equal(before.model, "m-a", "首屏按会话配置选中模型");
    const beforeOptions = [...page.$("model").options].map((o) => `${o.value}:${o.text}`);
    // 用户打开模型菜单：后台事件到达时，打开的菜单既不能换值也不能换节点。
    page.$("model").dispatchEvent(new page.window.Event("click", { bubbles: true }));
    const menu = page.window.document.querySelector(".ax-mp-menu");
    const menuNodes = [...menu.children];
    const runtime = page.$("session-runtime").textContent;
    for (const event of [
      { type: "agent.runtime", sessionId: "s-b", agentId: "main", data: { model: "m-b", thinking: "high" } },
      { type: "agent.message.start", sessionId: "s-b", agentId: "main", seq: 1, data: { message: { role: "assistant", content: [] } } },
      { type: "agent.delta", sessionId: "s-b", agentId: "main", seq: 2, data: { type: "text_delta", delta: "后台输出" } },
      { type: "agent.message.end", sessionId: "s-b", agentId: "main", seq: 3, data: { entryId: "b1", message: { role: "assistant", content: [{ type: "text", text: "后台输出" }] } } },
      { type: "session.state", sessionId: "s-b", agentId: "main", seq: 4, data: { status: "running" } },
    ]) page.emit(event);
    await page.drain(2);
    assert.deepEqual(values(page, MODEL_IDS), before, "模型区选择不被后台会话改动");
    assert.deepEqual([...page.$("model").options].map((o) => `${o.value}:${o.text}`), beforeOptions, "模型目录节点不被后台会话重建");
    assert.deepEqual([...page.window.document.querySelector(".ax-mp-menu").children], menuNodes, "打开的模型菜单节点保持原样");
    assert.equal(page.$("session-runtime").textContent, runtime, "运行态显示不被后台会话改写");
    // 后台会话仍在跑：当前会话必须还是空闲（发送键可见、不是停止键）。
    assert.equal(page.$("send").hidden, false, "后台 running 不把当前会话切到忙态");
    assert.equal(page.window.document.querySelectorAll("#output .message").length, 2, "后台正文不落进当前会话的对话区");
  } finally { page.dom.window.close(); }
});

test("草稿输入不重建对话历史节点", async () => {
  const page = await bootPage();
  try {
    await page.connect();
    const before = [...page.$("output").children];
    assert.equal(before.length, 2, "首屏渲染两条历史消息");
    const input = page.$("prompt");
    for (const text of ["草", "草稿", "草稿不动历史"]) {
      input.value = text;
      input.dispatchEvent(new page.window.Event("input", { bubbles: true }));
      await page.drain(1);
    }
    // 中文输入法：组合期间同样不能动历史。
    input.dispatchEvent(new page.window.Event("compositionstart", { bubbles: true }));
    input.value = "草稿不动历史继续";
    input.dispatchEvent(new page.window.KeyboardEvent("input", { bubbles: true, isComposing: true }));
    input.dispatchEvent(new page.window.Event("compositionend", { bubbles: true }));
    await page.drain(2);
    const after = [...page.$("output").children];
    assert.deepEqual(after, before, "输入不得替换历史消息节点（同一节点、同一顺序）");
    assert.equal(input.value, "草稿不动历史继续", "输入内容不被回写覆盖");
    assert.equal(page.$("error").textContent, "", "输入本身不报错");
  } finally { page.dom.window.close(); }
});

test("一个区域显示失败不阻断其他区域更新", async () => {
  const page = await bootPage();
  try {
    await page.connect();
    page.$("error").textContent = "";
    // 模拟「输入操作」区自身抛错（DOM 缺失）：其余区域仍须完成本轮更新。
    page.$("add-image").remove();
    page.window.eval("updateAvailability()");
    assert.match(page.$("error").textContent, /输入操作显示失败/, "失败被局部报告到错误区");
    assert.equal(page.$("status").dataset.connected, "true", "连接状态区仍更新");
    assert.equal(page.$("status").textContent, "已连接");
    assert.equal(page.$("new").disabled, false, "会话导航区仍更新");
  } finally { page.dom.window.close(); }
});


test("连接显示故障不关闭连接或阻断输入区", async () => {
  const page = await bootPage();
  try {
    await page.connect();
    page.$("prompt").value = "仍可输入";
    page.window.__regionProbe.failConnection();
    assert.match(page.$("error").textContent, /连接状态显示失败/);
    assert.equal(page.$("send").disabled, false);
    assert.equal(page.sockets.at(-1).readyState, 1);
  } finally { page.window.close(); }
});

test("关闭设置后迟到预算不回填", async () => {
  const page = await bootPage();
  try {
    await page.connect();
    page.hold.add("task.budget.get");
    page.$("settings").showModal();
    const loading = page.window.loadTaskBudget();
    await page.drain();
    assert.equal(page.held.length, 1);
    page.$("settings").close();
    page.$("task-max-turns").value = "77";
    page.release("task.budget.get", { ok: true, data: { maxTurns: 3, wrapUpWindow: 1 } });
    await loading;
    assert.equal(page.$("task-max-turns").value, "77");
  } finally { page.window.close(); }
});

test("权威事件失败不推进序号；删除模型保留显式不可用选择", async () => {
  const page = await bootPage();
  try {
    await page.connect();
    const seq = page.window.__regionProbe.seq();
    assert.throws(() => page.window.applyEvent({ type: "agent.message.start", sessionId: "s-a", seq: (seq || 0) + 1, data: null }));
    assert.equal(page.window.__regionProbe.seq(), seq);
    page.window.options(page.$("model"), [["m-b", "模型B"]], "m-a");
    assert.equal(page.$("model").value, "m-a");
    assert.match(page.$("model").selectedOptions[0].textContent, /当前不可用/);
  } finally { page.window.close(); }
});
