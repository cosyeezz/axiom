// 会话记忆标签：助手在回复开头用 <title> 自报会话标题。
// extractMemoryTags 供后端落库（src/session-memory.js），stripMemoryTags 供展示过滤（前端流式与 result() 去标签）。
// 代码区（围栏、缩进代码块、行内代码）一律不处理：写在代码里的标签是在讨论标签，不是自报标签，
// 判定口径与 answer-tags、goal 共用 public/markdown-scan.js。
import { maskCode, cutSpans, FILL } from "./markdown-scan.js";

// 自报标签只有 title 一个，且只认「回复的第一行」：<title> 同时是常见 HTML 元素，正文里讲页头
// 写法时出现的 <title>示例站点</title> 不是自报，既不能提取（污染会话标题）也不能删（吞掉正文）。
const LIVE = "title";
// axiom_summary/summary/progress 来自已删除的摘要机制，只做展示过滤：旧会话历史里存着这些标签，不剥就会漏进正文。
const DEAD = ["axiom_summary", "summary", "progress"];
const TAGS = [LIVE, ...DEAD];
const NAMES = TAGS.join("|");
// 有界标签，内容可跨行（模型常把开启标签、正文、闭合标签分行写）；内容排除其他标签起点，杜绝贪婪吞并与嵌套。
const TAG = new RegExp(`<(${NAMES})>((?:(?!<(?:/?(?:${NAMES})))[\\s\\S])*?)</\\1>`, "gi");
const OPEN = new RegExp(`<(${NAMES})>`, "gi");
const CLOSE = new RegExp(`</(${NAMES})>`, "gi");
const MARKS = TAGS.flatMap((tag) => [`<${tag}>`, `</${tag}>`]);
export const TITLE_MAX = 10;
// 与真 HTML 元素同名的标签写在这些父元素里就是正经 HTML（<details> 的折叠标题、<head> 的页面标题），不剥。
const PARENT = { summary: "details", title: "head" };
// 已剥离内容的占位符：与 FILL（代码区）分开，反复剥壳时外层才不会把已剥内容误当代码区。
const HOLE = "\u0002";
const hide = (text) => text.replace(/[^\n]/g, HOLE);
// 输入自带这两个控制字符会打乱掩码与下标对齐，入口先去掉（不可见字符，去掉不影响展示）。
const sanitize = (text) => (text.includes(FILL) || text.includes(HOLE) ? text.replaceAll(FILL, "").replaceAll(HOLE, "") : text);

// 回复的第一行（跳过空行与整行代码）的字符区间：自报标题只在这里生效。
function headLine(masked) {
  let at = 0;
  for (const line of masked.split("\n")) {
    if (line.replaceAll(FILL, "").trim()) return [at, at + line.length];
    at += line.length + 1;
  }
  return [0, 0];
}
const inHead = (at, head) => at >= head[0] && at < head[1];
// 标签落在同名 HTML 元素的父元素里（前面有未闭合的 <details>/<head>）
function inParent(masked, name, at) {
  const parent = PARENT[name.toLowerCase()];
  if (!parent) return false;
  const before = masked.slice(0, at);
  const opens = before.match(new RegExp(`<${parent}[\\s>]`, "gi"))?.length ?? 0;
  const closes = before.match(new RegExp(`</${parent}>`, "gi"))?.length ?? 0;
  return opens > closes;
}
// 前面有带属性的同名开启标签 → 落单的闭合标签属于那段真 HTML（<progress value="70"></progress>），不剥。
const attributedOpen = (text, name, at) => new RegExp(`<${name}\\s[^<>]*>`, "i").test(text.slice(0, at));

// 提取模型自报标签，返回 { title? }（缺省键不出现；已删机制的旧标签不提取）。
// 标签内容可跨行（换行折叠为空格）；title 取首个合法值。
export function extractMemoryTags(text) {
  if (typeof text !== "string" || !text) return {};
  const clean = sanitize(text);
  const masked = maskCode(clean);
  const head = headLine(masked);
  for (const match of masked.matchAll(TAG)) {
    const name = match[1].toLowerCase();
    if (name !== LIVE || !inHead(match.index, head) || inParent(masked, name, match.index)) continue;
    const body = clean.slice(match.index + name.length + 2, match.index + match[0].length - name.length - 3);
    const value = body.trim().replace(/\s+/g, " ");
    if (!value || [...value].length > TITLE_MAX) continue;
    return { title: value };
  }
  return {};
}

// 从展示文本去除记忆标签（不改原文）：完整标签连内容删除，落单的开启/闭合标签只删标签本身
// （谈到标签名不该吞掉后文，更不该吞掉别的机制的标记）；整行只剩空白就丢掉该行，不留空档。
// streaming=true 时另外两条：落单开启标签按「正在输入的整块」隐藏到文本末尾，行尾正在输入的
// 标签残片（"<sum"、"</t" 等）也隐藏，避免半截标签闪现。
export function stripMemoryTags(text, { streaming = false } = {}) {
  if (typeof text !== "string" || !text) return text;
  const clean = sanitize(text);
  const masked = maskCode(clean);
  const head = headLine(masked);
  const spans = [];
  // 归属：死标签任何位置都剥，自报标题只在第一行剥；同名真 HTML 的父元素内不剥。
  const owned = (name, at) => (DEAD.includes(name.toLowerCase()) || inHead(at, head)) && !inParent(masked, name, at);
  // 反复剥壳：嵌套在外层的完整标签在内层剥掉后才完整可见。守卫跳过的也要遮掉，否则下一轮反复命中。
  let work = masked, prev;
  do {
    prev = work;
    work = work.replace(TAG, (all, name, body, at) => {
      if (owned(name, at)) spans.push([at, at + all.length]);
      return hide(all);
    });
  } while (work !== prev);
  for (const match of work.matchAll(OPEN)) {
    if (!owned(match[1], match.index)) continue;
    if (streaming) { spans.push([match.index, clean.length]); break; }
    spans.push([match.index, match.index + match[0].length]);
  }
  for (const match of work.matchAll(CLOSE)) {
    if (!owned(match[1], match.index) || attributedOpen(work, match[1], match.index)) continue;
    spans.push([match.index, match.index + match[0].length]);
  }
  if (streaming) {
    const max = Math.max(...MARKS.map((mark) => mark.length));
    for (let len = 1; len <= Math.min(max, masked.length); len++) {
      const suffix = masked.slice(-len).toLowerCase();
      if (MARKS.some((mark) => mark.startsWith(suffix))) { spans.push([masked.length - len, masked.length]); break; }
    }
  }
  return cutSpans(clean, spans);
}
