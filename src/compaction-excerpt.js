import { maskCode } from "../public/markdown-scan.js";

// Complete textual source, deliberately not SDK's tool-result-truncated summary serialization.
export function messageText(entry) {
  const message = entry.message ?? entry;
  if (typeof message.content === "string") return message.content;
  return (message.content ?? []).filter(b => b.type === "text").map(b => b.text ?? "").join("\n");
}
const idsIn = text => [...maskCode(text).matchAll(/\[消息:([a-zA-Z0-9-]+(?:,[a-zA-Z0-9-]+)*)\]/g)].flatMap(m => m[1].split(","));
export function resolveSummaryExcerpts(raw, evidence, previousSummary = "", newSourceIds) {
  const fail = message => { throw Object.assign(new Error(`SUMMARY_INVALID: ${message}`), { code: "SUMMARY_INVALID", action: "replan" }); };
  const readable = new Set(evidence.map(e => e.entryId));
  const inherited = new Set(idsIn(previousSummary));
  const masked = maskCode(raw);
  for (const id of idsIn(raw)) if (!inherited.has(id) || !readable.has(id)) fail("未知或不可访问的继承消息 ID");
  const pattern = /\[原文：[“"]([^]*?)[”"]\]/g;
  const matches = [...masked.matchAll(pattern)];
  const remaining = masked.replace(pattern, "").replace(/\[消息:[a-zA-Z0-9,-]+\]/g, "");
  if (/\[(?:原文|消息)[:：]/.test(remaining)) fail("来源标记格式损坏");
  const items = [];
  let summary = raw;
  for (const match of matches.reverse()) {
    const quote = raw.slice(match.index + 5, match.index + match[0].length - 2);
    if (!quote.trim()) fail("原文摘录为空");
    const sources = evidence.filter(e => (!newSourceIds || newSourceIds.has(e.entryId)) && e.text.includes(quote));
    if (!sources.length) fail("原文摘录未命中");
    if (sources.length > 32) fail("原文摘录来源过多，请保留更具体的证据");
    const ids = [...new Set(sources.map(s => s.entryId))];
    items.unshift({ quote, status: ids.length > 1 ? "ambiguous" : "verified", sources: sources.map(s => ({ messageId: s.entryId, role: s.role, range: [s.text.indexOf(quote), s.text.indexOf(quote) + quote.length] })) });
    summary = summary.slice(0, match.index) + `[消息:${ids.join(",")}]` + summary.slice(match.index + match[0].length);
  }
  return { summary, items, rawSummary: raw };
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
