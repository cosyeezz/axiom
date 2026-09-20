import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Sessions } from "../src/sessions.js";
import { discoverCapabilities, capabilityLoader } from "../src/capabilities.js";

const scopeKey = async (dir) => {
  const cwd = await realpath(dir);
  return process.platform === "win32" ? cwd.toLowerCase() : cwd;
};

// 共用目录布局：agent 全局技能 1 个，每个工作目录各 1 个项目技能；alias 是指向 a 的连接。
// 桩工厂带 catalog/capabilities，才能走默认配置里的能力解析路径。
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "axiom-project-skills-")));
  const a = join(root, "a"), b = join(root, "b"), alias = join(root, "alias"), agentDir = join(root, "agent");
  for (const base of [join(a, ".pi"), join(b, ".pi"), agentDir]) {
    await mkdir(join(base, "skills", "sample"), { recursive: true });
    await writeFile(join(base, "skills/sample/SKILL.md"),
      `---\nname: ${base === agentDir ? "global-sample" : "sample"}\ndescription: Test\n---\n${base}`);
  }
  await symlink(a, alias, process.platform === "win32" ? "junction" : "dir");
  const factory = async () => ({
    config: () => ({ model: "test/model" }),
    subscribe: () => () => {}, prompt: async () => {}, result: () => "done",
    abort: async () => {}, dispose: async () => {},
  });
  factory.cwd = a;
  factory.catalog = () => [{ key: "test/model" }];
  factory.capabilities = async (cwd) => (await discoverCapabilities(cwd, { agentDir, loadAdapter: false })).catalog;
  return { root, a, b, alias, agentDir, factory, defaults: join(root, "defaults.json") };
}

// 项目技能就在目录配置的完整 selection 里：保存、只改 thinking、重启、新建/恢复会话、别名目录都不丢。
test("项目技能完整存进目录配置：保存、改 thinking、重启、新建与恢复会话、别名目录都不丢", async () => {
  const { root, a, b, alias, agentDir, factory, defaults } = await setup();
  const opened = [];
  const open = () => { const sessions = new Sessions(factory, defaults); opened.push(sessions); return sessions; };
  try {
    const catalog = await factory.capabilities(alias);
    assert.equal(catalog.cwd, await realpath(a));
    const projectSkill = catalog.skills.find((skill) => skill.scope === "project");
    const globalIds = catalog.skills.filter((skill) => skill.scope === "global").map((skill) => skill.id);
    const selected = { skills: [...globalIds, projectSkill.id], plugins: [], mcp: [] };

    const first = open();
    await first.configureDefaults(alias, { capabilities: selected, subagentCapabilities: "inherit" });
    assert.deepEqual((await first.workspaceDefaults(a)).capabilities, selected);
    // 一条目录记录、选择集完整落库：没有旁路 projectSkills 字段，全局兜底不沾项目技能。
    const disk = first.database.get("defaults", `workspace/${await scopeKey(alias)}`);
    assert.deepEqual(disk.selection.capabilities, selected);
    assert.equal(disk.projectSkills, undefined);
    assert.deepEqual(first.getDefaults().capabilities.skills, []);
    // 未配置的目录不拿别的目录的项目技能，也不拿全局兜底里的项目路径。
    assert.deepEqual((await first.workspaceDefaults(b)).capabilities.skills, []);
    // 只改 thinking：项目技能原样留下，不再经历「摘出→重拼」。
    await first.configureDefaults(a, { thinking: "high" });
    assert.deepEqual((await first.workspaceDefaults(a)).capabilities, selected);
    assert.equal((await first.workspaceDefaults(a)).thinking, "high");
    await first.close();

    const second = open();
    await second.loadDefaults();
    assert.deepEqual((await second.workspaceDefaults(alias)).capabilities, selected, "重启后目录配置仍是完整选择集");
    assert.equal((await second.workspaceDefaults(alias)).thinking, "high");
    // 新建会话真的带上项目技能（create 取 workspaceDefaults），且别名目录归一到同一份配置。
    const id = await second.create(alias);
    second.get(id).emit({ type: "agent.message.end", data: { entryId: "u1", message: { role: "user", content: "seed" } } });
    assert.deepEqual(second.get(id).capabilities, selected);
    assert.deepEqual(second.snapshot(id).config.capabilitySelection, selected);
    // 真实 loader 集成：选中的项目技能与全局技能都被加载。
    const resources = await discoverCapabilities(alias, { agentDir, loadAdapter: false });
    const { loader } = capabilityLoader(resources, (await second.workspaceDefaults(alias)).capabilities, []);
    try {
      await loader.reload();
      assert.deepEqual(loader.getSkills().skills.map((skill) => skill.name).sort(), ["global-sample", "sample"]);
      assert(loader.getSkills().skills.some((skill) => skill.filePath === projectSkill.id));
    } finally { loader.getExtensions().runtime.invalidate(); }
    await second.close();

    // 重启后恢复已有会话：历史里存的是完整能力，项目技能不丢。
    const third = open();
    await third.load();
    await third.ensureLoaded(id);
    assert.deepEqual(third.get(id).capabilities, selected);
    await third.close();
  } finally {
    for (const sessions of opened) await sessions.close();
    await rm(root, { recursive: true, force: true });
  }
});

// 旧记录兼容、写侧边界：目录记录旧 projectSkills 读入合并；显式保存不能选别的项目资源；
// 全局兜底不收项目能力；项目技能文件消失只影响读侧那一条，不再让整次保存失败。
test("旧记录 projectSkills 读入合并；显式保存不能选别的项目资源；全局兜底不收项目能力", async () => {
  const { root, a, b, alias, factory, defaults } = await setup();
  let sessions;
  try {
    const catalog = await factory.capabilities(a);
    const projectId = catalog.skills.find((skill) => skill.scope === "project").id;
    const projectPath = join(a, ".pi", "skills", "sample", "SKILL.md");
    const globalIds = catalog.skills.filter((skill) => skill.scope === "global").map((skill) => skill.id);
    sessions = new Sessions(factory, defaults);
    // 旧版目录记录：selection 只含全局技能，项目技能在旁路的 projectSkills 里。
    sessions.database.set("defaults", `workspace/${await scopeKey(alias)}`,
      { cwd: a, selection: { capabilities: { skills: globalIds, plugins: [], mcp: [] } }, projectSkills: { capabilities: [projectId] } });
    await sessions.loadDefaults();
    assert.deepEqual((await sessions.workspaceDefaults(alias)).capabilities.skills, [...globalIds, projectId]);
    assert.deepEqual((await sessions.workspaceDefaults(b)).capabilities.skills, [], "旧记录不能把项目技能漏给别的目录");

    // 再保存一次：记录升到完整 selection，projectSkills 字段消失，技能一个不少。
    await sessions.configureDefaults(a, { thinking: "low" });
    const disk = sessions.database.get("defaults", `workspace/${await scopeKey(a)}`);
    assert.equal(disk.projectSkills, undefined);
    assert.equal(disk.selection.thinking, "low", "旧记录没有thinking字段也必须保存新补丁");
    assert.deepEqual(disk.selection.capabilities.skills, [...globalIds, projectId]);
    // 模拟只保存过模型的旧目录记录：新增skill字段不能因原记录没有该键而被忽略。
    sessions.database.set("defaults", `workspace/${await scopeKey(b)}`, { cwd: b, selection: { thinking: "off" } });
    sessions.loadWorkspaceDefaults();
    await sessions.configureDefaults(b, { capabilities: { skills: globalIds, plugins: [], mcp: [] } });
    assert.deepEqual((await sessions.workspaceDefaults(b)).capabilities.skills, globalIds);

    // 显式保存别的目录的项目技能：严格拒绝（catalog 里没有这个 id）。
    await assert.rejects(sessions.configureDefaults(b, { capabilities: { skills: [projectId], plugins: [], mcp: [] } }), /未知|不可用/);
    // 全局兜底显式选中服务目录的项目能力：拒绝；null（全部）保留运行时语义，照常放行。
    await assert.rejects(sessions.configureDefaults(undefined, { capabilities: { skills: [projectId], plugins: [], mcp: [] } }), /项目/);
    assert.deepEqual(sessions.getDefaults().capabilities.skills, []);
    await sessions.configureDefaults(undefined, { capabilities: null });
    assert.equal(sessions.getDefaults().capabilities, null);

    // 项目技能文件消失：读侧只滤掉这一条，改 thinking 不再被它整单拖垮。
    await rm(projectPath);
    assert.deepEqual((await sessions.workspaceDefaults(a)).capabilities.skills, globalIds);
    await sessions.configureDefaults(a, { thinking: "minimal" });
    assert.deepEqual(sessions.database.get("defaults", `workspace/${await scopeKey(a)}`).selection.capabilities.skills, globalIds);
    assert.equal((await sessions.workspaceDefaults(a)).thinking, "minimal");
  } finally {
    await sessions?.close();
    await rm(root, { recursive: true, force: true });
  }
});
