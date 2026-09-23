import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Sessions } from '../src/sessions.js';

test('last explicit model choice overrides defaults globally and survives restart without changing existing sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-recent-'));
  const other = join(dir, 'other'); await mkdir(other);
  const path = join(dir, 'defaults.json');
  let catalog = [{ key: 'p/default', levels: ['off', 'high'] }, { key: 'p/recent', levels: ['off', 'high'] }];
  const factory = async (_tools, selected) => {
    let config = { model: selected.model || 'p/default', thinking: selected.thinking || 'off' };
    return { config: () => config, configure: async (value) => { for (const key of ['model', 'thinking']) if (value[key] !== undefined) config[key] = value[key]; return { ...config }; }, subscribe: () => () => {}, abort: async () => {}, dispose: () => {} };
  };
  factory.catalog = () => catalog;
  let sessions;
  try {
    sessions = new Sessions(factory, path); await sessions.loadDefaults();
    await sessions.configureDefaults(undefined, { model: 'p/default', thinking: 'off' });
    const old = await sessions.create(dir), chosen = await sessions.create(dir);
    await sessions.configure(chosen, { model: 'p/recent', thinking: 'high' });
    assert.equal(sessions.snapshot(old).config.model, 'p/default');
    const next = await sessions.create(other);
    assert.equal(sessions.snapshot(next).config.model, 'p/recent');
    assert.equal(sessions.snapshot(next).config.thinking, 'high');
    await sessions.close();
    sessions = new Sessions(factory, path); await sessions.loadDefaults();
    const restored = await sessions.create(other);
    assert.equal(sessions.snapshot(restored).config.model, 'p/recent');
    assert.equal(sessions.snapshot(restored).config.thinking, 'high');
    const explicit = await sessions.create(other, { model: 'p/default', thinking: 'off' });
    assert.equal(sessions.snapshot(explicit).config.model, 'p/default');
    catalog[1].levels = ['off'];
    const staleThinking = await sessions.create(dir);
    assert.equal(sessions.snapshot(staleThinking).config.model, 'p/default', 'unsupported remembered thinking falls back safely');
    catalog = catalog.slice(0, 1);
    const fallback = await sessions.create(dir);
    assert.equal(sessions.snapshot(fallback).config.model, 'p/default');
    sessions.database.set('defaults', 'recent', { model: 'p/default', thinking: 5, capabilities: { skills: ['unexpected'] } });
    await sessions.close();
    sessions = new Sessions(factory, path); await sessions.loadDefaults();
    assert.equal(sessions.recentConfig, null, 'malformed persisted preference is ignored');
  } finally { await sessions?.close(); await rm(dir, { recursive: true, force: true }); }
});
