import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the private pure function without adding a production export.
const source = readFileSync(new URL('../src/sessions.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function translateRetries('), source.indexOf('\n// 统一目录浏览'));
const translate = new Function(`${body}; return translateRetries;`)();
function reference(retries, raw, projected) {
  if (!retries.some(r => Number.isInteger(r.messageCount))) return retries;
  const slots = [];
  let p = 0;
  for (const record of raw) {
    if ((record.agentId ?? 'main') !== 'main') continue;
    while (p < projected.length && projected[p] !== record) p++;
    if (projected[p] !== record) break;
    slots.push(p + 1);
  }
  return retries.map(record => {
    if (!Number.isInteger(record.messageCount)) return record;
    let mains = 0;
    for (let i = 0; i < Math.min(record.messageCount, raw.length); i++)
      if ((raw[i].agentId ?? 'main') === 'main') mains++;
    const slot = mains > 0 && mains <= slots.length ? slots[mains - 1] : 0;
    return slot === record.messageCount ? record : { ...record, messageCount: slot };
  });
}
test('retry prefix counts match the original scan, including boundary values and identity', () => {
  let seed = 0x5eed1234;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 500; trial++) {
    const raw = Array.from({ length: random(200) }, () => ({ agentId: ['main', 'child', 'orphan', null, undefined, ''][random(6)] }));
    const projected = raw.filter(() => random(5) !== 0);
    const counts = [-100, -1, -0, 0, raw.length, raw.length + 100, 1.5, NaN, Infinity, -Infinity, null, undefined, '5'];
    for (let i = 0; i < 40; i++) counts.push(random(raw.length + 10));
    const retries = counts.map(messageCount => Object.freeze({ messageCount }));
    const expected = reference(retries, raw, projected), actual = translate(retries, raw, projected);
    assert.deepEqual(actual, expected, `trial ${trial}`);
    actual.forEach((record, i) => assert.equal(record === retries[i], expected[i] === retries[i]));
  }
  const nonInteger = [{ messageCount: 1.5 }, {}];
  assert.equal(translate(nonInteger, [], []), nonInteger);
});
