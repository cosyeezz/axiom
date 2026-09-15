import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.js";
import { createPiModelStorage, canonicalModelsJson } from "../src/pi-model-storage.js";
import { runOpponent } from "./helpers/model-concurrency-child.mjs";


// 独立测试：临时目录同时充当 Axiom home 与假 ~/.pi（piDir），不触碰真实用户配置与密钥。
async function tempDir() {
  return mkdtemp(join(tmpdir(), "axiom-pi-model-storage-"));
}

// 返回 storage 与库连接：测试结束前必须 close，否则 Windows 上清理临时目录会 EBUSY。
function makeStorage(dir) {
  const database = new Database(join(dir, "axiom.db"));
  return { storage: createPiModelStorage({ database, home: dir, piDir: join(dir, "pi") }), database };
}

const seedPiModels = async (dir, content) => {
  await mkdir(join(dir, "pi"), { recursive: true });
  await writeFile(join(dir, "pi", "models.json"), `${JSON.stringify(content, null, 2)}\n`);
};
const seedPiAuth = async (dir, content) => {
  await mkdir(join(dir, "pi"), { recursive: true });
  await writeFile(join(dir, "pi", "auth.json"), `${JSON.stringify(content, null, 2)}\n`);
};

test("首次幂等导入：Pi 配置/凭据/收藏入库，源文件字节不变，迁移标记生效", async () => {
  const dir = await tempDir();
  let database;
  try {
    const modelsSource = { providers: { p: { baseUrl: "https://p.example.com", api: "openai-completions", apiKey: "sk-import" } } };
    const authSource = { p: { type: "api_key", key: "sk-import" } };
    const favoritesSource = { provider: ["p"], model: [], thinking: [] };
    await seedPiModels(dir, modelsSource);
    await seedPiAuth(dir, authSource);
    await writeFile(join(dir, "models-favorites.json"), `${JSON.stringify(favoritesSource, null, 2)}\n`);
    const modelsBytes = await readFile(join(dir, "pi", "models.json"), "utf8");
    const authBytes = await readFile(join(dir, "pi", "auth.json"), "utf8");

    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();

    assert.deepEqual(database.get("models", "config"), modelsSource);
    assert.deepEqual(database.get("auth", "p"), { type: "api_key", key: "sk-import" });
    assert.deepEqual(database.get("models", "favorites"), { ...favoritesSource, version: 1 }, "导入与 CAS 写同形状（都带 version）");
    // 不修改用户原配置：字节级一致
    assert.equal(await readFile(join(dir, "pi", "models.json"), "utf8"), modelsBytes);
    assert.equal(await readFile(join(dir, "pi", "auth.json"), "utf8"), authBytes);

    // 幂等：源文件此后被改动也不再覆盖权威（SQLite 是唯一权威，旧文件只是历史）
    await seedPiModels(dir, { providers: { changed: { baseUrl: "https://x.example.com" } } });
    await storage.init();
    assert.equal(database.get("models", "config").providers.p.apiKey, "sk-import");
    assert.equal(database.get("models", "config").providers.changed, undefined);
    assert.equal(database.get("migrated", join(dir, "pi", "models.json")), true);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("SQLite 优先：库内已有配置时导入不再写入；无旧配置时零导入", async () => {
  const dir = await tempDir();
  let open;
  try {
    await seedPiModels(dir, { providers: { old: { baseUrl: "https://old.example.com" } } });
    const { storage, database } = makeStorage(dir);
    open = [database];
    await storage.writeConfig({ providers: { ui: { baseUrl: "https://ui.example.com" } } });
    await storage.syncCompatFile(storage.readConfig());
    await storage.init();
    assert.deepEqual(storage.readConfig(), { providers: { ui: { baseUrl: "https://ui.example.com" } } });
    assert.equal(storage.importErrors().length, 0);

    // 全新安装：无任何旧文件，init 幂等且不产生导入错误
    const dir2 = await tempDir();
    const second = makeStorage(dir2);
    try {
      await second.storage.init();
      await second.storage.init();
      assert.deepEqual(second.storage.readConfig(), { providers: {} });
      assert.equal(second.storage.importErrors().length, 0);
    } finally {
      second.database.close();
      await rm(dir2, { recursive: true, force: true });
    }
  } finally {
    for (const database of open ?? []) database.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("损坏的旧配置：记录导入告警、不污染权威、原文件不动、不重复记录", async () => {
  const dir = await tempDir();
  let database;
  try {
    await mkdir(join(dir, "pi"), { recursive: true });
    await writeFile(join(dir, "pi", "models.json"), "{oops");
    await seedPiAuth(dir, { p: { type: "api_key", key: "sk-1" }, bad: { type: "wat" } });
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.deepEqual(storage.readConfig(), { providers: {} });
    const errors = storage.importErrors();
    assert.equal(errors.length, 2);
    assert.match(errors[0].error, /不是有效 JSON/);
    assert.match(errors[1].error, /bad/);
    assert.equal(errors.some((e) => e.error.includes("{oops")), false, "告警不携带文件原文");
    assert.equal(readFileSync(join(dir, "pi", "models.json"), "utf8"), "{oops");
    // 幂等：再次 init 不追加
    await storage.init();
    assert.equal(storage.importErrors().length, 2);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("坏文件不打完成标记：修复原文件后再次 init 自动导入，陈旧告警清除", async () => {
  const dir = await tempDir();
  let database;
  try {
    await mkdir(join(dir, "pi"), { recursive: true });
    await writeFile(join(dir, "pi", "models.json"), "{oops");
    const source = join(dir, "pi", "models.json");
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.deepEqual(storage.readConfig(), { providers: {} });
    assert.equal(database.get("migrated", source), undefined, "坏文件不打迁移标记");
    assert.equal(storage.importErrors().length, 1);
    // 修复源文件 → 再次 init → 自动导入、告警清除、标记生效
    await writeFile(
      source,
      `${JSON.stringify({ providers: { fixed: { baseUrl: "https://f.example.com", api: "openai-completions" } } }, null, 2)}\n`,
    );
    await storage.init();
    assert.equal(storage.readConfig().providers.fixed.baseUrl, "https://f.example.com");
    assert.equal(database.get("migrated", source), true);
    assert.deepEqual(storage.importErrors(), []);
    // 标记生效：改源文件不再覆盖权威
    await writeFile(source, `{"providers":{"changed":{}}}`);
    await storage.init();
    assert.equal(storage.readConfig().providers.changed, undefined);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("导入门闩：页面配置后 pi 文件才出现不补导，清空权威也不复活", async () => {
  const dir = await tempDir();
  let database;
  try {
    // 首次启动无任何 pi 旧文件：零导入并关闭迁移窗口
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.deepEqual(storage.readConfig(), { providers: {} });
    // 页面配置之后 pi 文件才出现：不得补导新 provider/凭据，也不产生告警
    await storage.writeConfig({ providers: { ui: { baseUrl: "https://ui.example.com" } } });
    await seedPiModels(dir, { providers: { late: { baseUrl: "https://late.example.com" } } });
    await seedPiAuth(dir, { late: { type: "api_key", key: "sk-late" } });
    await storage.init();
    assert.deepEqual(storage.readConfig().providers, { ui: { baseUrl: "https://ui.example.com" } }, "后出现的 models.json 不补导");
    assert.equal(database.get("auth", "late"), undefined, "后出现的 auth.json 不补导");
    assert.equal(storage.importErrors().length, 0);
    // 明确清空权威（写回空配置）后源文件仍在：不复活
    await storage.writeConfig({ providers: {} });
    await storage.init();
    assert.deepEqual(storage.readConfig(), { providers: {} }, "清空后旧文件不复活");
    assert.equal(database.get("auth", "late"), undefined);
    assert.equal(database.get("migrated", join(dir, "pi", "auth.json")), true, "门闩标记已补打");
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("成功导入后外部改动不跟随：源文件后续增改、改值均不影响权威", async () => {
  const dir = await tempDir();
  let database;
  try {
    await seedPiModels(dir, { providers: { p1: { baseUrl: "https://p1.example.com", api: "openai-completions" } } });
    await seedPiAuth(dir, { p1: { type: "api_key", key: "sk-old" } });
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.equal(database.get("auth", "p1").key, "sk-old");
    // 导入完成后源文件被外部改动：既有条目改值 + 新增条目，权威一律不跟随
    await seedPiModels(dir, {
      providers: {
        p1: { baseUrl: "https://changed.example.com", api: "openai-completions" },
        p2: { baseUrl: "https://p2.example.com", api: "openai-completions" },
      },
    });
    await seedPiAuth(dir, { p1: { type: "api_key", key: "sk-rotated" }, p2: { type: "api_key", key: "sk-new" } });
    await storage.init();
    assert.equal(storage.readConfig().providers.p1.baseUrl, "https://p1.example.com", "既有 provider 不被外部改值覆盖");
    assert.equal(storage.readConfig().providers.p2, undefined, "外部新增 provider 不导入");
    assert.equal(database.get("auth", "p1").key, "sk-old", "既有凭据不被外部改值覆盖");
    assert.equal(database.get("auth", "p2"), undefined, "外部新增凭据不导入");
    assert.deepEqual(storage.importErrors(), []);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("混合坏 auth：好条目入库且不打标记，UI 新值不被重导覆盖，修复后坏条目可补导入", async () => {
  const dir = await tempDir();
  let database;
  try {
    await seedPiAuth(dir, { good: { type: "api_key", key: "sk-old" }, broken: { type: "wat" } });
    const source = join(dir, "pi", "auth.json");
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.deepEqual(database.get("auth", "good"), { type: "api_key", key: "sk-old" });
    assert.equal(database.get("auth", "broken"), undefined);
    assert.equal(database.get("migrated", source), undefined, "混合坏条目不打迁移标记");
    assert.match(storage.importErrors().at(-1).error, /broken/);
    // 用户经 UI 改了 good 的新值；随后把源文件里的 broken 修好
    await storage.credentials.modify("good", () => ({ type: "api_key", key: "sk-new" }));
    await seedPiAuth(dir, { good: { type: "api_key", key: "sk-old" }, broken: { type: "api_key", key: "sk-fix" } });
    await storage.init();
    assert.deepEqual(database.get("auth", "good"), { type: "api_key", key: "sk-new" }, "权威新值不被重导覆盖");
    assert.deepEqual(database.get("auth", "broken"), { type: "api_key", key: "sk-fix" }, "修复后补导入");
    assert.equal(database.get("migrated", source), true);
    assert.deepEqual(storage.importErrors(), []);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("导入告警去重：反复 init 同一批坏文件不追加重复条目", async () => {
  const dir = await tempDir();
  let database;
  try {
    await mkdir(join(dir, "pi"), { recursive: true });
    await writeFile(join(dir, "pi", "models.json"), "{oops");
    await seedPiAuth(dir, { p: { type: "api_key", key: "sk-1" }, bad: { type: "wat" } });
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    const count = storage.importErrors().length;
    assert.equal(count, 2);
    for (let i = 0; i < 3; i += 1) await storage.init();
    assert.equal(storage.importErrors().length, count, "重复告警不追加");
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("compat 原子写：rename 失败完整清理临时文件且绝不先删目标，恢复后可重建", async () => {
  const dir = await tempDir();
  let database;
  try {
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    const original = await readFile(storage.compatPath, "utf8");
    // 故障注入：目标位置被目录占用 → rename 必败（旧实现会在此泄漏 .tmp 文件）
    await rm(storage.compatPath);
    await mkdir(storage.compatPath);
    await assert.rejects(() => storage.syncCompatFile({ providers: {} }));
    assert.deepEqual((await readdir(dir)).filter((n) => n.includes(".tmp-")), [], "临时文件已清理");
    // 恢复：移除占位目录后重新派生成功
    await rm(storage.compatPath, { recursive: true });
    await storage.syncCompatFile({ providers: {} });
    assert.equal(await readFile(storage.compatPath, "utf8"), canonicalModelsJson({ providers: {} }));
    assert.notEqual(original, undefined);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("凭据存储：read 解析 $VAR 插值、! 命令不执行原样返回、list 不含 key、modify/delete 串行语义", async () => {
  const dir = await tempDir();
  let database;
  try {
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await seedPiAuth(dir, {
      env: { type: "api_key", key: "$MY_KEY", env: { MY_KEY: "sk-env" } },
      cmd: { type: "api_key", key: "!op read vault" },
    });
    await storage.init();
    const c = storage.credentials;

    // 与 SDK AuthStorage.read 一致：key 做环境插值，其余字段（env）原样保留
    assert.deepEqual(await c.read("env"), { type: "api_key", key: "sk-env", env: { MY_KEY: "sk-env" } });
    assert.deepEqual(await c.read("cmd"), { type: "api_key", key: "!op read vault" }, "命令型不解析不执行");
    assert.equal(await c.read("missing"), undefined);

    const list = await c.list();
    assert.deepEqual([...list].sort((a, b) => a.providerId.localeCompare(b.providerId)), [
      { providerId: "cmd", type: "api_key" },
      { providerId: "env", type: "api_key" },
    ]);
    assert.equal(JSON.stringify(list).includes("sk"), false, "list 元数据绝不包含 key 值");

    // modify：fn 拿到现值（SDK 语义：原始存储值，未经环境插值）；返回 undefined = 放弃变更且返回现值
    const seen = await c.modify("env", (current) => {
      assert.equal(current.key, "$MY_KEY");
      return undefined;
    });
    assert.equal(seen.key, "$MY_KEY");
    assert.deepEqual(await c.read("env"), { type: "api_key", key: "sk-env", env: { MY_KEY: "sk-env" } });

    // OAuth 形状原样入库
    const oauth = { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 1000 };
    assert.deepEqual(await c.modify("oauth-p", () => oauth), oauth);
    assert.deepEqual(await c.read("oauth-p"), oauth);

    await c.delete("cmd");
    assert.equal(await c.read("cmd"), undefined);
    assert.equal((await c.list()).length, 2);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("派生兼容文件：init 后生成、writeConfig 后同步、与权威规范序列化一致", async () => {
  const dir = await tempDir();
  let database;
  try {
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.equal(existsSync(storage.compatPath), true, "空权威也生成兼容文件（SDK 启动即可读）");
    const config = { providers: { p: { baseUrl: "https://p.example.com", apiKey: "sk-1", models: [{ id: "m1" }] } } };
    await storage.writeConfig(config);
    await storage.syncCompatFile(config);
    assert.equal(await readFile(storage.compatPath, "utf8"), canonicalModelsJson(config));
    // 权限收紧（Windows 无 POSIX 模型，跳过断言）
    if (process.platform !== "win32") {
      const mode = statSync(storage.compatPath).mode & 0o777;
      assert.equal(mode, 0o600, "兼容文件含真实密钥，必须 0600");
    }
    // 无临时残留
    const leftover = await (await import("node:fs/promises")).readdir(dir);
    assert.deepEqual(leftover.filter((n) => n.includes(".tmp-")), []);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("SDK 注入：runtimeOptions 提供 credentials + modelsPath，ModelRuntime 可见自定义模型与凭据", async () => {
  const dir = await tempDir();
  let database;
  try {
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    await storage.writeConfig({
      providers: {
        testp: {
          name: "Test Provider",
          baseUrl: "https://testp.example.com/v1",
          api: "openai-completions",
          models: [{ id: "m1", name: "Model One", contextWindow: 1000 }],
        },
      },
    });
    await storage.syncCompatFile(storage.readConfig());
    await storage.credentials.modify("testp", () => ({ type: "api_key", key: "sk-runtime" }));

    const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
    const runtime = await ModelRuntime.create({ ...storage.runtimeOptions(), refreshOnCreate: false });
    const models = runtime.getModels("testp");
    assert.ok(models.some((m) => m.id === "m1"), "派生兼容文件中的自定义模型进入 SDK 目录");
    const credentials = await runtime.listCredentials();
    assert.ok(credentials.some((e) => e.providerId === "testp" && e.type === "api_key"));
    assert.deepEqual(await runtime.credentials.read("testp"), { type: "api_key", key: "sk-runtime" });
    // 运行时凭据写入（OAuth 刷新等）落回权威库
    await runtime.credentials.modify("testp", () => ({ type: "api_key", key: "sk-rotated" }));
    assert.deepEqual(database.get("auth", "testp"), { type: "api_key", key: "sk-rotated" });
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("CAS 原语：期望原文不匹配拒绝写入，行缺失仅首次插入成功", async () => {
  const dir = await tempDir();
  const database = new Database(join(dir, "custom-authority.db"));
  try {
    const storage = createPiModelStorage({ database, home: dir, piDir: join(dir, "pi") });
    await storage.init();
    const absent = storage.configState();
    assert.equal(absent.raw, undefined);
    assert.deepEqual(absent.config, { providers: {} });
    assert.equal(storage.casConfig(absent.raw, { providers: { a: { baseUrl: "https://a.example.com" } } }), true);
    // 旧原文已被取代：同 expectedRaw 二次写入必须失败
    assert.equal(storage.casConfig(absent.raw, { providers: {} }), false);
    const current = storage.configState();
    assert.notEqual(current.raw, undefined);
    assert.equal(storage.casConfig(current.raw, { providers: { a: { baseUrl: "https://b.example.com" } } }), true);
    assert.equal(storage.readConfig().providers.a.baseUrl, "https://b.example.com");
    // favorites 同语义，且保持 version 形状
    const favorites = storage.favoritesState();
    assert.equal(favorites.raw, undefined);
    const empty = { provider: [], model: [], thinking: [] };
    assert.equal(storage.casFavorites(favorites.raw, empty), true);
    assert.equal(storage.casFavorites(favorites.raw, empty), false);
    assert.equal(database.get("models", "favorites").version, 1);
    await storage.credentials.modify("p", () => ({ type: "api_key", key: "test" }));
    assert.equal(database.get("auth", "p").key, "test");
    // 坏 JSON 行的口径：读路径容错（配置页与启动都必须打得开，否则用户没有任何自愈入口），
    // 写路径拒绝（不知道原值是什么就写新值 = 静默丢弃用户数据）。两侧都不得回显原文片段。
    for (const [namespace, key, state] of [
      ["models", "config", () => storage.configState()],
      ["models", "favorites", () => storage.favoritesState()],
    ]) {
      database.prepare("UPDATE store SET value = ? WHERE namespace = ? AND key = ?").run('secret-must-not-leak{', namespace, key);
      const read = state();
      assert.equal(read.invalid, true, `${namespace}/${key} 坏行必须标记 invalid 供写路径拒绝`);
      assert.equal(read.raw, 'secret-must-not-leak{', "原文只作 CAS 期望值，不进任何错误信息");
    }
    // 权威坏行：读得出 invalid，写路径明确拒绝且不泄露原文。
    assert.equal(storage.readConfig().providers.a, undefined, "坏行按未配置读，不炸");
    database.prepare("UPDATE store SET value = ? WHERE namespace = ? AND key = ?").run('secret-must-not-leak{', "auth", "p");
    await assert.rejects(
      () => storage.credentials.modify("p", () => assert.fail("坏值不能进入回调")),
      (error) => {
        assert.match(error.message, /不是合法 JSON/);
        assert.doesNotMatch(error.message, /secret-must-not-leak/);
        return true;
      },
    );
    // 读路径对坏凭据行容错跳过（不阻断 SDK 取凭据）。
    assert.equal(await storage.credentials.read("p"), undefined);
    assert.deepEqual(await storage.credentials.list(), []);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("两进程并发 credentials.modify：CAS 拒绝后写者，杜绝静默丢更新", async () => {
  const dir = await tempDir();
  let database;
  try {
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    const opponent = runOpponent({ dir, op: "credentials" });
    try {
      await opponent.ready(); // 子进程已经读取旧凭据，fn尚未返回
      await storage.credentials.modify("p", () => ({ type: "api_key", key: "sk-parent" }));
      opponent.release();
      const outcome = await opponent.result();
      assert.equal(outcome.ok, false);
      assert.match(outcome.message, /已被其他进程修改/);
      assert.equal((await storage.credentials.read("p")).key, "sk-parent");
    } finally { await opponent.close(); }
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("auth 迁移窗口只看自己的标记：models.json 合法时坏 auth 条目修好后仍能补导入", async () => {
  const dir = await tempDir();
  let database;
  try {
    // 典型组合：models.json 合法 + auth.json 有坏条目。首次 init 后 models/config 已有值，
    // 之后再 init 时门闩若按「config 是否存在」推断，就会把 auth 的窗口一起永久关掉。
    await seedPiModels(dir, { providers: { p: { baseUrl: "https://p.example.com" } } });
    await seedPiAuth(dir, { good: { type: "api_key", key: "sk-good" }, broken: { type: "wat" } });
    const authSource = join(dir, "pi", "auth.json");
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.deepEqual(database.get("auth", "good"), { type: "api_key", key: "sk-good" });
    assert.equal(database.get("migrated", authSource), undefined, "坏条目未修好前不得打 auth 迁移标记");
    assert.ok(storage.importErrors().some((item) => /broken/.test(item.error)), "坏条目必须有告警");

    // 第二次 init：config 已有值，但 auth 自己的窗口必须还开着。
    await storage.init();
    assert.equal(database.get("migrated", authSource), undefined, "config 存在不得推断 auth 已迁移完成");
    assert.ok(storage.importErrors().some((item) => /broken/.test(item.error)), "告警不得被清空");

    // 用户修好坏条目 → 下次 init 补导入并收窗。
    await seedPiAuth(dir, { good: { type: "api_key", key: "sk-good" }, broken: { type: "api_key", key: "sk-fix" } });
    await storage.init();
    assert.deepEqual(database.get("auth", "broken"), { type: "api_key", key: "sk-fix" }, "修复后必须补导入");
    assert.equal(database.get("migrated", authSource), true);
    assert.deepEqual(storage.importErrors(), []);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("收藏来源结构非法：与 models/auth 同口径记录告警，不静默跳过", async () => {
  const dir = await tempDir();
  let database;
  try {
    await writeFile(join(dir, "models-favorites.json"), JSON.stringify(["not", "an", "object"]));
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.equal(database.get("models", "favorites"), undefined, "非法结构不入库");
    const favoriteError = storage.importErrors().find((item) => item.source.endsWith("models-favorites.json"));
    assert.ok(favoriteError, "结构非法必须有用户可见告警（与 importModels/importAuth 同口径）");
    assert.match(favoriteError.error, /结构无效/);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("credentials.modify 落库前校验形状：非法值被拒，不留读不回的幽灵行", async () => {
  const dir = await tempDir();
  let database;
  try {
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    await assert.rejects(storage.credentials.modify("p", () => ({ type: "wat", key: "sk-x" })), /凭据格式无效/);
    // 幽灵行会让 read/list 都看不到它，却因为「行已存在」永久阻断 auth.json 里同名的合法凭据导入。
    assert.equal(database.get("auth", "p"), undefined, "非法值不得落库");
    assert.equal(await storage.credentials.read("p"), undefined);
    assert.deepEqual(await storage.credentials.list(), []);
    // 合法值照常写入；返回 undefined 仍表示放弃变更。
    await storage.credentials.modify("p", () => ({ type: "api_key", key: "sk-ok" }));
    assert.deepEqual(database.get("auth", "p"), { type: "api_key", key: "sk-ok" });
    await storage.credentials.modify("p", () => undefined);
    assert.deepEqual(database.get("auth", "p"), { type: "api_key", key: "sk-ok" });
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("收藏写入形状统一：导入与 CAS 写都带 version，调用方不能覆盖字面量", async () => {
  const dir = await tempDir();
  let database;
  try {
    await writeFile(join(dir, "models-favorites.json"), JSON.stringify({ models: ["a/b"] }));
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    assert.equal(database.get("models", "favorites").version, 1, "导入路径也要写 version");
    // version 必须由本模块定，不能被调用方传入的 store.version 覆盖。
    storage.setFavorites({ models: ["a/b"], version: 99 });
    assert.equal(database.get("models", "favorites").version, 1);
    const { raw } = storage.favoritesState();
    assert.equal(storage.casFavorites(raw, { models: ["c/d"], version: 99 }), true);
    assert.equal(database.get("models", "favorites").version, 1);
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("多语句写入原子：importAuth 中途失败不留半截导入", async () => {
  const dir = await tempDir();
  let database;
  try {
    await seedPiAuth(dir, { a: { type: "api_key", key: "sk-a" }, b: { type: "api_key", key: "sk-b" } });
    const { storage, database: db } = makeStorage(dir);
    database = db;
    // 第二条写入失败（磁盘满/SQL 异常）：第一条不得留在库里，否则半截导入既不完整又占位阻断重导。
    const set = db.set.bind(db);
    let calls = 0;
    db.set = (namespace, key, value) => {
      if (namespace === "auth" && ++calls === 2) throw new Error("injected auth write failure");
      return set(namespace, key, value);
    };
    await assert.rejects(storage.init(), /injected auth write failure/);
    db.set = set;
    assert.equal(database.get("auth", "a"), undefined, "半截导入必须整体回滚");
    assert.equal(database.get("auth", "b"), undefined);
    // 解除故障后重新导入，两条都在。
    await storage.init();
    assert.deepEqual(database.get("auth", "a"), { type: "api_key", key: "sk-a" });
    assert.deepEqual(database.get("auth", "b"), { type: "api_key", key: "sk-b" });
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("写路径 prepared 语句复用：反复 CAS 写不按次数增长 prepare 调用", async () => {
  const dir = await tempDir();
  let database;
  try {
    const { storage, database: db } = makeStorage(dir);
    database = db;
    await storage.init();
    await storage.credentials.modify("p", () => ({ type: "api_key", key: "sk-0" }));
    const prepare = db.prepare.bind(db);
    let prepares = 0;
    db.prepare = (sql) => { prepares += 1; return prepare(sql); };
    // 第一批：首次用到 UPDATE 形式，允许编译一次。
    for (let i = 1; i <= 5; i += 1) await storage.credentials.modify("p", () => ({ type: "api_key", key: `sk-${i}` }));
    const warmed = prepares;
    prepares = 0;
    // 第二批：同形式语句已缓存，不得再编译——否则就是按调用次数线性增长。
    for (let i = 6; i <= 15; i += 1) await storage.credentials.modify("p", () => ({ type: "api_key", key: `sk-${i}` }));
    db.prepare = prepare;
    assert.ok(warmed <= 2, `首次用到新语句形式最多编译两条，实际 ${warmed} 条`);
    assert.equal(prepares, 0, `prepared 语句必须复用，第二批 10 次写入又新编译 ${prepares} 条`);
    assert.equal(database.get("auth", "p").key, "sk-15");
  } finally {
    database?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
