// 会话记忆标签：助手在回复中用 <title> 自报会话标题。
// extractMemoryTags 供后端落库（src/session-memory.js），stripMemoryTags 供展示过滤（前端流式与 result() 去标签）。
// 标签可跨行（模型常把开启标签、正文、闭合标签分行写）；代码围栏（``` 行，允许缩进，未闭合视为代码到结尾）
// 与行内代码（`…`）内一律不处理：写在反引号里的标签是在讨论标签，不是自报标签。

// title 是唯一仍在提取的标签；axiom_summary/summary/progress 来自已删除的摘要机制，
// 仍留在列表内只为展示过滤：旧会话历史里存着这些标签，不剥就会漏进正文。
const TAGS = ["axiom_summary", "summary", "title", "progress"];
const NAMES = TAGS.join("|");
// 有界标签，内容可跨行；内容排除其他标签起点，杜绝贪婪吞并同类标签与嵌套。
const TAG = new RegExp(`<(${NAMES})>((?:(?!<(?:/?(?:${NAMES})))[\\s\\S])*?)</\\1>`, "gi");
const OPEN = new RegExp(`<(${NAMES})>`, "gi");
const CLOSE = new RegExp(`</(${NAMES})>`, "gi");
const MARKS = TAGS.flatMap((tag) => [`<${tag}>`, `</${tag}>`]);
const FENCE = /^\s*```/;
// 行内代码跨度（CommonMark）：N 个反引号开头，到下一串恰好 N 个反引号结束；不跨行（够用）。
const INLINE_CODE = /(`+)(?:(?!\1`)[^\n])+?\1(?!`)/g;
// 已删标签的占位符：整行只剩占位符就丢弃该行，不留空档。
const HOLE = "\u0000";

// 行内代码遮罩：先换成不含尖括号的占位符，标签处理完再原样回填。
// 不遮罩的后果：`<summary>` 这样的行内代码会被当成未闭合开启标签，按规则“截到段尾”把后文全吃掉。
const MASK = "\u0001";
function maskInlineCode(text) {
  const spans = [];
  const masked = text.replace(INLINE_CODE, (span) => `${MASK}${spans.push(span) - 1}${MASK}`);
  return { masked, spans };
}
const unmaskInlineCode = (text, spans) =>
  spans.length
    ? text.replace(new RegExp(`${MASK}(\\d+)${MASK}`, "g"), (all, index) => spans[Number(index)] ?? all) // 输入自带占位符字符时不写出 undefined
    : text;

// 按代码围栏切段：连续同类（代码/非代码）行合成一段，段内可跨行匹配标签。
function segments(text) {
  const out = [];
  let code = false;
  for (const line of String(text).split("\n")) {
    const fence = FENCE.test(line);
    const inCode = fence || code;
    if (fence) code = !code;
    if (out.length && out.at(-1).inCode === inCode) out.at(-1).lines.push(line);
    else out.push({ inCode, lines: [line] });
  }
  return out;
}

// 提取模型自报标签，返回 { title? }（缺省键不出现；旧摘要标签不再提取）。
// 标签内容可跨行（换行折叠为空格）；title 取首个。
export function extractMemoryTags(text) {
  if (typeof text !== "string" || !text) return {};
  const found = {};
  for (const { inCode, lines } of segments(text)) {
    if (inCode) continue;
    for (const [, name, body] of maskInlineCode(lines.join("\n")).masked.matchAll(TAG)) {
      const key = name.toLowerCase();
      if (key !== "title") continue;
      const value = body.trim().replace(/\s+/g, " ");
      if (!value || key in found || [...value].length > 10) continue;
      found[key] = value;
    }
  }
  return found;
}

// 从展示文本去除记忆标签（不改原文）：完整标签删除，首个无配对闭合的开启标签截到段尾
// （正在流式输入的摘要），落单的闭合标签删除；streaming=true 再隐藏行尾正在输入的标签残片（"<sum"、"</t" 等）。
// 代码围栏内不做任何处理。
export function stripMemoryTags(text, { streaming = false } = {}) {
  if (typeof text !== "string" || !text) return text;
  const kept = [];
  for (const { inCode, lines } of segments(text)) {
    if (inCode) {
      kept.push(...lines.map((line) => ({ line, inCode })));
      continue;
    }
    // 反复剥壳：嵌套在外层的完整标签在内层剥掉后才完整可见。
    const { masked, spans } = maskInlineCode(lines.join("\n").replaceAll(HOLE, ""));
    let stripped = masked, prev;
    do {
      prev = stripped;
      stripped = stripped.replace(TAG, HOLE);
    } while (stripped !== prev);
    for (const match of stripped.matchAll(OPEN)) {
      const at = match.index;
      if (new RegExp(`</${match[1]}>`, "i").test(stripped.slice(at + match[0].length))) continue;
      stripped = stripped.slice(0, at) + HOLE;
      break;
    }
    stripped = unmaskInlineCode(stripped.replace(CLOSE, HOLE), spans); // 开启标签丢失（跨围栏、被截断）时不让闭合标签漏进正文
    for (const line of stripped.split("\n")) {
      const bare = line.replaceAll(HOLE, "");
      if (line !== bare && !bare.trim()) continue; // 整行只有标签
      kept.push({ line: bare, inCode });
    }
  }
  let lines = kept.map(({ line }) => line);
  if (streaming && kept.length && !kept.at(-1).inCode) {
    const last = kept.at(-1).line;
    const max = Math.max(...MARKS.map((mark) => mark.length));
    for (let len = 1; len <= Math.min(max, last.length); len++) {
      const suffix = last.slice(-len).toLowerCase();
      if (MARKS.some((mark) => mark.startsWith(suffix))) {
        lines = [...lines.slice(0, -1), last.slice(0, -len)];
        break;
      }
    }
  }
  return lines.join("\n");
}
