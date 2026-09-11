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
    const sessions = new Sessions(factory, defaults);
    const catalog = await factory.capabilities(alias);
    assert.equal(catalog.cwd, await realpath(a));
    assert.equal(catalog.skills.filter((s) => s.scope === "project").length, 1);
    const selected = { skills: [...catalog.skills].sort((a, b) => a.scope.localeCompare(b.scope)).map((s) => s.id), plugins: [], mcp: [] };
    await sessions.configureDefaults(alias, { capabilities: selected, subagentCapabilities: "inherit" });
    assert.deepEqual((await sessions.workspaceDefaults(a)).capabilities, selected);
    const globalIds = catalog.skills.filter((s) => s.scope === "global").map((s) => s.id);
    assert.deepEqual((await sessions.workspaceDefaults(b)).capabilities.skills, globalIds);
    const disk = JSON.parse(await readFile(defaults, "utf8"));
    assert.deepEqual(disk.capabilities.skills, globalIds);
    const restored = new Sessions(factory, defaults);
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
    const legacy = new Sessions(factory);
    legacy.defaultSelection.capabilities = { ...selected, skills: selected.skills.map((id) =>
      id === catalog.skills.find((s) => s.scope === "project").id ? join(alias, ".pi/skills/sample/SKILL.md") : id) };
    assert.deepEqual((await legacy.workspaceDefaults(alias)).capabilities, selected);
    assert.deepEqual((await legacy.workspaceDefaults(b)).capabilities.skills, globalIds);
    await legacy.configureDefaults(b, { thinking: "off" });
    assert.deepEqual((await legacy.workspaceDefaults(a)).capabilities, selected);
    await restored.configureDefaults(b, { thinking: "off" });
    assert.deepEqual((await restored.workspaceDefaults(a)).capabilities, selected);
  } finally { await rm(root, { recursive: true, force: true }); }
});
