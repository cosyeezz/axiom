import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sessions } from '../src/sessions.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async check => { for (let n=0;n<200;n++) { if (check()) return; await new Promise(r=>setTimeout(r,5)); } assert.fail('deadline'); };

test('eligible raw compactions survive restart, deduplicate, ignore checkpoint and remain paused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-memory-lifecycle-'));
  const selections = [];
  const entries = [{ id: 'u1', message: { role: 'user', content: '原始用户要求' } }, { id: 't1', message: { role: 'toolResult', toolName: 'bash', toolCallId: 'failed', isError: true, content: [{ type: 'text', text: '原始失败结果' }] } }];
  const factory = async (tools, selection) => {
    selections.push({ tools, selection });
    return { config: () => ({ model: 'test/model', capabilities: { skills: [], plugins: [], mcp: [] } }),
      historyEntries: () => selection.profile.role === 'main' ? entries : [],
      subscribe: () => () => {}, prompt: async () => {}, result: () => '没有值得保留的新信息，不写入', abort: async () => {}, dispose: async () => {} };
  };
  factory.catalog = () => [{ key: 'test/model' }];
  let sessions = new Sessions(factory, undefined, join(root, 'sessions'));
  try {
    const id = await sessions.create(root), item = sessions.get(id);
    for (const entry of entries) item.emit({ type: 'agent.message.end', data: { entryId: entry.id, message: entry.message } });
    await sessions.safeStop(id);
    const event = { id: 'c1', summary: '推断摘要不应作为事实', compactedMessageIds: ['u1','t1'] };
    item.emit({ type: 'agent.compaction', data: event });
    item.emit({ type: 'agent.compaction', data: { ...event, id: 'checkpoint', checkpoint: true } });
    await tick(); assert.equal(item.tasks.jobs.size, 0);
    await item.saving; await sessions.close();
    sessions = new Sessions(factory, undefined, join(root, 'sessions'));
    await sessions.load(); await sessions.ensureLoaded(id);
    const restored = sessions.get(id);
    await tick(); assert.equal(restored.tasks.jobs.size, 0, 'restart cannot release memory pause');
    assert.equal(restored.memoryPaused, true);
    // Explicit new user execution releases this non-Todo stop; ordinary recovery does not.
    await sessions.prompt(id, '继续'); await restored.work;
    await until(() => restored.tasks.jobs.size === 1);
    const job = [...restored.tasks.jobs.values()][0]; await job.done;
    assert.equal(job.sourceKey, 'c1');
    assert.equal(job.budget.workMs, restored.taskBudget.workSeconds * 1000);
    assert.match(job.materials, /原始失败结果/); assert.match(job.materials, /"isError":true/);
    assert.doesNotMatch(job.materials, /推断摘要/);
    assert.equal(job.profile.purpose, 'memory-maintain'); assert.equal(job.notified, true);
    const child = selections.find(s => s.selection.profile.purpose === 'memory-maintain');
    assert.deepEqual(child.tools, []); assert.deepEqual(child.selection.capabilities, { skills: [], plugins: [], mcp: [] });
    await assert.rejects(child.selection.instructions.execute('task.start', {}), /Unknown/);
    assert.match((await child.selection.instructions.execute('memory.material', {})).text, /sessionId/);
    restored.emit({ type: 'agent.compaction', data: event }); await tick();
    assert.equal(restored.tasks.jobs.size, 1);
    await sessions.close();
    sessions = new Sessions(factory, undefined, join(root, 'sessions'));
    await sessions.load(); await sessions.ensureLoaded(id); await tick();
    assert.equal(sessions.get(id).tasks.jobs.size, 1);
    const persisted = [...sessions.get(id).tasks.jobs.values()][0];
    assert.deepEqual(persisted.profile, job.profile);
    assert.equal(persisted.materials, job.materials);
    assert.equal(persisted.resultId, job.resultId);
    assert.deepEqual(persisted.budget, job.budget);
  } finally { await sessions.close(); await rm(root, { recursive: true, force: true }); }
});

test('safe stop of an idle parent cancels an active maintenance writer without a notification wakeup', async () => {
  let finish, aborted = 0;
  const factory = async (_tools, selection) => ({ config: () => ({ model: 'test/model' }), subscribe: () => () => {},
    prompt: () => selection.profile.purpose === 'memory-maintain' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(),
    result: () => 'done', abort: async () => { aborted++; finish?.(); }, dispose: async () => {} });
  factory.catalog = () => [{ key: 'test/model' }];
  const sessions = new Sessions(factory);
  try {
    const id = await sessions.create(), item = sessions.get(id);
    const [jobId] = item.tasks.start([{ task: 'maintain', profile: { purpose: 'memory-maintain' }, materials: 'source' }]);
    await until(() => finish);
    await sessions.safeStop(id);
    assert.equal(aborted, 1); assert.equal(item.status, 'idle'); assert.equal(item.notificationsPaused, true);
    assert.equal(item.tasks.jobs.get(jobId).status, 'cancelled');
    assert.deepEqual(item.tasks.pendingNotifications(), []);
    await assert.rejects(sessions.appendTask(id, jobId, 'write more'), /记忆整理已暂停/);
    await assert.rejects(sessions.retryTask(id, jobId), /记忆整理已暂停/);
    const rawJob = item.tasks.jobs.get(jobId);
    // The business task.append instruction uses Tasks directly: the factory must still deny a writer.
    rawJob.sessionFile = 'retained-history';
    await item.tasks.append(jobId, 'resume through business instruction');
    await rawJob.done;
    assert.equal(rawJob.status, 'failed');
    assert.match(rawJob.error, /记忆整理已暂停/);
    sessions.startRun(item, () => item.agent.prompt('internal notice'));
    await item.work; assert.equal(item.memoryPaused, true, 'automatic runs cannot release memory pause');
    // A writer whose stop is unconfirmed also blocks future maintenance after explicit resume.
    item.memoryPaused = false; item.notificationsPaused = false;
    item.tasks.jobs.get(jobId).cleanupStatus = 'unconfirmed';
    item.messages.push({ agentId: 'main', entryId: 'source', message: { role: 'user', content: 'new fact' } });
    item.memoryPending = new Map([['next', { compactedMessageIds: ['source'] }]]);
    sessions.scheduleMemory(item); await tick();
    assert.equal(item.tasks.jobs.size, 1);
    assert.equal(item.memoryPending.size, 1);
  } finally { await sessions.close(); }
});
