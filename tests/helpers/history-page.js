// 分页页面测试的共享装配：真实 app.js + 真实 src/session-history.js 的服务端分页。
//
// 为什么不再有受控分片调度：分片实现已删除，`snapshot()` 对一页做同步挂载。
// 这里让假服务端用 `pageOf()` 真算游标/窗口，页面的「上一页/下一页/最新」按钮走
// 真实 loadHistory/latestHistory 通路；测试只控制响应何时送达（hold）、页面是否隐藏、
// 以及是否把渲染入口换成抛错版，不替换被测逻辑。
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../../public/stream-renderer.js";
import { publicSource } from "./public-source.js";
import { createHistory, pageOf, toPageRecord, touchHistory } from "../../src/session-history.js";

export const PAGE_SIZE = 60;
export const CONFIG = { model: "test/model", thinking: "off", levels: ["off"], skills: [] };

// 每条消息一个唯一标记，便于断言「某一页的哪几条」是否落进 DOM。
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
  .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");

// 无分页元数据的会话状态（老服务端 / 内存态）：事件直接落地，不走翻页停放。
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
export function bootHistoryPage({ sessionId = "long", title = "长会话", epoch = "epoch-1",
  records = makeRecords(240), seq = 500, hold = null } = {}) {
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  const media = { matches: false, onchange: null, addEventListener() {}, removeEventListener() {} };
  window.matchMedia = () => media;
  const frames = new Map();
  let frameId = 0;
  window.requestAnimationFrame = (fn) => { frames.set(++frameId, fn); return frameId; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const clock = { t: 0 };
  window.renderMarkdown = new Function("marked", "DOMPurify", `${markdownSource}; return renderMarkdown;`)(marked, createPurify(window));
  window.createStreamRenderer = (render, after) =>
    createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame, 40, () => clock.t);

  // 服务端分页与实例号：用真实 pageOf，游标语义/窗口边界都不是测试自造的。
  const history = createHistory(sessionId);
  let instance = epoch;
  const pageState = (window_) => {
    const page = pageOf(records, history, { sessionId, epoch: instance, ...window_ });
    return {
      sessionId, cwd: "C:/work", title, status: "idle",
      config: structuredClone(CONFIG),
      messages: page.records.map(toPageRecord),
      tasks: [], live: {}, tools: {}, compactions: [], retries: [],
      instanceId: instance, revision: history.revision, history: page.meta, liveMessageIds: {},
    };
  };

  const requests = [];
  const sockets = [];
  const held = [];
  const respond = (req) => {
    switch (req.type) {
      case "service.status": return { managed: false, error: "", version: "9.9.9" };
      case "models.list": return [{ key: "test/model", provider: "test", name: "Model" }];
      case "models.favorites.get": return { provider: [], model: [], thinking: [] };
      case "capabilities.list": return { needsTrust: false, warnings: [], skills: [], mcp: [], plugins: [] };
      case "sessions.list": return [{ id: sessionId, title, cwd: "C:/work", status: "idle", sessionFile: "C:\\axiom\\long.jsonl", updatedAt: 1 }];
      case "session.attach": return { ...pageState({ edge: "last", limit: PAGE_SIZE }), seq };
      case "session.history":
        return pageState({ edge: req.edge, before: req.before, after: req.after, target: req.target, limit: req.limit || PAGE_SIZE });
      default: return {};
    }
  };
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
      else queueMicrotask(deliver);
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
      snapshot, event, saveView, views, live, renderer, loadHistory, latestHistory,
      switchSession, withdrawQueue,
      request: (type, data) => request(type, data),
      setRequest: (fn) => { request = fn; },
      session: () => sessionId,
      connected: () => connected,
      watermark: (id) => transport.getWatermark(id),
      queue: () => transport.getSnapshotQueue(),
      transportState: () => transport.getConnectionState(),
      historyState: () => historyState,
      mainEntries: () => mainItems.map(entry => entry.entryId),
      historyFlags: () => ({ loading: historyLoading, dirty: historyDirty, request: historyRequest, hiddenDirty, events: historyEvents }),
      setConnected: (value) => { connected = value; updateAvailability(); },
      failPlacement: () => { const original = placeSnapshotMessage; placeSnapshotMessage = () => { throw new Error("分片渲染失败"); }; return () => { placeSnapshotMessage = original; }; },
      dispose: () => transport.dispose(),
    };`,
  ].join("\n"));

  const app = window.__app;
  const texts = () => [...$("output").querySelectorAll(".message")].map((node) => node.textContent);
  const count = (text) => texts().filter((value) => value.includes(text)).length;
  return {
    dom, window, $, app, requests, sockets, history, records,
    texts, count,
    messages: () => $("output").querySelectorAll(".message").length,
    pageText: () => $("history-position").textContent,
    // 只有被 hold 住的响应留在队列里；release 让其中最先的一个送达。
    held: () => held.length,
    release: () => { held.shift()?.(); return held.length; },
    releaseAll: () => { while (held.length) held.shift()(); },
    open: () => sockets.at(-1).open(),
    setHidden(value) { hidden = value; window.document.dispatchEvent(new window.Event("visibilitychange")); },
    setEpoch(value) { instance = value; },
    touchHistory: () => touchHistory(history),
    // 受控帧：快照尾部的滚动还原挂在 rAF 上，断言前手动放一帧。
    paint() {
      clock.t += 1000;
      const batch = [...frames.values()];
      frames.clear();
      for (const fn of batch) fn();
    },
    close: () => { try { app.dispose(); } catch {} dom.window.close(); },
  };
}
