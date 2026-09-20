// 会话页面测试的共享装配：真实 app.js + 假服务端（一次全量下发历史）。
//
// 历史不再分页：attach 一次给全量消息，页面同步挂载完整历史，两个滚动按钮只做本地跳转。
// 这里只控制外部条件——响应何时送达（hold/release）、页面是否在后台、实例号与 seq 水位、
// 以及渲染入口是否抛错，不替换任何被测逻辑。
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../../public/stream-renderer.js";
import { publicSource } from "./public-source.js";
import { toWireRecord } from "../../src/session-history.js";

export const CONFIG = { model: "test/model", thinking: "off", levels: ["off"], skills: [] };

// 每条消息一个唯一标记，便于断言具体哪几条落进了 DOM。
export const makeRecords = (count, tag = "历史") =>
  Array.from({ length: count }, (_, index) => ({
    agentId: "main",
    entryId: `${tag}-${index}`,
    message: { role: index % 2 ? "assistant" : "user", content: `${tag}${index}` },
  }));

const html = await readFile(new URL("../../public/index.html", import.meta.url), "utf8");
const pickerSource = (await readFile(new URL("../../public/file-picker.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const modelSources = await Promise.all(["model-picker", "model-auth", "model-manager"].map(async (name) => {
  const source = await readFile(new URL(`../../public/${name}.js`, import.meta.url), "utf8");
  const exports = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  return `Object.assign(window, (() => { ${source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`;
})).then((parts) => parts.join("\n"));
// 与 tests/app.test.js 同一套加载顺序：markdown-scan 是 memory-tags/goal-markers 的依赖。
const pageSource = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
// answer-tags 与 memory-tags 都有顶层常量，同处一段脚本会重复声明；包一层隔离作用域。
const answerSource = `Object.assign(window, (() => { ${(await readFile(new URL("../../public/answer-tags.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn { splitAnswer }; })());`;
const markdownSource = (await readFile(new URL("../../public/markdown.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export /gm, "");

// 一份会话快照：事件直接落地，没有任何翻页停放。
export function sessionState(sessionId, { messages = [], live = {}, seq, status = "idle" } = {}) {
  const state = { sessionId, title: sessionId, cwd: "C:\\work", status, config: structuredClone(CONFIG), messages, tasks: [], live, tools: {}, compactions: [], retries: [] };
  if (seq !== undefined) state.seq = seq;
  return state;
}

export const settle = () => new Promise((resolve) => setImmediate(resolve));
export async function until(predicate, label, rounds = 500) {
  for (let i = 0; i < rounds && !predicate(); i++) await settle();
  if (!predicate()) throw new Error(`等待超时：${label}`);
}

/**
 * 启动一页真实 app.js + 假服务端。
 * - records/epoch/seq：服务端历史与实例号、attach 快照水位。
 * - hold(req, requests)：返回 true 则响应被扣住，由 release()/releaseAll() 决定何时送达。
 * 不 hold 的响应在微任务里立刻送达（真实 transport 负责在 attach 在飞时开闸）。
 */
export function bootSessionPage({ sessionId = "long", title = "长会话", epoch = "epoch-1",
  records = makeRecords(240), seq = 500, hold = null, respond: respondOverride = null } = {}) {
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  const media = { matches: false, onchange: null, addEventListener() {}, removeEventListener() {} };
  window.matchMedia = () => media;
  const frames = new Map();
  let closed = false;
  let frameId = 0;
  window.requestAnimationFrame = (fn) => { frames.set(++frameId, fn); return frameId; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const clock = { t: 0 };
  // markdown.js 同时导出页级渲染缓存工厂，与渲染器一并注入 eval 版 app。
  const markdownApi = new Function("marked", "DOMPurify", `${markdownSource}; return { renderMarkdown, createMarkdownPageCache };`)(marked, createPurify(window));
  window.renderMarkdown = markdownApi.renderMarkdown;
  window.createMarkdownPageCache = markdownApi.createMarkdownPageCache;
  window.createStreamRenderer = (render, after) =>
    createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame, 40, () => clock.t);

  let instance = epoch;
  // 全量快照：身份经真实 toWireRecord 投影，messageId/entryId 语义与服务端一致。
  const fullState = () => ({
    sessionId, cwd: "C:/work", title, status: "idle",
    config: structuredClone(CONFIG),
    messages: records.map(toWireRecord),
    messageIndexes: records.map((_, index) => index),
    messageCount: records.length,
    tasks: [], live: {}, tools: {}, compactions: [], retries: [],
    instanceId: instance, liveMessageIds: {},
  });

  const requests = [];
  const sockets = [];
  const held = [];
  const defaultRespond = (req) => {
    switch (req.type) {
      case "service.status": return { managed: false, error: "", version: "9.9.9" };
      case "models.list": return [{ key: "test/model", provider: "test", name: "Model" }];
      case "models.favorites.get": return { provider: [], model: [], thinking: [] };
      case "capabilities.list": return { needsTrust: false, warnings: [], skills: [], mcp: [], plugins: [] };
      case "sessions.list": return [{ id: sessionId, title, cwd: "C:/work", status: "idle", sessionFile: "C:\\axiom\\long.jsonl", updatedAt: 1 }];
      case "session.attach": return { ...fullState(), seq };
      default: return {};
    }
  };
  const respond = req => respondOverride ? respondOverride(req, defaultRespond) : defaultRespond(req);
  class Socket {
    static OPEN = 1;
    readyState = 0;
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.onclose({ code }); }
    receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
    send(raw) {
      const req = JSON.parse(raw);
      requests.push(req);
      let data, error;
      try { data = respond(req); } catch (e) { error = e.message; }
      const deliver = () => this.receive(error ? { type: "response", id: req.id, ok: false, error } : { type: "response", id: req.id, ok: true, data });
      if (hold?.(req, requests)) held.push(deliver);
      else queueMicrotask(() => { if (!closed) deliver(); }); // 页面关掉后仍在飞的响应丢弃，避免测试结束后再碰 DOM。
    }
  }
  window.WebSocket = Socket;

  // 后台标签页：可切换的 document.hidden，切换即派发真实 visibilitychange。
  let hidden = false;
  Object.defineProperty(window.document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(window.document, "visibilityState", { configurable: true, get: () => hidden ? "hidden" : "visible" });

  window.eval([
    modelSources, pickerSource, pageSource, answerSource,
    `window.__app = {
      snapshot, event, saveView, views, live, renderer,
      switchSession, withdrawQueue, reattach,
      request,
      setRequest: (fn) => { request = fn; },
      session: () => sessionId,
      connected: () => connected,
      watermark: (id) => transport.getWatermark(id),
      queue: () => transport.getSnapshotQueue(),
      transportState: () => transport.getConnectionState(),
      mainEntries: () => mainItems.map(entry => entry.entryId),
      historyEntries: () => mainItems,
      attachFlags: () => ({ attaching, hiddenDirty }),
      setConnected: (value) => { connected = value; updateAvailability(); },
      failPlacement: () => { const original = placeSnapshotMessage; placeSnapshotMessage = () => { throw new Error("历史挂载失败"); }; return () => { placeSnapshotMessage = original; }; },
      pageCacheStats: () => ({ ...pageCacheCurrent().stats, bytes: pageCacheCurrent().bytes, entries: pageCacheCurrent().entries.size }),
      dispose: () => transport.dispose(),
    };`,
  ].join("\n"));

  const app = window.__app;
  const texts = () => [...$("output").querySelectorAll(".message")].map((node) => node.textContent);
  const count = (text) => texts().filter((value) => value.includes(text)).length;
  return {
    dom, window, $, app, requests, sockets, records,
    texts, count,
    // 服务端当前会下发的整份快照（测试里手工触发重建时复用同一形状）。
    fullState: (overrides = {}) => ({ ...fullState(), seq, ...overrides }),
    messages: () => $("output").querySelectorAll(".message").length,
    // 只有被 hold 住的响应留在队列里；release 让其中最先的一个送达。
    held: () => held.length,
    release: () => { held.shift()?.(); return held.length; },
    releaseAll: () => { while (held.length) held.shift()(); },
    open: () => sockets.at(-1).open(),
    setHidden(value) { hidden = value; window.document.dispatchEvent(new window.Event("visibilitychange")); },
    setEpoch(value) { instance = value; },
    // 受控帧：快照尾部的滚动还原挂在 rAF 上，断言前手动放一帧。
    paint() {
      clock.t += 1000;
      const batch = [...frames.values()];
      frames.clear();
      for (const fn of batch) fn();
    },
    // 关闭顺序有讲究：dispose 会拒掉在飞请求，调用方的错误处理还要摸 DOM，
    // 所以先放一个宏任务让这些回调在活着的 window 上跑完，再销毁 JSDOM。
    close: async () => {
      closed = true;
      try { app.dispose(); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 0));
      dom.window.close();
    },
  };
}
