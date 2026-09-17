// 展示协议只识别独占行的标签；原始消息始终由调用方保存。
// 代码区判定与 memory-tags、goal 共用 public/markdown-scan.js：写在围栏、缩进代码块或行内代码
// 里的标记是在举例，不是协议（原先自带的行内反引号计数器跨行不重置，一个落单反引号就让整条消息失效）。
import { maskCode, maskCodeCached, cutSpans } from "./markdown-scan.js";

const OPEN = "<axiom_display>";
const CLOSE = "</axiom_display>";
const MARKS = [OPEN, CLOSE];
// 标记必须独占一行、缩进不超过 3 空格：4 空格起是缩进代码块，属于举例。
const isMark = (line) => /^ {0,3}\S/.test(line) && MARKS.includes(line.trim());

export function splitAnswer(text, { streaming = false, maskCache } = {}) {
  text = String(text ?? "");
  const lines = (maskCache ? maskCodeCached(text, maskCache) : maskCode(text)).split("\n");
  const marks = [];
  let offset = 0, pending = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], trimmed = line.trim();
    if (isMark(line)) marks.push({ kind: trimmed, start: offset, end: offset + line.length });
    // 流式：末行正在输入的标记前缀先藏起来，避免半截标签闪现。
    else if (streaming && i === lines.length - 1 && trimmed && /^ {0,3}\S/.test(line)
      && MARKS.some((mark) => mark.startsWith(trimmed))) pending = offset;
    offset += line.length + 1;
  }
  const visible = pending < 0 ? text : text.slice(0, pending);
  // 丢协议不丢正文：解析不出协议时照样删掉独占行的裸标记，不让展示标签漏进展示文本。
  const fallback = (malformed = false) => ({
    found: false,
    answer: cutSpans(visible, marks.map((mark) => [mark.start, mark.end])),
    process: "",
    incomplete: false,
    malformed,
  });
  if (!marks.length) return fallback();
  if (marks[0].kind !== OPEN || marks.length > 2 || (marks[1] && marks[1].kind !== CLOSE)) return fallback(true);
  const [open, close] = marks;
  const answer = visible.slice(open.end, close?.start ?? visible.length).trim();
  // 完整但空的标签不能把本轮唯一说明折叠掉。
  if (close && !answer) return fallback(true);
  return {
    found: true,
    answer,
    process: [text.slice(0, open.start), close ? text.slice(close.end) : ""].map(part => part.trim()).filter(Boolean).join("\n\n"),
    incomplete: !close,
    malformed: false,
  };
}
