import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";
import { command } from "../src/protocol.js";

const makeFactory = () => {
  const factory = () => {};
  factory.catalog = () => [{ key: "a/b" }];
  return factory;
};

test("presets CRUD persist across restart and strip trustProject/useDefaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-presets-"));
  let sessions, restored;
  try {
    sessions = new Sessions(makeFactory(), join(dir, "defaults.json"));
    assert.deepEqual(await sessions.listPresets(), { presets: [] });
    const saved = await sessions.savePreset({
      name: " 开发 ",
      cwd: join(dir, "proj"),
      selection: { model: "a/b", trustProject: true, useDefaults: false, subagentCapabilities: "inherit" },
    });
    assert.match(saved.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(saved.name, "开发");
    assert.deepEqual(saved.selection, { model: "a/b", subagentCapabilities: "inherit" });
    assert.equal(saved.cwd, join(dir, "proj"));
    const updated = await sessions.savePreset({ presetId: saved.id, name: "开发2", selection: { thinking: "high" } });
    assert.equal(updated.id, saved.id);
    assert.equal(updated.cwd, undefined);
    const store = { presets: [updated] };
    assert.deepEqual(await sessions.listPresets(), store);
    // 重启（同目录新实例）读回
    restored = new Sessions(makeFactory(), join(dir, "defaults.json"));
    assert.deepEqual(await restored.listPresets(), store);
    await sessions.deletePreset(saved.id);
    assert.deepEqual(await sessions.listPresets(), { presets: [] });
    await assert.rejects(sessions.deletePreset(saved.id), /Unknown preset/);
    await assert.rejects(sessions.savePreset({ presetId: randomUUID(), name: "x", selection: {} }), /Unknown preset/);
  } finally {
    await sessions?.close();
    await restored?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("presets reject invalid input and keep the stored file intact", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-presets-"));
  let sessions;
  try {
    sessions = new Sessions(makeFactory(), join(dir, "defaults.json"));
    const good = await sessions.savePreset({ name: "good", selection: {} });
    await assert.rejects(sessions.savePreset({ name: "  ", selection: {} }));
    await assert.rejects(sessions.savePreset({ name: "x".repeat(81), selection: {} }));
    await assert.rejects(sessions.savePreset({ name: "ok", selection: { thinking: "bogus" } }));
    await assert.rejects(sessions.savePreset({ name: "ok", selection: { model: 42 } }));
    await assert.rejects(sessions.savePreset({ name: "ok", selection: { capabilities: { skills: ["a"], extra: 1 } } }));
    assert.deepEqual(await sessions.listPresets(), { presets: [good] });
  } finally {
    await sessions?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("concurrent preset saves serialize without losing writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-presets-"));
  let sessions;
  try {
    sessions = new Sessions(makeFactory(), join(dir, "defaults.json"));
    await Promise.all(Array.from({ length: 6 }, (_, i) =>
      sessions.savePreset({ name: `p${i}`, selection: { model: "a/b" } })));
    const { presets } = await sessions.listPresets();
    assert.equal(presets.length, 6);
    await Promise.all(presets.map((preset) => sessions.deletePreset(preset.id)));
    assert.deepEqual(await sessions.listPresets(), { presets: [] });
  } finally {
    await sessions?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("stale preset cwd fails at session creation, not at list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-presets-"));
  let sessions;
  try {
    sessions = new Sessions(makeFactory(), join(dir, "defaults.json"), join(dir, "storage"));
    const saved = await sessions.savePreset({ name: "gone", cwd: join(dir, "missing"), selection: {} });
    assert.deepEqual(await sessions.listPresets(), { presets: [saved] });
    await assert.rejects(sessions.create(saved.cwd), /ENOENT/);
  } finally {
    await sessions?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("protocol validates preset commands", () => {
  assert.equal(command.parse({ id: "1", type: "session.presets.list" }).type, "session.presets.list");
  const save = { id: "1", type: "session.presets.save", name: "x", selection: {} };
  assert.equal(command.parse(save).name, "x");
  assert.throws(() => command.parse({ ...save, name: "" }));
  assert.throws(() => command.parse({ ...save, name: "x".repeat(81) }));
  assert.throws(() => command.parse({ ...save, presetId: "not-uuid" }));
  assert.throws(() => command.parse({ ...save, trustProject: true }));
  assert.throws(() => command.parse({ ...save, selection: undefined }));
  assert.throws(() => command.parse({ id: "1", type: "session.presets.delete" }));
  const parsed = command.parse({ id: "1", type: "session.presets.delete", presetId: randomUUID() });
  assert.match(parsed.presetId, /^[0-9a-f-]{36}$/);
});
