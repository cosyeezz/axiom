
// Complete textual source, deliberately not SDK's tool-result-truncated summary serialization.
export function messageText(entry) {
  const message = entry.message ?? entry;
  if (typeof message.content === "string") return message.content;
  return (message.content ?? []).filter(b => b.type === "text").map(b => b.text ?? "").join("\n");
}
export function messageWindow(text, keyword, limit = 2000) {
  const chars = Array.from(text);
  const at = text.indexOf(keyword);
  let hits = 0;
  for (let i = 0; (i = text.indexOf(keyword, i)) >= 0; i += keyword.length) hits++;
  if (chars.length <= limit) return { text, complete: true, totalLength: chars.length, ranges: [[0, chars.length]], matched: at >= 0, hits };
  if (at >= 0) {
    const position = Array.from(text.slice(0, at)).length;
    const start = Math.min(Math.max(0, position - Math.floor(limit / 2)), chars.length - limit);
    return { text: chars.slice(start, start + limit).join(""), complete: false, totalLength: chars.length, ranges: [[start, start + limit]], matched: true, hits };
  }
  const half = Math.floor(limit / 2);
  return { text: `${chars.slice(0, half).join("")}\n[中间省略 ${chars.length - limit} 字符]\n${chars.slice(-half).join("")}`, complete: false, totalLength: chars.length, ranges: [[0, half], [chars.length - half, chars.length]], matched: false, hits: 0 };
}
