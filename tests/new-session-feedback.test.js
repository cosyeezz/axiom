// 点「新会话」的即时反馈：列表立刻出现新会话行，按钮不置灰。
//
// 原来两处都让人觉得卡：updateNavigation 把全局 changing 混进 $("new").disabled，一点击就灰；
// 侧栏又要等 session.create 回执后再跑一轮 sessions.list 往返才出现新行。现在按钮可用性只看
// 连接与模型（重复点击由 switchSession 开头的 changing 守卫挡），新行在 create 回执后乐观插入，
// 随后台列表刷新校正。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

const appSource = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
const inline = async (name) => (await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const pickerSource = await inline("file-picker");
const modelPickerSource = await inline("model-picker");
const modelSources = (await Promise.all(["model-auth", "model-manager"].map(inline))).join("\n");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

const state = (id, title, cwd) => ({
  sessionId: id, title, cwd, status: "idle",
  config: { model: "m-a", thinking: "off", levels: ["off"], skills: [], queueType: "steer" },
  runtime: { model: "m-a", thinking: "off" },
  messages: [], tasks: [], live: {}, compactions: [], retries: [],
});

async function bootPage() {
  const dom = new JSDOM(html, { url: "http://localhost/#session=s-a", runScripts: "outside-only", pretendToBeVisual: true });
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

  // create 先注册再回执；测试延迟 sessions.list 回执来验证即时插入。
  const listed = [{ ...state("s-a", "会话A", "C:\\wa"), id: "s-a", updatedAt: 1 }];
  const requests = [], sockets = [], held = [];
  const hold = new Set();
  const respond = (socket, req, data) => socket.receive({ type: "response", id: req.id, ok: true, data });
  const auto = (socket, req) => {
    switch (req.type) {
      case "service.status": return respond(socket, req, { managed: true, error: "", version: "0.0.0", importDir: "" });
      case "models.favorites.get": return respond(socket, req, { provider: [], model: [], thinking: [] });
      case "models.list": return respond(socket, req, [{ key: "m-a", provider: "p", name: "模型A", levels: ["off"] }]);
      case "capabilities.list": return respond(socket, req, { needsTrust: false, warnings: [], skills: [], mcp: [], plugins: [] });
      case "sessions.list": return respond(socket, req, listed);
      case "session.attach": return respond(socket, req, state(req.sessionId, req.sessionId, "C:\\wa"));
      case "session.create": {
        const created = state("s-new", "", req.cwd || "C:\\wa");
        listed.push({ ...created, id: "s-new", title: "服务端新会话", updatedAt: Date.now() });
        return respond(socket, req, created);
      }
      default: return respond(socket, req, {});
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
      queueMicrotask(() => { if (hold.has(req.type)) held.push({ socket: this, req }); else auto(this, req); });
    }
  };
  window.eval(`${modelSources}\n${pickerSource}\n${modelPickerSource}\n${appSource}`);
  const drain = async (rounds = 10) => { for (let i = 0; i < rounds; i++) await new Promise(setImmediate); };
  return {
    dom, window, $, requests, hold,
    rows: () => [...$("sessions").querySelectorAll("[data-session-id]")].map((node) => node.dataset.sessionId),
    release: (type) => {
      for (const entry of held.filter((h) => h.req.type === type)) auto(entry.socket, entry.req);
      held.splice(0, held.length, ...held.filter((h) => h.req.type !== type));
    },
    drain,
    connect: async () => { sockets.at(-1).open(); await drain(); },
  };
}

test("新建会话：创建回执后立即出现新行，不等待列表回执", async (t) => {
  const page = await bootPage();
  t.after(() => page.dom.window.close());
  await page.connect();
  assert.deepEqual(page.rows(), ["s-a"], "初始只有已有会话");
  assert.equal(page.$("new").disabled, false, "连接就绪时按钮可用");

  page.hold.add("sessions.list");
  page.$("new").click();
  await page.drain();

  assert.ok(page.rows().includes("s-new"), `新会话应立刻进列表：${page.rows().join(",")}`);
  assert.equal(page.$("new").disabled, false, "新建完成后按钮仍可用");
  const created = page.requests.filter((req) => req.type === "session.create");
  assert.equal(created.length, 1, "一次点击只新建一个会话");
  page.release("sessions.list");
  await page.drain();
  assert.ok(page.rows().includes("s-new"), "权威列表返回后保留新行");
  assert.match(page.$("sessions").querySelector('[data-session-id="s-new"]').textContent, /服务端新会话/, "列表回执校正标题");
});

test("新建在途时按钮不置灰，重复点击也不会多建会话", async (t) => {
  const page = await bootPage();
  t.after(() => page.dom.window.close());
  await page.connect();
  page.hold.add("session.create");

  page.$("new").click();
  await page.drain();
  // 回执还没到：按钮此刻必须仍然可用（用户抱怨的正是这一段变灰）。
  assert.equal(page.$("new").disabled, false, "新建在途时按钮不得置灰");

  // 在途期间再点两次：changing 守卫负责挡住，不能变成多个会话。
  page.$("new").click();
  page.$("new").click();
  await page.drain();
  assert.equal(page.requests.filter((req) => req.type === "session.create").length, 1, "在途期间重复点击不重复新建");

  page.release("session.create");
  await page.drain();
  assert.ok(page.rows().includes("s-new"), "回执到达后新行在列表里");
  assert.equal(page.$("new").disabled, false, "结束后按钮仍可用");
});
