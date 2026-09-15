import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// 复用 tool-detail-reclaim 的页面 harness（真实 app.js，无模型无服务器）；
// 拦 scrollHeight getter 数「读了几次」，验证复用键命中时不再强制同步布局。
async function page(media = { matches: false }) {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  // 与 tests/app.test.js、compaction-ui 同一套加载顺序：markdown-scan 是 memory-tags/goal-markers 的依赖。
  const sources = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => media;
  Object.defineProperty(w.document, "fonts", { value: new w.EventTarget(), configurable: true });
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
  // mobile 是模块作用域的 const，测试里要改断点就得让同一个 MediaQueryList 进得来。
  w.eval(`${picker}\n${sources}\nwindow.__promptEnv = { mobile };`);
  const input = w.document.getElementById("prompt");
  const reads = { count: 0 };
  let measured = 0;
  Object.defineProperty(input, "scrollHeight", {
    configurable: true,
    get() { reads.count++; return measured; },
  });
  const size = (value) => { measured = value; };
  const paint = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach((fn) => fn()); };
  return { dom, w, input, reads, size, paint };
}

test("键没变时重复调用不读 scrollHeight（文档变脏也一样）", async () => {
  const { dom, w, input, reads, size, paint } = await page();
  try {
    // 初始化时已经量过一次，`connected` 之后 snapshot/connect 的重复调用必须全是命中。
    w.resizePrompt();
    w.resizePrompt();
    assert.equal(reads.count, 0, "无变化重复调用不读 scrollHeight");

    size(120);
    w.dispatchEvent(new w.Event("resize"));
    assert.equal(reads.count, 0, "resize 合并到下一帧，不在事件里同步量");
    paint();
    assert.equal(reads.count, 1, "视口变化量一次");
    assert.equal(input.style.height, "120px");

    // 长会话场景：transcript 插入大量节点后文档是脏的，此时任何几何读都会强制整文档布局。
    const output = w.document.getElementById("output");
    for (let i = 0; i < 200; i++) output.append(w.document.createElement("div"));
    for (let i = 0; i < 5; i++) w.resizePrompt();
    assert.equal(reads.count, 1, "重复调用不因文档变脏而再量");
    assert.equal(input.style.height, "120px", "高度保持上次结果");
  } finally { dom.window.close(); }
});

test("必要的变化仍然重算：输入、视口、桌面侧栏折叠", async () => {
  const { dom, w, input, reads, size, paint } = await page();
  try {
    w.resizePrompt();
    assert.equal(reads.count, 0, "初始化已量过，重复调用是命中");

    input.value = "第一行\n第二行";
    size(180);
    w.resizePrompt();
    assert.equal(reads.count, 1, "内容变化要重量");
    assert.equal(input.style.height, "180px");

    input.value = ""; // 回到原内容：键与上次不同，同样要重量，不能拿旧缓存糊弄
    size(90);
    w.resizePrompt();
    assert.equal(reads.count, 2);
    assert.equal(input.style.height, "90px");

    size(200);
    w.dispatchEvent(new w.Event("resize"));
    paint();
    assert.equal(reads.count, 3, "同断点内宽度变化要重量");
    assert.equal(input.style.height, "200px");

    w.sidebar(false);
    assert.equal(reads.count, 4, "桌面折叠侧栏改主区宽度，要重量");
    w.sidebar(false);
    assert.equal(reads.count, 4, "折叠状态没变不重复量");
    w.sidebar(true);
    assert.equal(reads.count, 5, "再展开也要重量");
    size(220);
    w.document.fonts.dispatchEvent(new w.Event("loadingdone"));
    assert.equal(reads.count, 6, "字体加载完成必须重新测量");
    assert.equal(input.style.height, "220px");
  } finally { dom.window.close(); }
});

test("手机展开与断点切换仍然重算，收起时不白量", async () => {
  const media = { matches: true };
  const { dom, w, input, reads, size } = await page(media);
  try {
    size(300);
    reads.count = 0;
    w.document.getElementById("mobile-expand").click();
    assert.equal(reads.count, 0, "手机空输入固定高度，无需读取几何");
    assert.equal(input.style.height, "44px", "手机空输入固定 44px");

    w.document.getElementById("mobile-expand").click();
    assert.equal(reads.count, 0, "收起时不做无谓测量");

    input.value = "有内容";
    w.document.getElementById("mobile-expand").click();
    assert.equal(reads.count, 1);
    assert.equal(input.style.height, "240px", "非空按 scrollHeight 且封顶 240");

    // 跨断点：手机 → 桌面要改 rows 与封顶规则。
    media.matches = false;
    media.onchange();
    assert.equal(input.rows, 3, "桌面回到 3 行");
    assert.equal(input.style.height, "240px", "同一 scrollHeight 封顶后仍为 240");
    assert.ok(reads.count >= 2, "断点切换要重量");

    media.matches = true;
    media.onchange();
    assert.equal(input.rows, 1, "回手机回到 1 行");
  } finally { dom.window.close(); }
});
