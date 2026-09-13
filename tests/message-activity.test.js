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
  const memoryTags = (await readFile(new URL("../public/memory-tags.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const source = memoryTags + "\n" + (await readFile(new URL("../public/service-settings.js", import.meta.url), "utf8")).replace(/^export /gm, "") + "\n" + (await readFile(new URL("../public/app.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
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
  w.WebSocket = class { static OPEN = 1; readyState = 1; send() {} };
  for (const name of ["model-picker", "model-manager"]) {
    const module = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    const exports = [...module.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    w.eval(`Object.assign(window, (() => { ${module.replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`);
  }
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

test("retry cards preserve timeline positions and never absorb message content", async () => {
  const { dom, emit, restore, paint, output } = await page();
  try {
    const failed = assistant([thought("思考内容"), call("retry-tool")], { stopReason: "error", errorMessage: "network error" });
    const answer = assistant([{ type: "text", text: "恢复后的回答" }]);
    const retry = { id: "r1", agentId: "main", status: "waiting", attempt: 1, maxRetries: 45, delayMs: 2000, nextRetryAt: Date.now() + 2000, error: "network error" };
    emit("agent.message.start", { message: failed });
    emit("agent.message.end", { message: failed, entryId: "failure" });
    emit("agent.retry", retry);
    paint();
    assert.equal(output.querySelector(".retry-card .message"), null);
    assert.equal(output.querySelector(".retry-card .tool-record"), null);
    assert(output.querySelector(".tool-record"));
    emit("agent.message.start", { message: answer });
    emit("agent.message.end", { message: answer, entryId: "answer" });
    emit("agent.retry", { ...retry, status: "succeeded" });
    paint();
    const order = () => [...output.children].filter(n => !n.hidden).map(n => n.className);
    const liveOrder = order();
    assert.equal(output.lastElementChild.querySelector(":scope > .markdown").textContent.trim(), "恢复后的回答");
    for (let reload = 0; reload < 3; reload++) {
      restore({ messages: [entry(failed, "failure"), entry(answer, "answer")], retries: [{ ...retry, status: "succeeded", messageCount: 1, history: [retry] }] });
      paint();
      paint();
      assert.deepEqual(order(), liveOrder, "repeated refresh and grouping preserve the retry boundary");
    }
    assert.equal(output.querySelector(".retry-card .message"), null);
    assert.equal(output.querySelector(".retry-card").open, false);
    restore({ messages: [entry(answer, "answer")], retries: [{ ...retry, status: "succeeded" }] });
    paint();
    assert(output.firstElementChild.classList.contains("retry-archive"), "unknown history is explicitly archived, not appended after the answer");
    assert(output.firstElementChild.querySelector(".retry-card"));
    assert.equal(output.lastElementChild.querySelector(":scope > .markdown").textContent.trim(), "恢复后的回答");
  } finally { dom.window.close(); }
});

test("retry cards follow their compacted boundary across live updates and repeated snapshots", async () => {
  const { dom, emit, restore, paint, output } = await page();
  try {
    const failed = assistant([{ type: "text", text: "失败之前" }], { stopReason: "error" });
    const answer = assistant([{ type: "text", text: "最终回答" }]);
    const retry = { id: "compact-retry", status: "waiting", attempt: 1, messageCount: 1,
      anchorEntryId: "failure", delayMs: 2000, nextRetryAt: 3000 };
    const compaction = { id: "compact", summary: "历史摘要", compactedMessageIds: ["failure"] };
    emit("agent.message.end", { message: failed, entryId: "failure" });
    emit("agent.retry", retry);
    emit("agent.message.end", { message: answer, entryId: "answer" });
    emit("agent.compaction", compaction);
    emit("agent.retry", { ...retry, status: "succeeded" });
    const check = () => {
      paint(); paint();
      assert.equal(output.querySelectorAll(":scope > .retry-card").length, 0);
      assert.equal(output.querySelectorAll(".compaction-card .retry-card").length, 1);
      assert.match(output.querySelector(".compaction-card .retry-card").textContent, /重试成功/);
      assert.equal(output.lastElementChild.querySelector(":scope > .markdown").textContent.trim(), "最终回答");
    };
    check();
    for (let i = 0; i < 3; i++) {
      restore({ messages: [entry(failed, "failure"), entry(answer, "answer")], compactions: [compaction],
        retries: [{ ...retry, status: "succeeded" }] });
      check();
    }
  } finally { dom.window.close(); }
});

test("attaching during retry keeps the same card through running and success", async () => {
  const { dom, emit, restore, paint, output } = await page();
  try {
    const retry = { id: "waiting", agentId: "main", status: "waiting", attempt: 1,
      messageCount: 0, delayMs: 2000, nextRetryAt: 3000 };
    restore({ status: "running", retries: [{ ...retry, history: [retry] }] });
    const card = output.querySelector(".retry-card");
    assert.equal(card.open, true);
    assert.match(card.textContent, /预计/);
    assert.match(card.textContent, /1\/45/);
    emit("agent.retry", { ...retry, status: "running" });
    const message = assistant([{ type: "text", text: "恢复回答" }]);
    emit("agent.message.end", { message, entryId: "answer" });
    emit("agent.retry", { ...retry, status: "succeeded" });
    paint(); paint();
    assert.equal(output.querySelector(".retry-card"), card);
    assert.equal(output.querySelectorAll(".retry-card").length, 1);
    assert.equal(card.open, false);
    assert.equal(card.querySelectorAll("li").length, 1);
    assert.equal(output.lastElementChild.querySelector(":scope > .markdown").textContent.trim(), "恢复回答");
  } finally { dom.window.close(); }
});

test("multiple retry episodes retain their first boundary through status updates and replay", async () => {
  const { dom, emit, restore, paint, output } = await page();
  try {
    const messages = [], retries = [];
    for (let i = 0; i < 2; i++) {
      const message = assistant([{ type: "text", text: `阶段${i}` }]);
      messages.push(entry(message, `m${i}`));
      emit("agent.message.end", { message, entryId: `m${i}` });
      const retry = { id: `retry${i}`, agentId: "main", status: "waiting", attempt: 1,
        messageCount: messages.length, delayMs: 2000, nextRetryAt: 3000 };
      emit("agent.retry", retry);
      retries.push({ ...retry, status: "succeeded", history: [retry] });
    }
    const message = assistant([{ type: "text", text: "结束" }]);
    messages.push(entry(message, "end"));
    emit("agent.message.end", { message, entryId: "end" });
    for (const retry of [...retries].reverse()) emit("agent.retry", retry);
    paint(); paint();
    const order = () => [...output.children].filter(n => !n.hidden).map(n => n.classList.contains("retry-card")
      ? n.querySelector("summary").textContent : n.querySelector(":scope > .markdown")?.textContent);
    const live = order();
    restore({ messages, retries }); paint(); paint();
    assert.deepEqual(order(), live);
    assert.equal(output.querySelectorAll(".retry-card").length, 2);
  } finally { dom.window.close(); }
});

test("main and child retries stay isolated, including missing task metadata", async () => {
  const { dom, w, emit, restore, paint, output } = await page();
  try {
    const retry = { id: "same", status: "succeeded", attempt: 1, messageCount: 1 };
    const child = { id: "child", task: "子任务", status: "completed" };
    const messages = [entry(assistant([{ type: "text", text: "主回答" }]), "main"),
      entry(assistant([{ type: "text", text: "子回答" }]), "child-answer", "child")];
    const retries = [{ ...retry, agentId: "main" }, { ...retry, agentId: "child" }];
    w.event({ sessionId: "activity", type: "task.state", taskId: "child", data: child });
    emit("agent.message.end", { message: messages[1].message }, "child");
    emit("agent.retry", retry, "child");
    assert(w.document.querySelector("#task-child .task-description + .task-retries > .retry-card"));
    for (let i = 0; i < 2; i++) {
      restore({ messages, retries, tasks: [child] }); paint(); paint();
      assert.equal(output.querySelectorAll(".retry-card").length, 1);
      const body = w.document.querySelector("#task-child .task-body");
      assert.equal(body.querySelector(".task-description").nextElementSibling.className, "task-retries");
      assert(body.querySelector(".task-retries > .retry-card"));
      assert.equal(body.querySelector(".retry-archive"), null);
      emit("agent.retry", { ...retry, status: "cancelled" }, "child");
      assert.match(body.textContent, /重试已停止/);
      assert.match(output.querySelector(".retry-card").textContent, /重试成功/);
    }
    restore({ messages: [messages[0]], retries: [retries[1]] });
    assert(output.querySelector(".retry-archive .retry-card"));
    w.event({ sessionId: "activity", type: "task.state", taskId: "child", data: child });
    assert.equal(output.querySelector(".retry-card"), null);
    assert(w.document.querySelector("#task-child .task-retries > .retry-card"));
    assert.equal(w.document.querySelector(".retry-archive"), null);
    // 重启后只剩主历史，子任务计数越界/缺失也必须按任务 ID 原位恢复。
    for (const messageCount of [99, undefined]) {
      restore({ messages: [messages[0]], tasks: [child, { ...child, id: "other" }],
        retries: ["child", "other"].flatMap(agentId => ["first", "second"].map(id =>
          ({ ...retry, id, agentId, messageCount }))) });
      paint(); paint();
      for (const id of ["child", "other"]) {
        const body = w.document.querySelector(`#task-${id} .task-body`);
        assert.equal(body.querySelector(".task-description").nextElementSibling.className, "task-retries");
        assert.equal(body.querySelectorAll(".task-retries > .retry-card").length, 2);
      }
      assert.equal(output.querySelector(".retry-card"), null);
      assert.equal(w.document.querySelector(".retry-archive"), null);
    }
  } finally { dom.window.close(); }
});

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

test("task-separated completed groups stop Working while the latest segment and pending tools remain active", async () => {
  const { dom, w, emit, restore, paint, output } = await page();
  const labels = () => [...output.querySelectorAll(':scope > .call-group:not([hidden]) > summary .activity-label')].map(node => node.textContent);
  const delegated = assistant([call('delegate', 'delegate', { tasks: [{ task: 'work' }] })]);
  const result = { role: 'toolResult', toolCallId: 'delegate', toolName: 'delegate', content: [{ type: 'text', text: '{"taskIds":["child"]}' }] };
  const task = { id: 'child', task: 'work', status: 'running' };
  try {
    emit('session.state', { status: 'running' });
    emit('agent.message.end', { message: delegated, entryId: 'delegated' });
    w.event({ sessionId: 'activity', type: 'task.state', taskId: task.id, data: task });
    emit('agent.message.end', { message: result, entryId: 'result' });
    emit('tool.state', { phase: 'end', toolCallId: 'delegate', toolName: 'delegate', result });
    emit('agent.message.end', { message: assistant([call('read')]), entryId: 'read' });
    paint(); paint();
    assert.deepEqual(labels(), ['Completed', 'Working']);
    const previous = output.querySelector('.call-group');
    assert.equal(previous.open, true, 'status does not force disclosure closed');
    emit('tool.state', { phase: 'start', toolCallId: 'delegate', toolName: 'delegate' });
    paint();
    assert.deepEqual(labels(), ['Working', 'Working'], 'a genuinely pending earlier tool stays active');
    emit('tool.state', { phase: 'end', toolCallId: 'delegate', toolName: 'delegate', result });
    emit('tool.state', { phase: 'end', toolCallId: 'read', toolName: 'read', result: { content: 'ok' } });
    paint();
    assert.deepEqual(labels(), ['Completed', 'Working'], 'latest tool gap still belongs to the active turn');
    emit('session.state', { status: 'idle' });
    paint();
    assert.deepEqual(labels(), ['Completed', 'Completed']);
    assert.equal(output.querySelector('.task-card').dataset.status, 'running', 'child state is independent');
    restore({ status: 'running', tasks: [task], messages: [entry(delegated, 'delegated'), entry(result, 'result'), entry(assistant([call('read')]), 'read')], tools: { read: { agentId: 'main', phase: 'start', toolCallId: 'read', toolName: 'read' } } });
    paint(); paint();
    assert.deepEqual(labels(), ['Working'], 'snapshot merges adjacent calls and keeps only the latest wait');
    emit('session.state', { status: 'idle' });
    paint();
    assert.deepEqual(labels(), ['Stopped'], 'unfinished snapshot tools stop without fabricating success');
  } finally { dom.window.close(); }
});

test("activity groups stop after interruption and idle restore without a final answer", async () => {
  const { dom, emit, restore, paint, output } = await page();
  const label = () => output.querySelector('.call-preview .activity-label')?.textContent;
  try {
    emit('session.state', { status: 'running' });
    emit('tool.state', { phase: 'start', toolCallId: 'watch', toolName: 'bash', args: { command: 'gh run watch' } });
    paint();
    assert.equal(label(), 'Working');
    emit('tool.state', { phase: 'end', toolCallId: 'watch', toolName: 'bash', isError: true });
    paint();
    assert.equal(label(), 'Working', 'a tool gap must not end the active turn');
    emit('session.state', { status: 'idle' });
    paint();
    assert.equal(label(), 'Stopped');
    assert.equal(output.querySelector('.call-group').open, true, 'terminal status does not override disclosure choice');
    restore({ messages: [entry(assistant([call('watch')]), 'call'), entry({ role: 'toolResult', toolCallId: 'watch', toolName: 'read', content: 'aborted', isError: true }, 'result')] });
    paint();
    assert.equal(label(), 'Stopped', 'idle snapshot cannot resurrect Working');
    assert.equal(output.querySelector('.call-group').dataset.active, 'false');
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
