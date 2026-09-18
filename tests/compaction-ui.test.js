import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// Run the real page's snapshot/event handlers without a model or server.
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
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
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const markdownApi = new Function("marked", "DOMPurify", `${markdown}; return { renderMarkdown, createMarkdownPageCache };`)(marked, createPurify(w));
  w.renderMarkdown = markdownApi.renderMarkdown;
  w.createMarkdownPageCache = markdownApi.createMarkdownPageCache;
  w.createStreamRenderer = (render, after) => createStreamRenderer(render, after, w.requestAnimationFrame, w.cancelAnimationFrame);
  w.WebSocket = class { static OPEN = 1; readyState = 1; send() {} };
  for (const name of ["model-picker", "model-auth", "model-manager"]) {
    const module = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    const exports = [...module.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    w.eval(`Object.assign(window, (() => { ${module.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`);
  }
  w.eval(`${picker}\n${source}\nconnected = true; window.disconnectForTest = () => { connected = false; updateAvailability(); };`);
  const state = { sessionId: "activity", title: "Activity", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...state, ...changes });
  const emit = (type, data, agentId = "main") => w.event({ sessionId: state.sessionId, type, data, agentId });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  restore();
  return { dom, w, emit, restore, paint, output: w.document.getElementById("output") };
}

test("压缩状态隔离、两层子代理归档、快照与迟到任务更新", async () => {
  const { dom, w, emit, restore, output } = await page();
  try {
    const progress = w.document.getElementById("compaction-progress");
    emit("agent.compaction.status", { status: "summarizing" });
    assert.equal(progress.hidden, false);
    assert(progress.querySelector(".task-run-spin"));
    emit("agent.compaction.status", { status: "failed" }, "child");
    assert.equal(progress.dataset.status, "summarizing");
    w.event({ sessionId: "other", type: "agent.compaction.status", data: { status: "failed" } });
    assert.equal(progress.dataset.status, "summarizing");
    emit("agent.compaction.status", { status: "cancelled", message: "<img src=x>" });
    assert.equal(progress.querySelector("img"), null);
    assert.equal(progress.querySelector(".task-run-spin"), null);
    restore();
    assert.equal(progress.hidden, true);
    const messages = [], records = [], taskList = [];
    for (let i = 1; i <= 2; i++) {
      const task = { id: `t${i}`, task: `任务${i}`, status: "completed" };
      taskList.push(task);
      w.event({ sessionId: "activity", type: "task.state", taskId: task.id, data: task });
      const message = { role: "user", content: `阶段${i}` };
      emit("agent.message.end", { message, entryId: `u${i}` });
      const result = { role: "toolResult", toolName: "delegate", toolCallId: `d${i}`, content: [{ type: "text", text: JSON.stringify({ taskIds: [task.id] }) }] };
      emit("agent.message.end", { message: result, entryId: `r${i}` });
      messages.push({ agentId: "main", message, entryId: `u${i}` }, { agentId: "main", message: result, entryId: `r${i}` });
      const record = { id: `c${i}`, summary: `摘要${i}`, compactedMessageIds: [`u${i}`, `r${i}`] };
      records.push(record);
      emit("agent.compaction", record);
    }
    const check = () => {
      assert.equal(output.querySelectorAll(":scope > .task-card").length, 0);
      const cards = output.querySelectorAll(":scope > .compaction-card");
      assert.equal(cards.length, 2);
      for (let i = 0; i < 2; i++) assert.match(cards[i].querySelector(".task-card").textContent, new RegExp(`任务${i+1}`));
    };
    check();
    restore({ messages, tasks: taskList, compactions: records, compactionStatus: { status: "ready" } });
    check();
    assert.equal(progress.dataset.status, "ready");
    const task = { ...taskList[0], status: "running" };
    w.event({ sessionId: "activity", type: "task.state", taskId: task.id, data: task });
    check();
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.document.querySelector("#task-runs button").click();
    assert.equal(output.querySelector(".compaction-card").open, true);
    output.querySelector(".compaction-card .task-card").click();
    assert.equal(w.document.getElementById("task-t1").open, true);
    restore({ messages, tasks: [], compactions: records });
    w.event({ sessionId: "activity", type: "task.state", taskId: "t1", data: taskList[0] });
    assert.equal(output.querySelectorAll(".compaction-card .task-card").length, 1);
    assert.equal(output.querySelectorAll(":scope > .task-card").length, 0);
  } finally { dom.window.close(); }
});

test("压缩卡片序号与 progress 标题描述，旧数据回退现文案", async () => {
  const { dom, restore, output } = await page();
  try {
    const records = [
      { id: "c1", summary: "摘要一", tokensBefore: 120000, estimatedTokensAfter: 30000, compactedMessageIds: [] },
      { id: "c2", summary: "摘要二", progress: { title: "阶段压缩<img src=x>", description: "保留检查点后的消息<script>alert(1)</script>" }, compactedMessageIds: [] },
    ];
    restore({ compactions: records });
    const cards = output.querySelectorAll(":scope > .compaction-card");
    assert.equal(cards.length, 2);
    // 旧数据：现文案 + 序号 01
    assert.equal(cards[0].querySelector("summary span").textContent, "01 · 上下文已压缩");
    assert.match(cards[0].querySelector("summary small").textContent, /压缩前 120,000 tokens · 压缩后约 30,000 tokens/);
    // 新数据：progress 标题/描述只走 textContent，不产生任何元素
    const badge = cards[1].querySelector("summary span");
    const meta = cards[1].querySelector("summary small");
    assert.equal(badge.textContent, "02 · 阶段压缩<img src=x>");
    assert.equal(meta.textContent, "保留检查点后的消息<script>alert(1)</script>");
    assert.equal(badge.querySelector("*"), null);
    assert.equal(meta.querySelector("*"), null);
    // 摘要展开结构不变
    cards[1].open = true;
    assert.match(cards[1].querySelector(".compaction-summary").textContent, /摘要二/);
    assert.equal(cards[1].querySelector(".compaction-tasks").childElementCount, 0);
  } finally { dom.window.close(); }
});


test("委派入口在原位置恢复，同批顺序、迟到状态及重复分组不漂移", async () => {
  const { dom, w, emit, restore, paint, output } = await page();
  const messages = [
    { agentId: "main", entryId: "u", message: { role: "user", content: "开始" } },
    { agentId: "main", entryId: "d", message: { role: "assistant", content: [{ type: "text", text: "现在委派" }, { type: "toolCall", id: "delegate-call", name: "functions.delegate", arguments: {} }] } },
    { agentId: "main", entryId: "r", message: { role: "toolResult", toolName: "functions.delegate", toolCallId: "delegate-call", content: [{ type: "text", text: '{"taskIds":["a","b"]}' }] } },
    { agentId: "main", entryId: "answer", message: { role: "assistant", content: [{ type: "text", text: "最终回答" }] } },
  ];
  const tasks = ["b", "a"].map(id => ({ id, task: id, status: "completed" }));
  const check = () => {
    paint(); paint(); paint();
    const cards = [...output.querySelectorAll(":scope > .task-card")];
    assert.deepEqual(cards.map(node => node.getAttribute("aria-controls")), ["task-a", "task-b"]);
    const answer = [...output.querySelectorAll(".message")].find(node => node.textContent.includes("最终回答"));
    assert(cards[1].compareDocumentPosition(answer) & 4, "卡片在最终回答前");
    assert(cards[0].previousElementSibling.classList.contains("call-group"), "入口在委派执行段外，折叠仍可见");
    assert.equal(cards[0].nextElementSibling, cards[1]);
  };
  try {
    for (let i = 0; i < 2; i++) { restore({ messages, tasks }); check(); }
    const read = { agentId: "main", entryId: "read", message: { role: "assistant", content: [{ type: "toolCall", id: "later-read", name: "read", arguments: { path: "later.txt" } }] } };
    restore({ messages: [...messages.slice(0, 3), read, messages[3]] });
    paint(); paint();
    for (const task of tasks) w.event({ sessionId: "activity", type: "task.state", taskId: task.id, data: task });
    check();
    const laterRead = [...output.querySelectorAll(".tool-record")].find(node => node.textContent.includes("later.txt"));
    assert(output.querySelector('[aria-controls="task-b"]').compareDocumentPosition(laterRead) & 4, "迟到任务也应在后续工具之前");
    restore();
    for (const entry of messages) {
      emit("agent.message.end", { message: entry.message, entryId: entry.entryId });
      if (entry.entryId === "d") for (const task of tasks)
        w.event({ sessionId: "activity", type: "task.state", taskId: task.id, data: task });
      paint();
    }
    check();
  } finally { dom.window.close(); }
});

test("子任务手动重试绑定原会话和任务，禁止重复点击并随状态收起", async () => {
  const { dom, w, restore } = await page();
  try {
    const task = { id: "child", task: "继续检查", status: "failed", canRetry: true };
    restore({ tasks: [task] });
    const button = w.document.querySelector("#task-child .task-error + button");
    assert.equal(button.hidden, false);
    w.eval('window.sent = []; request = (type, data) => { window.sent.push({ type, ...data }); return new Promise(resolve => { window.finishRetry = resolve; }); };');
    button.click(); button.click();
    assert.equal(w.sent.length, 1);
    assert.equal(w.sent[0].type, "task.retry");
    assert.equal(w.sent[0].sessionId, "activity");
    assert.equal(w.sent[0].taskId, "child");
    assert.equal(button.disabled, true);
    w.event({ sessionId: "activity", type: "task.state", taskId: task.id, data: { ...task, status: "running", canRetry: false } });
    assert.equal(button.hidden, true);
    w.finishRetry({ accepted: true });
    await Promise.resolve();
    w.event({ sessionId: "activity", type: "task.state", taskId: task.id, data: task });
    w.disconnectForTest();
    assert.equal(button.disabled, true);
  } finally { dom.window.close(); }
});
