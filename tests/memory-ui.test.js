import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { extractMemoryTags, stripMemoryTags } from "../public/memory-tags.js";

test("extractMemoryTags 取自报内容：同类多段取最后一段，无标签返回空串", () => {
  const tags = extractMemoryTags("<title>摘要机制</title><summary>第一版</summary>正文<summary>最终版</summary><progress>进行中</progress>");
  assert.equal(tags.title, "摘要机制");
  assert.equal(tags.summary, "最终版");
  assert.equal(tags.progress, "进行中");
  assert.deepEqual(extractMemoryTags("没有任何标签的普通回复"), {});
});

test("stripMemoryTags 移除成对标签，其余文本与普通标签原样保留", () => {
  assert.equal(stripMemoryTags("<summary>内部摘要</summary>可见正文"), "可见正文");
  assert.equal(stripMemoryTags("结果<b>加粗</b><title>你好</title>尾部"), "结果<b>加粗</b>尾部");
  assert.equal(stripMemoryTags("a < b 且 x<y 正常保留"), "a < b 且 x<y 正常保留");
});

test("stripMemoryTags 流式隐藏残缺标签，闭合后恢复正文", () => {
  assert.equal(stripMemoryTags("正在 <sum", { streaming: true }), "正在 ");
  assert.equal(stripMemoryTags("正在 <summary>进度中", { streaming: true }), "正在 ");
  assert.equal(stripMemoryTags("正在 </t", { streaming: true }), "正在 ");
  assert.equal(stripMemoryTags("比较 <b 与 <br", { streaming: true }), "比较 <b 与 <br");
  assert.equal(stripMemoryTags("<summary>旧</summary> Hello <summary>新", { streaming: true }), " Hello ");
  assert.equal(stripMemoryTags("正在 <summary>进度中</summary> 完成", { streaming: true }), "正在  完成");
});

// Run the real page's snapshot/event handlers without a model or server.
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const memoryTags = (await readFile(new URL("../public/memory-tags.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const source = memoryTags + "\n" + (await readFile(new URL("../public/service-settings.js", import.meta.url), "utf8")).replace(/^export /gm, "") + "\n" + (await readFile(new URL("../public/app.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
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
  for (const name of ["model-picker", "model-manager"]) {
    const module = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    const exports = [...module.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    w.eval(`Object.assign(window, (() => { ${module.replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`);
  }
  w.eval(`${contrast}\n${picker}\n${source}\nconnected = true;`);
  const state = { sessionId: "memory", title: "Memory", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...state, ...changes });
  const emit = (type, data, agentId = "main") => w.event({ sessionId: state.sessionId, type, data, agentId });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  restore();
  return { dom, w, emit, restore, paint, output: w.document.getElementById("output") };
}

const record = (id, text, extra = {}) => ({ id, agentId: "main", turn: 1, text, timestamp: Date.UTC(2026, 8, 12, 8, 0, 0), source: "model", ...extra });

test("摘要记录对话框：只列主代理记录、新到旧排序、时间与轮次纯文本", async () => {
  const { dom, w, restore } = await page();
  try {
    const dialog = w.document.getElementById("summaries");
    restore({ summaries: [
      record("s1", "第一条"),
      record("c1", "子代理记录", { agentId: "child", turn: 3 }),
      record("s2", "第二条", { turn: 4 }),
    ] });
    w.document.getElementById("open-summaries").click();
    assert.equal(dialog.open, true);
    const rows = [...dialog.querySelectorAll(".summary-record")];
    assert.equal(rows.length, 2, "subagent records stay out of the main list");
    assert.match(rows[0].textContent, /第二条/);
    assert.match(rows[0].querySelector(".summary-turn").textContent, /第 4 轮/);
    assert.match(rows[1].textContent, /第一条/);
    assert.match(rows[1].querySelector(".summary-turn").textContent, /第 1 轮/);
    assert.ok(rows[0].querySelector("time").textContent.length > 0);
    assert.equal(dialog.querySelector(".summary-text").childElementCount, 0, "text renders as plain text");
    assert.equal(w.document.getElementById("summaries-empty").hidden, true);
    dialog.close();
    assert.equal(dialog.open, false);
    // 空态
    restore({ summaries: [] });
    w.document.getElementById("open-summaries").click();
    assert.equal(dialog.querySelectorAll(".summary-record").length, 0);
    assert.equal(w.document.getElementById("summaries-empty").hidden, false);
  } finally { dom.window.close(); }
});

test("session.summary 按 id 覆盖（迟到 entryId 不产生重复），session.title 更新标题", async () => {
  const { dom, w, emit, restore } = await page();
  try {
    const dialog = w.document.getElementById("summaries");
    restore({ summaries: [record("s1", "第一条")] });
    w.document.getElementById("open-summaries").click();
    emit("session.summary", { ...record("s1", "第一条"), entryId: "e9", toolResults: [{ toolCallId: "t1", toolName: "read", isError: true }] });
    assert.equal(dialog.querySelectorAll(".summary-record").length, 1, "same id updates in place");
    emit("session.summary", record("s2", "第二条", { turn: 2 }));
    assert.equal(dialog.querySelectorAll(".summary-record").length, 2);
    assert.match(dialog.querySelector(".summary-record").textContent, /第二条/, "newest first after live update");
    emit("session.summary", record("c2", "子代理进度", { agentId: "child" }));
    assert.equal(dialog.querySelectorAll(".summary-record").length, 2, "subagent records are kept but not listed");
    dialog.close();
    emit("session.summary", record("s3", "关闭后到达"));
    w.document.getElementById("open-summaries").click();
    assert.equal(dialog.querySelectorAll(".summary-record").length, 3, "records arrive while closed are shown on reopen");
    assert.equal(w.document.getElementById("session-title").textContent, "Memory");
    emit("session.title", { title: "新标题" });
    assert.equal(w.document.getElementById("session-title").textContent, "新标题");
    assert.match(w.document.title, /^新标题 · /);
  } finally { dom.window.close(); }
});

test("撤回后快照重放会同步摘要列表（含打开中的对话框）", async () => {
  const { dom, w, restore } = await page();
  try {
    const dialog = w.document.getElementById("summaries");
    restore({ summaries: [record("s1", "保留"), record("s2", "被撤回摘要")] });
    w.document.getElementById("open-summaries").click();
    assert.equal(dialog.querySelectorAll(".summary-record").length, 2);
    // 撤回清理后服务端返回的新快照
    restore({ summaries: [record("s1", "保留")] });
    assert.equal(dialog.open, true);
    assert.equal(dialog.querySelectorAll(".summary-record").length, 1);
    assert.match(dialog.querySelector(".summary-record").textContent, /保留/);
  } finally { dom.window.close(); }
});

test("助手文本流式与成稿都剥离记忆标签，用户手写标签不受影响", async () => {
  const { dom, w, emit, paint, output } = await page();
  try {
    emit("agent.message.start", { message: { role: "assistant" } });
    emit("agent.delta", { type: "text_delta", delta: "正在<sum" });
    paint();
    const assistant = output.querySelector(".message:not(.user) .markdown:not(.thinking-content)");
    assert.equal(assistant.textContent.trim(), "正在", "partial tag stays hidden while streaming");
    emit("agent.delta", { type: "text_delta", delta: "mary>内部进度</summary> 完成" });
    paint();
    assert.equal(assistant.textContent.trim(), "正在 完成");
    emit("agent.message.end", { message: { role: "assistant", content: [{ type: "text", text: "<summary>全程</summary>最终回复" }] } });
    assert.equal(output.querySelector(".message:not(.user) .markdown:not(.thinking-content)").textContent.trim(), "最终回复");
    emit("agent.message.end", { message: { role: "user", content: "<summary>手写标签</summary>用户问题" } });
    const user = output.querySelector(".message.user .markdown:not(.thinking-content)");
    assert.ok(user.querySelector("summary"), "user-written tag survives as typed");
    assert.equal(user.querySelector("summary").textContent, "手写标签");
    assert.match(user.textContent, /用户问题/);
  } finally { dom.window.close(); }
});

test("摘要设置：memory.summary.get 填充面板，change 即存并回显服务端确认值", async () => {
  const { dom, w } = await page();
  try {
    w.eval(`window.__rpc = []; request = async (type, data = {}) => {
      window.__rpc.push([type, data]);
      return type === "memory.summary.get" ? { mainTurns: 5, subagentTurns: 7, maxChars: 40 } : data.summary;
    };`);
    await w.loadMemorySummary();
    const value = (id) => w.document.getElementById(id).value;
    assert.equal(value("memory-main-turns"), "5");
    assert.equal(value("memory-subagent-turns"), "7");
    assert.equal(value("memory-max-chars"), "40");
    value("memory-max-chars") && (w.document.getElementById("memory-max-chars").value = "25");
    w.document.getElementById("memory-max-chars").dispatchEvent(new w.Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const configure = w.__rpc.find(([type]) => type === "memory.summary.configure");
    assert.deepEqual(JSON.parse(JSON.stringify(configure[1])), { summary: { mainTurns: 5, subagentTurns: 7, maxChars: 25 } });
    assert.equal(value("memory-max-chars"), "25");
    assert.match(w.document.getElementById("settings-feedback").textContent, /已保存/);
    // 打开设置时拉取一次当前值
    assert.ok(w.__rpc.some(([type]) => type === "memory.summary.get"));
  } finally { dom.window.close(); }
});
