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
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
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
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const markdownApi = new Function("marked", "DOMPurify", `${markdown}; return { renderMarkdown, createMarkdownPageCache };`)(marked, createPurify(w));
  w.renderMarkdown = markdownApi.renderMarkdown;
  w.createMarkdownPageCache = markdownApi.createMarkdownPageCache;
  w.createStreamRenderer = (render, after) => createStreamRenderer(render, after, w.requestAnimationFrame, w.cancelAnimationFrame);
  w.WebSocket = class { static OPEN = 1; readyState = 1; send() {} };
  // 折叠延时是 5s，测试里拦下这一档 setTimeout，用 __collapseTick() 手动到点，不真等。
  const collapseTimers = [];
  const realSetTimeout = w.setTimeout.bind(w), realClearTimeout = w.clearTimeout.bind(w);
  w.setTimeout = (fn, delay, ...args) => {
    if (delay !== 5000) return realSetTimeout(fn, delay, ...args);
    collapseTimers.push(fn);
    return -collapseTimers.length;
  };
  w.clearTimeout = (id) => { if (typeof id === "number" && id < 0) collapseTimers[-id - 1] = null; else realClearTimeout(id); };
  w.__collapseTick = async () => { for (const fn of collapseTimers.splice(0)) fn?.(); };
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
    // 桌面默认折叠成一行（高度交回 CSS），测量路径要从展开态开始验。
    w.expandComposer();
    reads.count = 0;
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
    w.expandComposer();
    reads.count = 0;
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
    assert.equal(input.rows, 1, "桌面默认折叠成一行");
    assert.equal(input.style.height, "", "折叠态高度交回 CSS");
    w.expandComposer();
    assert.equal(input.rows, 3, "展开后桌面回到 3 行");
    assert.equal(input.style.height, "240px", "同一 scrollHeight 封顶后仍为 240");
    assert.ok(reads.count >= 2, "断点切换要重量");

    media.matches = true;
    media.onchange();
    assert.equal(input.rows, 1, "回手机回到 1 行");
  } finally { dom.window.close(); }
});

// 桌面输入区折叠：默认一行，点击/聚焦/输入展开，鼠标与键盘焦点都离开 5s 后收回。
test("桌面输入区默认折叠，交互展开，离开 5s 收回", async () => {
  const { dom, w, input } = await page();
  const composer = w.document.getElementById("composer");
  const wrap = w.document.querySelector(".composer-wrap");
  try {
    assert.equal(composer.dataset.collapsed, "true", "首屏就是折叠态，不占多行");
    assert.equal(wrap.dataset.collapsed, "true", "footer 所在的外层同步折叠标记");
    assert.equal(input.rows, 1);

    // 点击展开：mousedown 先到，popover / 选择器都能正常点。
    wrap.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
    assert.equal(composer.dataset.collapsed, "false", "点击即展开");
    assert.equal(input.rows, 3);

    // 焦点在输入框里时不收：5s 到点也得留着。
    input.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
    input.focus();
    wrap.dispatchEvent(new w.Event("mouseleave"));
    await w.__collapseTick();
    assert.equal(composer.dataset.collapsed, "false", "键盘焦点还在输入区，不收");

    // 焦点与鼠标都离开 → 5s 后折叠。
    input.blur();
    input.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
    await w.__collapseTick();
    assert.equal(composer.dataset.collapsed, "true", "失焦 5s 自动折叠");
    assert.equal(input.rows, 1);

    // 输入内容立刻展开（快捷键聚焦后直接打字的路径）。
    input.value = "草稿";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert.equal(composer.dataset.collapsed, "false", "输入即展开");

    // 悬停期间不收，计时器被清掉。
    wrap.dispatchEvent(new w.Event("mouseenter"));
    input.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
    await w.__collapseTick();
    assert.equal(composer.dataset.collapsed, "false", "鼠标还在输入区上，不收");
  } finally { dom.window.close(); }
});

// 回归防守：“回到最新”钉在输入区上沿，mousedown 就展开会把按钮推走，
// mouseup 落不回原元素、click 不触发，按钮彻底点不动。
test("滚动按钮不算输入意图：点回到最新不展开输入区", async () => {
  const { dom, w, input } = await page();
  const composer = w.document.getElementById("composer");
  const latest = w.document.getElementById("latest");
  try {
    assert.equal(composer.dataset.collapsed, "true");
    latest.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
    assert.equal(composer.dataset.collapsed, "true", "滚到最新不展开，按钮不位移");
    latest.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
    assert.equal(composer.dataset.collapsed, "true", "按钮拿到焦点也不展开");

    // 输入区本体的 mousedown 照旧展开。
    input.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
    assert.equal(composer.dataset.collapsed, "false", "点输入区仍然展开");
  } finally { dom.window.close(); }
});

test("还在用的状态不折叠：待发图片、补全打开；运行中照常折叠", async () => {
  const { dom, w, input } = await page();
  const composer = w.document.getElementById("composer");
  const wrap = w.document.querySelector(".composer-wrap");
  const leave = async () => {
    wrap.dispatchEvent(new w.Event("mouseleave"));
    input.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
    await w.__collapseTick();
  };
  try {
    // Stop/Force 在折叠态里是保留项（CSS 只收 selectors 与发送按钮），运行中不必撑开整个输入区。
    w.expandComposer();
    w.document.getElementById("stop").hidden = false;
    await leave();
    assert.equal(composer.dataset.collapsed, "true", "运行中也折叠，Stop 由折叠态保留");
    w.document.getElementById("stop").hidden = true;
    await leave();
    assert.equal(composer.dataset.collapsed, "true");

    // @ 补全列表是 #composer 的子节点，收起会被裁掉。
    w.expandComposer();
    w.document.getElementById("prompt-completion").hidden = false;
    await leave();
    assert.equal(composer.dataset.collapsed, "false", "补全打开期间不折叠");
    w.document.getElementById("prompt-completion").hidden = true;
    await leave();
    assert.equal(composer.dataset.collapsed, "true");

    // 待发图片在附件区，折叠不隐附件区，但发送按钮会被收起，所以同样不收。
    w.expandComposer();
    w.document.getElementById("image-attachments").hidden = false;
    await leave();
    assert.equal(composer.dataset.collapsed, "false", "有待发图片时不折叠");
    w.document.getElementById("image-attachments").hidden = true;
    await leave();
    assert.equal(composer.dataset.collapsed, "true");
  } finally { dom.window.close(); }
});

// 折叠态保留什么、收起什么，全靠这段 media query；jsdom 不跑媒体查询，改从 CSS 文本守。
test("折叠态样式：摘要与停止按钮同一行，任务计时保留，图标组与发送区收起", async () => {
  const css = await readFile(new URL("../public/style.css", import.meta.url), "utf8");
  const block = css.match(/@media \(min-width: 701px\) \{\s*#composer\[data-collapsed[\s\S]*?\r?\n\}/)?.[0];
  assert.ok(block, "桌面折叠态样式块存在");
  const hidden = block.match(/([^{}]*)\{ display: none; \}/)[1];
  for (const selector of [".session-detail-rows", ".selectors", "#send", ".icon-group", ".composer-footer"]) {
    assert.ok(hidden.includes(selector), `${selector} 折叠时收起`);
  }
  for (const keep of ["#session-runtime", "#task-timer", "#context-chips", "#image-attachments", "#stop", "#force-stop"]) {
    assert.ok(!hidden.includes(keep), `${keep} 折叠时保留`);
  }
  // 摘要和停止按钮共用第二行：输入框 basis 100% 独占首行，摘要 basis 必须是 0，
  // 否则 nowrap 文本的内容宽就是初始主尺寸，窄屏时把按钮挤到下一行。
  assert.match(block, /#composer\[data-collapsed="true"\] \{[^}]*flex-flow: row wrap/, "折叠态改横向换行排列");
  assert.match(block, /#prompt, #prompt-completion\) \{[^}]*flex: 1 0 100%/, "输入框独占首行");
  assert.match(block, /> #session-runtime \{[^}]*flex: 1 1 0/, "摘要按剩余宽度收缩，不把按钮顶走");
  assert.match(block, /> #session-runtime \{[^}]*white-space: nowrap/, "摘要单行不换行");
  assert.match(block, /> \.actions \{[^}]*justify-content: flex-end/, "停止按钮靠右");
  assert.match(block, /> \.actions \{[^}]*order: 1/, "动作区排到摘要右侧");
  assert.match(block, /\.actions:not\(:has\(> #stop:not\(\[hidden\]\), > #force-stop:not\(\[hidden\]\)\)\) \{ display: none/, "两个停止按钮都隐藏时整条动作区收掉");
});
