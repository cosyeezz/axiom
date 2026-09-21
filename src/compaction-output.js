import { compactionError } from './compaction-budget.js';
import { STATE_FIELDS } from './compaction-state.js';

// Only unwrap a complete, solitary code fence. Never extract a plausible object
// from prose or repair truncated JSON: that could silently discard constraints.
export function parseTaskStateOutput(output) {
  const text = output.trim();
  const fence = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
  const body = fence ? fence[1] : text;
  let value;
  try { value = JSON.parse(body); }
  catch {
    const format = fence ? 'fenced-json' : text.startsWith('{') ? 'object-like' : 'non-json';
    throw compactionError('SUMMARY_INVALID', `SUMMARY_INVALID: expected JSON (format=${format}, chars=${text.length})`);
  }
  // Check shape before source hydration; semantic and evidence validation still
  // happens afterwards. Malformed model output must not become a TypeError.
  const object = item => item !== null && typeof item === 'object' && !Array.isArray(item);
  const invalid = reason => { throw compactionError('SUMMARY_SCHEMA_INVALID', `任务状态结构无效 (${reason})`); };
  if (!object(value)) invalid('root: expected object');
  if (value.schemaVersion !== 1) invalid('schemaVersion: expected 1');
  // Never echo unknown model keys or output text in diagnostics.
  if (Object.keys(value).some(key => key !== 'schemaVersion' && !STATE_FIELDS.includes(key))) invalid('root: unknown field');
  for (const field of STATE_FIELDS) {
    // Omission means no new items, not deletion: prior state is inherited later.
    if (!Object.hasOwn(value, field)) value[field] = [];
    if (!Array.isArray(value[field])) invalid(`${field}: expected array`);
    for (const [index, item] of value[field].entries()) {
      const path = `${field}[${index}]`;
      if (!object(item)) invalid(`${path}: expected object`);
      if (!Object.hasOwn(item, 'sources')) item.sources = [];
      if (!Array.isArray(item.sources)) invalid(`${path}.sources: expected array`);
      if (item.sources.some(source => !object(source))) invalid(`${path}.sources: expected objects`);
    }
  }
  return value;
}
