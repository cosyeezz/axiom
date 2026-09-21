import { publicSource } from "./helpers/public-source.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { splitAnswer } from "../public/answer-tags.js";

// 前端用例：/goal 命令的斜杠补全（app.js）与「裸 /goal 等待目标」专属提示（goal.js）。
// 后端裸 /goal 只置 clarifying、不调模型，因此这两处必须同时成立，否则用户会等一个没发出的请求。
async function page({ skills = [] } = {}) {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await publicSource("app");
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
  w.renderMarkdown = (node, text) => { node.textContent = text ?? ""; };
  w.createMarkdownPageCache = () => ({ entries: new Map(), bytes: 0, stats: { hit: 0, miss: 0, store: 0, evict: 0 }, get: () => null, store: () => {} });
  w.stripMemoryTags = (text) => text;
  w.stripGoalMarkers = (text) => text;
  w.createStreamRenderer = (render, after) => createStreamRenderer(render, after, w.requestAnimationFrame, w.cancelAnimationFrame);
  w.WebSocket = class { static OPEN = 1; readyState = 1; constructor() { w.__ws = this; } send() {} close() {} };
  for (const name of ["model-picker", "model-auth", "model-manager"]) {
    const module = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    const exports = [...module.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
    w.eval(`Object.assign(window, (() => { ${module.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`);
  }
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const question = (await readFile(new URL("../public/question.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const goal = (await readFile(new URL("../public/goal.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const service = (await readFile(new URL("../public/service-settings.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  w.eval(`${picker}\n${question}\n${goal}\n${service}\n${source}\nconnected = true;`);
  const state = { sessionId: "goal-1", title: "Goal", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills }, messages: [], tasks: [], live: {}, tools: {} };
  const restore = (changes = {}) => w.snapshot({ ...state, ...changes });
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  const stub = (reply) => {
    w.eval(`window.__rpc = []; request = async (type, data = {}) => { window.__rpc.push([type, data]); return window.__reply ? window.__reply(type, data) : {}; };`);
    w.__reply = reply;
    return () => JSON.parse(JSON.stringify(w.__rpc));
  };
  restore();
  return { dom, w, restore, paint, stub };
}
const $ = (w, id) => w.document.getElementById(id);
const settle = () => new Promise(setImmediate);
const input = (w, text) => { $(w, "prompt").value = text; $(w, "prompt").dispatchEvent(new w.Event("input")); };
const key = (w, name) => $(w, "prompt").dispatchEvent(new w.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

test("斜杠补全里出现 /goal，且 /skill: 前缀只列 Skill", async () => {
  const { dom, w } = await page({ skills: [{ name: "ponytail", description: "最小实现" }] });
  try {
    input(w, "/go");
    await settle();
    assert.equal($(w, "prompt-completion").hidden, false);
    assert.match($(w, "prompt-completion").textContent, /\/goal/);
    assert.doesNotMatch($(w, "prompt-completion").textContent, /ponytail/);
    input(w, "/skill:go");
    await settle();
    assert.doesNotMatch($(w, "prompt-completion").textContent, /\/goal/, "skill: 前缀是 Skill 专用，不混入命令");
    input(w, "/");
    await settle();
    assert.match($(w, "prompt-completion").textContent, /ponytail/);
    assert.match($(w, "prompt-completion").textContent, /\/goal/, "裸斜杠也能发现命令");
  } finally { dom.window.close(); }
});

test("选择 /goal 只补全 \"/goal \"，可选择后直接发送，也可继续追加目标", async () => {
  const { dom, w, stub, paint } = await page();
  try {
    const rpc = stub((type) => type === "prompt" ? { runId: "r1" } : {});
    input(w, "/go");
    await settle();
    key(w, "Enter");
    assert.equal($(w, "prompt").value, "/goal ", "补全补出命令与尾随空格");
    assert.equal($(w, "prompt").selectionStart, 6, "光标留在末尾，方便接着写目标");
    assert.equal($(w, "prompt-completion").hidden, true);
    assert.equal(rpc().some(([type]) => type === "prompt"), false, "选命令本身不发送");
    // 裸命令：补全后不追加任何文字，直接回车发送（发送路径统一 trim，尾随空格自然去掉）。
    key(w, "Enter");
    paint();
    await settle();
    assert.equal(rpc().findLast(([type]) => type === "prompt")[1].text, "/goal");

    // 追加目标：补全后接着写，再回车发送完整命令。
    input(w, "/go");
    await settle();
    key(w, "Enter");
    input(w, "/goal 重构导出流程");
    key(w, "Enter");
    paint();
    await settle();
    assert.equal(rpc().findLast(([type]) => type === "prompt")[1].text, "/goal 重构导出流程");
  } finally { dom.window.close(); }
});

test("裸 /goal 等待目标时显示专属提示，不出现模型澄清口径", async () => {
  const { dom, w, restore } = await page();
  try {
    restore({ goal: { phase: "clarifying", objective: "", rounds: [], constraints: [], acceptance: [] } });
    const hint = () => $(w, "goal-dock").querySelector(".goal-dock-hint").textContent;
    assert.equal(hint(), "任务模式已开启，请发送任务目标");
    assert.doesNotMatch(hint(), /模型|澄清/);
    // 目标到手（模型真在澄清）后，回到原文案。
    restore({ goal: { phase: "clarifying", objective: "重构导出流程", rounds: [], constraints: [], acceptance: [] } });
    assert.match(hint(), /回答输入框里的问题/);
  } finally { dom.window.close(); }
});

test("输入区图标组：+ / 图片 / 目标共用一条描边，尺寸与焦点环统一", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const css = (await readFile(new URL("../public/style.css", import.meta.url), "utf8")) + "\n" + (await readFile(new URL("../public/goal.css", import.meta.url), "utf8"));
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const group = document.querySelector(".icon-group");
    assert.ok(group, "输入区图标组存在");
    assert.equal(group.getAttribute("role"), "group");
    assert.equal(group.getAttribute("aria-label"), "输入区图标");
    assert.deepEqual([...group.children].map((node) => node.id), ["add-context", "add-image", "compact-session", "goal-enter"], "四枚图标同组");
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const computed = (selector) => dom.window.getComputedStyle(document.querySelector(selector));
    // jsdom 解析不了 border 简写里的 var()，整组描边改从 CSS 文本断言，子项用计算值断言尺寸与去边框。
    assert.match(css, /\.icon-group \{[^}]*border: 1px solid var\(--line\)/, "整组共用一条发丝描边");
    assert.match(css, /\.icon-group \{[^}]*border-radius: 8px/, "Linear rounded.md");
    for (const id of ["add-context", "add-image", "compact-session", "goal-enter"]) {
      assert.equal(computed(`#${id}`).width, "28px", `${id} 统一尺寸`);
      assert.equal(computed(`#${id}`).height, "28px", `${id} 统一尺寸`);
      assert.equal(computed(`#${id}`).borderTopWidth, "0px", `${id} 不再各自带边框（含原先的 Goal 专属边框）`);
    }
    assert.match(css, /\.icon-group > :focus-visible \{[^}]*outline: 2px solid var\(--accent\)/, "统一 2px accent 焦点环");
    assert.match(css, /@media \(pointer: coarse\) \{[^}]*\.icon-group/, "触摸设备放大到 ≥40px 目标");
  } finally { dom.window.close(); }
});
