import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverCapabilities, capabilityLoader, resolveCapabilities, refreshProjectSkills } from "../src/capabilities.js";
import { command } from "../src/protocol.js";
import { Sessions } from "../src/sessions.js";
import { MAIN_AGENT_PROMPT, SUBAGENT_PROMPT } from "../src/prompts.js";

test("main policy is appended without replacing Pi defaults or leaking to subagents", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-prompts-"));
  const agentDir = join(root, "agent"), cwd = join(root, "project");
  try {
    await mkdir(agentDir);
    await mkdir(cwd);
    await writeFile(join(agentDir, "APPEND_SYSTEM.md"), "Existing user instructions");
    const resources = await discoverCapabilities(cwd, { agentDir, loadAdapter: false });
    for (const main of [true, false]) {
      const { loader } = capabilityLoader(resources, { skills: [], plugins: [], mcp: [] }, main ? [{}] : []);
      try {
        await loader.reload();
        assert.equal(loader.getSystemPrompt(), undefined, "leave Pi's default prompt intact");
        assert.deepEqual(loader.getAppendSystemPrompt(), ["Existing user instructions", main ? MAIN_AGENT_PROMPT : SUBAGENT_PROMPT]);
      } finally { loader.getExtensions().runtime.invalidate(); }
    }
    for (const section of ["Communication:", "Delegation:", "Environment:", "Git and worktrees:", "Response format and execution:"])
      assert.ok(MAIN_AGENT_PROMPT.includes(section));
    assert.ok(MAIN_AGENT_PROMPT.includes("<axiom_display>...</axiom_display>"));
    assert.ok(MAIN_AGENT_PROMPT.includes("not to modify files or change external state"));
    assert.ok(MAIN_AGENT_PROMPT.includes("not authorize automatic commits, pushes, or merges"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

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
    assert.equal(resources.catalog.plugins.find((entry) => entry.id.endsWith("good.js")).scope, "global");
    assert.equal(resources.catalog.plugins.find((entry) => entry.id.endsWith("bad.js")).scope, "project");
    assert.deepEqual(resources.catalog.skills.map((s) => s.name).sort(), ["project-sample", "sample"]);
    // 旧会话保存的 false 也不能让工作空间退回仅全局能力。
    const restored = await discoverCapabilities(cwd, { agentDir, trustProject: false });
    assert.deepEqual(restored.catalog, resources.catalog);
    const sessions = new Sessions(async () => {});
    const defaults = sessions.getDefaults();
    const empty = { skills: [], mcp: [], plugins: [] };
    assert.deepEqual(defaults.capabilities, empty);
    assert.deepEqual(defaults.subagentCapabilities, empty);
    const clean = capabilityLoader({ ...resources, adapter: { path: "unused" }, createMcpAdapter: () => {
      throw new Error("UNSELECTED_MCP_EXECUTED");
    } }, defaults.capabilities, []).loader;
    await clean.reload();
    assert.deepEqual(clean.getExtensions().errors, []);
    assert.deepEqual(clean.getSkills().skills, []);
    assert.equal(clean.getExtensions().extensions.length, 1); // only built-in image handling
    clean.getExtensions().runtime.invalidate();
    await sessions.close();
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
    for (const sid of [id, other])
      first.get(sid).emit({ type: "agent.message.end", data: { entryId: "u1", message: { role: "user", content: "seed" } } });
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

test("mcp catalog is per-project isolated, marks global servers and re-reads config without restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-mcp-catalog-"));
  const agentDir = join(root, "agent"), a = join(root, "a"), b = join(root, "b");
  const adapterDir = join(agentDir, "extensions", "pi-mcp-adapter");
  const globalFile = join(agentDir, "mcp-global.json");
  // 假适配器 config.ts：与 pi-mcp-adapter 一样按 cwd 读盘，provenance 单独给出。
  const config = [
    'import { readFileSync } from "node:fs";',
    'import { dirname, join } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'const agentDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));',
    'const read = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return { mcpServers: {}, provenance: {} }; } };',
    'const merge = (cwd) => {',
    '  const global = read(join(agentDir, "mcp-global.json")), project = read(join(cwd, "mcp.json"));',
    '  return { ...global.mcpServers, ...project.mcpServers };',
    '};',
    'export function loadMcpConfig(_paths, cwd) { return { mcpServers: merge(cwd) }; }',
    'export function getServerProvenance(_paths, cwd) {',
    '  const global = read(join(agentDir, "mcp-global.json")), project = read(join(cwd, "mcp.json"));',
    '  return new Map(Object.entries({ ...global.provenance, ...project.provenance }));',
    '}',
  ].join("\n");
  try {
    await mkdir(adapterDir, { recursive: true });
    await mkdir(a);
    await mkdir(b);
    await writeFile(join(agentDir, "settings.json"), "{}");
    await writeFile(globalFile, JSON.stringify({ mcpServers: { global: { command: "g" } }, provenance: { global: { kind: "user" } } }));
    await writeFile(join(adapterDir, "config.ts"), config);
    await writeFile(join(adapterDir, "index.ts"), "export function createMcpAdapter() { return async () => {}; }");
    await writeFile(join(a, "mcp.json"), JSON.stringify({
      mcpServers: { "project-a": { command: "a" }, off: { command: "x", disabled: true }, imported: { url: "http://x" } },
      provenance: { "project-a": { kind: "project" } },
    }));
    await writeFile(join(b, "mcp.json"), JSON.stringify({
      mcpServers: { "project-b": { command: "b" } }, provenance: { "project-b": { kind: "project" } },
    }));
    const scopeOf = (catalog, id) => catalog.mcp.find((server) => server.id === id)?.scope;
    const first = await discoverCapabilities(a, { agentDir, loadAdapter: false });
    assert.deepEqual(first.catalog.mcp.map((s) => s.id).sort(), ["global", "imported", "project-a"], "disabled 条目不入目录");
    assert.equal(scopeOf(first.catalog, "global"), "global");
    assert.equal(scopeOf(first.catalog, "project-a"), "project");
    assert.equal(scopeOf(first.catalog, "imported"), "project", "来源不明保守归当前项目");
    assert.deepEqual(first.catalog.plugins, [], "适配器自身不出现在插件列表");
    const other = await discoverCapabilities(b, { agentDir, loadAdapter: false });
    assert.deepEqual(other.catalog.mcp.map((s) => s.id).sort(), ["global", "project-b"], "项目之间互不可见");
    // 改盘后重新 discover（不重启）即可见新条目。
    await writeFile(join(a, "mcp.json"), JSON.stringify({
      mcpServers: { "project-a": { command: "a" }, "project-a2": { command: "a2" } }, provenance: { "project-a": { kind: "project" } },
    }));
    await writeFile(globalFile, JSON.stringify({
      mcpServers: { global: { command: "g" }, "global-two": { command: "g2" } },
      provenance: { global: { kind: "user" }, "global-two": { kind: "user" } },
    }));
    const refreshed = await discoverCapabilities(a, { agentDir, loadAdapter: false });
    assert.deepEqual(refreshed.catalog.mcp.map((s) => s.id).sort(), ["global", "global-two", "project-a", "project-a2"]);
    assert.equal(scopeOf(refreshed.catalog, "global-two"), "global");
    assert.equal(scopeOf(refreshed.catalog, "project-a2"), "project");
    assert(!refreshed.catalog.mcp.some((s) => s.id === "imported"), "删除的条目重新发现后消失");
    assert.deepEqual((await discoverCapabilities(b, { agentDir, loadAdapter: false })).catalog.mcp.map((s) => s.id).sort(), ["global", "global-two", "project-b"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('Todo rules belong only to the static main system prompt', () => {
  assert.equal(MAIN_AGENT_PROMPT.split('Todo task tracking:').length - 1, 1);
  assert.match(MAIN_AGENT_PROMPT, /不要为了确认或等待而重复读取/);
  assert.doesNotMatch(SUBAGENT_PROMPT, /Todo task tracking:/);
});
