// 展示协议只识别独占行的标签；原始消息始终由调用方保存。
const OPEN = "<axiom_answer>";
const CLOSE = "</axiom_answer>";

export function splitAnswer(text, { streaming = false } = {}) {
  text = String(text ?? "");
  const marks = [];
  let fence = null, inline = 0, offset = 0, pending = -1;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const run = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (run && run[1][0] === fence.char && run[1].length >= fence.size && !run[2].trim()) fence = null;
    } else if (run && !inline) {
      fence = { char: run[1][0], size: run[1].length };
    } else {
      const trimmed = line.trim();
      if (!inline && (trimmed === OPEN || trimmed === CLOSE)) {
        marks.push({ kind: trimmed, start: offset, end: offset + line.length });
      } else if (!inline && streaming && i === lines.length - 1 && trimmed
        && [OPEN, CLOSE].some(mark => mark.startsWith(trimmed))) {
        pending = offset;
      }
      for (const match of line.matchAll(/`+/g)) {
        if (!inline) inline = match[0].length;
        else if (inline === match[0].length) inline = 0;
      }
    }
    offset += line.length + 1;
  }
  const visible = pending < 0 ? text : text.slice(0, pending);
  const fallback = (malformed = false) => ({ found: false, answer: visible, process: "", incomplete: false, malformed });
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
