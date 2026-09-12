// 会话记忆标签：助手在回复中用 <title>/<summary>/<progress> 自报标题与摘要。
// extractMemoryTags 供后端落库（src/session-memory.js），stripMemoryTags 供展示过滤（前端流式与 result() 去标签）。
// 只解析简单单行有界标签；代码围栏（``` 行，允许缩进，未闭合视为代码到结尾）内一律不处理。

// 保留旧标签读取兼容，新的模型输出统一使用 axiom_summary。
const TAGS = ["axiom_summary", "summary", "title", "progress"];
const NAMES = TAGS.join("|");
// 单行有界标签；内容排除其他标签起点，杜绝贪婪吞并同类标签与嵌套。
const TAG = new RegExp(`<(${NAMES})>((?:(?!<(?:/?(?:${NAMES})))[^\\n])*?)</\\1>`, "gi");
const OPEN = new RegExp(`<(${NAMES})>`, "gi");
const MARKS = TAGS.flatMap((tag) => [`<${tag}>`, `</${tag}>`]);
const FENCE = /^\s*```/;

// 逐行标记代码状态：围栏行与围栏内的行都是代码。
function codeFlags(text) {
  let code = false;
  return String(text).split("\n").map((line) => {
    const fence = FENCE.test(line);
    const inCode = fence || code;
    if (fence) code = !code;
    return { line, inCode };
  });
}

// 提取模型自报标签，返回 { summary?, title?, progress? }（缺省键不出现）。
// 标签须单行有界，可在行中/行尾/同行多个；title 取首个，summary/progress 取最后（最新）。
export function extractMemoryTags(text) {
  if (typeof text !== "string" || !text) return {};
  const found = {};
  for (const { line, inCode } of codeFlags(text)) {
    if (inCode) continue;
    for (const [, name, body] of line.matchAll(TAG)) {
      const key = name.toLowerCase();
      const value = body.trim();
      if (!value || (key === "title" && (key in found || [...value].length > 10))) continue;
      found[key] = value;
    }
  }
  return found;
}

// 从展示文本去除记忆标签（不改原文）：完整标签删除，行内最后一个无配对闭合的
// 开启标签截到行尾；streaming=true 再隐藏行尾正在输入的标签残片（"<sum"、"</t" 等）。
// 代码围栏内不做任何处理。
export function stripMemoryTags(text, { streaming = false } = {}) {
  if (typeof text !== "string" || !text) return text;
  const kept = [];
  for (const { line, inCode } of codeFlags(text)) {
    if (inCode) {
      kept.push({ line, inCode });
      continue;
    }
    // 反复剥壳：嵌套在外层的完整标签在内层剥掉后才完整可见。
    let stripped = line, prev;
    do {
      prev = stripped;
      stripped = stripped.replace(TAG, "");
    } while (stripped !== prev);
    let cut = -1;
    for (const match of stripped.matchAll(OPEN)) {
      const at = match.index;
      if (cut >= 0 && at >= cut) continue;
      if (!new RegExp(`</${match[1]}>`, "i").test(stripped.slice(at + match[0].length)) && (cut < 0 || at < cut)) cut = at;
    }
    if (cut >= 0) {
      if (!stripped.slice(0, cut).trim()) continue; // 未闭合前无正文：整行丢弃，不留空档
      kept.push({ line: stripped.slice(0, cut), inCode });
      continue;
    }
    if (!stripped.trim() && stripped !== line) continue; // 整行只有完整标签
    kept.push({ line: stripped, inCode });
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
