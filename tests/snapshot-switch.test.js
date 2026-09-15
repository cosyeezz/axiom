import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// 分片快照的切换语义：旧片 / 旧事件不得落到新会话，草稿不被尾部覆盖，live 前缀要接住后续 delta。
// 与 tests/app.test.js 同一套 JSDOM 装配方式，但这里把分片调度换成受控队列，逐片推进。
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const pickerSource = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const modelSources = await Promise.all(["model-picker", "model-auth", "model-manager"].map(async (name) => {
  const source = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
  const exports = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  return `Object.assign(window, (() => { ${source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`;
})).then((parts) => parts.join("\n"));
// 与 tests/app.test.js 同一套加载顺序：markdown-scan 是 memory-tags/goal-markers 的依赖。
const pageSource = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
const markdownSource = (await readFile(new URL("../public/markdown.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
// answer-tags 与 memory-tags 都有顶层 OPEN/CLOSE 常量，同处一段脚本会重复声明；包一层隔离作用域。
const answerSource = `Object.assign(window, (() => { ${(await readFile(new URL("../public/answer-tags.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn { splitAnswer }; })());`;

const CONFIG = { model: "test/model", thinking: "off", levels: ["off"], skills: [] };

function sessionState(id, { messages = [], live = {}, seq, status = "idle" } = {}) {
  const state = { sessionId: id, title: id, cwd: "C:\\work", status, config: structuredClone(CONFIG), messages, tasks: [], live };
  if (seq !== undefined) state.seq = seq;
  return state;
}

// 每条消息一个唯一标记，便于断言某一条是否落进 DOM。
function history(count, tag) {
  return Array.from({ length: count }, (_, index) => ({
    agentId: "main",
    entryId: `${tag}-${index}`,
    message: { role: index % 2 ? "assistant" : "user", content: `${tag}-${index}` },
  }));
}

function boot() {
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
  // 假时钟：流渲染器的让路窗口（interact 后 520ms）不会随真实时间漂移，paint 完全可控。
  const clock = { t: 0 };
  const renderMarkdown = new Function("marked", "DOMPurify", `${markdownSource}; return renderMarkdown;`)(marked, createPurify(window));
  window.renderMarkdown = renderMarkdown;
  window.createStreamRenderer = (render, after) =>
    createStreamRenderer(render, after, window.requestAnimationFrame, window.cancelAnimationFrame, 40, () => clock.t);
  const chunks = [];
  window.scheduler = { postTask: (fn) => { chunks.push(fn); } };
  window.eval([
    modelSources, pickerSource, pageSource, answerSource,
    "window.__app = { snapshot, event, saveView, live, views, appliedSeq, renderer," +
    " snapshotQueue: () => snapshotQueue, snapshotJob: () => snapshotJob, session: () => sessionId," +
    " withdrawQueue, switchSession, request: (type, data) => request(type, data), setRequest: (fn) => { request = fn; }," +
    " setConnected: (value) => { connected = value; controls(); } };",
  ].join("\n"));
  return {
    window,
    $,
    app: window.__app,
    close: () => dom.window.close(),
    pendingChunks: () => chunks.length,
    // 受控调度：一次只推进一片，测试决定"哪一片"落在切换前还是切换后。
    runChunk() { const next = chunks.shift(); if (next) next(); },
    paint() {
      clock.t += 1000;
      const batch = [...frames.values()];
      frames.clear();
      for (const fn of batch) fn();
    },
  };
}

test("长快照分片中快速切新会话：旧片与旧事件都不污染新会话", async (t) => {
  const { $, app, runChunk, paint, pendingChunks, close } = boot();
  t.after(close);
  const stale = sessionState("a", { seq: 10, messages: history(160, "OLD-A") });
  const first = app.snapshot(stale);
  assert.equal(pendingChunks(), 1, "长快照交给受控调度分片，不同步落地");
  assert.equal($("output").textContent.includes("OLD-A"), false, "首片落地前消息区是空的");
  runChunk();
  assert.match($("output").textContent, /OLD-A-0/);
  assert.doesNotMatch($("output").textContent, /OLD-A-159/, "一片之内铺不完 160 条");
  // 分片期间到达的 A 会话事件被阀住排队，不即时应用。
  app.event({ type: "agent.delta", sessionId: "a", agentId: "main", seq: 11, data: { type: "text_delta", delta: "STALE-EVENT-A" } });
  assert.equal(app.snapshotQueue().length, 1, "分片期间外部事件进入队列");
  assert.doesNotMatch($("output").textContent, /STALE-EVENT-A/);

  // 快速切到新会话：旧片仍在挂起，新快照同步接管事件阀。
  const fresh = sessionState("b", { seq: 20, messages: history(130, "NEW-B") });
  const second = app.snapshot(fresh);
  assert.equal(app.session(), "b");
  assert.equal(app.snapshotQueue().length, 0, "新快照接管事件阀，旧队列被丢弃");
  assert.doesNotMatch($("output").textContent, /OLD-A/, "切换即清空旧会话消息区");
  // 队列里此刻只剩旧片退场回调，先放它跑：必须静默退场，不把旧消息塞回来。
  runChunk();
  await first;
  assert.doesNotMatch($("output").textContent, /OLD-A/, "旧片退场不触碰 DOM");
  assert.doesNotMatch($("output").textContent, /STALE-EVENT-A/);
  assert.equal(app.appliedSeq.get("a"), undefined, "被取消的旧快照与排队事件都不得提交水位");

  // 新会话自己的分片继续推进，期间排队的事件在尾部按 seq 水位补放（正向对照）。
  runChunk();
  assert.match($("output").textContent, /NEW-B-0/, "新会话首片正常落地");
  app.event({ type: "agent.message.end", sessionId: "b", seq: 21, data: { entryId: "tail-b", message: { role: "user", content: "TAIL-B" } } });
  assert.equal(app.snapshotQueue().length, 1, "新会话分片期间事件同样排队");
  while (pendingChunks()) runChunk();
  await second;
  paint();
  assert.match($("output").textContent, /TAIL-B/, "尾部按序补放排队事件");
  assert.match($("output").textContent, /NEW-B-0/);
  assert.doesNotMatch($("output").textContent, /OLD-A/);
});

test("分片中编辑草稿：快照尾部不覆盖，切走再切回仍保留", async (t) => {
  const { window, $, app, runChunk, paint, pendingChunks, close } = boot();
  t.after(close);
  const draft = "分片中编辑的草稿\n第二行";
  const first = app.snapshot(sessionState("a", { seq: 5, messages: history(150, "OLD-A") }));
  runChunk();
  // 用户在第一片落地后、尾部未到之前输入草稿（未连接时 updateCompletion 直接返回，不触网）。
  $("prompt").value = draft;
  $("prompt").dispatchEvent(new window.Event("input"));
  assert.equal($("prompt").value, draft);
  while (pendingChunks()) runChunk();
  await first;
  paint();
  assert.equal($("prompt").value, draft, "快照尾部不得用 begin 时读到的旧视图覆盖草稿");

  // 切到别的会话再切回来：草稿按视图恢复，旧视图不反噬。
  app.saveView();
  await app.snapshot(sessionState("b", { seq: 6 }));
  assert.equal($("prompt").value, "");
  const second = app.snapshot(sessionState("a", { seq: 5, messages: history(150, "OLD-A") }));
  assert.equal($("prompt").value, draft, "切回原会话立即恢复草稿（同步阶段即可见）");
  while (pendingChunks()) runChunk();
  await second;
  paint();
  assert.equal($("prompt").value, draft, "分片结束后草稿仍在");
});

test("state.live 恢复的前缀接住后续 delta，内容完整不丢不重", async (t) => {
  const { $, app, paint, close } = boot();
  t.after(close);
  await app.snapshot(sessionState("a", {
    seq: 7,
    status: "running",
    live: { main: { role: "assistant", content: [
      { type: "text", text: "快照前缀" },
      { type: "thinking", thinking: "已有思考" },
    ] } },
  }));
  assert.match($("output").textContent, /快照前缀/);
  assert.equal(app.live.get("main").raw, "快照前缀", "挂起流入 live 时以快照文本为 delta 基线");
  app.event({ type: "agent.delta", sessionId: "a", agentId: "main", seq: 8, data: { type: "text_delta", delta: "追加后缀" } });
  paint();
  assert.equal(app.live.get("main").raw, "快照前缀追加后缀");
  assert.match($("output").textContent, /快照前缀追加后缀/, "delta 接在快照前缀之后，绘制内容不丢不重");
  assert.equal(app.live.get("main").reasoning, "已有思考", "renderMessage 恢复 thinking 块");
  app.event({ type: "agent.delta", sessionId: "a", agentId: "main", seq: 9, data: { type: "thinking_delta", delta: "继续思考" } });
  paint();
  assert.equal(app.live.get("main").reasoning, "已有思考继续思考");
});

// withdrawQueue(recall) 在 await request("session.attach") 之后直接 snapshot，没有对 attach 返回时的身份复核：
// 召回 attach 挂起期间用户切走（真实 switchSession 此刻 changing=true 但 sessionId 未变），
// 覆盖 B 已完成和 B 仍等待回包两种顺序，不能只检查 sessionId。
for (const pendingB of [false, true]) test(`召回 attach 挂起中切到 B（B${pendingB ? "仍等待" : "已完成"}）：A 不夺屏且召回文本留在 A 草稿`, async (t) => {
  const { $, app, close } = boot();
  t.after(close);
  const settle = () => new Promise(setImmediate);
  const states = {
    a: sessionState("a", { seq: 5, messages: history(4, "A-MSG") }),
    // 迟到的 A 快照带独立标记，便于断言它到底有没有重绘消息区。
    lateA: sessionState("a", { seq: 9, messages: history(4, "A-LATE") }),
    b: sessionState("b", { seq: 6, messages: history(4, "B-MSG") }),
  };
  let attachAStarted = false, releaseAttachA;
  const pendingAttachA = new Promise((resolve) => { releaseAttachA = resolve; });
  let releaseAttachB;
  const pendingAttachB = new Promise((resolve) => { releaseAttachB = resolve; });
  app.setRequest(async (type, data = {}) => {
    if (type === "sessions.list") return [];
    if (type === "queue.withdraw") return { steering: [], followUp: [], recalled: { entryId: "u1", text: "召回文本" } };
    if (type === "session.attach" && data.sessionId === "a") { attachAStarted = true; return pendingAttachA; }
    if (type === "session.attach" && pendingB) return pendingAttachB;
    if (type === "session.attach") return structuredClone(states[data.sessionId]);
    return {};
  });
  app.setConnected(true);
  await app.snapshot(structuredClone(states.a));
  assert.equal(app.session(), "a");

  // 规则召回：queue.withdraw 返回后走「重取快照」分支，attach 挂起在路上。
  const withdraw = app.withdrawQueue(true);
  await settle();
  assert.equal(attachAStarted, true, "召回路径已发出重取快照的 attach，并处于挂起状态");
  assert.equal(app.session(), "a");

  // 用户此刻切到 B：与真实 switchSession 一致（attach 期间只置 changing，尚未改 sessionId）。这里让 B 正常完成。
  const switching = app.switchSession(() => app.request("session.attach", { sessionId: "b" }));
  if (!pendingB) {
    await switching;
    assert.equal(app.session(), "b");
    assert.match($("output").textContent, /B-MSG-0/);
    assert.equal($("prompt").value, "");
  }

  // A 的 attach 迟到返回：此刻当前会话已是 B，A 的快照必须静默退场。
  releaseAttachA(structuredClone(states.lateA));
  await withdraw;
  await settle();
  assert.doesNotMatch($("output").textContent, /A-LATE/, "即使B还未返回，也不得启动过期的A快照");
  if (pendingB) {
    releaseAttachB(structuredClone(states.b));
    await switching;
  }
  assert.equal(app.session(), "b", "迟到的 A 快照不得把当前会话夺回 a");
  assert.doesNotMatch($("output").textContent, /A-LATE/, "迟到的 A 快照不得重绘消息区");
  assert.match($("output").textContent, /B-MSG-0/, "B 的消息区必须保住");
  assert.equal($("prompt").value, "", "召回文本不得落进 B 的输入框");
  assert.equal(app.views.get("a")?.draft, "召回文本", "召回文本按视图存进 A 草稿，切回 A 时再恢复");
});
