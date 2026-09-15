import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Sessions } from "../src/sessions.js";

const factory = async () => ({
  config: () => ({ model: "test/one", thinking: "off" }),
  subscribe: () => () => {},
  prompt: async () => {},
  result: () => "ok",
  abort: async () => {},
  dispose: async () => {},
});
factory.catalog = () => [{ key: "test/one" }];

const workspaceHash = (cwd) => createHash("sha256").update(process.platform === "win32" ? cwd.toLowerCase() : cwd).digest("hex");

test("旧 defaults.json 一次性迁入库：验证成功才标记，源文件保留，此后 JSON 非权威", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-migrate-"));
  const defaultsPath = join(dir, "defaults.json");
  const presetsPath = join(dir, "presets.json");
  let first, second;
  try {
    await writeFile(defaultsPath, JSON.stringify({ model: "a/b", projectSkills: {} }));
    // 旧预设不迁移：留在磁盘上，不阻断启动。
    await writeFile(presetsPath, JSON.stringify({ presets: [{ id: randomUUID(), name: "旧预设", selection: {} }] }));

    first = new Sessions(factory, defaultsPath);
    await first.loadDefaults();
    // 迁移结果生效 + 源文件保留 + 标记写入
    assert.equal(first.getDefaults().model, "a/b");
    assert.equal(JSON.parse(await readFile(defaultsPath, "utf8")).model, "a/b");
    assert.equal(first.database.get("migrated", defaultsPath), true);
    assert.equal(first.database.get("migrated", presetsPath), undefined);
    await first.close();

    // 此后改 JSON 不再生效：库是唯一权威，源文件永不复活旧值
    await writeFile(defaultsPath, JSON.stringify({ model: "c/d", projectSkills: {} }));
    second = new Sessions(factory, defaultsPath);
    await second.loadDefaults();
    assert.equal(second.getDefaults().model, "a/b");
    await second.close();
  } finally {
    await second?.close(); await first?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("旧版单条 defaults 记录按新布局拆分：全局兜底 + 各工作目录独立配置", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-split-defaults-"));
  const a = await realpath(await mkdir(join(dir, "a"), { recursive: true }) || dir);
  const b = join(dir, "b");
  await mkdir(b);
  // 带能力目录的桩，才走项目技能合并分支（与旧版 workspaceDefaults 一致）。
  const capabilityFactory = Object.assign(async () => ({}), factory, { capabilities: async () => ({ skills: [], mcp: [], plugins: [] }) });
  const sessions = new Sessions(capabilityFactory, join(dir, "defaults.json"));
  try {
    // 旧记录：一份全局配置 + A 目录的项目技能表（键是 realpath，旧版就如此），B 从未配置过
    sessions.database.set("defaults", "defaults", {
      model: "test/one",
      projectSkills: { [a]: { capabilities: ["a-skill"] } },
    });
    await sessions.loadDefaults();

    // 全局兜底保留旧配置；A 得到独立配置，B 回落全局
    assert.equal(sessions.getDefaults().model, "test/one");
    assert.deepEqual(sessions.listDefaults(), { workspaces: [a] });
    assert.deepEqual((await sessions.workspaceDefaults(a)).capabilities.skills, ["a-skill"]);
    assert.deepEqual((await sessions.workspaceDefaults(b)).capabilities.skills, []);
    // 迁移后的目录配置写进库（重启后仍生效）
    await sessions.close();
    const restored = new Sessions(capabilityFactory, join(dir, "defaults.json"));
    try {
      await restored.loadDefaults();
      assert.equal(restored.getDefaults().model, "test/one");
      assert.deepEqual((await restored.workspaceDefaults(a)).capabilities.skills, ["a-skill"]);
      assert.deepEqual((await restored.workspaceDefaults(b)).capabilities.skills, []);
    } finally { await restored.close(); }
  } finally { await sessions.close(); await rm(dir, { recursive: true, force: true }); }
});

test("迁移前坏 defaults.json 只警告不标记，不阻断启动；修复后可再迁移", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-migrate-bad-"));
  const defaultsPath = join(dir, "defaults.json");
  let sessions, repaired;
  try {
    await writeFile(defaultsPath, "{broken");
    const warnings = [];
    const original = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      sessions = new Sessions(factory, defaultsPath);
      await sessions.loadDefaults();
    } finally {
      console.warn = original;
    }
    // 未迁移：无标记、默认值保持；源文件保留
    assert.equal(sessions.database.get("migrated", defaultsPath), undefined);
    assert.equal(sessions.getDefaults().model, null);
    assert.ok(warnings.some((message) => message.includes(defaultsPath)));
    await sessions.close();
    await writeFile(defaultsPath, JSON.stringify({ model: "test/one" }));
    repaired = new Sessions(factory, defaultsPath);
    await repaired.loadDefaults();
    assert.equal(repaired.database.get("migrated", defaultsPath), true);
    await repaired.configureDefaults(dir, { model: "test/one" });
    assert.equal(repaired.getDefaults().model, "test/one");
    await repaired.close();
  } finally {
    await repaired?.close(); await sessions?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("旧磁盘会话一次性迁入并恢复；坏文件不标记可重试；删除后不复活；库同 id 以库为准", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-migrate-sessions-"));
  const storage = join(root, "storage");
  const workspace = join(storage, workspaceHash(root));
  await mkdir(workspace, { recursive: true });
  const good = join(workspace, "good.json");
  const broken = join(workspace, "broken.json");
  await writeFile(good, JSON.stringify({ id: "good", cwd: root, title: "旧会话", createdAt: 111, updatedAt: 222,
    selection: { model: "test/one" } }));
  await writeFile(broken, "{broken");
  let sessions, again, third, fourth;
  try {
    const warnings = [];
    const original = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      sessions = new Sessions(factory, undefined, storage);
      await sessions.load();
    } finally {
      console.warn = original;
    }
    // 好文件迁入恢复；坏文件警告保留；标记精确到文件，坏文件无标记可重试
    assert.deepEqual(sessions.list().map((s) => s.title), ["旧会话"]);
    assert.ok(warnings.some((message) => message.includes(broken)));
    assert.equal(await readFile(broken, "utf8"), "{broken");
    assert.ok(await readFile(good, "utf8"));
    assert.equal(sessions.database.get("migrated", `sessions/${good}`), true);
    assert.equal(sessions.database.get("migrated", `sessions/${broken}`), undefined);
    await sessions.close();

    // 幂等：标记目录跳过——改坏已迁移的好文件不影响库中会话再次恢复
    await writeFile(good, "{now-broken}");
    again = new Sessions(factory, undefined, storage);
    const warnAgain = [];
    console.warn = (message) => warnAgain.push(message);
    try {
      await again.load();
    } finally {
      console.warn = original;
    }
    assert.deepEqual(again.list().map((s) => s.title), ["旧会话"]);
    assert.ok(!warnAgain.some((message) => message.includes(good)));
    // 删除会话：库记录删除，标记过的目录不再扫出旧 JSON，绝不复活
    await again.remove("good");
    await again.close();

    third = new Sessions(factory, undefined, storage);
    await third.load();
    assert.deepEqual(third.list(), []);
    assert.equal(await readFile(broken, "utf8"), "{broken"); // 与删除无关的坏文件仍在
    await third.close();

    // 同目录一好一坏：坏文件修复后二次迁移补入库，已标记的好文件不受影响
    await writeFile(broken, JSON.stringify({ id: "broken", cwd: root, title: "修复的会话", updatedAt: 333 }));
    fourth = new Sessions(factory, undefined, storage);
    await fourth.load();
    assert.deepEqual(fourth.list().map((s) => s.title).sort(), ["修复的会话"]);
    assert.equal(fourth.database.get("migrated", `sessions/${broken}`), true);
    await fourth.close();
  } finally {
    await fourth?.close(); await third?.close(); await again?.close(); await sessions?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("缺失历史仍列出会话，但打开失败且不让 SDK 用空历史覆盖", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-migrate-missing-"));
  let sessions;
  try {
    const { Database } = await import("../src/database.js");
    const db = new Database(join(root, "axiom.db"));
    const ghostFile = join(root, "ghost.jsonl");
    const saved = { id: "ghost", cwd: root, title: "丢失历史的会话", createdAt: 1, updatedAt: 2,
      sessionFile: ghostFile, selection: {} };
    db.set("sessions", "ghost", saved);
    db.close();
    const warnings = [];
    const original = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      sessions = new Sessions(factory, undefined, join(root, "storage"));
      await sessions.load();
    } finally {
      console.warn = original;
    }
    // 列表不隐藏无法恢复的会话；只有打开时检查历史，不创建空JSONL。
    assert.equal(sessions.list()[0].id, "ghost");
    await assert.rejects(sessions.ensureLoaded("ghost"), /历史文件缺失/);
    assert.equal(sessions.store.getSession("ghost").title, "丢失历史的会话");
    assert.equal(existsSync(ghostFile), false);
    // 库记录逐字节原状保留：空历史不固化，文件找回后下次启动照常恢复
    assert.deepEqual(sessions.database.get("sessions", "ghost"), saved);
    await sessions.close();
  } finally {
    await sessions?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("旧文件迁移告警保留路径，但不带坏JSON原文", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-migration-redact-"));
  const storage = join(root, "storage");
  const directory = join(storage, workspaceHash(root));
  const sessions = new Sessions(factory, join(root, "defaults.json"), storage);
  const warnings = [];
  const original = console.warn;
  try {
    await mkdir(directory, { recursive: true });
    const paths = [join(root, "defaults.json"), join(directory, "broken.json")];
    for (const path of paths) await writeFile(path, 'secret-content-not-json');
    console.warn = message => warnings.push(message);
    await sessions.loadDefaults();
    await sessions.load();
    for (const path of paths) assert.ok(warnings.some(message => message.includes(path)));
    assert.equal(warnings.some(message => message.includes("secret-content")), false);
  } finally {
    console.warn = original;
    await sessions.close(); await rm(root, { recursive: true, force: true });
  }
});

test("全局轮次预算：默认 20/2，configure 校验后持久化，重启恢复最新值，坏记录回退默认", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-task-budget-"));
  let sessions;
  try {
    sessions = new Sessions(factory, join(dir, "defaults.json"));
    assert.deepEqual(sessions.getTaskBudget(), { maxTurns: 20, wrapUpWindow: 2 });
    const saved = sessions.configureTaskBudget({ maxTurns: 50, wrapUpWindow: 5 });
    assert.deepEqual(saved, { maxTurns: 50, wrapUpWindow: 5 });
    // 越界值抛给调用方，内存与库都不更新
    assert.throws(() => sessions.configureTaskBudget({ maxTurns: 2, wrapUpWindow: 5 }));
    assert.throws(() => sessions.configureTaskBudget({ maxTurns: 201, wrapUpWindow: 5 }));
    assert.throws(() => sessions.configureTaskBudget({ maxTurns: 50, wrapUpWindow: 0 }));
    assert.throws(() => sessions.configureTaskBudget({ maxTurns: 50, wrapUpWindow: 11 }));
    assert.deepEqual(sessions.getTaskBudget(), { maxTurns: 50, wrapUpWindow: 5 });
    await sessions.close();

    // 重启后恢复最新全局设置
    sessions = new Sessions(factory, join(dir, "defaults.json"));
    assert.deepEqual(sessions.getTaskBudget(), { maxTurns: 50, wrapUpWindow: 5 });
    await sessions.close();

    // 库记录损坏：警告并回退默认，不阻断启动
    const { Database } = await import("../src/database.js");
    const db = new Database(join(dir, "axiom.db"));
    db.set("settings", "taskBudget", { maxTurns: -1 });
    db.close();
    const warnings = [];
    const original = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      sessions = new Sessions(factory, join(dir, "defaults.json"));
    } finally {
      console.warn = original;
    }
    assert.ok(warnings.some((message) => message.includes("轮次预算读取失败")));
    assert.deepEqual(sessions.getTaskBudget(), { maxTurns: 20, wrapUpWindow: 2 });
    await sessions.close();
  } finally {
    await sessions?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
