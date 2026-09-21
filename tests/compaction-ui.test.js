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

test("手动压缩必须确认，携带所选模式，切会话后拒绝旧确认", async () => {
  const { dom, w, restore } = await page();
  try {
    const calls = [];
    w.request = async (type, data) => { calls.push({ type, data }); return { status: "summarizing" }; };
    const $ = id => w.document.getElementById(id);
    $("compact-session").click();
    assert.equal($("manual-compaction").open, true);
    assert.equal(calls.length, 0);
    $("manual-compaction-mode").dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const menu = $("manual-compaction").querySelector('[role="menu"]');
    assert.ok(menu, "manual mode uses the shared custom picker");
    assert.equal(menu.querySelectorAll(".ax-mp-star").length, 0, "modes cannot be favorited");
    menu.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    $("manual-compaction-mode").value = "sync";
    $("manual-compaction-mode").dispatchEvent(new w.Event("change"));
    assert.match($("manual-compaction-hint").textContent, /安全停止/);
    await $("manual-compaction-form").onsubmit({ preventDefault() {} });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, "session.compaction.start");
    assert.equal(calls[0].data.mode, "sync");
    $("compact-session").click();
    restore({ sessionId: "other" });
    await $("manual-compaction-form").onsubmit({ preventDefault() {} });
    assert.equal(calls.length, 1);
    assert.match($("manual-compaction-error").textContent, /会话已切换/);
  } finally { dom.window.close(); }
});

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
    // 摘要 markdown 懒渲染：折叠态是空的，展开（toggle 异步派发）后才落内容。
    assert.equal(cards[1].querySelector(".compaction-summary").textContent, "");
    cards[1].open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
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

test("压缩摘要卡懒加载原文：展开才取、只取一次、原文对照按时间序插回", async () => {
  const { dom, w, restore, paint, output } = await page();
  try {
    w.HTMLElement.prototype.scrollIntoView = function () {};
    const compactions = [{ id: "c1", summary: "摘要", compactedMessageIds: ["u1", "r1"], firstKeptEntryId: "keep" }];
    // 服务端已把折叠段滤掉：页上只有摘要卡与其后保留的消息。
    restore({
      messages: [
        { agentId: "main", entryId: "keep", message: { role: "assistant", content: "保留的回答" } },
        { agentId: "child", entryId: "s2", message: { role: "assistant", content: "子代理后续输出" } },
      ],
      messageIndexes: [3, 4], messageCount: 5,
      tasks: [{ id: "child", task: "子任务", status: "completed" }],
      compactions,
    });
    paint();
    w.eval('window.sent = []; request = (type, data) => { window.sent.push({ type, ...data }); return new Promise((resolve, reject) => { window.finishSegment = resolve; window.failSegment = reject; }); };');
    const card = output.querySelector(":scope > .compaction-card");
    assert.equal(w.sent.length, 0, "折叠态不取原文");
    card.open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(w.sent.length, 1);
    assert.deepEqual({ ...w.sent[0] }, { type: "session.compaction.messages", sessionId: "activity", compactionId: "c1" });
    w.finishSegment({
      sessionId: "activity", compactionId: "c1",
      messages: [
        { agentId: "main", entryId: "u1", message: { role: "user", content: "折叠的提问" } },
        { agentId: "main", entryId: "r1", message: { role: "toolResult", toolName: "delegate", toolCallId: "d1", content: [{ type: "text", text: '{"taskIds":["child"]}' }] } },
        { agentId: "child", entryId: "s1", message: { role: "assistant", content: "子代理早期输出" } },
      ],
      tools: {}, retries: [{ id: "retry-1", agentId: "main", anchorEntryId: "u1", status: "succeeded", attempt: 1, history: [{ attempt: 1, delayMs: 2000, error: "429" }] }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    paint(); paint(); paint();
    // 主消息不重绘：摘要卡就是它们的形态，页上仍只有一张摘要卡与保留的回答。
    assert.equal(output.querySelectorAll(":scope > .compaction-card").length, 1);
    assert.equal([...output.querySelectorAll(":scope > .message")].length, 1);
    // 原文对照按时间序插回：折叠段在 firstKeptEntryId 之前。
    assert.deepEqual([...w.rawEntryIds()], ["u1", "r1", "s1", "keep", "s2"]);
    // 子代理早期输出补进任务弹窗，且排在已有的后续输出之前（弹窗关着时正文不渲染，先打开）。
    card.querySelector(".compaction-tasks .task-card").click();
    paint(); paint();
    const outputs = [...w.document.querySelectorAll("#task-child .message")].map((node) => node.textContent);
    assert.equal(outputs.length, 2);
    assert.match(outputs[0], /子代理早期输出/);
    assert.match(outputs[1], /子代理后续输出/);
    // 重试卡按锚点归位到摘要卡内，不落历史归档。
    assert.equal(card.querySelectorAll(".compaction-tasks .retry-card").length, 1);
    assert.equal(output.querySelector(".retry-archive"), null);
    // 重复开合不再取第二次。
    card.open = false;
    card.open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(w.sent.length, 1);
  } finally { dom.window.close(); }
});

test("压缩段原文取回失败：提示可重试，重新展开再取一次", async () => {
  const { dom, w, restore, output } = await page();
  try {
    w.HTMLElement.prototype.scrollIntoView = function () {};
    restore({ messages: [], compactions: [{ id: "c1", summary: "摘要", compactedMessageIds: ["u1"] }] });
    w.eval('window.sent = []; request = (type, data) => { window.sent.push({ type, ...data }); return new Promise((resolve, reject) => { window.finishSegment = resolve; window.failSegment = reject; }); };');
    const card = output.querySelector(":scope > .compaction-card");
    card.open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    w.failSegment(new Error("历史文件缺失"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(w.document.getElementById("error").textContent, /历史文件缺失/);
    card.open = false;
    card.open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(w.sent.length, 2, "失败不缓存：重新展开可重试");
  } finally { dom.window.close(); }
});

test("换会话后迟到的压缩段原文被丢弃，不污染新会话", async () => {
  const { dom, w, restore, output } = await page();
  try {
    w.HTMLElement.prototype.scrollIntoView = function () {};
    restore({ messages: [], compactions: [{ id: "c1", summary: "摘要", compactedMessageIds: ["u1"] }] });
    w.eval('window.sent = []; request = (type, data) => { window.sent.push({ type, ...data }); return new Promise((resolve) => { window.finishSegment = resolve; }); };');
    output.querySelector(":scope > .compaction-card").open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    restore({ sessionId: "other", messages: [], compactions: [] });
    w.finishSegment({ sessionId: "activity", compactionId: "c1", messages: [{ agentId: "main", entryId: "u1", message: { role: "user", content: "过期原文" } }], tools: {}, retries: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.doesNotMatch(output.textContent, /过期原文/);
    assert.deepEqual([...w.rawEntryIds()], []);
  } finally { dom.window.close(); }
});

// 后台压缩可视化：条幅可点进详情，详情里能看到内部流程并取消当次摘要。
test("压缩条幅点击进详情：步骤流、流式尾部、取消按钮与历史切换", async () => {
  const { dom, w } = await page();
  try {
    const $ = (id) => w.document.getElementById(id);
    const progress = $("compaction-progress");
    const dialog = $("compaction-run");
    const run = (over = {}) => ({
      id: "run-1", status: "summarizing", startedAt: Date.UTC(2026, 0, 1, 3, 4, 5), endedAt: null,
      model: "fake/model", thinking: "off",
      trigger: { tokens: 120000, contextWindow: 200000, tokenThreshold: 100000, percentThreshold: 50, keepRecentTokens: 5000, estimated: false },
      steps: [{ step: "trigger", text: "触发后台压缩 · 上下文 120,000 tokens", at: Date.UTC(2026, 0, 1, 3, 4, 5) }, { step: "session", text: "摘要会话就绪 · fake/model", at: Date.UTC(2026, 0, 1, 3, 4, 6) }],
      stream: { chars: 6, preview: "正在写摘要", thinkingChars: 0 },
      usage: { input: 10, output: 4 }, error: null, result: null, ...over,
    });

    // 旧服务端（没有 runs）：条幅只展示，不做成按钮，避免点进去是空的
    w.event({ sessionId: "activity", type: "agent.compaction.status", agentId: "main", data: { status: "summarizing" } });
    assert.equal(progress.querySelector("button"), null);

    w.event({ sessionId: "activity", type: "agent.compaction.status", agentId: "main", data: { status: "summarizing", runId: "run-1", runs: [run()] } });
    const open = progress.querySelector("button.compaction-progress-open");
    assert.ok(open, "有 run 详情时整行变成可点按钮");
    assert.match(open.getAttribute("aria-label"), /点击查看过程/);
    assert.equal(open.getAttribute("aria-controls"), "compaction-run");
    assert.ok(progress.querySelector(".task-run-spin"), "在途仍有转圈");

    open.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    assert.equal(dialog.open, true);
    assert.match($("compaction-run-title").textContent, /生成中/);
    assert.match($("compaction-run-meta").textContent, /fake\/model/);
    assert.match($("compaction-run-trigger").textContent, /120,000 \/ 200,000 tokens/);
    assert.match($("compaction-run-trigger").textContent, /100,000 tokens 或 50%/);
    assert.equal($("compaction-run-steps").querySelectorAll("li").length, 2);
    assert.match($("compaction-run-steps").textContent, /摘要会话就绪/);
    assert.equal($("compaction-run-stream-wrap").hidden, false);
    assert.equal($("compaction-run-stream").textContent, "正在写摘要");
    assert.equal($("compaction-run-error").hidden, true);
    // 在途可取消
    assert.equal($("compaction-run-cancel").hidden, false);
    assert.equal($("compaction-run-cancel").disabled, false);
    assert.equal($("compaction-run-pick-label").hidden, true, "只有一条记录时不显示历史选择");

    // 取消：发 session.compaction.cancel，带上当前 runId
    const calls = [];
    w.eval("request = (type, args) => { window.__calls.push({ type, args }); return Promise.resolve({ cancelled: true }); }");
    w.__calls = calls;
    $("compaction-run-cancel").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(JSON.stringify(calls), JSON.stringify([{ type: "session.compaction.cancel", args: { sessionId: "activity", runId: "run-1" } }]));

    // 服务端回「没赶上」时用返回的状态对齐，不留下假的可取消按钮
    calls.length = 0;
    w.eval("request = (type, args) => { window.__calls.push({ type, args }); return Promise.resolve({ cancelled: false, status: { status: 'applied', runId: null, runs: [window.__applied] } }); }");
    w.__applied = run({ status: "applied", endedAt: Date.UTC(2026, 0, 1, 3, 4, 9), result: { compactionId: "c1", tokensBefore: 120000, estimatedTokensAfter: 40000, summaryChars: 900, facts: 3 } });
    $("compaction-run-cancel").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal($("compaction-run-cancel").hidden, true, "终态没有取消按钮");
    assert.match($("compaction-run-trigger").textContent, /120,000 → 40,000 tokens/);
    assert.match($("compaction-run-title").textContent, /已应用/);

    // 失败的 run：错误可见；多条记录可切换回看
    w.event({ sessionId: "activity", type: "agent.compaction.status", agentId: "main", data: {
      status: "summarizing", runId: "run-2",
      runs: [run({ id: "run-1", status: "failed", endedAt: Date.UTC(2026, 0, 1, 3, 4, 9), error: "boom" }), run({ id: "run-2" })],
    } });
    assert.equal(dialog.open, true, "事件刷新不关掉已打开的详情");
    assert.equal($("compaction-run-pick-label").hidden, false);
    const pick = $("compaction-run-pick");
    assert.deepEqual([...pick.options].map((o) => o.value), ["run-1", "run-2"]);
    assert.equal(pick.value, "run-2", "默认跟当前在途那一条");
    pick.value = "run-1";
    pick.dispatchEvent(new w.Event("change"));
    assert.equal($("compaction-run-error").hidden, false);
    assert.equal($("compaction-run-error").textContent, "boom");
    assert.equal($("compaction-run-cancel").hidden, true, "历史记录不能取消");

    // 快照没有压缩状态（切会话/新会话）：条幅收起、详情关闭
    w.snapshot({ sessionId: "activity", title: "Activity", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} });
    assert.equal(progress.hidden, true);
    assert.equal(dialog.open, false);
  } finally { dom.window.close(); }
});
