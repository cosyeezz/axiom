// Markdown 代码区扫描：围栏代码块、缩进代码块、行内代码。三套标签解析（memory-tags、
// answer-tags、goal 完成标记）共用这一份口径，避免各写一套正则各自漂移
// （原先 memory-tags 不认 ~~~ 与缩进代码块，answer-tags 的行内反引号计数器跨行不重置）。
// 口径对齐 CommonMark 与前端渲染（public/markdown.js）：
//   围栏      —— 0-3 空格缩进 + 至少三个反引号或波浪线；闭合需同字符且不短于开启；未闭合延伸到结尾。
//   缩进代码块 —— 4 空格或 Tab 起头，且不打断段落（前一行是空行、围栏结束或已在缩进代码段内）。
//   行内代码   —— 等长反引号配对，不跨空行；落单反引号按字面处理。
// 缩进代码块只看前一行是否空行，不做完整容器解析：列表项内的缩进另有基准，但标签协议要求
// 标记独占行且不缩进，这点误差不影响判定。

// 代码区掩码字符：不含尖括号、反引号与空白，标签与标记的正则一律匹配不到；等长替换让下标
// 在掩码文本与原文之间通用（在掩码文本上匹配，命中后按下标回原文取值或删除）。
export const FILL = "\u0001";

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
// 行内代码跨度：N 个反引号开头，到下一串恰好 N 个反引号结束；中间不许出现空行（空行断段落）。
const INLINE = /(`+)((?:(?!\n[ \t]*\n)[\s\S])*?)\1(?!`)/g;
const fill = (text) => text.replace(/[^\n]/g, FILL);

// 把代码区替换成等长掩码；行结构与字符下标都不变。
export function maskCode(text) {
  let fence = null, canIndent = true, indented = false;
  const masked = String(text ?? "").split("\n").map((line) => {
    const run = FENCE.exec(line);
    if (fence) {
      if (run && run[2][0] === fence.char && run[2].length >= fence.size && !run[3].trim()) {
        fence = null;
        canIndent = true;
      }
      return fill(line);
    }
    if (run) {
      fence = { char: run[2][0], size: run[2].length };
      indented = false;
      canIndent = false;
      return fill(line);
    }
    if (!line.trim()) { canIndent = true; return line; } // 空行没有内容需要遮罩，且允许下一行起缩进代码
    if ((canIndent || indented) && /^(?: {4}|\t)/.test(line)) {
      indented = true;
      canIndent = false;
      return fill(line);
    }
    indented = false;
    canIndent = false;
    return line;
  }).join("\n");
  return masked.replace(INLINE, fill);
}

// 按字符区间删除，并顺手整理空行：删完整行只剩空白（且删前不是空行）就丢掉该行，
// 让独占一行的标签不留空档。区间可重叠、可越界，按并集处理。
export function cutSpans(text, spans) {
  if (!spans?.length) return text;
  const cut = new Uint8Array(text.length);
  for (const [start, end] of spans)
    for (let i = Math.max(0, start); i < Math.min(text.length, end); i++) cut[i] = 1;
  const out = [];
  let at = 0;
  for (const line of text.split("\n")) {
    let kept = "", touched = false;
    for (let i = 0; i < line.length; i++) {
      if (cut[at + i]) touched = true;
      else kept += line[i];
    }
    at += line.length + 1;
    if (touched && line.trim() && !kept.trim()) continue;
    out.push(kept);
  }
  return out.join("\n");
}
