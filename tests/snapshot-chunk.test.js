import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// 复用 compaction-ui 的页面 harness：跑真实 app.js，无模型无服务器。
// 额外暴露分片调度与内部状态的受控入口，用来在片间精确插事件、制造渲染失败。
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  // 与 tests/app.test.js、compaction-ui 同一套加载顺序：markdown-scan 是 memory-tags/goal-markers 的依赖。
  const source = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const frames = new Map();
  let nextFrame = 0;
  w.requestAnimationFrame = (fn) => { frames.set(++nextFrame, fn); return nextFrame; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  const markdown = (await readFile(new URL("../public/markdown.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  w.renderMarkdown = new Function("marked", "DOMPurify", `${markdown}; return renderMarkdown;`)(marked, createPurify(w));
  w.createStreamRenderer = (render, after) => createStreamRenderer(render, after, w.requestAnimationFrame, w.cancelAnimationFrame);
  const sent = [];
  w.WebSocket = class { static OPEN = 1; readyState = 1; close() {} send(raw) { sent.push(JSON.parse(raw)); } };
  for (const name of ["model-picker", "model-auth", "model-manager"]) {
    const module = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    const exports = [...module.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    w.eval(`Object.assign(window, (() => { ${module.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`);
  }
  w.eval(`${picker}\n${source}\nconnected = true;
    window.__chunks = [];
    window.__originalPlaceSnapshotMessage = placeSnapshotMessage;
    window.useManualSnapshotScheduler = () => { scheduleSnapshotChunk = (fn) => { window.__chunks.push(fn); }; };
    window.stepSnapshotChunk = () => { window.__chunks.shift()?.(); return window.__chunks.length; };
    window.queuedSnapshotEvents = () => transport.getSnapshotQueue();
    window.snapshotWatermark = (id) => appliedSeq.get(id);
    window.failSnapshotScheduling = () => { scheduleSnapshotChunk = () => { throw new Error("分片调度失败"); }; };
    window.failSnapshotPlacement = () => { placeSnapshotMessage = () => { throw new Error("分片渲染失败"); }; };
    window.restoreSnapshotPlacement = () => { placeSnapshotMessage = window.__originalPlaceSnapshotMessage; };`);
  const output = w.document.getElementById("output");
  const texts = () => [...output.querySelectorAll(".message")].map((node) => node.textContent);
  const count = (text) => texts().filter((value) => value.includes(text)).length;
  return { dom, w, output, texts, count, sent };
}

// >120 条才走分片路径；seq 是服务端快照自带水位。
function longState(sessionId, seq, count = 240) {
  return {
    sessionId, title: "长会话", cwd: "C:/work", status: "idle",
    config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] },
    seq,
    messages: Array.from({ length: count }, (_, index) => ({
      agentId: "main",
      entryId: `h${index}`,
      message: { role: index % 2 ? "assistant" : "user", content: `历史${index}` },
    })),
    tasks: [], live: {}, tools: {},
  };
}

function runChunks(w) {
  let guard = 1000;
  while (w.__chunks.length && guard-- > 0) w.stepSnapshotChunk();
  assert.equal(w.__chunks.length, 0, "受控分片应全部推进");
}

const messageEvent = (sessionId, text, seq) => ({
  sessionId, type: "agent.message.end", agentId: "main",
  ...(seq === undefined ? {} : { seq }),
  data: { message: { role: "user", content: text }, entryId: `q-${text}` },
});

test("分片期间到达的事件按到达顺序补放且恰好一次", async () => {
  const { dom, w, texts, count } = await page();
  try {
    w.useManualSnapshotScheduler();
    const done = w.snapshot(longState("long", 500));
    assert.equal(w.__chunks.length, 1, "首片进入受控调度器");
    for (const [seq, text] of [[501, "片间甲"], [502, "片间乙"], [503, "片间丙"]])
      w.event(messageEvent("long", text, seq));
    assert.equal(count("片间甲"), 0, "分片未排空时事件只排队，不提前落地");
    runChunks(w);
    await done;
    assert.deepEqual(texts().map((value) => value.match(/片间[甲乙丙]/)?.[0]).filter(Boolean), ["片间甲", "片间乙", "片间丙"], "按到达顺序补放");
    for (const text of ["片间甲", "片间乙", "片间丙"]) assert.equal(count(text), 1, `${text} 恰好一次`);
  } finally { dom.window.close(); }
});

test("快照水位以内的迟到事件按 seq 去重，不重复应用", async () => {
  const { dom, w, count } = await page();
  try {
    w.useManualSnapshotScheduler();
    const done = w.snapshot(longState("long", 500));
    w.event(messageEvent("long", "水位下480", 480));
    w.event(messageEvent("long", "水位平500", 500));
    w.event(messageEvent("long", "水位上501", 501));
    runChunks(w);
    await done;
    assert.equal(count("水位下480"), 0, "低于水位的事件不重复应用");
    assert.equal(count("水位平500"), 0, "等于水位的事件已包含在快照里，不重复");
    assert.equal(count("水位上501"), 1, "高于水位的事件正常应用");
  } finally { dom.window.close(); }
});

test("无 seq 事件不参与水位去重，分片期间也不误丢", async () => {
  const { dom, w, count, sent } = await page();
  try {
    w.useManualSnapshotScheduler();
    const done = w.snapshot(longState("long", 500));
    // 无 seq 且会话不匹配也不该被吞掉：session.deleted 仍要触发列表刷新。
    w.event({ type: "session.deleted", sessionId: "other" });
    w.event(messageEvent("long", "无序号"));
    runChunks(w);
    await done;
    assert.equal(count("无序号"), 1, "无 seq 的同会话事件不被水位吞掉");
    assert(sent.some((message) => message.type === "sessions.list"), "无 seq 的 session.deleted 仍被放行");
  } finally { dom.window.close(); }
});

test("长快照首片调度同步抛错后 Promise 拒绝且解除事件队列", async () => {
  const { dom, w, count } = await page();
  try {
    // 首片调度器同步抛错（postTask/setTimeout 不可用等）：executor 内、try 之外。
    w.failSnapshotScheduling();
    const done = w.snapshot(longState("long", 500));
    await assert.rejects(done, /分片调度失败/);
    assert.equal(w.queuedSnapshotEvents(), null, "调度抛错后事件队列已解除");
    w.event(messageEvent("long", "调度失败后事件"));
    assert.equal(count("调度失败后事件"), 0, "失败后停用归并，等待受控快照恢复");
  } finally { dom.window.close(); }
});

test("失败快照不提交尚未恢复成功的序号水位", async () => {
  const { dom, w } = await page();
  try {
    w.snapshot(longState("long", 100, 1));
    assert.equal(w.snapshotWatermark("long"), 100);
    w.failSnapshotPlacement();
    assert.throws(() => w.snapshot(longState("long", 500, 3)), /分片渲染失败/);
    assert.equal(w.snapshotWatermark("long"), 100, "失败恢复不得把水位从100提前抬到500");
  } finally { dom.window.close(); }
});

test("短快照渲染抛错后解除事件队列，后续事件不再被永久排队", async () => {
  const { dom, w, count } = await page();
  try {
    w.failSnapshotPlacement();
    assert.throws(() => w.snapshot(longState("long", 500, 3)), /分片渲染失败/);
    assert.equal(w.queuedSnapshotEvents(), null, "抛错后事件队列已解除");
    w.restoreSnapshotPlacement();
    w.event(messageEvent("long", "错误后事件"));
    assert.equal(count("错误后事件"), 0, "失败后不能继续归并半成品");
  } finally { dom.window.close(); }
});
