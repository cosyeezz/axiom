import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { publicSource } from "./helpers/public-source.js";

const source = await publicSource("model-picker");
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
  // 观察器记账：disconnect 后从 w.observers 移除，用来验证释放是否完整
  const NativeObserver = w.MutationObserver;
  w.observers = [];
  w.MutationObserver = class extends NativeObserver {
    constructor(cb) { super(cb); w.observers.push(this); }
    disconnect() { w.observers.splice(w.observers.indexOf(this), 1); super.disconnect(); }
  };
  if (hooks.sheets) { // jsdom 不加载外部样式表：注入 model-picker.css 的假 sheet（同 tooltip.test.js）
    w.sheet = {
      href: "/model-picker.css",
      cssRules: [],
      insertRule(rule, index = this.cssRules.length) { this.cssRules.splice(index, 0, { cssText: rule, style: {} }); return index; },
      deleteRule(index) { this.cssRules.splice(index, 1); },
    };
    Object.defineProperty(w.document, "styleSheets", { value: [w.sheet], configurable: true });
  }
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
  w.favKey = hooks.favKey;
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
    assert.equal(stars(w)[0].querySelector("svg").dataset.icon, "star");
    assert.equal(stars(w)[0].getAttribute("aria-checked"), "true");

    stars(w)[0].focus(); // 模拟键盘到达星标（jsdom 不会因 click 聚焦）
    click(w, stars(w)[0]); // 取消收藏 c
    assert.ok(menu(w), "点星不关闭");
    assert.equal(select.value, "a", "点星不改选中");
    assert.equal(select.getAttribute("aria-expanded"), "true");
    assert.equal(w.document.activeElement.dataset.value, "c", "焦点跟住原星");
    assert.equal(w.document.activeElement.classList.contains("ax-mp-star"), true);
    assert.equal(w.document.activeElement.getAttribute("aria-checked"), "false");
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

test("favKey 映射：星标按持久化键匹配、onToggle 上报映射键、无键项无星", async () => {
  const { dom, w } = boot(SELECT, { model: ["prov/c"] }, {
    favKey: (kind, value) => (kind === "model" ? `prov/${value}` : value),
  });
  try {
    const select = $(w, "model");
    w.picker.enhance(select, "model");
    click(w, select);
    assert.deepEqual(opts(w).map((o) => o.dataset.value), ["c", "a", "b", ""], "映射键命中置顶");
    assert.equal(stars(w)[0].getAttribute("aria-checked"), "true", "存储键 prov/c 经映射回亮星");
    stars(w)[1].focus(); // a 行
    click(w, stars(w)[1]);
    await tick();
    assert.deepEqual(w.toggled.map((t) => [...t]), [["model", "prov/a", true]], "上报持久化键而非展示值");
    assert.deepEqual(w.favData.model, ["prov/c", "prov/a"]);

    const bare = boot(SELECT, {}, { favKey: () => "" }); // favKey 返回空串：全部无星不可收藏
    try {
      bare.w.picker.enhance(bare.w.document.getElementById("model"), "model");
      click(bare.w, bare.w.document.getElementById("model"));
      assert.equal(stars(bare.w).length, 0, "无收藏键的选项不提供星标");
    } finally { bare.dom.window.close(); }
  } finally { dom.window.close(); }
});

test("快速连点：乐观集交替上报，请求按序落地后与最后一次一致", async () => {
  const gates = [];
  const { dom, w } = boot(SELECT, {}, {
    onToggle: (kind, key, favorite) => new Promise((res) => {
      w.toggled.push([kind, key, favorite]);
      const list = w.favData[kind] ?? [];
      w.favData[kind] = favorite ? [...list, key] : list.filter((v) => v !== key); // 模拟主入口同步更 store
      gates.push(res);
    }),
  });
  try {
    const select = $(w, "model");
    w.picker.enhance(select, "model");
    click(w, select);
    const starOf = (v) => stars(w).find((s) => s.dataset.value === v);
    click(w, starOf("c")); // 收藏 c
    click(w, starOf("c")); // 第一个请求未落地时连点：基于乐观集而非陈旧 store
    await tick(); // 串行链：只有第一个请求已上报
    assert.deepEqual(w.toggled.map((t) => [...t]), [["model", "c", true]], "收藏先上报；陈旧 store 会误报两次 true");
    gates[0](); // 第一个请求落地后才发第二个，且 favorite 基于点击时的乐观集
    await tick();
    assert.deepEqual(w.toggled.map((t) => [...t]), [["model", "c", true], ["model", "c", false]], "按序上报交替状态");
    gates[1]();
    await tick();
    assert.equal(starOf("c").getAttribute("aria-checked"), "false", "落地后与最后一次请求一致");
    assert.deepEqual(w.favData.model, []);
  } finally { dom.window.close(); }
});

test("持久化失败：onError 一次、星标回落真实状态、可重试", async () => {
  let calls = 0;
  const { dom, w } = boot(SELECT, {}, {
    onToggle: async (kind, key, favorite) => {
      calls++;
      if (calls === 1) throw new Error("persist down");
      const list = w.favData[kind] ?? [];
      w.favData[kind] = favorite ? [...list, key] : list.filter((v) => v !== key);
    },
  });
  try {
    const select = $(w, "model");
    w.picker.enhance(select, "model");
    click(w, select);
    click(w, stars(w)[0]); // a：失败
    await tick();
    assert.equal(w.errors.length, 1);
    assert.match(w.errors[0].message, /persist down/);
    assert.equal(stars(w)[0].getAttribute("aria-checked"), "false", "失败后星标回落 store 真实状态");
    click(w, stars(w)[0]); // 重试：成功
    await tick();
    assert.equal(w.errors.length, 1, "失败只报一次");
    assert.equal(stars(w)[0].getAttribute("aria-checked"), "true");
  } finally { dom.window.close(); }
});

test("sync：无实质变化不重建、选中只翻 aria-checked、真变化按稳定键恢复焦点与滚动", async () => {
  const { dom, w } = boot(SELECT, { model: ["c"] });
  try {
    const select = $(w, "model");
    w.picker.enhance(select, "model");
    click(w, select);
    assert.deepEqual(opts(w).map((o) => o.dataset.value), ["c", "a", "b", ""], "c 收藏置顶");
    const head = opts(w)[0], headStar = stars(w)[0];
    headStar.focus();
    menu(w).scrollTop = 90;

    w.picker.sync(select); // app 的 options() 每次重建同名同序 option 也是这种：不得重建菜单
    w.picker.syncAll();
    assert.equal(opts(w)[0], head, "无实质变化不重建选项节点");
    assert.equal(stars(w)[0], headStar, "无实质变化不重建星标节点");
    assert.equal(w.document.activeElement, headStar, "无实质变化不动焦点");
    assert.equal(menu(w).scrollTop, 90, "无实质变化不动滚动");

    select.value = "b"; // 选中变化：就地翻 aria-checked
    w.picker.sync(select);
    assert.equal(opts(w)[0], head, "选中变化不重建");
    assert.deepEqual(
      opts(w).filter((o) => o.getAttribute("aria-checked") === "true").map((o) => o.dataset.value),
      ["b"],
      "选中态就地翻到 b",
    );
    assert.equal(w.document.activeElement, headStar, "局部更新不动焦点");
    assert.equal(menu(w).scrollTop, 90, "局部更新不动滚动");

    opts(w).find((o) => o.dataset.value === "a").textContent = "Alpha 改名"; // 真变化：文本 + 收藏
    w.favData.model = ["b"];
    menu(w).scrollTop = 70;
    w.picker.sync(select);
    assert.notEqual(opts(w)[0], head, "真变化重建节点");
    assert.deepEqual(opts(w).map((o) => o.dataset.value), ["b", "a", "", "c"], "重建后按新收藏置顶");
    assert.equal(w.document.activeElement.dataset.value, "c", "焦点按选项值跟住原星");
    assert.equal(w.document.activeElement.classList.contains("ax-mp-star"), true);
    assert.equal(menu(w).scrollTop, 70, "重建后恢复滚动位置");

    select.replaceChildren(new w.Option("Alpha", "a"), new w.Option("Beta", "b")); // 被聚焦的 c 整项消失
    select.value = "b";
    w.picker.sync(select);
    assert.equal(w.document.activeElement.dataset.value, "b", "原项消失：焦点退回当前选中项");
    assert.equal(w.document.activeElement.classList.contains("ax-mp-opt"), true);
  } finally { dom.window.close(); }
});

test("dispose：实例收尾摘监听/Observer/定时器/定位规则，单 select release 还原原生", async () => {
  const { dom, w } = boot(
    `<select id="m" title="模型">${OPTS}</select><select id="m2" title="模型2">${OPTS}</select>`,
    {}, { sheets: true },
  );
  try {
    const m = $(w, "m"), m2 = $(w, "m2");
    w.picker.enhance(m, "model");
    w.picker.enhance(m2, "model");
    assert.equal(w.observers.length, 2, "每个 select 一个 disabled 观察器");

    const pending = new Set(); // 假定时器：只记账，用来验证 typeahead 定时器被清
    const rawSet = w.setTimeout, rawClear = w.clearTimeout;
    w.setTimeout = (fn, ms) => { const id = rawSet(fn, ms); pending.add(id); return id; };
    w.clearTimeout = (id) => { pending.delete(id); return rawClear(id); };

    click(w, m);
    assert.equal(w.sheet.cssRules.length, 1, "定位规则按实例只插一条");
    assert.match(w.sheet.cssRules[0].cssText, /^\[data-ax-mp="ax-mp-i1"\]/, "规则按实例标记选择菜单");
    assert.match(w.sheet.cssRules[0].style.left, /^\d+px$/, "left 经 CSSOM 写入");
    assert.match(w.sheet.cssRules[0].style.top, /^\d+px$/);
    assert.equal(w.document.querySelectorAll("[style]").length, 0, "CSP：无 inline style");
    key(w, opts(w)[0], "a");
    assert.ok(pending.size >= 1, "字符查找起了 reset 定时器");

    w.picker.dispose(m2); // 单 select 释放
    assert.equal(m2.getAttribute("aria-haspopup"), null, "释放后还原成原生 select");
    click(w, m2);
    assert.equal(menu(w).parentElement, w.document.body, "m2 不再开菜单（当前菜单还是 m 的）");
    assert.equal(w.observers.length, 1, "只断开 m2 的观察器");
    assert.equal(w.sheet.cssRules.length, 1, "实例级定位规则不为单个 select 删除");

    w.picker.dispose(); // 实例收尾
    assert.equal(menu(w), null, "打开的菜单收起");
    assert.equal(m.getAttribute("aria-expanded"), null, "ARIA 属性摘干净");
    assert.equal(w.observers.length, 0, "观察器全断开");
    assert.equal(pending.size, 0, "typeahead 定时器已清");
    assert.equal(w.sheet.cssRules.length, 0, "定位规则随实例删除");
    w.picker.enhance(m, "model"); // 已 dispose 的实例不再接新 select
    click(w, m);
    key(w, m, "ArrowDown");
    assert.equal(menu(w), null, "dispose 后点击/键盘都不再打开菜单");
    assert.equal(w.document.querySelectorAll(".ax-mp-menu").length, 0);
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
    w.picker.syncAll(); // 曾挂载后断连：彻底释放（跟踪/监听/观察器）
    assert.equal(w.observers.length, 2, "被丢弃的 select 不再留着观察器");
    m3.title = "改过";
    w.picker.sync(m3);
    click(w, m3);
    assert.equal(m3.getAttribute("aria-haspopup"), null, "释放后还原成原生 select");
    assert.equal(w.document.querySelectorAll(".ax-mp-menu").length, 0, "释放后点击不再打开菜单（跟踪不复活）");

    click(w, m); // dialog 内再开
    assert.ok(menu(w));
    d.dispatchEvent(new w.Event("close")); // 宿主 dialog 关闭（close 不冒泡，捕获接）
    assert.equal(menu(w), null, "宿主 dialog 关闭即收起");
    assert.equal(m.getAttribute("aria-expanded"), "false");
  } finally { dom.window.close(); }
});
