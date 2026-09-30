import test from 'node:test';
import assert from 'node:assert/strict';
import { createBusinessInstructions } from '../src/business-instructions.js';
import { instructionTools } from '../src/instruction-tools.js';
import { Tasks } from '../src/tasks.js';
import { Todo, createTodoStore } from '../src/todo.js';
import { createQuestions } from '../src/questions.js';
import { MAIN_AGENT_PROMPT } from '../src/prompts.js';
import { MEMORY_QUERY_PROMPT, MEMORY_MAINTAIN_PROMPT, taskProfile } from '../src/agent-profile.js';

const agent = () => ({ prompt: async () => {}, result: () => 'verified result', subscribe: () => () => {}, dispose: async () => {} });

test('prompt contracts preserve discovery, source discipline and trusted profile boundaries', () => {
  for (const name of ['task.start', 'task.read', 'task.append', 'task.cancel', 'todo.read', 'todo.update', 'memory.query', 'guide.task', 'guide.todo', 'guide.git']) assert.ok(MAIN_AGENT_PROMPT.includes(name));
  assert.match(MAIN_AGENT_PROMPT, /没有模型历史回读工具/);
  assert.match(MEMORY_QUERY_PROMPT, /global 与 project 索引/);
  assert.match(MEMORY_QUERY_PROMPT, /没有命中/);
  for (const phrase of ['原始材料', '相关旧卡片', '保留来源和不确定性', '助手声称完成不等于实际验证', '没有值得保留的新信息就不写', '不强制类别和字段', '摘要必须准确概括正文', '不能修改正式操作规程']) assert.ok(MEMORY_MAINTAIN_PROMPT.includes(phrase));
  assert.deepEqual(taskProfile(), {role: 'subagent', purpose: 'general'});
  assert.throws(() => taskProfile({role:'main'}));
  assert.throws(() => taskProfile({purpose:'unrestricted'}));
});

test('ask/let task routing keeps custom prompt, result identity, errors and query notification lifecycle', async () => {
  const tasks = new Tasks(agent, () => {});
  const store = createTodoStore();
  try {
    const todo = new Todo({ sessionId: 's', store });
    const [ask, run] = instructionTools(createBusinessInstructions(tasks, todo));
    const description = await ask.execute('ask', { name: 'task.start' });
    assert.match(description.details.description, /task.read/);
    assert.ok(description.details.parameters.properties.tasks.items.properties.systemPrompt);
    const started = await run.execute('start', { name: 'task.start', arguments: { context: 'context', tasks: [{ task: 'verify', systemPrompt: 'Custom read-only reviewer' }] } });
    assert.equal(started.details.axiomInstruction, 'task.start');
    const id = JSON.parse(started.content[0].text).taskIds[0];
    assert.equal(tasks.jobs.get(id).profile.systemPrompt, 'Custom read-only reviewer');
    await tasks.jobs.get(id).done;
    const notice = tasks.pendingNotifications()[0];
    const read = await run.execute('read', { name: 'task.read', arguments: { taskId: notice.id, resultId: notice.resultId } });
    assert.match(read.content[0].text, /verified result/);
    await assert.rejects(run.execute('read', { name: 'task.read', arguments: { taskId: 'missing', resultId: notice.resultId } }), /完成通知/);
    const query = await run.execute('query', { name: 'memory.query', arguments: { query: 'Known prior decisions?' } });
    const queryId = query.details.taskIds[0];
    assert.equal(query.details.axiomInstruction, 'memory.query');
    assert.equal(tasks.jobs.get(queryId).profile.purpose, 'memory-query');
    await tasks.jobs.get(queryId).done;
    assert.ok(tasks.pendingNotifications().some(n => n.id === queryId));
    for (const name of ['delegate', 'todo_update', 'history.read', 'memory.save', 'memory.cancel', 'memory.read']) await assert.rejects(ask.execute('ask', { name }), /Unknown/);
    for (const name of ['guide.todo','guide.task','guide.git']) assert.ok((await ask.execute('ask', {name})).details.description.length > 100);
    const before = tasks.jobs.size;
    await assert.rejects(run.execute('cancelled', { name: 'memory.query', arguments: { query: 'x' } }, AbortSignal.abort()), /abort/i);
    assert.equal(tasks.jobs.size, before);
  } finally { store.database.close(); }
});

test('memory query cancellation reuses task.cancel, completion credential and task.read', async () => {
  let finish, started;
  const running = new Promise(resolve => { started = resolve; });
  const tasks = new Tasks(() => ({ subscribe: () => () => {},
    prompt: () => new Promise(resolve => { finish = resolve; started(); }),
    result: () => 'partial query', abort: async () => finish(), dispose: async () => {} }), () => {});
  const store = createTodoStore();
  try {
    const run = instructionTools(createBusinessInstructions(tasks, new Todo({ sessionId: 'cancel-query', store })))[1];
    const query = await run.execute('query', { name: 'memory.query', arguments: { query: 'prior decisions' } });
    const taskId = query.details.taskIds[0];
    await running;
    const cancelled = await run.execute('cancel', { name: 'task.cancel', arguments: { taskId, mode: 'immediate', reason: 'no longer needed' } });
    assert.equal(cancelled.details.axiomInstruction, 'task.cancel');
    assert.equal(JSON.parse(cancelled.content[0].text).status, 'cancelled');
    const [notice] = tasks.pendingNotifications();
    assert.equal(notice.id, taskId);
    const result = await run.execute('read', { name: 'task.read', arguments: { taskId, resultId: notice.resultId } });
    assert.equal(JSON.parse(result.content[0].text).status, 'cancelled');
    assert.equal(tasks.jobs.size, 1);
  } finally { await tasks.cancel(); store.database.close(); }
});

test('Todo through let preserves confirmation, abort, structured output and errors', async () => {
  const events = [], store = createTodoStore(), questions = createQuestions(e => events.push(e));
  const todo = new Todo({ sessionId: 's', store, questions, resolveRef: () => ({ toolName: 'let_axiom', instruction: 'todo.update' }) });
  const run = instructionTools(createBusinessInstructions(new Tasks(agent, () => {}), todo))[1];
  const target = { op: 'add', id: 'goal', level: 1, title: 'Result', description: 'Scope', acceptance: [{ criterionId: 'a', text: 'Actual test', check: 'tool' }] };
  try {
    const abort = new AbortController();
    const cancelled = run.execute('cancel-confirm', { name: 'todo.update', arguments: { baseVersion: 0, ops: [target] } }, abort.signal);
    assert.match(events[0].data.toolCallId, /^todo-approval-/);
    abort.abort();
    const declined = await cancelled;
    assert.equal(JSON.parse(declined.content[0].text).applied, false);
    assert.equal(todo.snapshot().counts.targets.total, 0);
    const promise = run.execute('confirm', { name: 'todo.update', arguments: { baseVersion: 0, ops: [target] } });
    const asked = events.findLast(e => e.type === 'question.asked');
    questions.reply(asked.data.toolCallId, [['确认并开始']]);
    const accepted = await promise;
    assert.equal(JSON.parse(accepted.content[0].text).applied, true);
    assert.equal(accepted.details.axiomInstruction, 'todo.update');
    const state = todo.snapshot();
    const rejected = await run.execute('self-proof', { name: 'todo.update', arguments: { listId: state.listId, baseVersion: state.version, ops: [{ op: 'status', id: 'goal', status: 'done', summary: 'claimed', verification: [{ criterionId: 'a', result: 'self proof', refs: [{ toolCallId: 'confirm' }] }] }] } });
    assert.equal(rejected.isError, true);
    assert.match(rejected.content[0].text, /TODO_INVALID_REFERENCE/);
    await assert.rejects(run.execute('invalid', { name: 'todo.read', arguments: { unexpected: true } }), /Invalid/);
  } finally { questions.cancel(); store.database.close(); }
});
