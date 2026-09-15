import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// P1-2 首屏渐进显示：登录恢复在同步清理旧 DOM / 身份切换完成后、首个分片调度前就显示 workspace，
// 但 connected 与发送能力必须等完整恢复才开放。这里跑真实登录入口 + 真实 app.js，用受控调度
// 把「首片调度前」这个中间态固定住再断言。
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const pickerSource = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const modelSources = await Promise.all(["model-picker", "model-auth", "model-manager"].map(async (name) => {
  const source = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
  const exports = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  return `Object.assign(window, (() => { ${source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`;
})).then((parts) => parts.join("\n"));
// 与 tests/app.test.js 同一套加载顺序：markdown-scan 是 memory-tags/goal-markers 的依赖。
const pageSource = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
// answer-tags 与 memory-tags 都有顶层常量，同处一段脚本会重复声明；包一层隔离作用域。
const answerSource = `Object.assign(window, (() => { ${(await readFile(new URL("../public/answer-tags.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn { splitAnswer }; })());`;
const markdownSource = (await readFile(new URL("../public/markdown.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");

const CONFIG = { model: "test/model", thinking: "off", levels: ["off"], skills: [] };
const LONG_MESSAGES = 240;

// >120 条才走分片路径；seq 是服务端快照自带水位。
function longState(seq = 500, count = LONG_MESSAGES) {
  return {
    sessionId: "long", title: "长会话", cwd: "C:/work", status: "idle",
    config: structuredClone(CONFIG), seq,
    messages: Array.from({ length: count }, (_, index) => ({
      agentId: "main",
      entryId: `h${index}`,
      message: { role: index % 2 ? "assistant" : "user", content: `历史${index}` },
    })),
    tasks: [], live: {}, tools: {},
  };
}

// 真实登录链路的假服务端：只回启动必需的四类响应，不碰维护通道（不产生轮询 fetch）。
function boot(state = longState()) {
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
  const renderMarkdown = new Function("marked", "DOMPurify", `${markdownSource}; return renderMarkdown;`)(marked, createPurify(window));
  window.renderMarkdown = renderMarkdown;
  window.createStreamRenderer = (render, after) =>
    createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame, 40, () => clock.t);
  const requests = [];
  const sockets = [];
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
        let data;
        switch (req.type) {
          case "service.status": data = { managed: false, error: "", version: "9.9.9" }; break;
          case "models.list": data = [{ key: "test/model", provider: "test", name: "Model" }]; break;
          case "models.favorites.get": data = { provider: [], model: [], thinking: [] }; break;
          case "capabilities.list": data = { needsTrust: false, warnings: [], skills: [], mcp: [], plugins: [] }; break;
          case "sessions.list": data = [{ id: "long", title: "长会话", cwd: "C:/work", status: "idle", sessionFile: "C:\\axiom\\long.jsonl", updatedAt: 1 }]; break;
          case "session.attach": data = structuredClone(state); break;
          default: data = {};
        }
        this.receive({ type: "response", id: req.id, ok: true, data });
      });
    }
  }
  window.WebSocket = Socket;
  // 受控分片：调度器只收片不执行，测试自己决定哪一片落地。
  const chunks = [];
  window.scheduler = { postTask: (fn) => { chunks.push(fn); } };
  window.eval([
    modelSources, pickerSource, pageSource, answerSource,
    "window.__app = {" +
    " state: () => ({ connected, connecting: ['connecting', 'restoring'].includes(transport.getConnectionState()), sessionId, queue: transport.getSnapshotQueue() })," +
    " views, snapshot," +
    " watermark: (id) => appliedSeq.get(id)," +
    " failPlacement: () => { const original = placeSnapshotMessage; placeSnapshotMessage = () => { throw new Error('分片渲染失败'); }; return () => { placeSnapshotMessage = original; }; }," +
    " stopReconnect: () => {}, dispose: () => transport.dispose() };",
  ].join("\n"));
  return {
    dom, window, $, app: window.__app, requests, sockets, chunks,
    // 受控调度：一次只推进一片，测试决定「首片调度前」还是「分片中途」的中间态。
    runChunk() { chunks.shift()?.(); },
    // 受控帧：快照尾部的滚动还原挂在 rAF 上，断言前手动放一帧。
    paint() { const batch = [...frames.values()]; frames.clear(); for (const fn of batch) fn(); },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate, label) {
  for (let i = 0; i < 500 && !predicate(); i++) await settle();
  assert.ok(predicate(), `等待超时：${label}`);
}

test("登录恢复：首片调度前显示 workspace，但连接与发送保持未开放", async (t) => {
  const { dom, $, app, requests, sockets, chunks, runChunk } = boot();
  const close = () => { app.dispose(); dom.window.close(); };
  t.after(close);
  try {
    // 断线重连时页面上残留的旧会话内容：身份切换必须先清掉它，再显示首屏。
    const residue = $("output").ownerDocument.createElement("div");
    residue.className = "message";
    residue.textContent = "旧会话残留";
    $("output").append(residue);
    assert.equal($("workspace").hidden, true, "初始页面还没显示 workspace");

    sockets[0].open();
    await until(() => chunks.length > 0, "登录恢复进入首片调度");

    // 首片调度前：DOM 已归属目标会话，workspace 可见；但连接与发送能力尚未开放。
    assert.equal($("workspace").hidden, false, "身份切换同步完成后就显示 workspace");
    assert.equal($("output").textContent.includes("旧会话残留"), false, "调度首片前旧内容已清");
    assert.equal(app.state().connected, false, "分片期间不得提前连接");
    assert.equal($("send").disabled, true, "未连接不得开放发送");
    $("prompt").value = "分片中尝试发送";
    $("composer").requestSubmit();
    await settle();
    assert.equal(requests.some((req) => req.type === "prompt"), false, "未连接时回车不发送");
    assert.equal($("prompt").value, "分片中尝试发送", "分片期间输入的草稿不被吞掉");

    // 分片中途：首条已落地、末条还没到，中间态仍是「可见但未连接」。
    runChunk();
    assert.match($("output").textContent, /历史0/);
    assert.doesNotMatch($("output").textContent, /历史239/);
    assert.equal($("workspace").hidden, false);
    assert.equal(app.state().connected, false, "分片中途依然不连接");
    assert.equal($("send").disabled, true);
    assert.notEqual(app.state().queue, null, "分片期间事件阀仍持有排队事件");

    for (let guard = 1000; chunks.length && guard-- > 0;) runChunk();
    assert.equal(chunks.length, 0, "受控分片应全部推进");
    await until(() => app.state().connected, "完整恢复后才连接");

    assert.equal($("login").hidden, true);
    assert.equal($("workspace").hidden, false);
    assert.equal($("output").querySelectorAll(".message").length, LONG_MESSAGES, "尾片把全部消息铺完");
    assert.match($("output").textContent, /历史239/, "最后一条已落地");
    assert.equal(app.watermark("long"), 500, "尾片完成后才提交快照水位");
    assert.equal(app.state().queue, null, "尾部排空后事件阀已释放");
    assert.equal($("status").dataset.connected, "true");
  } finally {
    close();
  }
});

test("登录恢复分片失败：不连接、不可发，错误回到重连入口", async (t) => {
  const { dom, $, app, sockets, chunks, runChunk } = boot();
  const close = () => { app.dispose(); dom.window.close(); };
  t.after(close);
  try {
    sockets[0].open();
    await until(() => chunks.length > 0, "登录恢复进入首片调度");
    const restorePlacement = app.failPlacement();
    runChunk();
    await until(() => $("error").textContent.includes("分片渲染失败"), "失败上报到错误区");
    assert.equal(app.state().connected, false, "失败不得把连接标记为已建立");
    assert.equal($("send").disabled, true, "失败后仍不可发送");
    assert.equal(app.state().queue, null, "失败快照释放事件阀，不永久排队");
    assert.equal($("status").dataset.connected, "false");
    restorePlacement();
  } finally {
    close();
  }
});

test("分片中断线重连：新草稿不丢，半截布局的滚动值不覆盖既有阅读位置", async (t) => {
  const { dom, $, app, sockets, chunks, runChunk, paint } = boot();
  const close = () => { app.dispose(); dom.window.close(); };
  t.after(close);
  try {
    // 既有视图：该会话上次留下的阅读位置与「暂停跟随」。views 是内存表，必须在首个快照同步阶段前置入。
    app.views.set("long", { draft: "", contextFiles: [], images: [], selectedSkill: "", scroll: 777, follow: false });
    sockets[0].open();
    await until(() => chunks.length > 0, "登录恢复进入首片调度");
    runChunk();
    assert.match($("output").textContent, /历史0/, "首片已落地，但仍是没恢复完的过渡态");
    // 过渡态里用户继续输入新草稿；页面上留下半截布局的中间滚动值。
    $("prompt").value = "分片断线中的新草稿";
    $("transcript").scrollTop = 321;
    assert.notEqual(app.state().queue, null, "断线前仍在分片，事件阀持有排队事件");

    sockets[0].close();
    await until(() => $("login").hidden === false, "断线回到登录入口");
    app.stopReconnect();
    assert.equal(app.views.get("long").draft, "分片断线中的新草稿", "断线保存不得丢掉分片中的新草稿");
    assert.equal(app.views.get("long").scroll, 777, "半截布局的中间滚动值不得覆盖既有视图");

    // 断线不影响已在飞的分片：它照旧铺完；随后这次登录在死连接上失败退出，回到重连入口。
    for (let guard = 1000; chunks.length && guard-- > 0;) runChunk();
    paint();
    assert.equal($("transcript").scrollTop, 321, "断线作废旧分片，旧尾部不再修改视图");
    await until(() => !app.state().connecting, "死连接上的登录收尾");
    app.stopReconnect();
    assert.equal(app.views.get("long").scroll, 777, "收尾保存写的是还原后的位置，不是半截布局的中间值");

    // 与 scheduleReconnect 同一入口恢复：首屏同步阶段草稿就该回来。
    $("login").requestSubmit();
    await until(() => sockets.length > 1, "重连建立新连接");
    sockets[1].open();
    await until(() => chunks.length > 0, "重连进入首片调度");
    // beginSnapshot 会把输入框重置成视图里的草稿：丢在断线保存那一步的话，这里会变空。
    assert.equal($("prompt").value, "分片断线中的新草稿", "首屏同步阶段从视图恢复草稿");
    for (let guard = 1000; chunks.length && guard-- > 0;) runChunk();
    await until(() => app.state().connected, "重连完整恢复");
    paint();
    assert.equal($("prompt").value, "分片断线中的新草稿", "完整恢复后新草稿仍在输入框");
    assert.equal($("transcript").scrollTop, 777, "恢复还原既有阅读位置，而不是半截布局的中间值");
    assert.equal($("latest").hidden, false, "跟随状态按既有视图恢复为暂停");
    assert.equal(app.state().queue, null, "尾部排空后事件阀已释放");
  } finally {
    close();
  }
});

test("首屏钩子抛错与 beginSnapshot 抛错同路：解阀，不留半成品锁死事件", async (t) => {
  const { dom, app } = boot();
  const close = () => { app.dispose(); dom.window.close(); };
  t.after(close);
  try {
    assert.throws(() => app.snapshot(longState(), () => { throw new Error("首屏钩子失败"); }), /首屏钩子失败/);
    assert.equal(app.state().queue, null, "回调异常必须解阀，否则事后事件永久排队");
  } finally {
    close();
  }
});
