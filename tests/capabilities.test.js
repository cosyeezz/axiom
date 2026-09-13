import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverCapabilities, capabilityLoader, resolveCapabilities, refreshProjectSkills } from "../src/capabilities.js";
import { command } from "../src/protocol.js";
import { Sessions } from "../src/sessions.js";

test("selected workspaces load project skills by default, filter plugins and leave Pi settings unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-capabilities-"));
  const agentDir = join(root, "agent"), cwd = join(root, "project");
  try {
    await mkdir(join(agentDir, "skills", "sample"), { recursive: true });
    await mkdir(join(agentDir, "extensions"), { recursive: true });
    await mkdir(join(cwd, ".pi", "extensions"), { recursive: true });
    await mkdir(join(cwd, ".pi", "skills", "project-sample"), { recursive: true });
    await writeFile(join(cwd, ".pi", "skills", "project-sample", "SKILL.md"), "---\nname: project-sample\ndescription: Project skill\n---\nProject instructions");
    await writeFile(join(agentDir, "settings.json"), '{"defaultModel":"original"}');
    await writeFile(join(agentDir, "skills", "sample", "SKILL.md"), "---\nname: sample\ndescription: Test skill\n---\nSample instructions");
    await writeFile(join(agentDir, "extensions", "good.js"), "export default function(pi) { pi.registerCommand('sample', {handler: async()=>{}}); }");
    await writeFile(join(cwd, ".pi", "extensions", "bad.js"), "throw new Error('UNSELECTED_PLUGIN_EXECUTED');");
    const resources = await discoverCapabilities(cwd, { agentDir });
    assert.equal(resources.catalog.projectTrusted, true);
    assert.equal(resources.catalog.needsTrust, false);
    assert.equal(resources.catalog.plugins.length, 2);
    assert.deepEqual(resources.catalog.skills.map((s) => s.name).sort(), ["project-sample", "sample"]);
    // 旧会话保存的 false 也不能让工作空间退回仅全局能力。
    const restored = await discoverCapabilities(cwd, { agentDir, trustProject: false });
    assert.deepEqual(restored.catalog, resources.catalog);
    const selected = {
      skills: resources.catalog.skills.map((s) => s.id),
      plugins: resources.catalog.plugins.filter((p) => p.id.endsWith("good.js")).map((p) => p.id), mcp: [],
    };
    const { loader } = capabilityLoader(resources, selected, []);
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    assert.equal(loader.getExtensions().extensions.length, 2);
    const contextHook = loader.getExtensions().extensions.flatMap((ext) => ext.handlers.get("context") || []);
    assert.equal(contextHook.length, 1);
    const image = { type: "image", mimeType: "image/png", data: "AA==" };
    const message = { role: "user", content: [{ type: "text", text: "前[image1]后" }, image] };
    assert.deepEqual(contextHook[0]({ messages: [message] }).messages[0].content, [
      { type: "text", text: "前[image1]" }, image, { type: "text", text: "后" },
    ]);
    assert.deepEqual(loader.getSkills().skills.map((s) => s.name).sort(), ["project-sample", "sample"]);
    resources.settingsManager.setDefaultModel("changed");
    await resources.settingsManager.flush();
    assert.equal(await readFile(join(agentDir, "settings.json"), "utf8"), '{"defaultModel":"original"}');
    assert.throws(() => resolveCapabilities({ ...selected, plugins: ["arbitrary-file.js"] }, resources.catalog), /未知/);
    assert.equal(resolveCapabilities(null, resources.catalog).plugins.length, 2);
    assert.equal(command.safeParse({ id: "1", type: "session.create", capabilities: { ...selected, unknown: [] } }).success, false);
    assert.equal(command.safeParse({ id: "1", type: "session.create", model: "test/model", capabilities: selected, subagentCapabilities: null }).success, true);
    loader.getExtensions().runtime.invalidate();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stale absolute IDs only narrow a saved allowlist, never match by skill name", () => {
  const old = { skills: ["C:\\old\\skills\\same\\SKILL.md", "/Users/old/skills/same/SKILL.md", "shared"], plugins: ["old.js"], mcp: ["gone"] };
  const catalog = { skills: [{ id: "/new/skills/same/SKILL.md" }, { id: "shared" }], plugins: [{ id: "new.js" }], mcp: [{ id: "new" }] };
  const warnings = [];
  assert.deepEqual(resolveCapabilities(old, catalog, { allowUnavailable: true, warnings }), { skills: ["shared"], plugins: [], mcp: [] });
  assert.equal(warnings.length, 3);
  assert.throws(() => resolveCapabilities(old, catalog), /C:\\old|不可用/);
  assert.throws(() => resolveCapabilities({ skills: null }, catalog, { allowUnavailable: true }), /无效/);
  assert.deepEqual(resolveCapabilities(null, catalog).skills, catalog.skills.map((s) => s.id));
});

test("missing saved skills do not block another workspace or startup; broken histories stay on disk", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "axiom-recovery-"));
  const agentDir = join(root, "agent"), a = join(root, "a"), b = join(root, "b");
  const storage = join(root, "sessions");
  const warnings = [];
  t.mock.method(console, "warn", (message) => warnings.push(message));
  const calls = [];
  const factory = async (_, selection) => {
    calls.push(selection);
    return {
      config: () => ({ model: "test/model" }), subscribe: () => () => {},
      prompt: async () => {}, result: () => "done", abort: async () => {}, dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "test/model" }];
  factory.capabilities = async (cwd) => (await discoverCapabilities(cwd, { agentDir, loadAdapter: false })).catalog;
  const first = new Sessions(factory, undefined, storage);
  const restored = new Sessions(factory, undefined, storage);
  try {
    await mkdir(join(a, ".pi", "skills", "local"), { recursive: true });
    await mkdir(b);
    await mkdir(agentDir);
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({ defaultProjectTrust: "always" }));
    const skill = join(a, ".pi", "skills", "local", "SKILL.md");
    await writeFile(skill, "---\nname: local\ndescription: Project skill\n---\nInstructions");
    const catalog = await factory.capabilities(a);
    assert.equal(catalog.skills.length, 1);
    const custom = { skills: catalog.skills.map((s) => s.id), plugins: [], mcp: [] };
    await first.configureDefaults(a, { capabilities: custom, subagentCapabilities: "inherit" });
    const id = await first.create(a);
    const other = await first.create(b);
    assert.deepEqual(first.get(other).capabilities.skills, []);
    assert.deepEqual((await first.workspaceDefaults(a)).capabilities, custom);
    assert.deepEqual(first.getDefaults().capabilities.skills, []);
    await first.rename(id, "history survives");
    await first.close();
    await rm(skill);
    const [workspace] = await readdir(storage);
    const broken = join(storage, workspace, "broken.json");
    await writeFile(broken, "{bad json");
    const missingDir = join(storage, workspace, "missing-dir.json");
    const missingHistory = JSON.stringify({ cwd: join(root, "removed"), selection: {} });
    await writeFile(missingDir, missingHistory);
    await restored.load();
    assert.equal(restored.list().length, 2);
    assert.equal(restored.get(id).title, "history survives");
    await restored.ensureLoaded(id);
    assert.deepEqual(restored.get(id).capabilities, { skills: [], plugins: [], mcp: [] });
    const tasks = restored.get(id).tasks;
    await Promise.all(tasks.start(["child"]).map((taskId) => tasks.jobs.get(taskId).done));
    assert.deepEqual(calls.at(-1).capabilities.skills, []);
    assert.equal(await readFile(broken, "utf8"), "{bad json");
    assert.equal(await readFile(missingDir, "utf8"), missingHistory);
    assert(warnings.some((line) => line.includes(catalog.skills[0].id)));
    assert(warnings.some((line) => line.includes(broken)));
    assert(warnings.some((line) => line.includes(missingDir)));
  } finally {
    await first.close();
    await restored.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("main and delegated agents receive independent capability and model selections", async () => {
  const calls = [];
  const factory = async (tools, selection) => {
    calls.push({ tools, selection });
    return {
      config: () => ({ model: selection.model || "a/main", thinking: "off", levels: ["off"] }),
      subscribe: () => () => {}, prompt: async () => {}, result: () => "done",
      abort: async () => {}, dispose: async () => {},
    };
  };
  factory.catalog = () => [{ key: "a/main" }, { key: "b/child" }];
  factory.capabilities = async () => ({ skills: [{ id: "s" }], mcp: [{ id: "m" }], plugins: [{ id: "p" }] });
  const sessions = new Sessions(factory);
  const main = { skills: ["s"], mcp: [], plugins: ["p"] };
  const child = { skills: [], mcp: ["m"], plugins: [] };
  try {
    const id = await sessions.create(process.cwd(), { capabilities: main, subagentCapabilities: child, subagentModel: "b/child" });
    const item = sessions.get(id);
    await Promise.all(item.tasks.start(["test"]).map((taskId) => item.tasks.jobs.get(taskId).done));
    assert.deepEqual(calls[0].selection.capabilities, main);
    assert.deepEqual(calls[1].selection.capabilities, child);
    assert.equal(calls[1].selection.model, "b/child");
    assert.equal(calls[1].tools.length, 0);
    assert.deepEqual(sessions.snapshot(id).config.subagentCapabilities, child);
    const before = calls.length;
    await assert.rejects(sessions.create(process.cwd(), { subagentCapabilities: { ...child, mcp: ["unknown"] } }), /未知/);
    assert.equal(calls.length, before);
  } finally { await sessions.close(); }
});

test("runtime-added project skills appear via extendResources refresh, allowlist still filters", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-refresh-skills-"));
  const agentDir = join(root, "agent"), cwd = join(root, "project");
  try {
    await mkdir(join(agentDir, "skills", "global-sample"), { recursive: true });
    await mkdir(cwd, { recursive: true });
    await writeFile(join(agentDir, "settings.json"), "{}");
    await writeFile(join(agentDir, "skills", "global-sample", "SKILL.md"), "---\nname: global-sample\ndescription: Global\n---\nGlobal");
    const resources = await discoverCapabilities(cwd, { agentDir, loadAdapter: false });
    // 全部模式：loader 初始看不到运行中才写入的项目技能
    const allLoader = capabilityLoader(resources, null, []).loader;
    try {
      await allLoader.reload();
      assert.deepEqual(allLoader.getSkills().skills.map((s) => s.name), ["global-sample"]);
      await mkdir(join(cwd, ".pi", "skills", "late"), { recursive: true });
      await writeFile(join(cwd, ".pi", "skills", "late", "SKILL.md"), "---\nname: late\ndescription: Added while running\n---\nLate");
      // 与 pi.js refreshSkills 相同的刷新路径：重新发现 → diff → extendResources
      const fresh = await discoverCapabilities(cwd, { agentDir, loadAdapter: false });
      const known = new Set(allLoader.getSkills().skills.map((s) => s.filePath));
      const added = fresh.catalog.skills.filter((s) => !known.has(s.id));
      assert.equal(added.length, 1);
      allLoader.extendResources({ skillPaths: added.map((s) => ({ path: s.id, metadata: { source: s.scope, scope: s.scope, origin: "top-level" } })) });
      assert(allLoader.getSkills().skills.some((s) => s.name === "late"), "全部模式刷新后应可见新项目技能");
    } finally { allLoader.getExtensions().runtime.invalidate(); }
    // 自定义 allowlist：同样的注入路径，新技能仍被 skillsOverride 过滤（不绕过 allowlist）
    const custom = capabilityLoader(resources, { skills: [], plugins: [], mcp: [] }, []);
    try {
      await custom.loader.reload();
      assert.deepEqual(custom.loader.getSkills().skills.map((s) => s.name), []);
      const fresh = await discoverCapabilities(cwd, { agentDir, loadAdapter: false });
      custom.loader.extendResources({ skillPaths: fresh.catalog.skills.map((s) => ({ path: s.id, metadata: { source: s.scope, scope: s.scope, origin: "top-level" } })) });
      assert.deepEqual(custom.loader.getSkills().skills.map((s) => s.name), []);
      const visible = refreshProjectSkills(custom.loader, custom.selected, fresh.catalog);
      assert.deepEqual(visible.map((s) => s.name), ["late"], "composer can select project skills despite an old custom snapshot");
      assert(!visible.some((s) => s.name === "global-sample"), "unselected global skills remain excluded");
      assert.deepEqual(custom.selected.plugins, []);
      assert.deepEqual(custom.selected.mcp, []);
      refreshProjectSkills(custom.loader, custom.selected, fresh.catalog);
      assert.equal(custom.selected.skills.length, 1, "repeated refresh does not duplicate skill IDs");
    } finally { custom.loader.getExtensions().runtime.invalidate(); }
    assert.equal(command.safeParse({ id: "1", type: "session.skills.refresh", sessionId: "s" }).success, true);
    assert.equal(command.safeParse({ id: "1", type: "session.skills.refresh" }).success, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
