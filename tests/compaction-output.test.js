import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskStateOutput } from '../src/compaction-output.js';
import { STATE_FIELDS } from '../src/compaction-state.js';
const state = { schemaVersion: 1, ...Object.fromEntries(STATE_FIELDS.map(field => [field, []])) };

test('task-state accepts only bare JSON or one complete JSON/plain fence', () => {
  const json = JSON.stringify(state);
  for (const text of [json, `\ufeff ${json}\n`, `\`\`\`json\n${json}\n\`\`\``, `\`\`\`JSON\r\n${json}\r\n\`\`\``, `\`\`\`\n${json}\n\`\`\``]) assert.deepEqual(parseTaskStateOutput(text), state);
  for (const text of [`Here: ${json}`, `${json} trailing`, json.slice(0, -1), `\`\`\`json\n${json}`, `\`\`\`js\n${json}\n\`\`\``, `\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``]) assert.throws(() => parseTaskStateOutput(text), { code: 'SUMMARY_INVALID' });
});

test('invalid shape is classified before source hydration', () => {
  for (const value of [null, [], 1, {}, { ...state, goals: {} }, { ...state, goals: [null] }, { ...state, goals: [{ sources: [null] }] }, { ...state, goals: [{ sources: {} }] }]) assert.throws(() => parseTaskStateOutput(JSON.stringify(value)), { code: 'SUMMARY_SCHEMA_INVALID' });
  assert.throws(() => parseTaskStateOutput('secret-private-output'), error => error.code === 'SUMMARY_INVALID' && !error.message.includes('secret-private-output') && error.message.includes('chars=21'));
});
