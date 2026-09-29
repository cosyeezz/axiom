import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sessions } from '../src/sessions.js';

for (const cold of [false, true]) for (const phase of ['persist', 'publish']) test(`duplicate holds source across async work (cold=${cold}, phase=${phase}) and releases on failure`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-copy-lock-'));
  const file = join(root, 'main.jsonl');
  await writeFile(file, JSON.stringify({type:'session',version:3,id:'source',cwd:root}) + '\n');
  const factory = async (_, selection = {}) => ({
    config: () => ({model:'test/model'}), subscribe: () => () => {},
    sessionFile: () => selection.sessionFile ?? file, historyEntries: () => [],
    prompt: async () => {}, result: () => '', abort: async () => {}, dispose: async () => {},
  });
  factory.catalog = () => [{key:'test/model'}];
  const sessions = new Sessions(factory, undefined, join(root, 'storage'));
  let release;
  const persist = sessions.persist.bind(sessions), create = sessions.create.bind(sessions);
  try {
    const id = await sessions.create(root), other = await sessions.create(root);
    await new Promise(setImmediate);
    if (cold) await sessions.releaseIdle(Date.now() + 1000, 0);
    const item = sessions.get(id);
    assert.equal(item.loaded, !cold);
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    sessions.persist = async (...args) => {
      if (phase === 'persist' && args[0] === item) { entered(); await gate; throw new Error('copy read failed'); }
      return persist(...args);
    };
    sessions.create = async (...args) => {
      if (phase === 'publish' && args[2]?.id !== id && args[2]?.titleManual) {
        entered(); await gate; throw new Error('copy read failed');
      }
      return create(...args);
    };
    const copying = sessions.duplicate(id);
    const rejected = assert.rejects(copying, /copy read failed/);
    await started;
    assert.equal(item.copying, true);
    for (const conflict of [
      () => sessions.prompt(id, 'conflict'), () => sessions.configure(id, {model:'test/model'}),
      () => sessions.remove(id), () => sessions.revert(id,'x'), () => sessions.fork(id,'x'),
      () => sessions.rename(id, 'conflict'), () => sessions.duplicate(id),
      () => sessions.startCompaction(id, 'sync'), () => sessions.retry(id),
    ]) await assert.rejects(conflict(), /busy|复制|运行|状态/);
    await sessions.prompt(other, 'other stays available'); await sessions.get(other).work;
    release(); await rejected;
    assert.equal(item.copying, false); assert.equal(item.configuring, false);
    sessions.persist = persist; sessions.create = create;
    await sessions.rename(id, 'unlocked');
    const copy = await sessions.duplicate(id);
    assert.equal(sessions.get(copy).title, 'unlocked 1');
  } finally {
    release?.(); sessions.persist = persist; sessions.create = create;
    await sessions.close(); await rm(root, {recursive:true,force:true});
  }
});
