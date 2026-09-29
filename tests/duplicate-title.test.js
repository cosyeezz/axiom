import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateTitle } from '../src/sessions.js';

test('duplicate titles reserve the suffix and never return a taken name', () => {
 for (const length of [3,58,59,60]) {
  const base = 'x'.repeat(length), taken = [base];
  for (let i = 1; i <= 110; i++) {
   const title = duplicateTitle(base, taken);
   assert(title.length <= 60); assert(!taken.includes(title));
   assert(title.endsWith(` ${i}`)); taken.push(title);
  }
 }
 assert.equal(duplicateTitle('name 1', ['name 1', 'name 2']), 'name 3');
 const taken = Array.from({length:999}, (_,i) => `name ${i+1}`);
 assert.equal(duplicateTitle('name',taken), 'name 副本');
 assert.throws(() => duplicateTitle('name',[...taken,'name 副本']), /没有可用/);
});
