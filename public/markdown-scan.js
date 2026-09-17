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

// 逐行状态机：处理 lines（原文行数组），返回每行的掩码输出与推进后的行级状态。
// 状态纯前向：append 不改变已处理行的判定，只有末行被 delta 延长时需从「进入末行前」状态重扫。
// enter 返回的是处理最后一行之前的状态，供下一次增量续扫。
function scanLines(lines, stateIn) {
  const out = [];
  let { fence, canIndent, indented } = stateIn;
  let enter = { fence, canIndent, indented };
  for (const line of lines) {
    const run = FENCE.exec(line);
    enter = { fence: fence ? { ...fence } : null, canIndent, indented };
    if (fence) {
      if (run && run[2][0] === fence.char && run[2].length >= fence.size && !run[3].trim()) {
        fence = null;
        canIndent = true;
      }
      out.push(fill(line));
    } else if (run) {
      fence = { char: run[2][0], size: run[2].length };
      indented = false;
      canIndent = false;
      out.push(fill(line));
    } else if (!line.trim()) {
      canIndent = true;
      out.push(line); // 空行没有内容需要遮罩，且允许下一行起缩进代码
    } else if ((canIndent || indented) && /^(?: {4}|\t)/.test(line)) {
      indented = true;
      canIndent = false;
      out.push(fill(line));
    } else {
      indented = false;
      canIndent = false;
      out.push(line);
    }
  }
  return { out, enter, state: { fence: fence ? { ...fence } : null, canIndent, indented } };
}

const initState = () => ({ fence: null, canIndent: true, indented: false });

// 行内代码跨度必须落在同一个无空行段内，段与段互不影响：只有末段需要反复重跑。
const inlineMask = (segment) => segment.replace(INLINE, fill);

// 把代码区替换成等长掩码；行结构与字符下标都不变。
export function maskCode(text) {
  const src = String(text ?? "");
  const { out } = scanLines(src.split("\n"), initState());
  return inlineMask(out.join("\n"));
}

// —— 流式增量版 ——
// 流式热路径（prepareStream 每帧）上 maskCode 对 append-only 增长的同一文本反复全文重扫；
// 行级状态前向固化 + 行内配对不跨空行，允许缓存：head（已围化的行内掩码前缀）+ tail（末段行
// 级掩码行，每帧重跑行内掩码）+ enter（进入末行前的行级状态，末行被 delta 延长时重扫）。
// 调用方演进非严格 append（残片翻转、整行删除）时 startsWith 校验失败 → 全量重算，天然退化。
// 缓存按调用方各自持有（三个标签模块对不同文本调用，共用会互相污染）。
export function createMaskCache() {
  return { text: "", head: "", tail: [], enter: initState(), masked: "" };
}

export function maskCodeCached(text, cache) {
  const src = String(text ?? "");
  if (src === cache.text) return cache.masked;
  if (!cache.text || !src.startsWith(cache.text)) {
    // 全量重算（同时也是 cache 初始化路径）：head 必须重置，旧演化史的固化段不能残留。
    cache.head = "";
    const lines = scanLines(src.split("\n"), initState());
    commit(cache, src, lines.out, lines.enter);
    return cache.masked;
  }
  // append：末行（原文）被 delta 延长，从进入末行前的状态重扫末行+新增行。
  const prevLast = cache.text.slice(cache.text.lastIndexOf("\n") + 1);
  const merged = (prevLast + src.slice(cache.text.length)).split("\n");
  const scanned = scanLines(merged, cache.enter);
  const lines = [...cache.tail.slice(0, -1), ...scanned.out];
  commit(cache, src, lines, scanned.enter);
  return cache.masked;
}

// 提交行级结果：按最后一个空行划 head/tail（行内配对不跨空行，空行之前的行永远固化）。
// 空行本身留在 tail 起始：它是段边界而非段内容，且「文本以 \n 结尾」时末行空串是哨兵而非
// 实体行，后续 delta 会把它填充成真行，不能固化进 head。
function commit(cache, src, lines, enter) {
  // 段边界 = 拥有结束换行的仅空白行。末行无结束换行（文本不以 \n 结尾，或 split 尾部哨兵
  // 空串）不是边界：行内配对可以跨它延伸到下一帧的新行，不能固化进 head。
  // 段边界 = 仅空白且有结束换行的行：split 行数组中只有下标 ≤ length-2 的行才有行尾 \n（
  // 末行无 \n，尾哨兵空串无字符）。无 \n 的末空白行不是边界（正则要求 \n[ \t]*\n），
  // 行内配对可以跨它延伸到后续帧，绝不能据此固化 head。
  const last = lines.length - 2;
  let boundary = -1;
  for (let i = last; i >= 0; i--)
    if (/^[ \t]*$/.test(lines[i])) { boundary = i; break; } // 与 INLINE 的空行口径逐字一致，\r 不算空
  if (boundary > 0) cache.head += inlineMask(lines.splice(0, boundary).join("\n")) + "\n";
  cache.tail = lines;
  cache.enter = enter;
  cache.text = src;
  cache.masked = cache.head + inlineMask(cache.tail.join("\n"));
  return cache.masked;
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
