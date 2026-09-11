import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";

// Run the real page's snapshot/event handlers without a model or server.
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = (await readFile(new URL("../public/app.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
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
  w.renderMarkdown = (node, text) => { node.textContent = text; };
  w.createStreamRenderer = (render, after) => createStreamRenderer(render, after, w.requestAnimationFrame, w.cancelAnimationFrame);
  w.WebSocket = class { static OPEN = 1; readyState = 1; send() {} };
  w.eval(`${picker}\n${source}\nconnected = true;`);
  const state = { sessionId: "activity", title: "Activity", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...state, ...changes });
  const emit = (type, data, agentId = "main") => w.event({ sessionId: state.sessionId, type, data, agentId });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  restore();
  return { dom, w, emit, restore, paint, output: w.document.getElementById("output") };
}

const assistant = (content, more = {}) => ({ role: "assistant", content, model: "model", provider: "test", usage: { input: 20, output: 10 }, ...more });
const thought = (text) => ({ type: "thinking", thinking: text });
const call = (id, name = "read", args = { path: "src/main.js" }) => ({ type: "toolCall", id, name, arguments: args });
const entry = (message, entryId, agentId = "main") => ({ message, entryId, agentId });

test("activity history hides empty shells and retains tool summaries without raw payloads", async () => {
  const { dom, restore, output } = await page();
  try {
    restore({ messages: [
      entry({ role: "user", content: "检查文件" }, "u"),
      entry(assistant([]), "empty"),
      entry(assistant([thought("第一步")]), "t1"),
      entry(assistant([thought("第二步")]), "t2"),
      entry(assistant([call("read-1")]), "c1"),
      entry({ role: "toolResult", toolCallId: "read-1", toolName: "read", content: [{ type: "text", text: "PRIVATE_FILE_CONTENT" }], isError: false }, "r1"),
      entry(assistant([{ type: "text", text: "检查完成" }]), "answer"),
    ] });
    assert.equal(output.querySelectorAll(".merged-thought").length, 1, "adjacent thinking messages form one visible record");
    assert.match(output.textContent, /检查完成/);
    assert.match(output.textContent, /src\/main\.js/);
    assert.doesNotMatch(output.textContent, /PRIVATE_FILE_CONTENT/);
    const record = output.querySelector(".tool-record");
    record.open = true;
    record.dispatchEvent(new dom.window.Event("toggle"));
    assert.match(record.textContent, /PRIVATE_FILE_CONTENT/);
    const visible = [...output.querySelectorAll(".message")].filter((node) => !node.hidden);
    assert(visible.every((node) => node.classList.contains("user") || node.querySelector(".markdown")?.textContent || /思考|read|读取/.test(node.textContent)), "no model/usage-only assistant cards");
    assert.equal(output.querySelectorAll(".message-model:not([hidden])").length <= 2, true, "intermediate steps do not repeat usage footers");
  } finally { dom.window.close(); }
});

test("live activity tracks thinking, tool completion, errors, cancellation and snapshot boundaries", async () => {
  const { dom, w, emit, restore, paint, output } = await page();
  const start = () => emit("agent.message.start", { message: assistant([]) });
  try {
    emit("session.state", { status: "running" });
    assert.match(output.textContent, /连接中/);
    start();
    emit("agent.delta", { type: "thinking_delta", delta: "第一段" });
    paint();
    assert.match(output.querySelector('[data-state="thinking"]').textContent, /思考中/);
    emit("agent.message.end", { message: assistant([thought("第一段")]), entryId: "one" });
    start();
    emit("agent.delta", { type: "thinking_delta", delta: "第二段" });
    emit("agent.message.end", { message: assistant([thought("第二段")]), entryId: "two" });
    assert.equal(output.querySelectorAll(".merged-thought").length, 1);
    const details = output.querySelector(".pure-thought details");
    details.open = true;
    details.dispatchEvent(new w.Event("toggle"));
    paint();
    assert.equal(details.querySelector("pre").textContent, "第一段\n\n第二段");
    emit("agent.compaction", { id: "compact", summary: "第一段摘要", compactedMessageIds: ["one"] });
    assert.equal(output.querySelectorAll(".merged-thought").length, 0, "compacting first member must not hide the retained thought");
    start();
    emit("agent.message.end", { message: assistant([call("tool")]) });
    emit("tool.state", { phase: "start", toolCallId: "tool", toolName: "read", args: { path: "<img src=x onerror=alert(1)>" } });
    assert.equal(output.querySelectorAll(".tool-activity").length, 1);
    assert.equal(output.querySelector(".tool-activity img"), null);
    emit("tool.state", { phase: "end", toolCallId: "tool", toolName: "read", isError: true });
    assert.match(output.querySelector('.tool-activity[data-state="failed"]').textContent, /失败/);
    emit("session.state", { status: "idle" });
    assert.equal(output.querySelector('[data-state="running"],[data-state="waiting"],[data-state="thinking"]'), null);
    restore({ status: "running", tools: { tool: { agentId: "main", phase: "start", toolCallId: "restored", toolName: "bash", args: { command: "npm test" } } } });
    assert.match(output.querySelector('[data-state="running"]').textContent, /npm test/);
    emit("session.state", { status: "cancelling" });
    assert.equal(output.querySelector('[data-state="running"]'), null);
    restore();
    assert.equal(output.querySelector(".tool-activity"), null, "switching clears tool state");
    start();
    emit("agent.message.end", { message: assistant([call("edit", "edit", { path: "app.js", edits: [{ oldText: "old", newText: "<script>bad</script>" }] })]) });
    const record = output.querySelector(".tool-record");
    assert.equal(record.open, false);
    assert.equal(record.querySelector(".tool-detail").textContent, "");
    record.open = true;
    record.dispatchEvent(new w.Event("toggle"));
    assert.match(record.querySelector(".diff-add").textContent, /<script>/);
    assert.equal(record.querySelector("script"), null);
    assert.match(record.textContent, /请求改动/);
    emit("tool.state", { phase: "end", toolCallId: "edit", toolName: "edit", result: { content: [{ type: "text", text: "Edited" }], details: { diff: "-1 old\n+1 new" } } });
    assert.match(record.textContent, /实际改动/);
    assert.match(record.querySelector(".diff-remove").textContent, /old/);
    assert.match(record.querySelector(".diff-add").textContent, /new/);
    const selector = record.querySelector('select[aria-label="代码对比展示方式"]');
    selector.value = "split";
    selector.dispatchEvent(new w.Event("change"));
    assert.equal(w.localStorage.getItem("axiom.diffView"), "split");
    assert(record.querySelector(".diff-view-split"));
    const cells = record.querySelectorAll(".diff-split pre");
    assert.match(cells[2].textContent, /old/);
    assert.match(cells[3].textContent, /new/);
  } finally { dom.window.close(); }
});
