import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";

// Run the real page's snapshot/event handlers without a model or server.
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = (await readFile(new URL("../public/app.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const contrast = (await readFile(new URL("../public/text-contrast.js", import.meta.url), "utf8")).replace(/^export /gm, "");
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
  w.WebSocket = class { static OPEN = 1; readyState = 1; send() {} };
  w.eval(`${contrast}\n${picker}\n${source}\nconnected = true;`);
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

