import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.js";
import { createPiModelStorage, canonicalModelsJson } from "../src/pi-model-storage.js";

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
    assert.deepEqual(database.get("models", "favorites"), favoritesSource);
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
