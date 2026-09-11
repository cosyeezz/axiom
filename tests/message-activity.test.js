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

const assistant = (content, more = {}) => ({ role: "assistant", content, model: "model", provider: "test", usage: { input: 20, output: 10 }, ...more });
const thought = (text) => ({ type: "thinking", thinking: text });
const call = (id, name = "read", args = { path: "src/main.js" }) => ({ type: "toolCall", id, name, arguments: args });
const entry = (message, entryId, agentId = "main") => ({ message, entryId, agentId });

test("activity history hides empty shells and retains tool summaries without raw payloads", async () => {
  const { dom, restore, output, paint } = await page();
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
    const collapsedThought = output.querySelector(".pure-thought details");
    assert.equal(collapsedThought.querySelector(".thinking-content").childElementCount, 0, "collapsed history thinking stays lazy");
    collapsedThought.open = true;
    collapsedThought.dispatchEvent(new dom.window.Event("toggle"));
    paint();
    assert.match(collapsedThought.querySelector(".thinking-content").textContent, /第一步/, "expanding a collapsed record renders its thinking");
    assert.match(output.textContent, /检查完成/);
    assert.match(output.textContent, /src\/main\.js/);
    assert.doesNotMatch(output.textContent, /PRIVATE_FILE_CONTENT/);
    const record = output.querySelector(".tool-record");
    record.open = true;
    record.dispatchEvent(new dom.window.Event("toggle"));
    assert.match(record.textContent, /PRIVATE_FILE_CONTENT/);
    const visible = [...output.querySelectorAll(".message")].filter((node) => !node.hidden);
    assert(visible.every((node) => node.classList.contains("user") || node.querySelector(":scope > .markdown")?.textContent || /thinking|read/.test(node.textContent)), "no model/usage-only assistant cards");
    assert.equal([...output.querySelectorAll(".message-model:not([hidden])")].filter((footer) => footer.textContent).length, 5, "every assistant step keeps its own identity and usage footer");
    assert.equal(output.querySelector(".message.user .message-model").textContent, "", "user messages never fabricate a model footer");
    assert.match([...output.querySelectorAll(".message-model")].pop().textContent, /test · model.*20↑10↓/, "the final answer carries provider, model and token counts");
  } finally { dom.window.close(); }
});

test("expanded tool sections keep truncation notices outside both diff views", async () => {
  const { dom, w, emit, output } = await page();
  try {
    const text = "- " + "x".repeat(60001);
    emit("tool.state", { phase: "end", toolCallId: "long", toolName: "edit", result: { details: { diff: text }, content: text } });
    const record = output.querySelector(".tool-record");
    record.open = true;
    record.dispatchEvent(new w.Event("toggle"));
    for (const view of ["split", "unified"]) {
      const select = record.querySelector("select");
      select.value = view;
      select.dispatchEvent(new w.Event("change"));
      assert(record.querySelector(`.diff-view-${view}`));
      assert.equal(record.querySelectorAll(".tool-detail > .tool-truncation").length, 2, "diff and output notices remain outside the switchable views");
      assert.equal(record.querySelector(".diff-comparison .tool-truncation"), null);
      assert.match(record.querySelector(".tool-truncation").textContent, /60,000/);
      assert.equal(record.querySelector(".tool-detail > pre").textContent.length, 60000);
    }
  } finally { dom.window.close(); }
});

test("live activity tracks thinking, tool completion, errors, cancellation and snapshot boundaries", async () => {
  const { dom, w, emit, restore, paint, output } = await page();
  const start = () => emit("agent.message.start", { message: assistant([]) });
  try {
    emit("session.state", { status: "running" });
    assert.equal(output.querySelector('[data-state="waiting"] .activity-label').textContent, "connecting...");
    start();
    emit("agent.delta", { type: "thinking_start" });
    assert.equal(output.querySelector('.message > [data-state="thinking"] .activity-label').textContent, "thinking...");
    assert.equal(output.querySelector('.message > [data-state="thinking"] .thinking-dots').textContent, "...");
    emit("agent.delta", { type: "thinking_delta", delta: "第一段" });
    paint();
    assert.equal(output.querySelector('.thinking-record [data-state="thinking"] .activity-label').textContent, "thinking...");
    assert.equal(output.querySelector('.message > .activity-line').hidden, true, "thinking has one disclosure row, not a second status line");
    assert(output.querySelector('.thinking-record .activity-icon svg'));
    assert.equal(output.querySelector('.thinking-record').open, true, "thinking auto-expands while the model is thinking");
    assert.match(output.querySelector('.thinking-content').textContent, /第一段/, "open thinking renders its streamed content");
    emit("agent.message.end", { message: assistant([thought("第一段")]), entryId: "one" });
    assert.equal(output.querySelector('.thinking-record .activity-label').textContent, "thinking");
    assert.equal(output.querySelector('.thinking-record .thinking-dots'), null);
    assert.equal(output.querySelector('.thinking-record').open, false, "thinking collapses when the message ends");
    start();
    emit("agent.delta", { type: "thinking_delta", delta: "第二段" });
    emit("agent.message.end", { message: assistant([thought("第二段")]), entryId: "two" });
    assert.equal(output.querySelectorAll(".merged-thought").length, 1);
    const details = output.querySelector(".pure-thought details");
    details.open = true;
    details.dispatchEvent(new w.Event("toggle"));
    paint();
    assert.deepEqual([...details.querySelectorAll(".thinking-content p")].map((p) => p.textContent), ["第一段", "第二段"]);
    emit("agent.compaction", { id: "compact", summary: "第一段摘要", compactedMessageIds: ["one"] });
    assert.equal(output.querySelectorAll(".merged-thought").length, 0, "compacting first member must not hide the retained thought");
    start();
    emit("agent.delta", { type: "toolcall_start" });
    assert.equal(output.querySelector('.message > [data-state="running"] .activity-label').textContent, "calling...");
    emit("agent.message.end", { message: assistant([call("tool")]) });
    emit("tool.state", { phase: "start", toolCallId: "tool", toolName: "read", args: { path: "<img src=x onerror=alert(1)>" } });
    assert.equal(output.querySelectorAll(".tool-activity").length, 1);
    assert.equal(output.querySelector(".tool-activity img"), null);
    emit("tool.state", { phase: "end", toolCallId: "tool", toolName: "read", isError: true });
    assert.match(output.querySelector('.tool-activity[data-state="failed"]').textContent, /FAILED/);
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
    assert.equal(record.querySelector(".activity-icon").dataset.icon, "edit", "completion preserves tool identity instead of replacing it with a check");
    assert.equal(record.querySelector(".activity-label").textContent, "edit");
    assert.equal(record.querySelector(".tool-target").textContent, "app.js");
    assert.equal(record.querySelector(".tool-activity").dataset.state, "done", "completed tools settle into the done state");
    assert.equal(record.querySelector(".tool-status").textContent, "", "completed tools show no status text");
    const selector = record.querySelector('select[aria-label="代码对比展示方式"]');
    selector.value = "split";
    selector.dispatchEvent(new w.Event("change"));
    assert.equal(w.localStorage.getItem("axiom.diffView"), "split");
    assert(record.querySelector(".diff-view-split"));
    const cells = record.querySelectorAll(".diff-split pre");
    assert.match(cells[2].textContent, /old/);
    assert.match(cells[3].textContent, /new/);
    restore({ messages: [entry(assistant([thought("## 思考标题\n\n**重点**和*说明* <script>bad()</script>\n\n```js\nconst safe = true;\n``` ")]), "markdown-thought")] });
    const thinking = output.querySelector(".thinking-record");
    thinking.open = true;
    thinking.dispatchEvent(new w.Event("toggle"));
    paint();
    assert.equal(thinking.querySelector("h2").textContent, "思考标题");
    assert.equal(thinking.querySelector("strong").textContent, "重点");
    assert.equal(thinking.querySelector("em").textContent, "说明");
    assert(thinking.querySelector(".code-toolbar button"));
    assert.equal(thinking.querySelector("script"), null);
    emit("tool.state", { phase: "start", toolCallId: "path", toolName: "read", args: { path: "C:/work/src/very-long-file.js" } });
    const target = output.querySelector(".tool-target");
    assert.equal(target.textContent, "src/very-long-file.js");
    assert.equal(target.title, "C:/work/src/very-long-file.js");
    emit("session.state", { status: "cancelling" });
    assert.equal(output.querySelector(".tool-target"), target, "stopping preserves the operation and path");
    assert.equal(output.querySelector(".tool-status").textContent, "正在停止…");
    emit("tool.state", { phase: "start", toolCallId: "custom", toolName: "constructor", args: { queries: "not-an-array" } });
    assert.equal(output.querySelectorAll(".tool-activity .activity-label")[1].textContent, "constructor", "unknown names cannot resolve Object.prototype properties");
    for (const [name, label, icon] of [["functions.edit", "edit", "edit"], ["bash", "bash", "bash"], ["powershell", "powershell", "bash"], ["pwsh", "pwsh", "bash"], ["custom.tool", "custom.tool", "tool"]]) {
      emit("tool.state", { phase: "start", toolCallId: name, toolName: name, args: { command: "Get-Date" } });
      const row = output.querySelector(".tool-record:last-child .tool-activity");
      assert.equal(row.querySelector(".activity-label").textContent, label);
      assert.equal(row.querySelector(".activity-label").title, name);
      assert.equal(row.dataset.toolIcon, icon);
    }
  } finally { dom.window.close(); }
});
