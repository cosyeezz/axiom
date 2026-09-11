// tests/text-contrast.test.js — 文字对比度调节：DOM 构建/aria、档位钳制、持久化与容错、CSS 契约。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = (await readFile(new URL("../public/text-contrast.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const css = await readFile(new URL("../public/text-contrast.css", import.meta.url), "utf8");

const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};
const throwingStorage = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} };

function boot(body = '<div class="service-controls"></div>', storage = fakeStorage()) {
  const dom = new JSDOM(body, { runScripts: "outside-only" });
  const { window } = dom;
  window.eval(`${source}\nwindow.tc = { clampLevel, readStoredLevel, storeLevel, applyLevel, initTextContrast };`);
  return { dom, window, tc: window.tc, storage };
}

test("localStorage getter 被安全策略禁用仍可调节", () => {
  const { dom, window, tc } = boot();
  try {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("SecurityError"); } });
    assert.doesNotThrow(() => tc.initTextContrast(window.document));
    const range = window.document.getElementById("text-contrast-range");
    range.value = "140";
    range.dispatchEvent(new window.Event("input"));
    assert.equal(window.document.documentElement.dataset.textContrast, "140");
  } finally { dom.window.close(); }
});

test("clampLevel 把非法输入钳到最近合法档位，完全无效回默认", () => {
  const dom = new JSDOM();
  try {
    const tc = dom.window.eval(`${source.replace(/^export /gm, "")}\nclampLevel;`);
    assert.equal(tc("abc"), 100, "非数字回默认");
    assert.equal(tc(undefined), 100);
    assert.equal(tc(150), 150);
    assert.equal(tc(999), 150, "越界钳到上限");
    assert.equal(tc(-5), 100, "越界钳到下限");
    assert.equal(tc("123"), 120, "非整档就近取整");
    assert.equal(tc("118"), 120);
  } finally { dom.window.close(); }
});

test("init 在 .service-controls 构建按钮与 popover，aria 齐全且无 inline style", () => {
  const { dom, window, tc, storage } = boot();
  try {
    tc.initTextContrast(window.document, storage);
    const doc = window.document;
    const button = doc.getElementById("text-contrast-button");
    const popover = doc.getElementById("text-contrast-popover");
    assert.ok(button.closest(".service-controls"), "按钮挂在 .service-controls");
    assert.equal(button.getAttribute("aria-label"), "文字对比度设置");
    assert.equal(button.getAttribute("popovertarget"), "text-contrast-popover");
    assert.equal(button.getAttribute("aria-haspopup"), "dialog");
    assert.equal(popover.getAttribute("popover"), "", "原生 popover，轻关闭/Esc 由浏览器提供");
    const range = doc.getElementById("text-contrast-range");
    assert.equal(range.min, "100");
    assert.equal(range.max, "150");
    assert.equal(range.step, "10");
    assert.equal(range.getAttribute("aria-label"), "文字对比度百分比");
    assert.ok(doc.getElementById("text-contrast-reset"));
    assert.equal(button.hasAttribute("style"), false, "CSP 下不能有 inline style");
    assert.equal(popover.hasAttribute("style"), false);

    tc.initTextContrast(window.document, storage);
    assert.equal(doc.querySelectorAll("#text-contrast-button").length, 1, "重复调用幂等");
  } finally { dom.window.close(); }
});

test("默认 100% 不写 data 属性，重置按钮禁用", () => {
  const { dom, window, tc, storage } = boot();
  try {
    tc.initTextContrast(window.document, storage);
    const doc = window.document;
    assert.equal(doc.documentElement.hasAttribute("data-text-contrast"), false);
    assert.equal(doc.getElementById("text-contrast-range").value, "100");
    assert.equal(doc.getElementById("text-contrast-value").textContent, "100%");
    assert.equal(doc.getElementById("text-contrast-reset").disabled, true);
    assert.equal(storage.map.size, 0, "默认不落盘");
  } finally { dom.window.close(); }
});

test("恢复持久化档位；非法存储值钳到合法档位", () => {
  for (const [stored, expected] of [["150", "150"], ["abc", "100"], ["999", "150"], ["123", "120"]]) {
    const { dom, window, tc, storage } = boot('<div class="service-controls"></div>', fakeStorage({ "axiom.textContrast": stored }));
    try {
      tc.initTextContrast(window.document, storage);
      const root = window.document.documentElement;
      if (expected === "100") assert.equal(root.hasAttribute("data-text-contrast"), false, `${stored} 回默认`);
      else assert.equal(root.getAttribute("data-text-contrast"), expected, `${stored} → ${expected}`);
      assert.equal(window.document.getElementById("text-contrast-range").value, expected);
    } finally { dom.window.close(); }
  }
});

test("拖动 range 实时预览并持久化；重置恢复默认并清存储", () => {
  const { dom, window, tc, storage } = boot();
  const { document: doc } = window;
  try {
    tc.initTextContrast(doc, storage);
    const range = doc.getElementById("text-contrast-range");
    range.value = "130";
    range.dispatchEvent(new window.Event("input"));
    assert.equal(doc.documentElement.getAttribute("data-text-contrast"), "130", "实时预览");
    assert.equal(doc.getElementById("text-contrast-value").textContent, "130%");
    assert.equal(range.getAttribute("aria-valuetext"), "130%");
    assert.equal(storage.map.get("axiom.textContrast"), "130");

    doc.getElementById("text-contrast-reset").click();
    assert.equal(doc.documentElement.hasAttribute("data-text-contrast"), false, "重置移除档位");
    assert.equal(range.value, "100");
    assert.equal(storage.map.get("axiom.textContrast"), undefined, "重置清存储");
    assert.equal(doc.getElementById("text-contrast-reset").disabled, true);
  } finally { dom.window.close(); }
});

test("存储不可用时初始化与预览均不崩溃", () => {
  const dom = new JSDOM('<div class="service-controls"></div>', { runScripts: "outside-only" });
  const { window } = dom;
  window.eval(`${source}\nwindow.tc = { readStoredLevel, initTextContrast };`);
  try {
    assert.equal(window.tc.readStoredLevel(throwingStorage), 100);
    window.tc.initTextContrast(window.document, throwingStorage);
    window.document.getElementById("text-contrast-range").value = "140";
    window.document.getElementById("text-contrast-range").dispatchEvent(new window.Event("input"));
    assert.equal(window.document.documentElement.getAttribute("data-text-contrast"), "140", "预览不受存储失败影响");
  } finally { dom.window.close(); }
});

test("宿主缺失时静默退出", () => {
  const dom = new JSDOM("<main></main>", { runScripts: "outside-only" });
  const { window } = dom;
  window.eval(`${source}\nwindow.tc = { initTextContrast };`);
  try {
    window.tc.initTextContrast(window.document, fakeStorage());
    assert.equal(window.document.getElementById("text-contrast-button"), null);
  } finally { dom.window.close(); }
});

test("CSS 契约：离散档位、仅文字 token 提亮、--muted 共享副作用钉回", () => {
  for (const level of [110, 120, 130, 140, 150]) {
    assert.match(css, new RegExp(`html\\[data-text-contrast="${level}"\\]`), `档位 ${level} 存在`);
  }
  assert.match(css, /:not\(\[data-text-contrast="100"\]\)/, "100% 走默认分支");
  const boost = css.match(/--body-ink: color-mix\([^;]+\);|--muted: color-mix\([^;]+\);/g) ?? [];
  assert.equal(boost.length, 2, "只重定义 --body-ink 与 --muted 两个文字 token");
  assert.doesNotMatch(css, /--ink:|--info:|--code-ink:|--highlight:|--thought:|--danger:|--success:|--accent:/, "不碰 --ink 与语义/状态色");
  assert.match(css, /\.tool-activity:not\(\[data-tool-icon\]\)[^{]*\{[^}]*--activity-ink: var\(--tcx-muted\)/, "工具图标默认色钉回原值");
  assert.match(css, /\.selectors label:has\(select\)::after[^}]*border-color: var\(--tcx-muted\)/, "下拉箭头边框钉回原值");
  assert.match(css, /#text-contrast-popover\s*\{[^}]*position: fixed/, "popover 仿 service-menu 固定定位");
});
