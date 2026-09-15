// Goal 完成标记：<axiom_round_finished> / <axiom_goal_finished>。
// 解析与剥离前后端共用这一份实现：后端 src/goal.js 用它判定轮次推进、生成轮次小结；前端
// public/app.js 用它做展示剥离（用户不该看到协议标记原文）。原先剥离只写在后端，标记会原样
// 渲染进对话；两侧各写一套正则正是第 5 轮 X2 的教训，这里从一开始就共用。
// 代码区（围栏、缩进代码块、行内代码）内的标记一律是在举例，不是信号，判定口径与 memory-tags、
// answer-tags 共用 public/markdown-scan.js。
import { cutSpans, maskCode } from "./markdown-scan.js";

export const ROUND_MARKER = "<axiom_round_finished>";
export const GOAL_MARKER = "<axiom_goal_finished>";
// 展示层要清掉的标记原文：开启与闭合两种写法都算（模型常自作主张补上闭合标签）。大小写不敏感——
// 大写变体不是有效信号，但同样是协议残留，不该漏进展示文本。
const MARKER_TOKENS = new RegExp([ROUND_MARKER, GOAL_MARKER].map((mark) => `</?${mark.slice(1)}`).join("|"), "gi");
// 流式：末行正在输入的标记前缀（"<axiom_rou" 等）先藏起来，避免半截标记闪现。
const SUFFIXES = [ROUND_MARKER, GOAL_MARKER].flatMap((mark) => [mark, `</${mark.slice(1)}`]);

// 协议标记只认「代码区外、缩进不超过 3 空格」的行：写在围栏、缩进代码块或行内代码里的标记是在
// 举例，不是信号；4 空格/Tab 起头的缩进代码、引用与列表内容同样不算独立信号。
function signalLines(text) {
  const lines = [];
  let at = 0;
  for (const line of maskCode(text).split("\n")) {
    if (/^ {0,3}\S/.test(line)) lines.push({ line, start: at });
    at += line.length + 1;
  }
  return lines;
}

// 严格解析完成标记：整行独占、精确小写、无闭合标签、无内文；代码区内不算。
export function parseGoalMarkers(text) {
  const found = { roundFinished: false, goalFinished: false };
  if (typeof text !== "string" || !text) return found;
  for (const { line } of signalLines(text)) {
    const marker = line.trim();
    if (marker === ROUND_MARKER) found.roundFinished = true;
    else if (marker === GOAL_MARKER) found.goalFinished = true;
  }
  return found;
}

// 展示用：删掉代码区外的标记原文（含模型补的闭合标签、空标签对），删完整行只剩空白就丢掉该行。
// 「不认作信号」与「要清掉原文」是两件事：空标签对不算完成信号（不放宽防伪造口径），但也不能
// 让 <axiom_round_finished></axiom_round_finished> 这种残留漏进展示文本与轮次小结。
// streaming=true 时另外隐藏行尾正在输入的标记残片。
export function stripGoalMarkers(text, { streaming = false } = {}) {
  if (typeof text !== "string" || !text) return text;
  const spans = [];
  for (const { line, start } of signalLines(text))
    for (const hit of line.matchAll(MARKER_TOKENS)) spans.push([start + hit.index, start + hit.index + hit[0].length]);
  if (streaming) {
    const masked = maskCode(text);
    const max = Math.max(...SUFFIXES.map((token) => token.length));
    for (let len = 1; len <= Math.min(max, masked.length); len++) {
      const suffix = masked.slice(-len).toLowerCase();
      if (SUFFIXES.some((token) => token.startsWith(suffix))) { spans.push([masked.length - len, masked.length]); break; }
    }
  }
  return cutSpans(text, spans);
}
