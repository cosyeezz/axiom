import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sessions } from '../src/sessions.js';
import { readSessionHistory } from '../src/session-history.js';
import { taskProfile } from '../src/agent-profile.js';

const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture({ noFile = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-review-boundary-'));
  const factory = async (_, selection = {}) => {
    const file = noFile ? null : selection.sessionFile ?? join(selection.sessionDir, `${randomUUID()}.jsonl`);
    if (file && !existsSync(file)) {
      await mkdir(selection.sessionDir, { recursive: true });
      await writeFile(file, [
        { type: 'session', version: 3, id: randomUUID(), cwd: root, timestamp: new Date().toISOString() },
        { type: 'message', id: 'seed-user', parentId: null, message: { role: 'user', content: 'seed', timestamp: Date.now() } },
      ].map(JSON.stringify).join('\n') + '\n');
    }
    return { config: () => ({ model: 'test/model' }), subscribe: () => () => {}, sessionFile: () => file,
      historyEntries: () => file ? readSessionHistory(file, root) : [], prompt: async () => {}, result: () => '',
      abort: async () => {}, dispose: async () => {}, withdraw: () => ({ steering: [], followUp: [] }) };
  };
  factory.catalog = () => [{ key: 'test/model' }];
  const sessions = new Sessions(factory, undefined, join(root, 'storage'));
  const id = await sessions.create(root), item = sessions.get(id);
  item.messages = item.agent.historyEntries().map(entry => ({ agentId: 'main', entryId: entry.id, message: entry.message }));
  if (noFile) item.messages.push({ agentId: 'main', message: { role: 'user', content: 'seed' } });
  await sessions.persist(item);
  await tick();
  return { root, sessions, id, item, cleanup: async () => { await sessions.close(); await rm(root, { recursive: true, force: true }); } };
}

test('copy rejects an already-entered recall and does not mix old metadata with new history', async () => {
  const { sessions, id, item, cleanup } = await fixture();
  const entered = deferred(), gate = deferred();
  try {
    item.messages.push({ agentId: 'main', entryId: 'withdrawn', message: { role: 'user', content: 'input' } });
    item.retries.push({ id: 'retry', agentId: 'main', anchorEntryId: 'withdrawn' });
    item.agent.recall = async () => { entered.resolve(); await gate.promise; return { entryId: 'withdrawn', text: 'input' }; };
    const recalling = sessions.withdraw(id, true);
    await entered.promise;
    await assert.rejects(sessions.duplicate(id), /运行|状态/);
    gate.resolve(); await recalling;
    assert.equal(item.configuring, false); assert.deepEqual(item.retries, []);
    const copy = await sessions.duplicate(id);
    assert.deepEqual(sessions.get(copy).retries, []);
  } finally { gate.resolve(); await cleanup(); }
});

test('copy holds pre-scheduled child continuations and resumes exactly once after unlock', async () => {
  const { sessions, id, item, cleanup } = await fixture();
  const entered = deferred(), gate = deferred();
  const persist = sessions.persist.bind(sessions);
  const launches = [];
  try {
    const job = { id: 'child', status: 'failed', executionId: 'old', notified: true, historySaved: true,
      pendingAppends: [{ text: 'new work', mode: 'steer' }] };
    item.tasks.jobs.set(job.id, job);
    item.tasks.launch = (current, resume, text) => { launches.push({ resume, text }); current.executionId = 'new'; current.status = 'completed'; };
    sessions.persist = async (...args) => { if (args[0] === item && item.copying) { entered.resolve(); await gate.promise; throw new Error('copy failure'); } return persist(...args); };
    item.tasks.resumeQueued(job); item.tasks.resumeQueued(job);
    const copying = assert.rejects(sessions.duplicate(id), /copy failure/);
    await entered.promise; await tick();
    assert.equal(launches.length, 0); assert.equal(job.pendingAppends.length, 1);
    gate.resolve(); await copying; await tick();
    assert.deepEqual(launches, [{ resume: true, text: 'new work' }]);
    assert.deepEqual(job.pendingAppends, []);
    await tick(); assert.equal(launches.length, 1);
  } finally { gate.resolve(); sessions.persist = persist; await cleanup(); }
});

for (const cold of [false, true]) for (const noFile of [false, true]) for (const sidecars of [false, true]) {
  test(`cleanup file inventory cold=${cold} mainMissing=${noFile} sidecars=${sidecars}`, async () => {
    const { sessions, id, item, cleanup } = await fixture({ noFile });
    try {
      const storageDir = item.storageDir, file = item.agent.sessionFile();
      await mkdir(storageDir, { recursive: true });
      if (file && sidecars) for (const suffix of ['.compaction-attempts.json', '.compaction-attempts.json.tmp', '.compaction-diagnostics.json']) await writeFile(file + suffix, '[]');
      for (const suffix of ['tasks', 'observations']) {
        await mkdir(join(storageDir, `${id}-${suffix}`, 'nested'), { recursive: true });
        await writeFile(join(storageDir, `${id}-${suffix}`, 'nested', 'history'), 'keep until delete');
      }
      await writeFile(join(storageDir, `${id}.json`), '{}');
      await writeFile(join(storageDir, 'unrelated.txt'), 'unrelated');
      if (cold) { await sessions.releaseIdle(Date.now() + 1000, 0); assert.equal(sessions.get(id).loaded, false); }
      await sessions.remove(id);
      assert.equal(sessions.store.hasSession(id), false);
      assert.deepEqual(await readdir(storageDir), ['unrelated.txt']);
    } finally { await cleanup(); }
  });
}

test('remove(false) preserves main history and auxiliary files', async () => {
  const { sessions, id, item, cleanup } = await fixture();
  try {
    const file = item.agent.sessionFile(), before = await readFile(file, 'utf8');
    await writeFile(file + '.compaction-attempts.json', '[]');
    await sessions.remove(id, false);
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal(await readFile(file + '.compaction-attempts.json', 'utf8'), '[]');
    assert.equal(sessions.store.hasSession(id), true);
  } finally { await cleanup(); }
});

test('cold tasks recompute retry eligibility after cancellation instead of persisting a transient denial', async () => {
  const { sessions, id, item, cleanup } = await fixture();
  const entered = deferred(), work = deferred();
  try {
    item.notificationsPaused = true;
    item.tasks.createAgent = async () => ({ subscribe: () => () => {}, sessionFile: () => item.agent.sessionFile(),
      prompt: async () => { entered.resolve(); await work.promise; }, result: () => '',
      abort: async () => work.resolve(), dispose: async () => {} });
    const [taskId] = item.tasks.start(['cancellable']);
    await entered.promise;
    await sessions.cancel(id);
    const saved = sessions.store.getSession(id).tasks.find(task => task.id === taskId);
    assert.equal(saved.canRetry, false, 'terminal persistence occurred while cancelling');
    assert.equal(sessions.snapshot(id).tasks[0].canRetry, true);
    // Acknowledge just this result; the acknowledgement patch must not rewrite canRetry.
    item.tasks.read(taskId, saved.resultId);
    await sessions.confirmTaskNotification(item, { id: taskId, resultId: saved.resultId });
    await tick();
    await sessions.releaseIdle(Date.now() + 1000, 0);
    assert.equal(sessions.get(id).loaded, false);
    assert.equal(sessions.snapshot(id).tasks[0].canRetry, true);
    // Cold projection is read-only; old records need not be migrated to repair the derived UI value.
    assert.equal(sessions.store.getSession(id).tasks[0].canRetry, false);
  } finally { work.resolve(); await cleanup(); }
});

test('Web tasks omit large internal records while persistence, cold child history and retry credentials survive', async () => {
  const { sessions, id, item, cleanup } = await fixture();
  try {
    item.notificationsPaused = true;
    const childFile = join(item.storageDir, 'child.jsonl');
    const entries = [
      { type: 'session', version: 3, id: 'child', cwd: item.cwd, timestamp: new Date().toISOString() },
      { type: 'custom_message', id: 'notice', parentId: null, timestamp: new Date().toISOString(), customType: 'task-notification', content: 'child notice', display: false, details: { marker: true } },
    ];
    await writeFile(childFile, entries.map(JSON.stringify).join('\n'));
    const job = { id: 'child', task: 'task', status: 'failed', text: 'current', resultId: 'current', notified: true,
      executionId: 'execution', cleanupStatus: 'stopped', historySaved: true, sessionFile: childFile,
      profile: taskProfile(), materials: 'short', parentContext: 'short', previousResults: { old: { id: 'child', resultId: 'old', text: 'old result', notified: true } },
      runtime: { model: 'test/model' }, pendingAppends: [], persistenceVersion: 3, createdAt: 1, updatedAt: 2 };
    item.tasks.jobs.set(job.id, job);
    const short = JSON.stringify(sessions.snapshot(id).tasks);
    const large = 'private material '.repeat(131072);
    job.materials = large; job.parentContext = large; job.previousResults.old.text = large;
    const before = structuredClone(job);
    const hot = sessions.snapshot(id).tasks[0];
    assert.equal(JSON.stringify([hot]).length, short.length);
    assert.deepEqual(job, before, 'projection does not mutate jobs');
    for (const key of ['materials', 'sourceKey', 'budget', 'pendingAppends', 'notified', 'notificationHeld', 'previousResults', 'parentContext', 'persistenceVersion', 'sessionFile', 'historySaved']) assert.equal(key in hot, false, key);
    assert.equal(hot.canRetry, true); assert.equal(hot.resultId, 'current'); assert.deepEqual(hot.profile, job.profile);
    assert.equal(item.tasks.snapshotJob(job).materials, large);
    await sessions.persist(item, { task: item.tasks.snapshotJob(job) });
    assert.equal(sessions.store.getSession(id).tasks[0].materials, large);
    await sessions.releaseIdle(Date.now() + 1000, 0);
    assert.equal(sessions.get(id).loaded, false);
    const coldSnapshot = sessions.snapshot(id), cold = coldSnapshot.tasks[0];
    assert.deepEqual(Object.keys(cold).sort(), Object.keys(hot).filter(key => hot[key] !== undefined).sort());
    assert.equal(cold.canRetry, true); assert.equal(cold.resultId, 'current'); assert.deepEqual(cold.profile, hot.profile);
    assert.ok(cold.runtime.billing); assert.ok(coldSnapshot.messages.some(m => m.agentId === 'child' && m.entryId === 'notice'));
    const restored = await sessions.ensureLoaded(id);
    assert.equal(restored.tasks.jobs.get('child').materials, large);
    assert.equal(restored.tasks.read('child', 'old').text, large);
    assert.equal(restored.tasks.read('child', 'current').text, 'current');
    assert.ok(sessions.snapshot(id).messages.some(m => m.agentId === 'child' && m.entryId === 'notice'), 'real hot restoration preserves child custom message');
    console.log(`P04 task JSON bytes short/large=${short.length}/${JSON.stringify([hot]).length}; internal materials bytes=${large.length}`);
  } finally { await cleanup(); }
});
