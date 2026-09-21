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
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 ||
      Object.keys(value).some(key => key !== 'schemaVersion' && !STATE_FIELDS.includes(key)) ||
      STATE_FIELDS.some(field => !Array.isArray(value[field]) || value[field].some(item =>
        !item || typeof item !== 'object' || Array.isArray(item) || !Array.isArray(item.sources) ||
        item.sources.some(source => !source || typeof source !== 'object' || Array.isArray(source))))) {
    throw compactionError('SUMMARY_SCHEMA_INVALID', 'SUMMARY_SCHEMA_INVALID: invalid task-state shape');
  }
  return value;
}
