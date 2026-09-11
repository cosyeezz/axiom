// public/text-contrast.js — 中文文字对比度调节：头部按钮 + 原生 popover + range（100–150% 离散档位）。
// 无依赖、无 inline style/handler（兼容 CSP default-src 'self'）；档位样式见 text-contrast.css。
//
// 集成（主代理）：
//   app.js：import { initTextContrast } from "./text-contrast.js"; 并在 DOM 就绪后调用一次；
//   index.html：<link rel="stylesheet" href="/text-contrast.css">；
//   src/server.js assets 表：["/text-contrast.js", "public/text-contrast.js"],
//                            ["/text-contrast.css", "public/text-contrast.css", "text/css"]。

const KEY = "axiom.textContrast";
const MIN = 100;
const MAX = 150;
const STEP = 10;
const DEFAULT = 100;

// 非法输入（NaN/越界/非整档）钳到最近合法档位；完全无效回默认。
export function clampLevel(raw) {
  const n = Math.round(Number(raw) / STEP) * STEP;
  if (!Number.isFinite(n)) return DEFAULT;
  return Math.min(MAX, Math.max(MIN, n));
}

export function readStoredLevel(storage) {
  try {
    storage ??= globalThis.localStorage;
    const raw = storage?.getItem(KEY);
    return raw == null || raw === "" ? DEFAULT : clampLevel(raw);
  } catch {
    return DEFAULT; // 隐私模式等存储不可用：回默认，不影响预览
  }
}

// 100% 为默认值，不落盘（removeItem），其余档位存字符串。
export function storeLevel(level, storage) {
  try {
    storage ??= globalThis.localStorage;
    if (level === DEFAULT) storage?.removeItem(KEY);
    else storage?.setItem(KEY, String(level));
  } catch { /* 预览仍生效，仅不持久化 */ }
}

export function applyLevel(doc, level) {
  if (level === DEFAULT) delete doc.documentElement.dataset.textContrast;
  else doc.documentElement.dataset.textContrast = String(level);
}

export function initTextContrast(doc = document, storage) {
  if (doc.getElementById("text-contrast-button")) return; // 幂等
  const host = doc.querySelector(".service-controls");
  if (!host) return; // 宿主缺失（如结构变动）时静默退出

  const button = doc.createElement("button");
  button.type = "button";
  button.id = "text-contrast-button";
  button.className = "icon-button";
  button.textContent = "A";
  button.title = "文字对比度";
  button.setAttribute("aria-label", "文字对比度设置");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("popovertarget", "text-contrast-popover"); // 原生开关，无需 JS

  const popover = doc.createElement("div");
  popover.id = "text-contrast-popover";
  popover.setAttribute("popover", "");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "文字对比度");

  const label = doc.createElement("label");
  label.setAttribute("for", "text-contrast-range");
  label.append("文字对比度 ");
  const output = doc.createElement("output");
  output.id = "text-contrast-value";
  label.append(output);

  const range = doc.createElement("input");
  range.type = "range";
  range.id = "text-contrast-range";
  range.min = String(MIN);
  range.max = String(MAX);
  range.step = String(STEP);
  range.setAttribute("aria-label", "文字对比度百分比");

  const reset = doc.createElement("button");
  reset.type = "button";
  reset.id = "text-contrast-reset";
  reset.textContent = "重置为 100%";

  popover.append(label, range, reset);
  host.append(button, popover);

  const sync = (level) => {
    applyLevel(doc, level);
    range.value = String(level);
    output.value = `${level}%`;
    range.setAttribute("aria-valuetext", `${level}%`);
    reset.disabled = level === DEFAULT;
  };

  let level = readStoredLevel(storage);
  sync(level);

  range.addEventListener("input", () => {
    level = clampLevel(range.value);
    sync(level);
    storeLevel(level, storage);
  });
  reset.addEventListener("click", () => {
    level = DEFAULT;
    sync(level);
    storeLevel(level, storage);
  });
}
