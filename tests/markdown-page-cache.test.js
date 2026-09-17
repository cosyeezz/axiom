// 页级渲染缓存（Phase D2）：整页替换后元素级 WeakMap 失效，页缓存按调用方键存终态
// blocks，命中 move 复用（跳过 lex/parse/sanitize）。connected 节点不当 clone 用（事件
// 处理器会丢），当 miss 重渲。缓存条目只存终态复杂 markdown。
import test from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import createPurify from "dompurify";
import { JSDOM } from "jsdom";
import { publicSource } from "./helpers/public-source.js";

async function loadRenderer() {
  const window = new JSDOM("").window;
  try {
    const source = await publicSource("clipboard", "markdown");
    const api = new Function(
      "marked",
      "DOMPurify",
      `${source}; return { renderMarkdown, createMarkdownPageCache };`,
    )(marked, createPurify(window));
    return { window, ...api };
  } catch (e) {
    window.close();
    throw e;
  }
}

const SAMPLE = "# 标题\n\n**加粗**与`行内`\n\n- 甲\n- 乙\n\n```js\nconst a = 1;\n```\n\n[链接](https://example.com)";
const OTHER = "另一条\n\n完全不同的内容，含 **加粗** 与列表。\n\n- x\n- y";

test("页缓存命中：整页替换后同键同文 move 复用，跳过 lex/parse", async () => {
  const { window, renderMarkdown, createMarkdownPageCache } = await loadRenderer();
  try {
    const pageCache = createMarkdownPageCache();
    const first = window.document.createElement("div");
    renderMarkdown(first, SAMPLE, { pageCache, cacheKey: "main\u0000e1" });
    assert.ok(pageCache.stats.store === 1);
    // 旧页销毁（元素丢弃），新页同键同文重建元素。先快照旧产物（move 复用会搬走节点）。
    const firstHtml = first.innerHTML, firstBlocks = first.querySelectorAll(".markdown-block").length;
    const second = window.document.createElement("div");
    renderMarkdown(second, SAMPLE, { pageCache, cacheKey: "main\u0000e1" });
    assert.equal(pageCache.stats.hit, 1);
    assert.equal(second.innerHTML, firstHtml);
    assert.equal(second.querySelectorAll(".markdown-block").length, firstBlocks);
    assert.equal(pageCache.stats.miss, 0);
  } finally { window.close(); }
});

test("同键不同文、不同键、换页缓存对象都按 miss 重渲", async () => {
  const { window, renderMarkdown, createMarkdownPageCache } = await loadRenderer();
  try {
    const pageCache = createMarkdownPageCache();
    const a = window.document.createElement("div");
    renderMarkdown(a, SAMPLE, { pageCache, cacheKey: "k" });
    // 同键不同文：换内容必须重渲（不能拿旧 blocks 冒充）。
    const b = window.document.createElement("div");
    renderMarkdown(b, OTHER, { pageCache, cacheKey: "k" });
    assert.ok(b.innerHTML.includes("完全不同"));
    assert.ok(!b.innerHTML.includes("标题"));
    assert.equal(pageCache.stats.hit, 0);
    // 同键换文后旧条目被覆盖，再用旧文渲染不命中（键内容不匹配时安全 miss 重渲）。
    const c = window.document.createElement("div");
    renderMarkdown(c, SAMPLE, { pageCache, cacheKey: "k" });
    assert.equal(pageCache.stats.hit, 0);
    assert.ok(c.innerHTML.includes("标题"));
    // 换页缓存对象（会话/修订切换）：全部重来。
    const pageCache2 = createMarkdownPageCache();
    const d = window.document.createElement("div");
    renderMarkdown(d, SAMPLE, { pageCache: pageCache2, cacheKey: "k" });
    assert.equal(pageCache2.stats.hit, 0);
    assert.ok(d.innerHTML.includes("标题"));
  } finally { window.close(); }
});

test("节点仍连接（同页双渲染同键）时不复用，重渲保证两处独立", async () => {
  const { window, renderMarkdown, createMarkdownPageCache } = await loadRenderer();
  try {
    const pageCache = createMarkdownPageCache();
    const first = window.document.createElement("div");
    window.document.body.append(first); // 保持连接
    renderMarkdown(first, SAMPLE, { pageCache, cacheKey: "k" });
    const second = window.document.createElement("div");
    window.document.body.append(second);
    renderMarkdown(second, SAMPLE, { pageCache, cacheKey: "k" });
    assert.equal(pageCache.stats.hit, 0); // connected → miss
    assert.notEqual(second.firstChild, first.firstChild); // 各自独立的节点
    assert.equal(second.innerHTML, first.innerHTML); // 内容等价
  } finally { window.close(); }
});

test("复用后的块更新（元素级 diff）与首次渲染行为一致", async () => {
  const { window, renderMarkdown, createMarkdownPageCache } = await loadRenderer();
  try {
    const pageCache = createMarkdownPageCache();
    const first = window.document.createElement("div");
    renderMarkdown(first, SAMPLE, { pageCache, cacheKey: "k" });
    const second = window.document.createElement("div");
    renderMarkdown(second, SAMPLE, { pageCache, cacheKey: "k" });
    // 命中后继续更新：既有块级 diff 应正常工作（尾部追加一个块）。
    renderMarkdown(second, `${SAMPLE}\n\n新增段落文字。`);
    assert.ok(second.innerHTML.includes("新增段落文字"));
  } finally { window.close(); }
});

test("LRU：条目上限 300 与字节预算 4MB，插入序逐出", async () => {
  const { window, createMarkdownPageCache } = await loadRenderer();
  try {
    const pageCache = createMarkdownPageCache();
    // 直接走 store/get（纯 Map 逻辑），验证上限与逐出统计。
    for (let i = 0; i < 305; i++) {
      pageCache.store(`k${i}`, { text: "x".repeat(10), linksKey: "", blocks: [{ key: "a", node: null }] });
    }
    assert.equal(pageCache.entries.size, 300);
    assert.equal(pageCache.stats.evict, 5);
    assert.ok(!pageCache.entries.has("k0"));
    assert.ok(pageCache.entries.has("k304"));
    // 字节预算：单条超预算时逐出全部旧条目，仅留这一条（严格大于才逐）。
    pageCache.store("big", { text: "x".repeat(4 << 20), linksKey: "", blocks: [] });
    assert.ok(pageCache.bytes <= 4 << 20);
    assert.equal(pageCache.entries.size, 1);
    assert.ok(pageCache.entries.has("big"));
  } finally { window.close(); }
});
