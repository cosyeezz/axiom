import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

test("摘要时间行不继承顶栏尺寸，正文不继承设置段落间距", () => {
  const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
  const dom = new JSDOM(`<style>${css}</style><dialog id="summaries"><header>摘要记录</header><div id="summaries-body" class="settings-body"><article class="summary-record"><header class="summary-meta">时间 · 轮次</header><p class="summary-text">摘要正文</p></article></div></dialog>`);
  try {
    const style = (selector) => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    assert.equal(style("#summaries > header").height, "64px");
    assert.equal(style(".summary-meta").height, "auto");
    assert.equal(style(".summary-meta").padding, "0px");
    assert.notEqual(style(".summary-meta").justifyContent, "space-between");
    assert.equal(style(".summary-meta").marginBottom, "4px");
    assert.equal(style(".summary-text").margin, "0px");
    assert.equal(style(".summary-text").fontSize, "13px");
    assert.equal(style(".summary-record").paddingTop, "12px");
  } finally { dom.window.close(); }
});
