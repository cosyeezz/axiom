// public/tooltip.js — 统一自定义悬浮提示：无依赖，事件委托接管全站原生 title。
// 集成（主代理负责接线）：
//   1. app.js 顶部 `import "./tooltip.js";`
//   2. index.html `<link rel="stylesheet" href="/tooltip.css" />`
//   3. src/server.js assets 增加 ["/tooltip.js", "public/tooltip.js"] 与 ["/tooltip.css", "public/tooltip.css", "text/css"]
// 行为：悬停/键盘聚焦带 title 的元素 → 先摘除 title（原生提示永不出现）再自绘提示；
//       离开/Esc/滚动/resize/按下鼠标 后恢复原 title 与 aria-describedby；空标题不展示；
//       关闭时指针/焦点仍在元素上（如滚轮关闭）则暂缓恢复，真正离开才恢复，避免原生提示突现。
//       触摸设备完全不干预，保留原生长按提示；顶层 <dialog> 内同样可见
//       （Popover API 优先——本仓库已在用 popovertarget，无该 API 时退化为挂入打开的 dialog）。
// CSP：策略不放宽、不写 inline style，也不新建 <style>（空 style 元素同样被 CSP 拦截）——
//       动态 left/top 通过 CSSOM insertRule 写入页面已有的外部 tooltip.css stylesheet，按需查找。

const SHOW_DELAY = 500; // 悬停意图延迟，接近原生节奏
const HIDE_DELAY = 100; // 留出把指针移入提示内容的间隙
const GAP = 8; // 提示与目标的间距
const EDGE = 8; // 视口安全边距

const meta = new WeakMap(); // 元素 -> { title, described, named }
let current = null; // 正在展示提示的元素
let deferred = null; // 关闭时指针/焦点仍在其上的元素，离开时再恢复
let popped = false; // 提示当前是否在 top layer（Popover API）
let showTimer = 0;
let hideTimer = 0;

const tip = document.createElement("div");
tip.id = "ax-tooltip";
tip.setAttribute("role", "tooltip");
if (typeof tip.showPopover === "function") tip.setAttribute("popover", "manual");
document.body.append(tip);

let pos = null; // tooltip.css stylesheet 里追加规则 #ax-tooltip{left;top} 的 style 对象
function cssPos() {
  if (pos) return pos;
  const sheets = document.styleSheets; // 按需取：link 样式表可能晚于本模块就绪
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    const href = s.href || (s.ownerNode && s.ownerNode.getAttribute && s.ownerNode.getAttribute("href")) || "";
    if (!/tooltip\.css/.test(href)) continue;
    try {
      s.insertRule("#ax-tooltip{}", s.cssRules.length); // 追加到末尾，同特异性下靠后级联覆盖 left:0/top:0
      pos = s.cssRules[s.cssRules.length - 1].style;
    } catch {} // ponytail: 跨域 stylesheet 写不进则退化为不定位；本仓库同源不会发生
    break;
  }
  return pos;
}

function hot(el) {
  if (el === document.activeElement) return true;
  try {
    return el.matches(":hover");
  } catch {
    return false; // 个别实现不认 :hover
  }
}

function lookup(target) {
  for (let n = target; n && n.nodeType === 1; n = n.parentElement) {
    if (n.hasAttribute("title")) {
      const text = n.getAttribute("title");
      return text && text.trim() ? n : null; // 空标题：与原生一致，不展示也不冒泡
    }
  }
  return null;
}

function restore(el) {
  const m = meta.get(el);
  if (!m) return;
  meta.delete(el);
  if (!el.hasAttribute("title")) el.setAttribute("title", m.title); // 期间被改写的新 title 不覆盖
  const d = el.getAttribute("aria-describedby");
  if (d === "ax-tooltip") el.removeAttribute("aria-describedby");
  else if (m.described && d === `${m.described} ax-tooltip`) el.setAttribute("aria-describedby", m.described);
  if (m.named && el.getAttribute("aria-label") === m.title) el.removeAttribute("aria-label");
}

function mount() {
  if (typeof tip.showPopover === "function") {
    if (!tip.isConnected) document.body.append(tip); // reveal 前 hide 曾摘除节点：断连元素 showPopover 会抛错
    if (!popped) tip.showPopover(); // top layer：盖过打开的原生 <dialog>
    popped = true;
    return;
  }
  const dlg = current.closest("dialog[open]");
  (dlg || document.body).append(tip); // 无 Popover API：挂进打开的 dialog 才能盖过顶层
  popped = false;
}

function unmount() {
  if (popped) tip.hidePopover();
  else tip.remove();
  popped = false;
}

function position(el) {
  const p = cssPos();
  if (!p) return;
  const r = el.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const x = Math.max(EDGE, Math.min(r.left + (r.width - t.width) / 2, vw - t.width - EDGE));
  let y = r.bottom + GAP; // 默认目标下方
  if (y + t.height > vh - EDGE) y = r.top - GAP - t.height >= EDGE ? r.top - GAP - t.height : vh - t.height - EDGE;
  p.left = `${Math.round(x)}px`;
  p.top = `${Math.round(y)}px`;
}

function showFor(el, delay = SHOW_DELAY) {
  const text = el.getAttribute("title");
  if (!text || !text.trim()) return;
  hide(true);
  const m = { title: text, described: el.getAttribute("aria-describedby") };
  // 图标按钮等无文字元素的名称来自 title，摘除前用 aria-label 保住可访问名称
  if (!el.textContent.trim() && !el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) {
    el.setAttribute("aria-label", text);
    m.named = true;
  }
  el.removeAttribute("title"); // 摘在原生提示出现之前，之后不会再弹
  meta.set(el, m);
  const d = m.described;
  el.setAttribute("aria-describedby", d && !d.split(/\s+/).includes("ax-tooltip") ? `${d} ax-tooltip` : "ax-tooltip");
  tip.textContent = text; // 纯文本，title 原文完整展示
  current = el;
  const reveal = () => {
    mount();
    position(el);
    tip.classList.add("ax-show");
  };
  if (delay > 0) showTimer = setTimeout(() => { showTimer = 0; reveal(); }, delay);
  else reveal();
}

function cancelHide() {
  clearTimeout(hideTimer);
  hideTimer = 0;
}

function finish(el) {
  if (current === el) current = null; // 关闭落定才解绑：跨 gap 期间保留，取消关闭才有效
  tip.classList.remove("ax-show");
  if (hot(el)) {
    if (deferred && deferred !== el) restore(deferred);
    deferred = el; // 指针/焦点仍在元素上：暂缓恢复，防止原生提示突然出现
  } else restore(el);
  if (!current) unmount();
}

function hide(immediate) {
  clearTimeout(showTimer);
  showTimer = 0;
  const el = current;
  if (!el) return;
  if (!immediate) {
    if (hideTimer) return; // 已在关闭倒计时，不重复起表
    hideTimer = setTimeout(() => {
      hideTimer = 0;
      finish(el);
    }, HIDE_DELAY);
    return;
  }
  cancelHide();
  finish(el);
}

// ---------- 事件委托（覆盖静态与动态节点） ----------

document.addEventListener("pointerover", (e) => {
  if (e.pointerType === "touch") return; // 触摸不打扰：保留原生长按提示
  if (tip.contains(e.target)) {
    cancelHide(); // 移入提示内容：取消关闭（含跨 gap 挂起中）
    return;
  }
  const el = lookup(e.target);
  if (el === current) {
    cancelHide(); // 目标内部移动或关闭倒计时中抖回
    return;
  }
  if (el) showFor(el);
});

document.addEventListener("pointerout", (e) => {
  if (e.pointerType === "touch") return;
  const gone = e.relatedTarget;
  if (deferred && !deferred.contains(gone)) {
    restore(deferred);
    deferred = null;
  }
  if (tip.contains(e.target)) {
    if (!tip.contains(gone)) hide(false); // 离开提示内容
    return;
  }
  if (!current || !current.contains(e.target) || current.contains(gone) || tip.contains(gone)) return;
  hide(false);
});

document.addEventListener("focusin", (e) => {
  const el = lookup(e.target);
  if (!el || el === current) return;
  showFor(el, 0); // 键盘聚焦立即显示
});

document.addEventListener("focusout", (e) => {
  if (deferred && !deferred.contains(e.relatedTarget)) {
    restore(deferred);
    deferred = null;
  }
  if (current && current.contains(e.target) && !current.contains(e.relatedTarget)) hide(true);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hide(true);
});

document.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") hide(true); // 与原生一致：按下即收起
});

addEventListener("scroll", (e) => {
  if (!tip.contains(e.target)) hide(true); // 提示内容自身滚动不关闭
}, true); // 捕获：任何容器内滚动都关闭
addEventListener("resize", () => hide(true));
