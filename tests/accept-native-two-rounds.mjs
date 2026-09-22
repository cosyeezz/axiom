// Explicit, bounded real-provider acceptance. No defaults pointing at user files.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelRuntime, SessionManager, SettingsManager, createAgentSession, DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import { createBackgroundCompaction, describeCompactionError } from '../src/compaction.js';
import { summarizeNative } from '../src/native-summary.js';
import { installDurableJournal, createJournalArchive } from '../src/history-journal.js';
import { createHistoryReader } from '../src/history-tools.js';

const { SESSION_FILE, MODELS_FILE, COMPACTION_MODEL } = process.env;
if (!SESSION_FILE || !MODELS_FILE || !COMPACTION_MODEL) throw new Error('Set SESSION_FILE, MODELS_FILE and COMPACTION_MODEL explicitly (real paid requests).');
const dir = mkdtempSync(join(tmpdir(), 'axiom-native-accept-'));
let session, archive, ctrl, requests = 0;
try {
  const file = join(dir, 'session.jsonl'); copyFileSync(SESSION_FILE, file);
  const runtime = await ModelRuntime.create({ modelsPath: MODELS_FILE, authPath: join(dir, 'auth.json') });
  const available = await runtime.getAvailable();
  const model = available.find(m => `${m.provider}/${m.id}` === COMPACTION_MODEL);
  assert.ok(model, 'Configured model unavailable');
  const manager = SessionManager.open(file, dir); installDurableJournal(manager);
  const originals = manager.getBranch().filter(e => e.type === 'message').map(e => e.id);
  archive = await createJournalArchive({ file }); await archive.barrier();
  const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const loader = new DefaultResourceLoader({ cwd: dir, agentDir: dir, settingsManager: settings, noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true });
  await loader.reload();
  ({ session } = await createAgentSession({ cwd: dir, agentDir: dir, modelRuntime: runtime, model, thinkingLevel: 'off', noTools: 'all', resourceLoader: loader, settingsManager: settings, sessionManager: manager }));
  const bounded = async args => {
    const timeout = AbortSignal.timeout(240000);
    const signal = AbortSignal.any([args.signal, timeout]);
    const original = runtime.streamSimple.bind(runtime);
    const wrappedRuntime = Object.create(runtime);
    wrappedRuntime.streamSimple = (...call) => { if (++requests > 8) throw new Error('Request limit exceeded'); return original(...call); };
    return summarizeNative({ ...args, signal, modelRuntime: wrappedRuntime });
  };
  ctrl = createBackgroundCompaction({ session, modelRuntime: runtime, available, summarize: bounded,
    config: { enabled: true, model: COMPACTION_MODEL, thinking: 'off', tokenThreshold: 100000, percentThreshold: null, keepRecentTokens: 5000, syncKeepRecentTokens: 2000 },
    beforeCommit: async ({ compactedMessageIds }) => { await archive.barrier(); const ids = new Set(archive.records().map(r => r.origin.entryId)); assert.ok(compactedMessageIds.every(id => ids.has(id) || manager.getBranch().find(e => e.id === id)?.type !== 'message')); },
  });
  const rounds = [];
  let parent;
  for (let round = 1; round <= 2; round++) {
    manager.appendMessage({ role: 'user', content: `验收第${round}轮：继续保留原有重要约束。` + '这是隔离验收副本，不修改原会话。'.repeat(600), timestamp: Date.now() });
    session.agent.state.messages = manager.buildSessionContext().messages;
    const status = await ctrl.runNow('sync');
    assert.equal(status.status, 'applied', status.message);
    const record = manager.getBranch().findLast(e => e.type === 'compaction');
    assert.equal(record.details.nativeSummary, true);
    if (parent) assert.equal(record.details.parentCompactionId, parent);
    parent = record.id;
    await archive.barrier();
    const allowed = new Set(manager.getBranch().map(e => e.id));
    assert.ok(record.details.stateDoc?.trim());
    assert.equal(record.details.stateBoundary, record.firstKeptEntryId);
    assert.equal(record.details.excerpts, undefined);
    const attempt = ctrl.getAttempt(status.runs.at(-1).id);
    const stateRequest = attempt.requests.at(-1).context.messages[0].content;
    if (round === 2) assert.ok(stateRequest.includes(JSON.stringify(rounds[0].stateDoc).slice(1, -1)));
    assert.ok(attempt.stateDoc);
    for (const id of originals) assert.ok(allowed.has(id));
    const reopened = SessionManager.open(file, dir);
    assert.equal(reopened.getBranch().findLast(e => e.type === 'compaction').id, record.id);
    assert.equal(reopened.buildSessionContext().messages[0].role, 'compactionSummary');
    assert.equal(reopened.getBranch().findLast(e => e.type === 'compaction').details.stateDoc, record.details.stateDoc);
    rounds.push({ round, applied: true, stateDoc: record.details.stateDoc, stateChars: record.details.stateDoc.length, summaryChars: record.summary.length, requests });
  }
  console.log(JSON.stringify({ ok: true, rounds: rounds.map(({ stateDoc, ...info }) => info), originalsPreserved: originals.length, requests }));
} catch (error) { console.error(JSON.stringify({ ok: false, error: describeCompactionError(error), requests })); process.exitCode = 1; }
finally { ctrl?.dispose(); session?.dispose(); await archive?.close(); rmSync(dir, { recursive: true, force: true }); }
