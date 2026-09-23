import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// 复用 message-activity 的页面 harness（真实 app.js，无模型无服务器）；
// 额外暴露 toolItems/mainItems 用于断言关闭详情不会删记录或锚点。
async function page() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  // 与 tests/app.test.js、compaction-ui 同一套加载顺序：markdown-scan 是 memory-tags 的依赖。
  const source = await publicSource("markdown-scan", "memory-tags", "question", "service-settings", "app");
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  try {
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
  w.eval(`${picker}\n${source}\nconnected = true;
    window.__toolItems = toolItems;
    window.__mainItems = mainItems;`);
  const state = { sessionId: "activity", title: "Activity", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...state, ...changes });
  const emit = (type, data, agentId = "main") => w.event({ sessionId: state.sessionId, type, data, agentId });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  restore();
  return { dom, w, emit, restore, paint, output: w.document.getElementById("output") };
  } catch (error) {
    dom.window.close();
    throw error;
  }
}

const toggle = (w, record, open) => { record.open = open; record.dispatchEvent(new w.Event("toggle")); };
const entry = (message, entryId, agentId = "main") => ({ message, entryId, agentId });

test("折叠普通工具释放 body，重开按现有 args/result 原样恢复", async () => {
  const { dom, w, restore, output } = await page();
  try {
    const args = { path: "src/main.js", limit: 40 };
    const result = { content: [{ type: "text", text: "PLAIN_TOOL_OUTPUT" }] };
    restore({
      messages: [entry({ role: "user", content: "看下文件" }, "u"), entry({ role: "assistant", content: [{ type: "text", text: "好的" }] }, "a")],
      tools: { t1: { agentId: "main", phase: "end", toolCallId: "t1", toolName: "read", args, result } },
    });
    const record = output.querySelector(".tool-record");
    const body = record.querySelector(".tool-detail");
    const item = w.__toolItems.get("main:t1");
    const mainItems = [...w.__mainItems];
    assert.equal(record.open, false, "恢复后的记录默认折叠");
    assert.equal(body.childElementCount, 0, "折叠时不构建详情 DOM");
    assert.equal(item.container, record);
    assert.equal(item.body, body);
    assert.equal(item.args, args, "args 是详情恢复源，必须保留");
    assert.equal(item.result, result, "result 是详情恢复源，必须保留");

    toggle(w, record, true);
    const expanded = body.innerHTML;
    const childCount = body.childElementCount;
    assert.match(body.textContent, /调用参数/);
    assert.match(body.textContent, /PLAIN_TOOL_OUTPUT/);
    assert.match(body.textContent, /src\/main\.js/);

    toggle(w, record, false);
    assert.equal(body.childElementCount, 0, "折叠后 body 立即释放");
    assert.equal(body.innerHTML, "");
    assert(record.isConnected, "原记录仍在文档流中");
    assert.equal(record.querySelector("summary .tool-target").textContent, "src/main.js", "摘要与锚点信息保留");
    assert.equal(output.querySelectorAll(".tool-record").length, 1, "关闭不产生重复记录");
    assert.equal(w.__toolItems.get("main:t1"), item, "关闭不删除 toolItems 记录");
    assert.equal(item.args, args);
    assert.equal(item.result, result);
    assert.deepEqual([...w.__mainItems], mainItems);

    toggle(w, record, true);
    assert.equal(body.innerHTML, expanded, "重开内容与关闭前一致");
    assert.equal(body.childElementCount, childCount);
    assert.equal(record.querySelectorAll(".tool-record").length, 0);
  } finally { dom.window.close(); }
});

test("折叠 edit diff 详情后重开仍按当前视图恢复，切换调用链不变", async () => {
  const { dom, w, restore, output } = await page();
  try {
    const args = { path: "app.js", edits: [{ oldText: "const a = 1;", newText: "const a = 2;" }] };
    const result = { content: [{ type: "text", text: "Edited app.js" }], details: { diff: "- const a = 1;\n+ const a = 2;" } };
    restore({ tools: { e1: { agentId: "main", phase: "end", toolCallId: "e1", toolName: "edit", args, result } } });
    const record = output.querySelector(".tool-record");
    const body = record.querySelector(".tool-detail");
    toggle(w, record, true);
    assert.match(body.textContent, /实际改动/);
    assert.match(body.querySelector(".diff-remove").textContent, /const a = 1;/);
    assert.match(body.querySelector(".diff-add").textContent, /const a = 2;/);

    let select = body.querySelector('select[aria-label="代码对比展示方式"]');
    select.value = "split";
    select.dispatchEvent(new w.Event("change"));
    assert(body.querySelector(".diff-view-split"));
    assert.equal(w.localStorage.getItem("axiom.diffView"), "split");
    select = body.querySelector("select");
    select.value = "unified";
    select.dispatchEvent(new w.Event("change"));
    assert(body.querySelector(".diff-view-unified"));
    assert.equal(body.querySelector(".diff-view-split"), null);
    const unified = body.innerHTML;

    toggle(w, record, false);
    assert.equal(body.innerHTML, "", "diff 详情同样释放");
    assert.equal(w.__toolItems.get("main:e1").result, result, "diff 原文仍在 tool.result");

    toggle(w, record, true);
    assert.equal(body.innerHTML, unified, "重开按当前 unified 视图一致恢复");
    assert.match(body.textContent, /Edited app\.js/);
    assert.equal(body.querySelector(".diff-unified").textContent, "- const a = 1;\n+ const a = 2;\n");
    assert.equal(body.querySelector("h4 + pre").textContent, "app.js");
  } finally { dom.window.close(); }
});

test("折叠期间到达的结果不写入空 body，重开显示最新结果且不新建记录", async () => {
  const { dom, w, emit, output } = await page();
  try {
    emit("tool.state", { phase: "start", toolCallId: "run", toolName: "bash", args: { command: "npm test" } });
    const record = output.querySelector(".tool-record");
    const body = record.querySelector(".tool-detail");
    const item = w.__toolItems.get("main:run");
    toggle(w, record, true);
    assert.match(body.textContent, /等待工具返回/);

    toggle(w, record, false);
    assert.equal(body.childElementCount, 0);
    emit("tool.state", { phase: "end", toolCallId: "run", toolName: "bash", args: { command: "npm test" }, result: { content: "all tests passed" } });
    assert.equal(record.querySelector(".tool-activity").dataset.state, "done");
    assert.equal(body.childElementCount, 0, "折叠状态不重建详情");
    assert.equal(output.querySelectorAll(".tool-record").length, 1);
    assert.equal(w.__toolItems.get("main:run"), item, "结束事件复用同一条记录");

    toggle(w, record, true);
    assert.match(body.textContent, /all tests passed/);
    assert.match(body.textContent, /执行输出/);
  } finally { dom.window.close(); }
});
