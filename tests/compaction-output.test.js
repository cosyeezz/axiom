import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskStateOutput } from '../src/compaction-output.js';
import { STATE_FIELDS, inheritTaskState, validateTaskState } from '../src/compaction-state.js';
const state = { schemaVersion: 1, ...Object.fromEntries(STATE_FIELDS.map(field => [field, []])) };

test('task-state accepts only bare JSON or one complete JSON/plain fence', () => {
  const json = JSON.stringify(state);
  for (const text of [json, `\ufeff ${json}\n`, `\`\`\`json\n${json}\n\`\`\``, `\`\`\`JSON\r\n${json}\r\n\`\`\``, `\`\`\`\n${json}\n\`\`\``]) assert.deepEqual(parseTaskStateOutput(text), state);
  for (const text of [`Here: ${json}`, `${json} trailing`, json.slice(0, -1), `\`\`\`json\n${json}`, `\`\`\`js\n${json}\n\`\`\``, `\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``]) assert.throws(() => parseTaskStateOutput(text), { code: 'SUMMARY_INVALID' });
});

test('omitted empty fields and sources normalize without dropping inherited constraints', () => {
  const goal = { id: 'g1', text: 'goal', status: 'active' };
  const parsed = parseTaskStateOutput(JSON.stringify({ schemaVersion: 1, goals: [goal] }));
  assert.deepEqual(parsed, { ...state, goals: [{ ...goal, sources: [] }] });
  const previous = { ...state, constraints: [{ id: 'c1', text: 'must keep', status: 'active', sources: [] }] };
  const next = inheritTaskState(parsed, previous);
  assert.deepEqual(validateTaskState(next, { previous }).constraints, previous.constraints);
  next.constraints[0].text = 'changed';
  assert.throws(() => validateTaskState(next, { previous }), { code: 'SUMMARY_TRANSITION_INVALID' });
  const badSource = parseTaskStateOutput(JSON.stringify({ schemaVersion: 1, goals: [{ ...goal, sources: [{}] }] }));
  assert.throws(() => validateTaskState(badSource), { code: 'SUMMARY_SOURCE_INVALID' });
});

test('shape diagnostics identify schema locations without echoing model content', () => {
  for (const [value, reason] of [
    [{ ...state, schemaVersion: '1' }, 'schemaVersion: expected 1'],
    [{ ...state, privateModelText: 'secret' }, 'root: unknown field'],
    [{ ...state, goals: null }, 'goals: expected array'],
    [{ ...state, goals: [{ sources: null }] }, 'goals[0].sources: expected array'],
  ]) assert.throws(() => parseTaskStateOutput(JSON.stringify(value)), error =>
    error.code === 'SUMMARY_SCHEMA_INVALID' && error.message.includes(reason) && !error.message.includes('privateModelText') && !error.message.includes('secret'));
});

test('invalid shape is classified before source hydration', () => {
  for (const value of [null, [], 1, {}, { ...state, goals: {} }, { ...state, goals: [null] }, { ...state, goals: [{ sources: [null] }] }, { ...state, goals: [{ sources: {} }] }]) assert.throws(() => parseTaskStateOutput(JSON.stringify(value)), { code: 'SUMMARY_SCHEMA_INVALID' });
  assert.throws(() => parseTaskStateOutput('secret-private-output'), error => error.code === 'SUMMARY_INVALID' && !error.message.includes('secret-private-output') && error.message.includes('chars=21'));
});
