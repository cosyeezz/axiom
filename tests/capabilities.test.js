import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverCapabilities, capabilityLoader, resolveCapabilities } from "../src/capabilities.js";
import { command } from "../src/protocol.js";
import { Sessions } from "../src/sessions.js";

test("capability discovery respects trust, filters before plugin execution and leaves settings unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-capabilities-"));
  const agentDir = join(root, "agent"), cwd = join(root, "project");
  try {
    await mkdir(join(agentDir, "skills", "sample"), { recursive: true });
    await mkdir(join(agentDir, "extensions"), { recursive: true });
    await mkdir(join(cwd, ".pi", "extensions"), { recursive: true });
    await writeFile(join(agentDir, "settings.json"), '{"defaultModel":"original"}');
    await writeFile(join(agentDir, "skills", "sample", "SKILL.md"), "---\nname: sample\ndescription: Test skill\n---\nSample instructions");
    await writeFile(join(agentDir, "extensions", "good.js"), "export default function(pi) { pi.registerCommand('sample', {handler: async()=>{}}); }");
    await writeFile(join(cwd, ".pi", "extensions", "bad.js"), "throw new Error('UNSELECTED_PLUGIN_EXECUTED');");
    const untrusted = await discoverCapabilities(cwd, { agentDir });
    assert.equal(untrusted.catalog.needsTrust, true);
    assert.equal(untrusted.catalog.plugins.length, 1);
    const resources = await discoverCapabilities(cwd, { agentDir, trustProject: true });
    assert.equal(resources.catalog.plugins.length, 2);
    assert.equal(resources.catalog.skills.length, 1);
    const selected = {
      skills: resources.catalog.skills.map((s) => s.id),
      plugins: resources.catalog.plugins.filter((p) => p.id.endsWith("good.js")).map((p) => p.id), mcp: [],
    };
    const { loader } = capabilityLoader(resources, selected, []);
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    assert.equal(loader.getExtensions().extensions.length, 1);
    assert.equal(loader.getSkills().skills.length, 1);
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
