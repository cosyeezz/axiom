import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { splitAnswer } from "../public/answer-tags.js";
import { GOAL_MARKER, ROUND_MARKER, parseGoalMarkers, stripGoalMarkers } from "../public/goal-markers.js";
import { publicSource } from "./helpers/public-source.js";

// 完成标记的判定细节在 tests/goal.test.js（后端 Goal 类）。本文件守两条契约：
//   1) 前后端共用一份实现 —— src/goal.js 与 public/app.js 都 import public/goal-markers.js；
//   2) 前端展示不出现协议标记原文（含流式半截），代码区内的写法与用户手写同名文本照常保留。

// Run the real page's snapshot/event handlers without a model or server.
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.splitAnswer = splitAnswer;
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
  w.WebSocket = class { static OPEN = 1; readyState = 1; send() {} };
  for (const name of ["model-picker", "model-auth", "model-manager"]) {
    const module = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    const exports = [...module.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    w.eval(`Object.assign(window, (() => { ${module.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`);
  }
  w.eval(`${picker}\n${source}\nconnected = true;`);
  const state = { sessionId: "goal-markers", title: "Goal", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...state, ...changes });
  const emit = (type, data, agentId = "main") => w.event({ sessionId: state.sessionId, type, data, agentId });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  restore();
  return { dom, w, emit, restore, paint, output: w.document.getElementById("output") };
}

const lastAssistant = (output) => [...output.querySelectorAll(".message:not(.user)")].at(-1);

test("完成标记只认代码区外独占行的精确写法", () => {
  assert.deepEqual(parseGoalMarkers(`正文\n\n${ROUND_MARKER}`), { roundFinished: true, goalFinished: false });
  assert.deepEqual(parseGoalMarkers(`正文\n\n${GOAL_MARKER}`), { roundFinished: false, goalFinished: true });
  for (const text of [
    `\`\`\`\n${ROUND_MARKER}\n\`\`\``,           // 围栏内是在举例
    `~~~\n${ROUND_MARKER}\n~~~`,                 // 波浪线围栏
    `    ${ROUND_MARKER}`,                       // 缩进代码块
    `\`${ROUND_MARKER}\``,                       // 行内代码
    "<AXIOM_ROUND_FINISHED>",                    // 大写变体不是信号
    `${ROUND_MARKER}。`,                          // 标记后还有内文
    `${ROUND_MARKER} ${GOAL_MARKER}`,             // 两个标记挤在同一行
    `${ROUND_MARKER}</${ROUND_MARKER.slice(1)}`, // 模型自作主张补的闭合标签
  ]) assert.deepEqual(parseGoalMarkers(text), { roundFinished: false, goalFinished: false }, text);
});

test("剥离标记原文，代码区内的写法原样保留", () => {
  assert.equal(stripGoalMarkers(`正文\n\n${ROUND_MARKER}`), "正文\n");
  assert.equal(stripGoalMarkers(`正文\n${ROUND_MARKER}\n</${ROUND_MARKER.slice(1)}`), "正文");
  assert.equal(stripGoalMarkers(`正文\n${ROUND_MARKER}</${ROUND_MARKER.slice(1)}`), "正文");
  assert.equal(stripGoalMarkers(`正文\n${ROUND_MARKER}\n\n收尾`), "正文\n\n收尾");
  const fenced = `正文\n\n\`\`\`\n${ROUND_MARKER}\n\`\`\``;
  assert.equal(stripGoalMarkers(fenced), fenced);
  assert.equal(stripGoalMarkers("没有标记的正文"), "没有标记的正文");
});

test("流式隐藏行尾半截标记，非流式按字面保留", () => {
  assert.equal(stripGoalMarkers("正文\n<axiom_rou", { streaming: true }), "正文");
  assert.equal(stripGoalMarkers("正文\n</axiom_goal_fin", { streaming: true }), "正文");
  assert.equal(stripGoalMarkers(`正文\n${ROUND_MARKER}`, { streaming: true }), "正文");
  assert.equal(stripGoalMarkers("正文\n<axiom_rou"), "正文\n<axiom_rou");
});

test("后端 goal.js 与前端 app.js 共用同一份实现", async () => {
  const backend = await import("../src/goal.js");
  assert.equal(backend.ROUND_MARKER, ROUND_MARKER);
  assert.equal(backend.GOAL_MARKER, GOAL_MARKER);
  assert.equal(backend.parseGoalMarkers, parseGoalMarkers, "后端不再自成一套解析");
  assert.equal(backend.stripGoalMarkers, stripGoalMarkers, "后端不再自成一套剥离");
  assert.match(await readFile(new URL("../public/app.js", import.meta.url), "utf8"), /from "\.\/goal-markers\.js"/);
});

test("页面展示不出现完成标记原文：成稿、流式、代码区讲解与用户手写各就各位", async () => {
  const { dom, emit, paint, output } = await page();
  try {
    emit("agent.message.end", { message: { role: "assistant", content: `<axiom_display>\n本轮结论\n</axiom_display>\n\n${ROUND_MARKER}` } });
    assert.equal(lastAssistant(output).textContent.includes(ROUND_MARKER), false, "成稿不显示完成标记原文");
    assert.match(lastAssistant(output).textContent, /本轮结论/);

    emit("agent.message.start", { message: { role: "assistant" } });
    emit("agent.delta", { type: "text_delta", delta: "收尾说明\n\n<axiom_rou" }); paint();
    assert.equal(lastAssistant(output).textContent.includes("axiom_rou"), false, "流式半截标记不闪现");
    emit("agent.delta", { type: "text_delta", delta: "nd_finished>" }); paint();
    assert.equal(lastAssistant(output).textContent.includes(ROUND_MARKER), false, "流式完整标记不显示");
    assert.match(lastAssistant(output).textContent, /收尾说明/);

    emit("agent.message.end", { message: { role: "assistant", content: `写法：\n\n\`\`\`\n${ROUND_MARKER}\n\`\`\`` } });
    assert.match(lastAssistant(output).textContent, /axiom_round_finished/, "围栏内的讲解照常显示");

    emit("agent.message.end", { message: { role: "user", content: `请输入 ${ROUND_MARKER} 开始` } });
    const user = [...output.querySelectorAll(".message.user")].at(-1);
    assert.match(user.textContent, /请输入 <axiom_round_finished> 开始/, "用户手写同名文本原样保留");
  } finally { dom.window.close(); }
});
