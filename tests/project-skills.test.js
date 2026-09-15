import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Sessions } from "../src/sessions.js";
import { discoverCapabilities, capabilityLoader } from "../src/capabilities.js";

test("project skill defaults stay scoped, survive restart and load through directory aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-project-skills-"));
  const a = join(root, "a"), b = join(root, "b"), alias = join(root, "alias"), agentDir = join(root, "agent");
  const defaults = join(root, "defaults.json");
  let sessions, restored, legacy;
  try {
    for (const base of [join(a, ".pi"), join(b, ".pi"), agentDir]) {
      await mkdir(join(base, "skills", "sample"), { recursive: true });
      const name = base === agentDir ? "global-sample" : "sample";
      await writeFile(join(base, "skills/sample/SKILL.md"), `---\nname: ${name}\ndescription: Test\n---\n${base}`);
    }
    await symlink(a, alias, process.platform === "win32" ? "junction" : "dir");
    const factory = () => {};
    factory.cwd = a;
    factory.catalog = () => [];
    factory.capabilities = async (cwd) => (await discoverCapabilities(cwd, { agentDir, loadAdapter: false })).catalog;
    sessions = new Sessions(factory, defaults);
    const catalog = await factory.capabilities(alias);
    assert.equal(catalog.cwd, await realpath(a));
    assert.equal(catalog.skills.filter((s) => s.scope === "project").length, 1);
    const selected = { skills: [...catalog.skills].sort((a, b) => a.scope.localeCompare(b.scope)).map((s) => s.id), plugins: [], mcp: [] };
    await sessions.configureDefaults(alias, { capabilities: selected, subagentCapabilities: "inherit" });
    assert.deepEqual((await sessions.workspaceDefaults(a)).capabilities, selected);
    const globalIds = catalog.skills.filter((s) => s.scope === "global").map((s) => s.id);
    // 全局技能跨工作目录共用靠全局兜底：未配置的目录只拿全局兜底，不拿别的目录的项目技能。
    assert.deepEqual((await sessions.workspaceDefaults(b)).capabilities.skills, []);
    await sessions.configureDefaults(undefined, { capabilities: { skills: globalIds, plugins: [], mcp: [] } });
    assert.deepEqual((await sessions.workspaceDefaults(b)).capabilities.skills, globalIds);
    assert.deepEqual((await sessions.workspaceDefaults(a)).capabilities, selected, "目录配置优先于全局兜底");
    // 默认配置在共享 SQLite 库（不再写磁盘 JSON）：目录配置归该目录，全局兜底不携带项目技能。
    const scope = process.platform === "win32" ? (await realpath(alias)).toLowerCase() : await realpath(alias);
    const disk = sessions.database.get("defaults", `workspace/${scope}`);
    assert.deepEqual(disk.selection.capabilities.skills, globalIds);
    assert.deepEqual(disk.projectSkills.capabilities, [catalog.skills.find((s) => s.scope === "project").id]);
    assert.deepEqual(sessions.database.get("defaults", "global").capabilities.skills, globalIds);
    restored = new Sessions(factory, defaults);
    await restored.loadDefaults();
    assert.deepEqual((await restored.workspaceDefaults(alias)).capabilities, selected);
    const resources = await discoverCapabilities(alias, { agentDir, loadAdapter: false });
    const { loader } = capabilityLoader(resources, (await restored.workspaceDefaults(alias)).capabilities, []);
    try {
      await loader.reload();
      assert.deepEqual(loader.getSkills().skills.map((s) => s.name).sort(), ["global-sample", "sample"]);
      assert(loader.getSkills().skills.some((s) => s.filePath === catalog.skills.find((s) => s.scope === "project").id));
    } finally { loader.getExtensions().runtime.invalidate(); }
    // Legacy defaults must not poison another project's editor or overwrite project A's selection.
    legacy = new Sessions(factory);
    legacy.defaultSelection.capabilities = { ...selected, skills: selected.skills.map((id) =>
      id === catalog.skills.find((s) => s.scope === "project").id ? join(alias, ".pi/skills/sample/SKILL.md") : id) };
    assert.deepEqual((await legacy.workspaceDefaults(alias)).capabilities, selected);
    assert.deepEqual((await legacy.workspaceDefaults(b)).capabilities.skills, globalIds);
    await legacy.configureDefaults(b, { thinking: "off" });
    assert.deepEqual((await legacy.workspaceDefaults(a)).capabilities, selected);
    await restored.configureDefaults(b, { thinking: "off" });
    assert.deepEqual((await restored.workspaceDefaults(a)).capabilities, selected);
  } finally { await sessions?.close(); await restored?.close(); await legacy?.close(); await rm(root, { recursive: true, force: true }); }
});
