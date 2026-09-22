import { cutSpans } from '../public/markdown-scan.js';
// Optional UI metadata, never a reason to reject or retry an SDK summary.
export const DISPLAY_INSTRUCTIONS = '保持上述原生摘要结构与内容要求。在摘要正文之后额外输出<axiom_compact_title>不超过30字的短标题</axiom_compact_title>和<axiom_compact_desc>不超过200字的一至两句折叠概述</axiom_compact_desc>。这些字段仅用于界面展示；不要把计划或待验证事项写成已经完成。不要求来源标记、逐字摘录或facts。';
export function parseDisplay(raw) {
  const values = {};
  // Mask code examples so quoted tags are not interpreted as live metadata.
  const mask = raw.replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g, s => ' '.repeat(s.length));
  const spans = [];
  for (const [field, tag, max] of [['title', 'title', 30], ['description', 'desc', 200]]) {
    const re = new RegExp(`<axiom_compact_${tag}>([\\s\\S]*?)<\\/axiom_compact_${tag}>`, 'g');
    const matches = [...mask.matchAll(re)];
    for (const match of matches) spans.push([match.index, match.index + match[0].length]);
    if (matches.length === 1) {
      const value = matches[0][1].trim();
      if (value && [...value].length <= max && !/[<>\n]/.test(value)) values[field] = value;
    }
  }
  const strays = [...mask.matchAll(/<\/?axiom_compact_(?:title|desc)>/g)].map(m => [m.index, m.index + m[0].length]);
  const summary = cutSpans(raw, [...spans, ...strays]).trim();
  // Malformed wrappers must never leak into the next previousSummary.
  if (!summary) return { summary: cutSpans(raw, strays).trim() };
  return { summary, ...(values.title && values.description ? { progress: values } : {}) };
}
