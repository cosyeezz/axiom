// public/model-picker.js — 原生 select 收藏增强（无依赖，主入口接线）。
// 用法：
//   import { createModelPicker } from "./model-picker.js";
//   const picker = createModelPicker({
//     getFavorites: () => ({ provider: [], model: [], thinking: [] }), // 同步返回各 kind 收藏 value 数组，每次渲染读取
//     onToggle: async (kind, key, favorite) => { ... },                // 星标切换后回调（favorite 为新状态），保存由这里负责；
//                                                                      //   建议先同步更新自家 store 再异步持久化，
//                                                                      //   同步抛错/异步 reject 都进 onError
//     onError: (err) => showFeedback(err),                             // 缺省 console.error
//   });
//   picker.enhance($("provider"), "provider");  // kind: provider | model | thinking，同 kind 共享收藏
//   picker.enhance($("model"), "model");        // （composer、subagent、createAgentPicker、compaction 同理）
//   options(...) 末尾 picker.sync(select)；controls() 末尾 picker.syncAll()。
// 触发器就是原生 select：不新增箭头（.selectors label::after 原样复用）、不占布局，宽度/禁用等规则全部沿用。
// 行为：拦截原生下拉，点击/Enter/↑↓ 打开自绘菜单；select 的 value/onchange 行为不变
//       （选中经 select.value + change 事件回流）；星标只切收藏，点击不选中不关闭；
//       收藏稳定置顶（仅菜单内排序，不改 select 顺序与选中值）；
//       键盘 ↑↓Home/End 移动、Tab 到星、Enter/Space 经原生 button 激活选中、Esc 关闭、字符查找；
//       禁用实时禁开/收起（MutationObserver 监听 disabled 反射）。
// CSP：无 inline style；动态 left/top 经 CSSOM 写入外部 model-picker.css（同 tooltip.js）；
//       有 Popover API 时菜单进 top layer（<dialog> 内不裁切），否则回退挂入打开的 dialog 或 body。

const GAP = 6;
const EDGE = 8;
const TYPEAHEAD_MS = 500;

// ---------- 微型 DOM 辅助（全部 textContent/setAttribute，绝不 innerHTML） ----------

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids) n.append(kid);
  return n;
}

export function createModelPicker({ getFavorites, onToggle, onError } = {}) {
  const meta = new WeakMap(); // select -> 状态
  const all = new Set(); // 已增强的 select，syncAll 用
  let opened = null; // 当前打开的菜单状态
  let counter = 0;

  const fail = (err) => (onError ? onError(err) : console.error(err));
  const favSet = (kind) => new Set(getFavorites?.()?.[kind] ?? []); // 每次渲染现读：后端数据到达即生效

  function labelOf(select) {
    return select.getAttribute("aria-label") || select.getAttribute("title") || "选项";
  }

  // ---------- 对外接口 ----------

  function enhance(select, kind) {
    if (meta.has(select)) return; // 幂等
    const menu = el("div", {
      id: `ax-mp-${++counter}`, class: "ax-mp-menu", role: "menu", "aria-label": labelOf(select),
    });
    if (typeof menu.showPopover === "function") menu.setAttribute("popover", "manual");
    const state = { select, kind, menu, open: false, popped: false, pos: null, typeahead: "", timer: 0, seen: select.isConnected };
    meta.set(select, state);
    all.add(select);

    select.setAttribute("aria-haspopup", "menu");
    select.setAttribute("aria-expanded", "false");
    select.addEventListener("mousedown", (e) => e.preventDefault()); // 拦掉原生下拉面板
    select.addEventListener("click", () => (state.open ? close(state, false) : open(state)));
    select.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault(); // 原生方向键会直接改值；值只经菜单改动
      open(state);
    });
    menu.addEventListener("keydown", (e) => onMenuKey(state, e));
    // 被禁用时立即收起：app 经 .disabled 属性切换，反射成 attribute 才能被观察到
    new MutationObserver(() => { if (select.disabled && state.open) close(state, false); })
      .observe(select, { attributes: true, attributeFilter: ["disabled"] });
  }

  function sync(select) {
    const state = meta.get(select);
    if (!state) return; // 未增强的 select（如 queue-type）安全跳过
    if (select.isConnected) state.seen = true;
    else if (state.seen) {
      // 曾挂载后断连：settings 重建丢弃的旧 select，摘除跟踪防泄漏
      // （enhance 时暂未挂 DOM 的 seen=false，不误删）
      if (state.open) close(state, false);
      all.delete(select);
      meta.delete(select);
      return;
    }
    state.menu.setAttribute("aria-label", labelOf(select));
    if (state.open) rerender(state);
  }

  function syncAll() {
    for (const select of [...all]) sync(select);
  }

  // ---------- 开关与渲染 ----------

  function open(state) {
    const { select } = state;
    if (select.disabled) return;
    if (opened && opened !== state) close(opened, false);
    render(state);
    mount(state);
    position(state);
    state.open = true;
    state.typeahead = "";
    select.setAttribute("aria-expanded", "true");
    opened = state;
    if (!focusValue(state, select.value, false)) state.menu.querySelector(".ax-mp-opt")?.focus();
  }

  function close(state, refocus) {
    if (!state.open) return;
    state.open = false;
    if (opened === state) opened = null;
    clearTimeout(state.timer);
    state.select.setAttribute("aria-expanded", "false");
    if (state.popped) state.menu.hidePopover();
    else state.menu.remove();
    state.popped = false;
    if (refocus) state.select.focus();
  }

  function mount(state) {
    // 先挂宿主：modal <dialog> 外的元素可能 inert；挂进打开的 dialog 再 showPopover 进 top layer
    const dlg = state.select.closest("dialog[open]");
    (dlg || document.body).append(state.menu);
    if (typeof state.menu.showPopover === "function") {
      state.menu.showPopover(); // top layer：盖过打开的 <dialog>
      state.popped = true;
    }
  }

  function render(state, favOverride) {
    const { select, menu } = state;
    const fav = favOverride ?? favSet(state.kind); // toggle 传入乐观集，避免 onToggle 微任务未落地时被旧数据盖掉
    const opts = [...select.options]
      .filter((o) => !o.disabled)
      .sort((a, b) => Number(fav.has(b.value)) - Number(fav.has(a.value))); // 稳定排序：收藏置顶，组内保持原序
    menu.replaceChildren(...opts.map((o) => entry(state, o, fav.has(o.value))));
  }

  function entry(state, opt, faved) {
    const pick = el("button", {
      type: "button", class: "ax-mp-opt", role: "menuitemradio", tabindex: "-1",
      "aria-checked": String(state.select.value === opt.value), "data-value": opt.value,
    }, opt.text);
    pick.addEventListener("click", () => choose(state, opt.value));
    if (!opt.value) return el("div", { role: "none", class: "ax-mp-entry" }, pick); // 空 value 占位（如“默认主代理模型”）不提供收藏
    const star = el("button", {
      type: "button", class: "ax-mp-star", role: "menuitemcheckbox", tabindex: "-1",
      "aria-checked": String(faved), "aria-label": `${faved ? "取消收藏" : "收藏"}：${opt.text}`,
      "data-value": opt.value,
    }, faved ? "★" : "☆");
    pick.addEventListener("click", () => choose(state, opt.value));
    star.addEventListener("click", () => toggle(state, opt.value));
    return el("div", { role: "none", class: "ax-mp-entry" }, pick, star); // role=none 包装：menu 合法子结构，星与选项平级不嵌套
  }

  function rerender(state) { // options/收藏/值外部变化后的原地刷新，焦点跟住原项
    if (state.select.disabled) return close(state, false);
    const at = document.activeElement;
    const value = at?.dataset?.value;
    render(state);
    position(state);
    if (value != null) focusValue(state, value, at.classList.contains("ax-mp-star"));
  }

  function choose(state, value) {
    const { select } = state;
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true })); // 与原生 onchange 行为一致
    }
    close(state, true);
  }

  function toggle(state, value) {
    const fav = favSet(state.kind);
    const favorite = !fav.has(value);
    favorite ? fav.add(value) : fav.delete(value); // 乐观更新仅为本菜单重排；持久状态以主入口 store 为准
    const starWas = document.activeElement?.classList?.contains("ax-mp-star"); // render 会移除焦点元素，先取后用
    Promise.resolve().then(() => onToggle?.(state.kind, value, favorite)).catch(fail);
    render(state, fav); // 置顶重排只发生在菜单里，select 顺序与选中值不动
    focusValue(state, value, starWas);
  }

  function focusValue(state, value, star) {
    const hit = [...state.menu.querySelectorAll(star ? ".ax-mp-star" : ".ax-mp-opt")]
      .find((n) => n.dataset.value === value);
    hit?.focus();
    return Boolean(hit);
  }

  // ---------- 菜单键盘 ----------

  function onMenuKey(state, e) {
    const { menu } = state;
    if (e.key === "Escape") {
      e.preventDefault(); // 只关菜单，不让宿主 <dialog> 跟着关
      e.stopPropagation();
      return close(state, true);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey || e.target.classList.contains("ax-mp-star")) return close(state, true);
      const star = e.target.closest(".ax-mp-entry")?.querySelector(".ax-mp-star");
      return star ? star.focus() : close(state, true); // 无星项（空 value 占位）：Tab 直接退出
    }
    const opts = [...menu.querySelectorAll(".ax-mp-opt")];
    const cur = e.target.closest(".ax-mp-entry");
    const i = cur ? opts.indexOf(cur.querySelector(".ax-mp-opt")) : -1;
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: opts.length - 1 }[e.key];
    if (to != null) {
      e.preventDefault();
      opts[Math.max(0, Math.min(to, opts.length - 1))]?.focus();
      return;
    }
    if (e.key.length === 1 && e.key.trim() && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 输入查找。排除 Space：按钮 Space 激活依赖 keydown 默认行为，preventDefault 会杀掉选/收藏
      e.preventDefault();
      clearTimeout(state.timer);
      state.typeahead += e.key.toLowerCase();
      state.timer = setTimeout(() => (state.typeahead = ""), TYPEAHEAD_MS);
      opts.find((o) => o.textContent.toLowerCase().startsWith(state.typeahead))?.focus();
    }
  }

  // ---------- 定位（CSSOM，CSP 禁 inline style） ----------

  function position(state) {
    const p = cssPos(state);
    if (!p) return;
    const r = state.select.getBoundingClientRect();
    const t = state.menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const x = Math.max(EDGE, Math.min(r.left, vw - t.width - EDGE));
    let y = r.bottom + GAP; // 默认目标下方
    if (y + t.height > vh - EDGE) y = r.top - GAP - t.height >= EDGE ? r.top - GAP - t.height : Math.max(EDGE, vh - t.height - EDGE);
    p.left = `${Math.round(x)}px`;
    p.top = `${Math.round(y)}px`;
  }

  function cssPos(state) {
    if (state.pos) return state.pos;
    const sheets = document.styleSheets; // 按需取：link 样式表可能晚于本模块就绪
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i];
      const href = s.href || (s.ownerNode && s.ownerNode.getAttribute && s.ownerNode.getAttribute("href")) || "";
      if (!/model-picker\.css/.test(href)) continue;
      try {
        s.insertRule(`#${state.menu.id}{}`, s.cssRules.length); // 追加到末尾，覆盖 left:0/top:0
        state.pos = s.cssRules[s.cssRules.length - 1].style;
      } catch {} // ponytail: 跨域 stylesheet 写不进则退化为不定位；本仓库同源不会发生
      break;
    }
    return state.pos;
  }

  // ---------- 全局收尾（外点关闭 / Esc / 滚动缩放） ----------

  document.addEventListener("pointerdown", (e) => {
    if (!opened || opened.menu.contains(e.target) || e.target === opened.select) return;
    close(opened, false);
  });
  document.addEventListener("keydown", (e) => {
    if (opened && e.key === "Escape") { e.preventDefault(); close(opened, true); } // 焦点在菜单内时已被上面拦截，此处兜底
  });
  addEventListener("scroll", (e) => {
    if (opened && !opened.menu.contains(e.target)) close(opened, false); // 菜单自身滚动不关闭
  }, true);
  addEventListener("resize", () => opened && close(opened, false));
  document.addEventListener("close", (e) => { // 宿主 dialog 关闭时收起挂在里面的菜单（close 不冒泡，捕获接）
    if (opened && opened.menu.parentElement === e.target) close(opened, false);
  }, true);

  return { enhance, sync, syncAll };
}
