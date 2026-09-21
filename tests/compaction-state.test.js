import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE_FIELDS, validateTaskState, candidateIdentity, renderTaskState, inheritTaskState } from '../src/compaction-state.js';
import { contentHash } from '../src/raw-history.js';
const empty = () => ({ schemaVersion: 1, ...Object.fromEntries(STATE_FIELDS.map(field => [field, []])) });
test('cumulative state cannot silently drop constraints; byte evidence must match', () => {
  const previous = empty(); previous.constraints.push({ id: 'c1', text: '禁止推送', status: 'active', sources: [] });
  assert.throws(() => validateTaskState(empty(), { previous }), { code: 'SUMMARY_STATE_LOSS' });
  assert.deepEqual(validateTaskState(previous), previous);
  const next = structuredClone(previous); next.constraints[0].text = '允许推送';
  assert.throws(() => validateTaskState(next, { previous }), { code: 'SUMMARY_TRANSITION_INVALID' });
  const text = '用户：允许推送😀';
  next.constraints[0].sources = [{ ref: 'test', part: 'part_0', contentHash: contentHash(text), range: [0, Buffer.byteLength(text)], quote: text }];
  assert.throws(() => validateTaskState(next, { previous, resolveEvidence: () => text }), { code: 'SUMMARY_AUTHORITY_REQUIRED' });
  assert.deepEqual(validateTaskState(next, { previous, resolveEvidence: () => text, authorizeConstraintChange: () => true }), next);
  next.constraints[0].sources[0].range[1]--;
  assert.throws(() => validateTaskState(next, { previous, resolveEvidence: () => text }), { code: 'SUMMARY_SOURCE_INVALID' });
  assert.match(renderTaskState(previous, { archiveId: 'a', compactionId: 'c', coverage: ['source'] }), /原文来源/);
});
test('ten generations inherit omitted unresolved constraints and evidence without upgrading verification', () => {
  let state = empty();
  state.constraints.push({ id: 'c1', text: '禁止未经授权推送', status: 'active', sources: [] });
  for (let i = 0; i < 10; i++) {
    const next = inheritTaskState(empty(), state);
    state = validateTaskState(next, { previous: state });
    assert.equal(state.constraints[0].text, '禁止未经授权推送');
  }
});
test('candidate identity pins generation, config, boundary and source payload', () => {
  const input = { journalId: 'j', generation: 1, boundaryId: 'b', coveredEntries: [{ id: 'a', content: 'x' }], config: { threshold: 10 } };
  assert.equal(candidateIdentity(input), candidateIdentity(structuredClone(input)));
  assert.notEqual(candidateIdentity(input), candidateIdentity({ ...input, generation: 2 }));
  assert.notEqual(candidateIdentity(input), candidateIdentity({ ...input, coveredEntries: [{ id: 'a', content: 'changed' }] }));
});
