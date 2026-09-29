import test from 'node:test';
import assert from 'node:assert/strict';
import { Compile } from 'typebox/compile';
import { Todo, createTodoStore, todoReadSchema, todoUpdateSchema } from '../src/todo.js';
import { createInstructions } from '../src/instructions.js';

test('Todo exposed basic bounds share runtime contracts', async () => {
 const todo = new Todo({ sessionId: 'schema', store: createTodoStore() });
 const registry = createInstructions();
 for (const [name, tool] of [['todo.read', todo.readTool()], ['todo.update', todo.updateTool()]]) {
  registry.register({ name, description: tool.description, parameters: tool.parameters, handler: () => null });
 }
 const read = Compile((await registry.execute('axiom.describe', { name: 'todo.read' })).parameters);
 const update = Compile((await registry.execute('axiom.describe', { name: 'todo.update' })).parameters);
 const check = (schema, validator, value, expected) => {
  assert.equal(schema.safeParse(value).success, expected, JSON.stringify(value).slice(0, 100));
  assert.equal(validator.Check(value), expected);
 };
 for (const length of [0, 1, 128, 129]) {
  const value = 'x'.repeat(length), valid = length > 0 && length <= 128;
  for (const field of ['id', 'listId']) check(todoReadSchema, read, { [field]: value }, valid);
  check(todoUpdateSchema, update, { listId: value, baseVersion: 0, ops: [{ op: 'move', id: 'ok' }] }, valid);
  for (const field of ['id', 'parentId']) check(todoUpdateSchema, update, { baseVersion: 0, ops: [{ op: 'add', level: 2, title: 'ok', [field]: value }] }, valid);
  check(todoUpdateSchema, update, { baseVersion: 0, ops: [{ op: 'move', id: 'ok', beforeId: value }] }, valid);
  check(todoUpdateSchema, update, { baseVersion: 0, ops: [{ op: 'edit', id: 'ok', acceptance: [{ criterionId: value, text: 'ok' }] }] }, valid);
  for (const field of ['toolCallId', 'messageId']) check(todoUpdateSchema, update, { baseVersion: 0, ops: [{ op: 'status', id: 'ok', status: 'done', verification: [{ criterionId: 'ok', result: 'ok', refs: [{ [field]: value }] }] }] }, valid);
 }
 for (const [field, max, min] of [['title',160,1],['description',2000,0],['summary',800,0]]) {
  for (const length of [0, 1, max, max + 1]) check(todoUpdateSchema, update, { baseVersion: 0, ops: [{ op: 'edit', id: 'ok', [field]: 'x'.repeat(length) }] }, length >= min && length <= max);
 }
 for (const limit of [0,1,100,101,1.5]) check(todoReadSchema, read, { limit }, Number.isInteger(limit) && limit >= 1 && limit <= 100);
 for (const baseVersion of [-1,0,0.5]) check(todoUpdateSchema, update, { baseVersion, ops: [{ op: 'move', id: 'ok' }] }, baseVersion === 0);
 // Intentional differences: public wide op/ref shape, runtime trims and applies strict op rules.
 const wide = { baseVersion: 0, ops: [{ op: 'edit', id: 'ok', status: 'done' }] };
 assert.equal(update.Check(wide), true); assert.equal(todoUpdateSchema.safeParse(wide).success, false);
 const padded = { baseVersion: 0, ops: [{ op: 'edit', id: 'ok', title: ' '.repeat(200) + 'x' }] };
 assert.equal(update.Check(padded), false); assert.equal(todoUpdateSchema.parse(padded).ops[0].title, 'x');
 assert.equal(todoUpdateSchema.safeParse({ baseVersion:0, ops:[{op:'edit',id:'ok',title:'   '}] }).success, false);
});
