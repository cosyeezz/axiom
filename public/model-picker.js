import { actionIconNode } from "./icons.js";
// public/model-picker.js — 原生 select 收藏增强（无依赖，主入口接线）。
// 用法：
//   import { createModelPicker } from "./model-picker.js";
//   const picker = createModelPicker({
//     getFavorites: () => ({ provider: [], model: [], thinking: [] }), // 同步返回各 kind 收藏 value 数组，每次渲染读取
//     favKey: (kind, value, select) => key,                            // 可选：option value → 持久化收藏键（返回空串=该项不可收藏）；
//                                                                      //   缺省恒等。存储键与展示值不同时必传（如 thinking 需 provider/model:level）
//     onToggle: async (kind, key, favorite) => { ... },                // 星标切换后回调（favorite 为新状态），保存由这里负责；
//                                                                      //   建议先同步更新自家 store 再异步持久化，
//                                                                      //   同步抛错/异步 reject 都进 onError；快速连点串行按序落地，
//     onError: (err) => showFeedback(err),                             // 缺省 console.error
//   });
//   picker.enhance($("provider"), "provider");  // kind: provider | model | thinking，同 kind 共享收藏
//   picker.enhance($("model"), "model");        // （composer、subagent、createAgentPicker、compaction 同理）
//   options(...) 末尾 picker.sync(select)；仅共享收藏变化调用 picker.syncAll()。
//   picker.dispose(select) 只释放这一个 select（还原成原生 select）；picker.dispose() 收尾整个实例。
// 触发器就是原生 select：不新增箭头（.selectors label::after 原样复用）、不占布局，宽度/禁用等规则全部沿用。
// 行为：拦截原生下拉，点击/Enter/↑↓ 打开自绘菜单；select 的 value/onchange 行为不变
//       （选中经 select.value + change 事件回流）；星标只切收藏，点击不选中不关闭；
//       收藏稳定置顶（仅菜单内排序，不改 select 顺序与选中值）；
//       键盘 ↑↓Home/End 移动、Tab 到星、Enter/Space 经原生 button 激活选中、Esc 关闭、字符查找；
//       禁用实时禁开/收起（MutationObserver 监听 disabled 反射）。
// sync 语义（选项列表被重建是常态，菜单必须扛得住）：选项值/文本与收藏命中都没变 → 一个 DOM 都不动；
//       只有选中值变了 → 就地翻 aria-checked；真有变化才重建，并按选项值（稳定键）恢复焦点与滚动位置。
// CSP：无 inline style；动态 left/top 经 CSSOM 写入外部 model-picker.css（同 tooltip.js）；
//       有 Popover API 时菜单进 top layer（<dialog> 内不裁切），否则回退挂入打开的 dialog 或 body。

const GAP = 6;
const EDGE = 8;
const TYPEAHEAD_MS = 500;
let instanceSeq = 0; // 实例序号：定位规则按实例共享，dispose 时按标记精确删除

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

export function createModelPicker({ getFavorites, onToggle, onError, favKey } = {}) {
  const meta = new WeakMap(); // select -> 状态
  const all = new Set(); // 已增强的 select，syncAll 用
  let opened = null; // 当前打开的菜单状态
  let counter = 0;
  let gone = false; // 实例已 dispose：不再接新 select
  let posRule = null; // 实例共享的定位规则（任一刻只有一个菜单打开）
  const mark = `ax-mp-i${++instanceSeq}`; // 定位规则选择器用的实例标记

  const fail = (err) => (onError ? onError(err) : console.error(err));
  const favSet = (kind) => new Set(getFavorites?.()?.[kind] ?? []); // 每次渲染现读：后端数据到达即生效
  const keyOf = (state, value) => (favKey ? favKey(state.kind, value, state.select) : value); // 展示值 → 收藏键（空串=不可收藏）

  function labelOf(select) {
    return select.getAttribute("aria-label") || select.getAttribute("title") || "选项";
  }

  // ---------- 对外接口 ----------

  function enhance(select, kind) {
    if (gone || meta.has(select)) return; // 幂等；实例已 dispose 则不再接新 select
    const menu = el("div", {
      id: `ax-mp-${++counter}`, class: "ax-mp-menu", role: "menu", "data-ax-mp": mark, "aria-label": labelOf(select),
    });
    if (typeof menu.showPopover === "function") menu.setAttribute("popover", "manual");
    const state = { select, kind, menu, open: false, popped: false, sig: "", value: null, typeahead: "", timer: 0, seen: select.isConnected, pending: null, flight: null };
    // 监听器一律留名存进 state：dispose/断连释放时要能一对一摘干净
    state.onMouseDown = (e) => e.preventDefault(); // 拦掉原生下拉面板
    state.onClick = () => (state.open ? close(state, false) : open(state));
    state.onKeyDown = (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault(); // 原生方向键会直接改值；值只经菜单改动
      open(state);
    };
    state.onMenuKey = (e) => onMenuKey(state, e);
    state.obs = new MutationObserver(() => { if (select.disabled && state.open) close(state, false); });
    meta.set(select, state);
    all.add(select);

    select.setAttribute("aria-haspopup", "menu");
    select.setAttribute("aria-expanded", "false");
    select.addEventListener("mousedown", state.onMouseDown);
    select.addEventListener("click", state.onClick);
    select.addEventListener("keydown", state.onKeyDown);
    menu.addEventListener("keydown", state.onMenuKey);
    // 被禁用时立即收起：app 经 .disabled 属性切换，反射成 attribute 才能被观察到
    state.obs.observe(select, { attributes: true, attributeFilter: ["disabled"] });
  }

  function sync(select) {
    const state = meta.get(select);
    if (!state) return; // 未增强的 select（如 queue-type）安全跳过
    if (select.isConnected) state.seen = true;
    else if (state.seen) return release(select); // 曾挂载后断连：settings 重建丢弃的旧 select，彻底摘除防泄漏
    // （enhance 时暂未挂 DOM 的 seen=false，不误删）
    const label = labelOf(select);
    if (state.menu.getAttribute("aria-label") !== label) state.menu.setAttribute("aria-label", label);
    if (state.open) syncMenu(state);
  }

  function syncAll() {
    for (const select of [...all]) sync(select);
  }

  // 只释放这一个 select（含 Observer/定时器/监听器），还原成原生 select；不动实例共享的定位规则
  function release(select) {
    const state = meta.get(select);
    if (!state) return;
    if (state.open) close(state, false);
    meta.delete(select);
    all.delete(select);
    state.obs.disconnect();
    clearTimeout(state.timer);
    select.removeEventListener("mousedown", state.onMouseDown);
    select.removeEventListener("click", state.onClick);
    select.removeEventListener("keydown", state.onKeyDown);
    state.menu.removeEventListener("keydown", state.onMenuKey);
    state.menu.remove();
    select.removeAttribute("aria-haspopup");
    select.removeAttribute("aria-expanded");
  }

  function dispose(select) {
    if (select) return release(select); // 单 select 释放
    gone = true;
    for (const s of [...all]) release(s);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("keydown", onDocKeyDown);
    removeEventListener("scroll", onScroll, true);
    removeEventListener("resize", onResize);
    document.removeEventListener("close", onDialogClose, true);
    if (posRule) {
      try { posRule.sheet.deleteRule(posRule.index); } catch {} // 规则是本实例插的，跟着实例走
      posRule = null;
    }
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

  // 菜单开着时的原地刷新：无实质变化 → 一个 DOM 都不动（不打断滚动与焦点）
  function syncMenu(state) {
    if (state.select.disabled) return close(state, false);
    const list = rows(state);
    if (sigOf(list) !== state.sig) return render(state, list); // 真变化：重建（内部恢复焦点与滚动）
    if (state.select.value !== state.value) {
      state.value = state.select.value;
      updateChecked(state); // 只有选中值变了：就地翻 aria-checked，不重建
    }
  }

  // 过滤 + 收藏置顶（稳定排序：收藏在前，组内保持原序）。pending=乐观集，避免被陈旧 store 盖掉
  function rows(state, favOverride) {
    const fav = favOverride ?? state.pending ?? favSet(state.kind);
    const list = [];
    for (const option of state.select.options) {
      if (option.disabled) continue;
      const key = keyOf(state, option.value);
      list.push({ value: option.value, text: option.text, starred: Boolean(option.value && key) && fav.has(key) });
    }
    list.sort((a, b) => b.starred - a.starred);
    return list;
  }

  // 渲染签名：值/文本/星标三样齐了才是「实质变化」；选中态不参与（它走局部更新）
  const sigOf = (list) => list.map((r) => `${r.starred ? 1 : 0}\u0000${r.value}\u0000${r.text}`).join("\u0001");

  function render(state, list = rows(state)) {
    const { menu } = state;
    const at = document.activeElement;
    // 只认本菜单内的焦点（菜单外/别的菜单重建时不留残影）；data-value 是恢复用的稳定键
    const keep = at && menu.contains(at) && at.dataset.value !== undefined
      ? { value: at.dataset.value, star: at.classList.contains("ax-mp-star") }
      : null;
    const scroll = menu.isConnected ? menu.scrollTop : 0; // 重建前先记：菜单还挂着才有位置可恢复
    state.sig = sigOf(list);
    state.value = state.select.value;
    menu.replaceChildren(...list.map((row) => entry(state, row)));
    menu.scrollTop = scroll; // 项少了由浏览器钳制
    if (!keep) return;
    // 按选项值（稳定键）恢复焦点：原项没了退回当前选中项，再没了退回首项
    if (!focusValue(state, keep.value, keep.star) && !focusValue(state, keep.value, false)
      && !focusValue(state, state.select.value, false)) menu.querySelector(".ax-mp-opt")?.focus();
  }

  function updateChecked(state) {
    const value = state.select.value;
    for (const pick of state.menu.querySelectorAll(".ax-mp-opt")) pick.setAttribute("aria-checked", String(pick.dataset.value === value));
  }

  function entry(state, row) {
    const pick = el("button", {
      type: "button", class: "ax-mp-opt", role: "menuitemradio", tabindex: "-1",
      "aria-checked": String(state.select.value === row.value), "data-value": row.value,
    }, row.text);
    pick.addEventListener("click", () => choose(state, row.value));
    if (!row.value || !keyOf(state, row.value)) return el("div", { role: "none", class: "ax-mp-entry" }, pick); // 空 value（如“默认主代理模型”）或无收藏键：不提供收藏
    const star = el("button", {
      type: "button", class: "ax-mp-star", role: "menuitemcheckbox", tabindex: "-1",
      "aria-checked": String(row.starred), "aria-label": `${row.starred ? "取消收藏" : "收藏"}：${row.text}`,
      "data-value": row.value,
    }, actionIconNode("star"));
    star.addEventListener("click", () => toggle(state, row.value));
    return el("div", { role: "none", class: "ax-mp-entry" }, pick, star); // role=none 包装：menu 合法子结构，星与选项平级不嵌套
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
    const key = keyOf(state, value);
    if (!key) return;
    const fav = state.pending ?? favSet(state.kind); // 连点基于上次点击的乐观集，而非陈旧 store
    const favorite = !fav.has(key);
    favorite ? fav.add(key) : fav.delete(key);
    state.pending = fav;
    const starWas = document.activeElement?.classList?.contains("ax-mp-star"); // render 会移除焦点元素，先取后用
    const run = Promise.resolve(state.flight).then(() => onToggle?.(state.kind, key, favorite)); // 串行链：请求按点击顺序落地
    const tail = run.then(
      () => settle(state, tail),
      (err) => { fail(err); settle(state, tail); }, // 保存失败：进 onError 并回落真实状态
    );
    state.flight = tail;
    render(state, rows(state, fav)); // 置顶重排只发生在菜单里，select 顺序与选中值不动
    focusValue(state, value, starWas);
  }

  function settle(state, tail) {
    if (state.flight !== tail) return; // 已有更晚点击在飞行：由链尾统一回落
    state.pending = null;
    state.flight = null;
    if (state.open) syncMenu(state); // 菜单开着才对齐 store（状态已被乐观集渲染过则不重建）；已关则下次打开现读
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
    const p = cssPos();
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

  // 每个实例一条规则（同一刻只开一个菜单，菜单按 data-ax-mp 标记共享），dispose 时整条删除；
  // 选择器带上 .ax-mp-menu：比基础规则更具体，外部后加载的样式表也盖不掉坐标
  function cssPos() {
    if (posRule) return posRule.style;
    const sheets = document.styleSheets; // 按需取：link 样式表可能晚于本模块就绪
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i];
      const href = s.href || (s.ownerNode && s.ownerNode.getAttribute && s.ownerNode.getAttribute("href")) || "";
      if (!/model-picker\.css/.test(href)) continue;
      try {
        s.insertRule(`[data-ax-mp="${mark}"].ax-mp-menu{}`, s.cssRules.length); // 追加到末尾，覆盖 left:0/top:0
        posRule = { sheet: s, index: s.cssRules.length - 1, style: s.cssRules[s.cssRules.length - 1].style };
      } catch {} // ponytail: 跨域 stylesheet 写不进则退化为不定位；本仓库同源不会发生
      break;
    }
    return posRule ? posRule.style : null;
  }

  // ---------- 全局收尾（外点关闭 / Esc / 滚动缩放），监听器留名供 dispose 摘除 ----------

  const onPointerDown = (e) => {
    if (!opened || opened.menu.contains(e.target) || e.target === opened.select) return;
    close(opened, false);
  };
  const onDocKeyDown = (e) => {
    if (opened && e.key === "Escape") { e.preventDefault(); close(opened, true); } // 焦点在菜单内时已被上面拦截，此处兜底
  };
  const onScroll = (e) => {
    // 只有触发器的滚动祖先会改变菜单锚点；正文/后台面板的滚动与模型区无关。
    if (opened && (e.target === document || e.target?.contains?.(opened.select))) close(opened, false);
  };
  const onResize = () => opened && close(opened, false);
  const onDialogClose = (e) => { // 宿主 dialog 关闭时收起挂在里面的菜单（close 不冒泡，捕获接）
    if (opened && opened.menu.parentElement === e.target) close(opened, false);
  };

  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onDocKeyDown);
  addEventListener("scroll", onScroll, true);
  addEventListener("resize", onResize);
  document.addEventListener("close", onDialogClose, true);

  return { enhance, sync, syncAll, dispose };
}
