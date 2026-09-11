import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = (await readFile(new URL("../public/model-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const tick = () => new Promise(setImmediate);
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const OPTS = `<option value="a" selected>Alpha</option>
  <option value="b">Beta</option>
  <option value="">默认</option>
  <option value="c">Gamma</option>`;
const SELECT = `<select id="model" title="模型">${OPTS}</select>`;

// 主入口形状：getFavorites() 无参返回字典；onToggle(kind, key, favorite)。
function boot(bodyHtml, favs = {}, hooks = {}) {
  const dom = new JSDOM(`<body>${bodyHtml}`, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.favData = { provider: [], model: [], thinking: [], ...favs };
  w.toggled = [];
  w.errors = [];
  w.getFavorites = hooks.getFavorites ?? (() => w.favData);
  w.onToggle = hooks.onToggle ?? (async (kind, key, favorite) => {
    w.toggled.push([kind, key, favorite]);
    const list = w.favData[kind] ?? [];
    w.favData[kind] = favorite ? [...list, key] : list.filter((v) => v !== key); // 先同步更 store 再异步持久化
  });
  w.onError = hooks.onError ?? ((err) => w.errors.push(err));
  w.eval(`${source}\nwindow.picker = createModelPicker(window);`);
  return { dom, w };
}

const $ = (w, id) => w.document.getElementById(id);
const key = (w, el, k, init = {}) =>
  el.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const menu = (w) => w.document.querySelector(".ax-mp-menu");
const opts = (w) => [...menu(w).querySelectorAll(".ax-mp-opt")];
const stars = (w) => [...menu(w).querySelectorAll(".ax-mp-star")];

test("拦截原生下拉、menu 结构合规、选中经 value+change 回流", async () => {
  const { dom, w } = boot(`<label>模型${SELECT}</label>`);
  try {
    const select = $(w, "model");
    w.picker.enhance(select, "model");
    assert.equal(select.getAttribute("aria-haspopup"), "menu");
    const md = new w.MouseEvent("mousedown", { bubbles: true, cancelable: true });
    select.dispatchEvent(md);
    assert.ok(md.defaultPrevented, "原生下拉面板被拦截");

    click(w, select);
    assert.equal(menu(w).getAttribute("role"), "menu");
    const entries = [...menu(w).children];
    assert.equal(entries.length, 4);
    assert.ok(entries.every((e) => e.getAttribute("role") === "none"), "role=none 合法包装");
    assert.equal(entries[2].querySelectorAll("button").length, 1, "空 value 占位无星标");
    assert.equal(
      menu(w).querySelectorAll("[role=menuitemradio] button, [role=menuitemcheckbox] button").length,
      0,
      "按钮不嵌套进 menuitem 角色",
    );
    assert.equal(w.document.activeElement, opts(w)[0], "打开即聚焦选中项");
    assert.equal(opts(w)[0].getAttribute("aria-checked"), "true");

    let changes = 0;
    select.onchange = () => changes++;
    click(w, opts(w)[1]); // Enter/Space 激活由原生 button 行为承担，jsdom 以 click 等价模拟
    assert.equal(select.value, "b");
    assert.equal(changes, 1);
    assert.equal(menu(w), null, "选择后关闭");
    assert.equal(w.document.activeElement, select);

    click(w, select);
    click(w, opts(w)[1]);
    assert.equal(changes, 1, "同值不重复触发 change");

    w.picker.enhance(select, "model"); // 幂等
    click(w, select);
    assert.equal(w.document.querySelectorAll(".ax-mp-menu").length, 1);
    assert.equal(key(w, opts(w)[0], "Escape"), false, "Esc 阻止默认（护住宿主 dialog）");
    assert.equal(menu(w), null);
    assert.equal(w.document.activeElement, select);
    assert.equal(w.document.querySelectorAll("[style]").length, 0, "CSP：全程无 inline style");
  } finally { dom.window.close(); }
});

test("收藏：字典播种置顶、星标只切收藏不选中不关闭、焦点跟星、Space 可激活", async () => {
  const { dom, w } = boot(SELECT, { model: ["c"] });
  try {
    const select = $(w, "model");
    w.picker.enhance(select, "model");
    click(w, select);
    assert.deepEqual(opts(w).map((o) => o.dataset.value), ["c", "a", "b", ""], "收藏稳定置顶");
    assert.equal(stars(w)[0].textContent, "★");
    assert.equal(stars(w)[0].getAttribute("aria-checked"), "true");

    stars(w)[0].focus(); // 模拟键盘到达星标（jsdom 不会因 click 聚焦）
    click(w, stars(w)[0]); // 取消收藏 c
    assert.ok(menu(w), "点星不关闭");
    assert.equal(select.value, "a", "点星不改选中");
    assert.equal(select.getAttribute("aria-expanded"), "true");
    assert.equal(w.document.activeElement.dataset.value, "c", "焦点跟住原星");
    assert.equal(w.document.activeElement.classList.contains("ax-mp-star"), true);
    assert.equal(w.document.activeElement.textContent, "☆");
    assert.deepEqual(opts(w).map((o) => o.dataset.value), ["a", "b", "", "c"], "取消后同步回落原序");
    await tick(); // onToggle 经微任务回调
    assert.deepEqual(w.toggled.map((t) => [...t]), [["model", "c", false]], "跨 realm 数组先拷回 Node 侧");
    assert.deepEqual([...w.favData.model], []);

    stars(w)[0].focus();
    click(w, stars(w)[0]); // 收藏 a
    await tick();
    assert.deepEqual(w.toggled.at(-1), ["model", "a", true]);
    assert.deepEqual(opts(w).map((o) => o.dataset.value), ["a", "b", "", "c"]);

    assert.ok(key(w, stars(w)[0], " "), "Space keydown 不被吞，原生 Space 激活可用");
    assert.equal(w.document.querySelectorAll("[style]").length, 0);
  } finally { dom.window.close(); }
});

test("onToggle 抛错进 onError", async () => {
  const { dom, w } = boot(SELECT, {}, { onToggle: () => { throw new Error("persist down"); } });
  try {
    const select = $(w, "model");
    w.picker.enhance(select, "model");
    click(w, select);
    click(w, stars(w)[0]);
    await tick();
    assert.equal(w.errors.length, 1);
    assert.match(w.errors[0].message, /persist down/);
    assert.ok(menu(w), "保存失败不影响菜单");
  } finally { dom.window.close(); }
});

test("键盘：↑↓Home/End 移动、Tab 到星/退出、Esc 归还焦点、字符查找", async () => {
  const { dom, w } = boot(SELECT, { model: ["b"] }); // 顺序：b, a, 默认, c
  try {
    const select = $(w, "model");
    w.picker.enhance(select, "model");
    assert.equal(key(w, select, "ArrowDown"), false, "↑↓ 开菜单并阻止原生改值");
    const at = () => w.document.activeElement;
    assert.equal(at().textContent, "Alpha", "初始聚焦选中项");
    key(w, at(), "ArrowDown");
    assert.equal(at().textContent, "默认");
    key(w, at(), "ArrowDown");
    assert.equal(at().textContent, "Gamma");
    key(w, at(), "Home");
    assert.equal(at().textContent, "Beta");
    key(w, at(), "End");
    assert.equal(at().textContent, "Gamma");
    key(w, at(), "ArrowUp");
    assert.equal(at().textContent, "默认");

    key(w, opts(w)[1], "Tab"); // Alpha 行
    assert.ok(at().classList.contains("ax-mp-star"), "Tab 到同行星标");
    key(w, at(), "Tab");
    assert.equal(menu(w), null, "星上再 Tab 关闭");
    assert.equal(w.document.activeElement, select);

    key(w, select, "ArrowDown"); // 重开
    key(w, opts(w)[0], "Tab"); // Beta 行的星
    assert.ok(at().classList.contains("ax-mp-star"));
    key(w, opts(w)[0], "ArrowDown"); // 星上仍可方向键移动
    assert.equal(at().textContent, "Alpha");

    key(w, at(), "g"); // 字符查找
    assert.equal(at().textContent, "Gamma");
    await nap(560); // 超过 TYPEAHEAD_MS，缓冲过期
    key(w, at(), "a");
    assert.equal(at().textContent, "Alpha", "过期后单字符重新查找");
    assert.equal(key(w, at(), "Escape"), false);
    assert.equal(w.document.activeElement, select);
  } finally { dom.window.close(); }
});

test("dialog 内回退挂载、sync/syncAll、禁用同步、断连清理、宿主 dialog 关闭收起", async () => {
  const { dom, w } = boot(
    `<dialog id="d" open><select id="m" title="模型">${OPTS}</select></dialog><select id="m2" title="模型2">${OPTS}</select>`,
  );
  try {
    const m = $(w, "m"), m2 = $(w, "m2"), d = $(w, "d");
    assert.equal(typeof menu(w)?.showPopover, "undefined", "前置确认：jsdom 无 Popover API，走回退路径");
    w.picker.enhance(m, "model");
    w.picker.enhance(m2, "model");
    click(w, m);
    assert.equal(menu(w).parentElement, d, "modal dialog 内挂进 dialog，不挂 body");

    m.replaceChildren(new w.Option("X", "x"), new w.Option("Y", "y"));
    m.value = "x";
    w.picker.sync(m);
    assert.deepEqual(opts(w).map((o) => [o.dataset.value, o.textContent]), [["x", "X"], ["y", "Y"]]);
    assert.equal(opts(w)[0].getAttribute("aria-checked"), "true", "外部改值后选中态刷新");

    m.disabled = true;
    await tick(); // MutationObserver 微任务
    assert.equal(menu(w), null, "禁用即收起");
    click(w, m);
    assert.equal(menu(w), null, "禁用不可打开");
    m.disabled = false;

    w.picker.sync(w.document.createElement("select")); // 未增强：安全跳过
    w.picker.syncAll();

    const m3 = w.document.createElement("select"); // settings 动态 select：enhance 时未挂 DOM
    m3.title = "模型3";
    m3.append(new w.Option("P", "p"), new w.Option("Q", "q"));
    w.picker.enhance(m3, "model");
    w.picker.syncAll(); // seen=false：不得误删
    click(w, m3);
    assert.ok(menu(w), "未挂 DOM 的 enhance 不被 syncAll 清掉");
    key(w, opts(w)[0], "Escape");

    w.document.body.append(m3);
    w.picker.sync(m3); // seen=true
    m3.remove();
    w.picker.syncAll(); // 曾挂载后断连：清理跟踪
    m3.title = "改过";
    w.picker.sync(m3);
    click(w, m3);
    assert.equal(menu(w).getAttribute("aria-label"), "模型3", "清理后 sync 不再作用（防止泄漏跟踪）");

    click(w, m); // dialog 内再开
    assert.ok(menu(w));
    d.dispatchEvent(new w.Event("close")); // 宿主 dialog 关闭（close 不冒泡，捕获接）
    assert.equal(menu(w), null, "宿主 dialog 关闭即收起");
    assert.equal(m.getAttribute("aria-expanded"), "false");
  } finally { dom.window.close(); }
});
