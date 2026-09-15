import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { splitAnswer } from "../public/answer-tags.js";
import { publicSource } from "./helpers/public-source.js";

// 标签提取/剥离的纯函数用例在 tests/memory-tags.test.js；本文件只覆盖页面集成行为。

// Run the real page's snapshot/event handlers without a model or server.
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await publicSource("markdown-scan", "memory-tags", "question", "service-settings", "app");
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
  const state = { sessionId: "memory", title: "Memory", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...state, ...changes });
  const emit = (type, data, agentId = "main") => w.event({ sessionId: state.sessionId, type, data, agentId });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  restore();
  return { dom, w, emit, restore, paint, output: w.document.getElementById("output") };
}

test("助手文本流式与成稿都剥离记忆标签，用户手写标签不受影响", async () => {
  const { dom, w, emit, paint, output } = await page();
  try {
    emit("agent.message.start", { message: { role: "assistant" } });
    emit("agent.delta", { type: "text_delta", delta: "正在<tit" });
    paint();
    const assistant = output.querySelector(".message:not(.user) .markdown:not(.thinking-content)");
    assert.equal(assistant.textContent.trim(), "正在", "partial tag stays hidden while streaming");
    emit("agent.delta", { type: "text_delta", delta: "le>标题</title> 完成" });
    paint();
    assert.equal(assistant.textContent.trim(), "正在 完成");
    emit("agent.message.end", { message: { role: "assistant", content: [{ type: "text", text: "<title>全程</title>最终回复" }] } });
    assert.equal(output.querySelector(".message:not(.user) .markdown:not(.thinking-content)").textContent.trim(), "最终回复");
    emit("agent.message.end", { message: { role: "user", content: "<summary>手写标签</summary>用户问题" } });
    const user = output.querySelector(".message.user .markdown:not(.thinking-content)");
    assert.equal(user.querySelector("summary"), null, "user input is plain text, not HTML");
    assert.equal(user.textContent, "<summary>手写标签</summary>用户问题");
    assert.match(user.textContent, /用户问题/);
  } finally { dom.window.close(); }
});

test("正式回答与过程分离，流式和历史均可独立阅读", async () => {
  const { dom, emit, restore, paint, output } = await page();
  const answer = '<axiom_answer>\n完成修复\n</axiom_answer>';
  try {
    emit('agent.message.end', { message: { role: 'user', content: '第一行\n第二行' } });
    emit('agent.message.end', { message: { role: 'assistant', content: '正在检查' } });
    emit('agent.message.start', { message: { role: 'assistant' } });
    emit('agent.delta', { type: 'text_delta', delta: '<axiom_ans' }); paint();
    assert.ok(!output.textContent.includes('<axiom_ans'));
    emit('agent.delta', { type: 'text_delta', delta: 'wer>\n完成修复' }); paint(); paint();
    assert.match(output.textContent, /完成修复/);
    emit('agent.message.end', { message: { role: 'assistant', content: answer } }); paint(); paint();
    assert.equal(output.querySelector('.user > .markdown').textContent, '第一行\n第二行');
    assert.ok([...output.querySelectorAll('.call-group')].some(g => !g.open && g.textContent.includes('正在检查')));
    assert.ok(!output.textContent.includes('axiom_answer'));
    restore({ messages: [
      { agentId: 'main', message: { role: 'user', content: '问题' } },
      { agentId: 'main', message: { role: 'assistant', content: '检查中\n' + answer } },
    ] }); paint(); paint();
    assert.match(output.textContent, /完成修复/);
    assert.ok([...output.querySelectorAll('.call-group')].some(g => !g.open && g.textContent.includes('检查中')));
  } finally { dom.window.close(); }
});

test("session.title 更新标题与页面标题", async () => {
  const { dom, w, emit } = await page();
  try {
    assert.equal(w.document.getElementById("session-title").textContent, "Memory");
    emit("session.title", { title: "新标题" });
    assert.equal(w.document.getElementById("session-title").textContent, "新标题");
    assert.match(w.document.title, /^新标题 · /);
  } finally { dom.window.close(); }
});

test("轮次预算设置：task.budget.get 填充面板，change 即存并回显服务端确认值", async () => {
  const { dom, w } = await page();
  try {
    w.eval(`window.__rpc = []; request = async (type, data = {}) => {
      window.__rpc.push([type, data]);
      return type === "task.budget.get" ? { maxTurns: 30, wrapUpWindow: 3 } : data.budget;
    };`);
    await w.loadTaskBudget();
    const value = (id) => w.document.getElementById(id).value;
    assert.equal(value("task-max-turns"), "30");
    assert.equal(value("task-wrap-up-window"), "3");
    w.document.getElementById("task-max-turns").value = "50";
    w.document.getElementById("task-max-turns").dispatchEvent(new w.Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const configure = w.__rpc.find(([type]) => type === "task.budget.configure");
    assert.deepEqual(JSON.parse(JSON.stringify(configure[1])), { budget: { maxTurns: 50, wrapUpWindow: 3 } });
    assert.equal(value("task-max-turns"), "50");
    assert.match(w.document.getElementById("settings-feedback").textContent, /已保存/);
    assert.ok(w.__rpc.some(([type]) => type === "task.budget.get"));
  } finally { dom.window.close(); }
});
