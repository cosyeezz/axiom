import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";

// 标签页隔离回归：hash → sessionStorage → localStorage 三级恢复顺序，
// 两个页面各自 attach 自己的会话，localStorage 只兼容读取、不再写入。
const appSource = (await readFile(new URL("../public/app.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
const pickerSource = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const contrastSource = (await readFile(new URL("../public/text-contrast.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

const state = (id, title, cwd) => ({
  sessionId: id, title, cwd, status: "idle",
  config: { model: "m", thinking: "off", levels: ["off"], skills: [] },
  messages: [], tasks: [], live: {},
});
const STATES = new Map([
  ["s-a", state("s-a", "会话A", "C:\\wa")],
  ["s-b", state("s-b", "会话B", "C:\\wb")],
  ["s-legacy", state("s-legacy", "旧会话", "C:\\legacy")],
]);

async function bootPage(url, { hash, session, local } = {}) {
  const dom = new JSDOM(html, { url: hash ? `${url}#${hash}` : url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  if (session) window.sessionStorage.setItem("axiom.session", session);
  if (local) window.localStorage.setItem("axiom.session", local);
  window.matchMedia = () => ({ matches: true });
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  window.renderMarkdown = () => {};
  window.createStreamRenderer = (render, after) => createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame);
  const requests = [];
  const sockets = [];
  window.WebSocket = class {
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
        let data;
        switch (req.type) {
          case "service.status": data = { managed: true, error: "", version: "0.0.0", importDir: "" }; break;
          case "models.list": data = [{ key: "m", provider: "p", name: "M" }]; break;
          case "session.attach": {
            const attached = STATES.get(req.sessionId);
            if (!attached) return this.receive({ type: "response", id: req.id, ok: false, error: "会话不存在" });
            data = attached; break;
          }
          case "sessions.list": data = [...STATES.values()].map((s) => ({ ...s, id: s.sessionId, updatedAt: Date.now() })); break;
          case "session.create":
            data = state("recovered", "恢复的会话", req.cwd);
            STATES.set(data.sessionId, data);
            break;
          case "session.presets.list": data = { presets: [] }; break;
          default: data = {};
        }
        this.receive({ type: "response", id: req.id, ok: true, data });
      });
    }
  };
  window.eval(`${contrastSource}\n${pickerSource}\n${appSource}`);
  const drain = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
  const connect = async () => { sockets.at(-1).open(); await drain(); };
  return { dom, window, $, requests, connect, drain, sockets };
}

const attachCalls = (requests) => requests.filter((r) => r.type === "session.attach").map((r) => r.sessionId);

test("两个页面携带不同 hash 各自 attach 自己的会话，localStorage 保持只读", async () => {
  const a = await bootPage("http://localhost/", { hash: "session=s-a", local: "s-legacy" });
  const b = await bootPage("http://localhost/", { hash: "session=s-b", local: "s-legacy" });
  try {
    await a.connect();
    await b.connect();
    assert.deepEqual(attachCalls(a.requests), ["s-a"], "页面 A 只 attach hash 指定的会话");
    assert.deepEqual(attachCalls(b.requests), ["s-b"], "页面 B 只 attach hash 指定的会话");
    assert.equal(a.requests.some((r) => r.type === "session.create"), false, "attach 命中时不得新建会话");
    assert.equal(b.requests.some((r) => r.type === "session.create"), false);
    assert.equal(a.$("session-title").textContent, "会话A");
    assert.equal(b.$("session-title").textContent, "会话B");
    assert.equal(a.$("workspace-label").textContent, "C:\\wa");
    assert.equal(b.$("workspace-label").textContent, "C:\\wb");
    // snapshot 落盘：hash 写回 + sessionStorage 更新，localStorage 原值不动（只兼容读取）。
    assert.equal(a.window.location.hash, "#session=s-a");
    assert.equal(b.window.location.hash, "#session=s-b");
    assert.equal(a.window.sessionStorage.getItem("axiom.session"), "s-a");
    assert.equal(b.window.sessionStorage.getItem("axiom.session"), "s-b");
    assert.equal(a.window.localStorage.getItem("axiom.session"), "s-legacy");
    assert.equal(b.window.localStorage.getItem("axiom.session"), "s-legacy");
    // 标签页标题区分工作空间。
    assert.equal(a.window.document.title, "会话A · wa — Axiom");
    assert.equal(b.window.document.title, "会话B · wb — Axiom");
  } finally { a.dom.window.close(); b.dom.window.close(); }
});

test("无 hash 时 sessionStorage 优先于 localStorage，且不回写 localStorage", async () => {
  const page = await bootPage("http://localhost/", { session: "s-b", local: "s-legacy" });
  try {
    await page.connect();
    assert.deepEqual(attachCalls(page.requests), ["s-b"]);
    assert.equal(page.window.location.hash, "#session=s-b");
    assert.equal(page.window.sessionStorage.getItem("axiom.session"), "s-b");
    assert.equal(page.window.localStorage.getItem("axiom.session"), "s-legacy", "localStorage 不被新链路覆盖");
  } finally { page.dom.window.close(); }
});

test("无 hash 无 sessionStorage 时按 localStorage 兼容读取旧会话", async () => {
  const page = await bootPage("http://localhost/", { local: "s-legacy" });
  try {
    await page.connect();
    assert.deepEqual(attachCalls(page.requests), ["s-legacy"]);
    assert.equal(page.window.sessionStorage.getItem("axiom.session"), "s-legacy", "attach 后迁入 sessionStorage");
  } finally { page.dom.window.close(); }
});

test("刷新恢复：丢掉 hash 后重跑页面脚本，由 sessionStorage 恢复原会话并重写 hash", async () => {
  const page = await bootPage("http://localhost/", { hash: "session=s-a", local: "s-legacy" });
  try {
    await page.connect();
    assert.equal(page.window.sessionStorage.getItem("axiom.session"), "s-a");
    // 模拟刷新且用户清掉了地址栏 hash：sessionStorage 必须独立完成恢复。
    page.window.history.replaceState(null, "", "/");
    page.requests.length = 0;
    page.window.eval(appSource);
    await page.connect();
    assert.deepEqual(attachCalls(page.requests), ["s-a"]);
    assert.equal(page.requests.some((r) => r.type === "session.create"), false);
    assert.equal(page.$("session-title").textContent, "会话A");
    assert.equal(page.window.location.hash, "#session=s-a", "恢复后 hash 重新写回");
    assert.equal(page.window.localStorage.getItem("axiom.session"), "s-legacy");
  } finally { page.dom.window.close(); }
});


test("另一页删除当前会话：立即禁发，在原目录恢复草稿且不自动发送", async () => {
  const page = await bootPage("http://localhost/", { hash: "session=s-a" });
  const original = STATES.get("s-a");
  try {
    await page.connect();
    page.$("prompt").value = "不要丢掉这份草稿";
    STATES.delete("s-a");
    page.sockets[0].receive({ type: "session.deleted", sessionId: "s-a" });
    assert.equal(page.$("send").disabled, true);
    await page.drain();
    assert.equal(page.$("workspace-label").textContent, "C:\\wa");
    assert.equal(page.$("prompt").value, "不要丢掉这份草稿");
    assert.equal(page.window.location.hash, "#session=recovered");
    assert.match(page.$("error").textContent, /保留草稿/);
    assert.equal(page.requests.filter((r) => r.type === "session.create").length, 1);
    assert.equal(page.requests.some((r) => r.type === "prompt"), false);
  } finally { STATES.set("s-a", original); STATES.delete("recovered"); page.dom.window.close(); }
});

test("漏掉删除通知时列表刷新也会恢复，且不会卡在刷新锁内", async () => {
  const page = await bootPage("http://localhost/", { hash: "session=s-a" });
  const original = STATES.get("s-a");
  try {
    await page.connect();
    page.$("prompt").value = "轮询恢复草稿";
    STATES.delete("s-a");
    await page.window.eval("refreshSessions()");
    assert.equal(page.window.location.hash, "#session=recovered");
    assert.equal(page.$("prompt").value, "轮询恢复草稿");
    await page.window.eval("refreshSessions()");
    assert.equal(page.requests.filter((r) => r.type === "session.create").length, 1);
  } finally { STATES.set("s-a", original); STATES.delete("recovered"); page.dom.window.close(); }
});

test("storage 同步隐藏与排序，不切换当前会话；本地更新合并最新存储", async () => {
  const page = await bootPage("http://localhost/", { hash: "session=s-a" });
  try {
    await page.connect();
    const emit = (key, value) => {
      page.window.localStorage.setItem(key, JSON.stringify(value));
      page.window.dispatchEvent(new page.window.StorageEvent("storage", { key }));
    };
    emit("axiom.hiddenSessions", ["s-b"]);
    assert.match(page.$("hidden-sessions").textContent, /会话B/);
    assert.equal(page.window.location.hash, "#session=s-a");
    // 未收到另一页的 storage 事件时，写入也必须读取最新状态。
    page.window.localStorage.setItem("axiom.hiddenSessions", JSON.stringify(["s-b", "s-legacy"]));
    await page.window.eval('setSessionHidden("s-a", true)');
    assert.deepEqual(JSON.parse(page.window.localStorage.getItem("axiom.hiddenSessions")), ["s-b", "s-legacy", "s-a"]);
    emit("axiom.hiddenSessions", []);
    emit("axiom.sessionOrder", ["s-b", "s-a"]);
    await page.window.eval('changeSessionPreference("axiom.sessionOrder", (ids) => [...ids, "s-legacy"])');
    assert.deepEqual(JSON.parse(page.window.localStorage.getItem("axiom.sessionOrder")), ["s-b", "s-a", "s-legacy"]);
    page.window.localStorage.clear();
    page.window.dispatchEvent(new page.window.StorageEvent("storage", { key: null }));
    assert.equal(page.$("hidden-sessions").children.length, 0);
    let lock = Promise.resolve();
    Object.defineProperty(page.window.navigator, "locks", { value: {
      request: (_key, fn) => { const next = lock.then(fn); lock = next.catch(() => {}); return next; },
    } });
    await Promise.all([
      page.window.eval('setSessionHidden("s-a", true)'),
      page.window.eval('setSessionHidden("s-b", true)'),
    ]);
    assert.deepEqual(JSON.parse(page.window.localStorage.getItem("axiom.hiddenSessions")), ["s-a", "s-b"], "locked read-modify-write preserves concurrent edits");
  } finally { page.dom.window.close(); }
});
