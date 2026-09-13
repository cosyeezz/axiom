import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { WebSocket } from "ws";
import { command } from "../src/protocol.js";
import { createModelsService } from "../src/model-config.js";
import { Database } from "../src/database.js";
import { createPiModelStorage, canonicalModelsJson } from "../src/pi-model-storage.js";
import { Sessions } from "../src/sessions.js";
import { createServerApp } from "../src/server.js";
import { runOpponent } from "./helpers/model-concurrency-child.mjs";

// 独立后端测试：临时目录 + fake factory + 独立 SQLite，不触碰真实 ~/.pi 与任何真实密钥。
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
// 权威为空（未配置）时的指纹：与空文件同语义。
const EMPTY = sha(canonicalModelsJson({ providers: {} }));

async function tempDir() {
  return mkdtemp(join(tmpdir(), "axiom-model-config-"));
}

// 测试内打开的库连接登记于此：finally 统一 close，否则 Windows 清理临时目录会 EBUSY。
const openDatabases = [];
const closeOpenDatabases = () => {
  for (const database of openDatabases.splice(0)) database.close();
};

function makeService(dir, catalog = []) {
  let refreshes = 0;
  // 故障注入点：failRefresh 置 true 时 refreshModels 抛错，模拟 SDK 目录刷新失败。
  const state = { failRefresh: false };
  const factory = {
    catalog: () => catalog,
    refreshModels: async () => {
      if (state.failRefresh) throw new Error("refresh exploded: fake-secret-must-not-leak");
      refreshes += 1;
      return catalog;
    },
  };
  const database = new Database(join(dir, "axiom.db"));
  openDatabases.push(database);
  // piDir 指向临时空目录：导入逻辑不触碰真实 ~/.pi。
  const storage = createPiModelStorage({ database, home: dir, piDir: join(dir, "pi") });
  const models = createModelsService({ factory, storage });
  return { models, storage, database, refreshes: () => refreshes, state };
}

// 种子：直接写权威库（绕过服务层校验，模拟任意既有状态），并同步派生文件保持一致。
const seed = async (svc, content) => {
  const config = typeof content === "string" ? JSON.parse(content) : content;
  svc.storage.writeConfig(config);
  await svc.storage.syncCompatFile(config);
};

// 派生兼容文件读取：SDK 实际读的镜像，内容应始终等于权威配置。
const compat = (dir) => readFile(join(dir, "models.compat.json"), "utf8");

test("协议层：模型配置与收藏命令的形状校验", () => {
  assert.equal(
    command.parse({
      id: "1",
      type: "models.provider.save",
      providerId: "my-proxy",
      provider: { baseUrl: "https://p.example.com", apiKey: { keep: true } },
      baseFingerprint: EMPTY,
    }).type,
    "models.provider.save",
  );
  assert.throws(() =>
    command.parse({ id: "2", type: "models.provider.save", providerId: "x", provider: { models: [] }, baseFingerprint: EMPTY }),
  );
  assert.throws(() =>
    command.parse({ id: "3", type: "models.provider.save", providerId: "bad id!", provider: {}, baseFingerprint: EMPTY }),
  );
  assert.throws(() =>
    command.parse({ id: "4", type: "models.model.delete", providerId: "x", modelId: "bad\nid", baseFingerprint: EMPTY }),
  );
  assert.throws(() => command.parse({ id: "5", type: "models.favorites.set", kind: "all", key: "k", favorite: true }));
  assert.throws(() => command.parse({ id: "6", type: "models.config.get", extra: 1 }));
});

test("models.config.get：权威为空时空指纹与空列表", async () => {
  const dir = await tempDir();
  try {
    const { models } = makeService(dir, [{ key: "a/b" }]);
    const data = await models.handle({ type: "models.config.get" });
    assert.equal(data.fingerprint, EMPTY);
    assert.deepEqual(data.providers, []);
    assert.deepEqual(data.catalog, [{ key: "a/b" }]);
    assert.equal(data.parseError, undefined);
    assert.equal(data.applyError, undefined, "无挂起时 GET 不返回 applyError");
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider.save：权威落库、派生文件同步、目录刷新", async () => {
  const dir = await tempDir();
  try {
    const { models, database, refreshes } = makeService(dir);
    const created = await models.saveProvider({
      providerId: "my-proxy",
      provider: { name: "My Proxy", baseUrl: "https://p.example.com/v1", api: "openai-completions", apiKey: "sk-test" },
      baseFingerprint: EMPTY,
    });
    assert.notEqual(created.fingerprint, EMPTY);
    assert.equal(created.applied, true, "成功回执 applied:true");
    assert.equal(refreshes(), 1);
    // 权威：SQLite 中的值含真实密钥（用户明确同意的明文存储）。
    const raw = database.get("models", "config");
    assert.equal(raw.providers["my-proxy"].apiKey, "sk-test");
    // 派生：compat 文件与权威一致（SDK 运行时的唯一模型目录来源）。
    assert.deepEqual(JSON.parse(await compat(dir)), raw);

    // GET 脱敏
    const view = await models.handle({ type: "models.config.get" });
    assert.deepEqual(view.providers[0].apiKey, { masked: true, kind: "literal" });
    assert.equal(JSON.stringify(view).includes("sk-test"), false, "响应永不包含密钥明文");

    // 覆盖写：权威与派生同步更新
    await models.saveProvider({ providerId: "my-proxy", provider: { name: "Renamed" }, baseFingerprint: created.fingerprint });
    const renamed = database.get("models", "config");
    assert.equal(renamed.providers["my-proxy"].name, "Renamed");
    assert.equal(renamed.providers["my-proxy"].apiKey, "sk-test");
    assert.deepEqual(JSON.parse(await compat(dir)), renamed);
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("已有密钥保持：!command/env 值经 keep 原样保留，null 删除", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    await seed(svc, {
      providers: {
        vaulted: {
          baseUrl: "https://v.example.com",
          api: "openai-completions",
          apiKey: "!op read 'op://vault/item'",
          headers: { "x-key": "$VAULT_KEY", "x-drop": "gone" },
        },
      },
    });
    const { models } = svc;
    const before = await models.handle({ type: "models.config.get" });
    assert.deepEqual(before.providers[0].apiKey, { masked: true, kind: "command" });
    assert.deepEqual(before.providers[0].headers["x-key"], { masked: true, kind: "env" });
    const text = JSON.stringify(before);
    assert.equal(text.includes("op read"), false);
    assert.equal(text.includes("VAULT_KEY"), false);
    const fingerprint = before.fingerprint;

    await models.saveProvider({
      providerId: "vaulted",
      provider: { apiKey: { keep: true }, headers: { "x-key": { keep: true }, "x-drop": null } },
      baseFingerprint: fingerprint,
    });
    const raw = svc.database.get("models", "config").providers.vaulted;
    assert.equal(raw.apiKey, "!op read 'op://vault/item'");
    assert.equal(raw.headers["x-key"], "$VAULT_KEY");
    assert.equal(raw.headers["x-drop"], undefined);
    // 未知字段/已有 baseUrl 不受影响
    assert.equal(raw.baseUrl, "https://v.example.com");

    await assert.rejects(() =>
      models.saveProvider({ providerId: "vaulted", provider: { apiKey: { keep: true } }, baseFingerprint: fingerprint }),
      /已被外部修改/,
    );
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("信任边界：新增 !command 凭据与非法 baseUrl 被拒绝，权威不变", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    await seed(svc, { providers: { a: { baseUrl: "https://a.example.com", apiKey: "$A_KEY" } } });
    const before = await compat(dir);
    const { models } = svc;
    const view = await models.handle({ type: "models.config.get" });
    const fingerprint = view.fingerprint;
    // keep 缺现值（providerId 不存在）：zod 同步抛错需包成 rejection 才能被 assert.rejects 捕获
    await assert.rejects(() =>
      Promise.resolve().then(() =>
        models.saveProvider({ providerId: "b", provider: { apiKey: { keep: true } }, baseFingerprint: fingerprint }),
      ), /没有可保留的已有值/,
    );
    await assert.rejects(() =>
      models.saveProvider({ providerId: "a", provider: { apiKey: "!evil cmd" }, baseFingerprint: fingerprint }), /! 开头/,
    );
    await assert.rejects(() =>
      models.saveProvider({ providerId: "a", provider: { headers: { "x-k": "!cmd" } }, baseFingerprint: fingerprint }), /! 开头/,
    );
    await assert.rejects(() =>
      models.saveProvider({ providerId: "a", provider: { baseUrl: "ftp://a.example.com" }, baseFingerprint: fingerprint }), /http\/https/,
    );
    await assert.rejects(() =>
      models.saveProvider({ providerId: "a", provider: { baseUrl: "not a url" }, baseFingerprint: fingerprint }), /URL/,
    );
    assert.equal(await compat(dir), before);
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("未知字段与 models/modelOverrides 在 provider.save 后原样保留", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    await seed(svc, {
      providers: {
        keeps: {
          baseUrl: "https://k.example.com",
          api: "openai-completions",
          customFutureField: { nested: [1, 2] },
          models: [{ id: "m1", name: "Model One", reasoning: true }],
          modelOverrides: { "b/m1": { name: "Override" } },
        },
      },
    });
    const { models } = svc;
    const view = await models.handle({ type: "models.config.get" });
    await models.saveProvider({ providerId: "keeps", provider: { name: "Renamed" }, baseFingerprint: view.fingerprint });
    const raw = JSON.parse(await compat(dir)).providers.keeps;
    assert.deepEqual(raw.customFutureField, { nested: [1, 2] });
    assert.deepEqual(raw.models, [{ id: "m1", name: "Model One", reasoning: true }]);
    assert.deepEqual(raw.modelOverrides, { "b/m1": { name: "Override" } });
    assert.equal(raw.name, "Renamed");

    // provider.save 拒绝 models/modelOverrides 键（zod 同步抛，包成 rejection）
    await assert.rejects(() =>
      Promise.resolve().then(() =>
        models.saveProvider({ providerId: "keeps", provider: { models: [] }, baseFingerprint: view.fingerprint }),
      ), /models.model/,
    );
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("model.save/delete：upsert、provider 自动创建、headers keep、删除", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    await seed(svc, {
      providers: { p: { baseUrl: "https://p.example.com", api: "openai-completions", models: [{ id: "m1", headers: { "x-k": "sk-old" } }] } },
    });
    const { models } = svc;
    let view = await models.handle({ type: "models.config.get" });
    let fingerprint = view.fingerprint;

    fingerprint = (await models.saveModel({
      providerId: "p",
      model: { id: "m1", name: "M1", headers: { "x-k": { keep: true } } },
      baseFingerprint: fingerprint,
    })).fingerprint;
    fingerprint = (await models.saveModel({
      providerId: "p",
      model: { id: "m2", contextWindow: 8192 },
      baseFingerprint: fingerprint,
    })).fingerprint;
    let raw = JSON.parse(await compat(dir));
    assert.equal(raw.providers.p.models[0].headers["x-k"], "sk-old");
    assert.equal(raw.providers.p.models[0].name, "M1");
    assert.deepEqual(raw.providers.p.models[1], { id: "m2", contextWindow: 8192 });

    // provider 不存在则自动创建
    await models.saveModel({ providerId: "fresh", model: { id: "f1" }, baseFingerprint: fingerprint });
    raw = JSON.parse(await compat(dir));
    assert.deepEqual(raw.providers.fresh.models, [{ id: "f1" }]);
    view = await models.handle({ type: "models.config.get" });

    await assert.rejects(() =>
      models.deleteModel({ providerId: "p", modelId: "nope", baseFingerprint: view.fingerprint }), /Unknown model/,
    );
    await models.deleteModel({ providerId: "p", modelId: "m1", baseFingerprint: view.fingerprint });
    raw = JSON.parse(await compat(dir));
    assert.deepEqual(raw.providers.p.models.map((m) => m.id), ["m2"]);
    view = await models.handle({ type: "models.config.get" });
    await assert.rejects(() => models.deleteProvider({ providerId: "ghost", baseFingerprint: view.fingerprint }), /Unknown provider/);
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("并发防护：过期指纹拒绝、库内结构非法拒绝写入", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    await seed(svc, { providers: { a: { baseUrl: "https://a.example.com" } } });
    const { models, database } = svc;
    const view = await models.handle({ type: "models.config.get" });

    // 外部写入库后旧指纹被拒（模拟另一进程/直接改库）
    database.set("models", "config", { providers: { a: { baseUrl: "https://changed.example.com" } } });
    await assert.rejects(() =>
      models.saveProvider({ providerId: "a", provider: { name: "x" }, baseFingerprint: view.fingerprint }), /已被外部修改/,
    );

    // providers 非对象（只能来自外部篡改）：GET 报 parseError，写一律拒绝
    database.set("models", "config", { providers: [] });
    const invalid = await models.handle({ type: "models.config.get" });
    assert.match(invalid.parseError, /结构无效/);
    await assert.rejects(() =>
      models.saveProvider({ providerId: "a", provider: { name: "x" }, baseFingerprint: invalid.fingerprint }), /结构无效/,
    );
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("SDK 校验闸门：轻校验放过的垃圾在落库前被拒，无临时文件残留", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    await seed(svc, { providers: { a: { baseUrl: "https://a.example.com", apiKey: "sk-1" } } });
    const before = await compat(dir);
    const { models } = svc;
    const view = await models.handle({ type: "models.config.get" });
    await assert.rejects(() =>
      models.saveProvider({ providerId: "a", provider: { apiKey: "" }, baseFingerprint: view.fingerprint }), /未通过校验/,
    );
    // zod 轻校验拒非字符串 header 值（同步抛，包成 rejection）
    await assert.rejects(() =>
      Promise.resolve().then(() =>
        models.saveProvider({ providerId: "a", provider: { headers: { "x-k": 42 } }, baseFingerprint: view.fingerprint }),
      ), /expected string/i,
    );
    assert.equal(await compat(dir), before);
    const leftover = (await readdir(dir)).filter((name) => name.includes(".tmp-"));
    assert.deepEqual(leftover, []);
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("部分成功回执：compat 重建失败 → applied:false + applyError，权威已落库，同指纹重试重新派生", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    const { models, storage, database } = svc;
    const realSync = storage.syncCompatFile;
    // 故障注入：库写入后的派生文件重建失败（磁盘/权限类 IO 错误）
    storage.syncCompatFile = async () => {
      throw Object.assign(new Error("EACCES: fake-secret-must-not-leak"), { code: "EACCES" });
    };
    let receipt;
    try {
      receipt = await models.saveProvider({
        providerId: "p",
        provider: { name: "P", baseUrl: "https://p.example.com/v1", api: "openai-completions" },
        baseFingerprint: EMPTY,
      });
    } finally {
      storage.syncCompatFile = realSync;
    }
    assert.equal(receipt.applied, false);
    assert.match(receipt.applyError, /EACCES/);
    assert.notEqual(receipt.fingerprint, EMPTY);
    // 库已是新配置（部分成功的事实），派生文件未生成
    assert.equal(database.get("models", "config").providers.p.name, "P");
    await assert.rejects(() => compat(dir), /ENOENT/);
    // 同一 fingerprint 重试：乐观锁通过、apply 幂等重算同一配置、重新派生应用成功
    const retried = await models.saveProvider({
      providerId: "p",
      provider: { name: "P", baseUrl: "https://p.example.com/v1", api: "openai-completions" },
      baseFingerprint: receipt.fingerprint,
    });
    assert.equal(retried.applied, true);
    assert.equal(retried.applyError, undefined);
    assert.deepEqual(JSON.parse(await compat(dir)), database.get("models", "config"));
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("部分成功回执：目录刷新失败 → applied:false，库与派生已一致，修复后重试仅重刷目录", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    const { models, database, state, refreshes } = svc;
    state.failRefresh = true;
    const receipt = await models.saveProvider({
      providerId: "p",
      provider: { name: "P", baseUrl: "https://p.example.com/v1", api: "openai-completions" },
      baseFingerprint: EMPTY,
    });
    assert.equal(receipt.applied, false);
    assert.match(receipt.applyError, /应用失败/);
    assert.doesNotMatch(receipt.applyError, /refresh exploded|fake-secret/);
    assert.equal(refreshes(), 0);
    // 库与派生文件已一致，仅 SDK 目录未刷新；同指纹重试修复后只补目录刷新
    assert.deepEqual(JSON.parse(await compat(dir)), database.get("models", "config"));
    state.failRefresh = false;
    const retried = await models.saveProvider({
      providerId: "p",
      provider: { name: "P", baseUrl: "https://p.example.com/v1", api: "openai-completions" },
      baseFingerprint: receipt.fingerprint,
    });
    assert.equal(retried.applied, true);
    assert.equal(refreshes(), 1);
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("GET 自愈：读取路径顺带重试挂起应用，成功后 applyError 消失，无挂起不额外刷新", async () => {
  const dir = await tempDir();
  try {
    const svc = makeService(dir);
    const { models, storage, database, refreshes } = svc;
    const realSync = storage.syncCompatFile;
    storage.syncCompatFile = async () => {
      throw Object.assign(new Error("EBUSY: fake-secret-must-not-leak"), { code: "EBUSY" });
    };
    let receipt;
    receipt = await models.saveProvider({
      providerId: "p",
      provider: { name: "P", baseUrl: "https://p.example.com/v1", api: "openai-completions" },
      baseFingerprint: EMPTY,
    });
    assert.equal(receipt.applied, false);
    // 挂起未修复：GET 返回 applyError（已保存未应用），UI 可展示并引导刷新重试
    let view = await models.handle({ type: "models.config.get" });
    assert.match(view.applyError, /EBUSY/);
    assert.equal(view.applied, false);
    assert.doesNotMatch(JSON.stringify(view), /fake-secret/);
    // 修复后：任意 GET 顺带重试成功，applyError 消失，派生文件与库一致
    storage.syncCompatFile = realSync;
    view = await models.handle({ type: "models.config.get" });
    assert.equal(view.applyError, undefined);
    assert.equal(view.applied, true);
    assert.equal(refreshes(), 1, "GET 自愈重刷目录一次");
    assert.deepEqual(JSON.parse(await compat(dir)), database.get("models", "config"));
    // 挂起已清除：再次 GET 不额外刷新
    const before = refreshes();
    await models.handle({ type: "models.config.get" });
    assert.equal(refreshes(), before);
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("收藏：三组 key、单项 mutation、去重、校验、持久化、上限", async () => {
  const dir = await tempDir();
  try {
    const { models, database } = makeService(dir);
    assert.deepEqual(await models.favorites(), { provider: [], model: [], thinking: [] });

    let state = await models.setFavorite({ kind: "model", key: "anthropic/claude-x", favorite: true });
    assert.deepEqual(state, { provider: [], model: ["anthropic/claude-x"], thinking: [] });
    state = await models.setFavorite({ kind: "model", key: "anthropic/claude-x", favorite: true });
    assert.deepEqual(state.model, ["anthropic/claude-x"], "重复收藏幂等");
    await models.setFavorite({ kind: "provider", key: "anthropic", favorite: true });
    await models.setFavorite({ kind: "thinking", key: "anthropic/claude-x:high", favorite: true });
    state = await models.favorites();
    assert.deepEqual(state, { provider: ["anthropic"], model: ["anthropic/claude-x"], thinking: ["anthropic/claude-x:high"] });

    await models.setFavorite({ kind: "model", key: "anthropic/claude-x", favorite: false });
    state = await models.favorites();
    assert.deepEqual(state.model, []);

    await assert.rejects(() => models.setFavorite({ kind: "model", key: "noprovider", favorite: true }), /provider\/model/);
    await assert.rejects(() => models.setFavorite({ kind: "model", key: "a/b:c", favorite: true }), /冒号/);
    await assert.rejects(() => models.setFavorite({ kind: "thinking", key: "anthropic/claude-x:bogus", favorite: true }), /level/);
    await assert.rejects(() => models.setFavorite({ kind: "provider", key: "bad id", favorite: true }), /key/);

    // 持久化与跨实例（同一 SQLite 文件重开连接，权威仍在）
    const persisted = database.get("models", "favorites");
    assert.equal(persisted.version, 1);
    assert.deepEqual(persisted.thinking, ["anthropic/claude-x:high"]);
    const againDatabase = new Database(join(dir, "axiom.db"));
    openDatabases.push(againDatabase);
    const againStorage = createPiModelStorage({ database: againDatabase, home: dir, piDir: join(dir, "pi") });
    const againModels = createModelsService({ factory: { catalog: () => [] }, storage: againStorage });
    assert.deepEqual(await againModels.favorites(), JSON.parse(JSON.stringify(state)));

    // 每组上限 200：provider 组已有 "anthropic" 占 1 席，再填 199 条后拒绝第 201 条
    for (let i = 0; i < 199; i += 1) await models.setFavorite({ kind: "provider", key: `p${i}`, favorite: true });
    await assert.rejects(() => models.setFavorite({ kind: "provider", key: "overflow", favorite: true }), /最多 200 条/);
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

test("WS：两个客户端共享 favorites/config.changed 广播，命令走协议校验", async () => {
  const dir = await tempDir();
  try {
    const { models } = makeService(dir);
    const sessions = new Sessions(async () => ({}));
    const app = createServerApp(sessions, { models });
    app.server.listen(0, "127.0.0.1");
    await once(app.server, "listening");
    const http = `http://127.0.0.1:${app.server.address().port}`;
    const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
    const connect = async () => {
      const ws = new WebSocket(url, ["axiom"]);
      await once(ws, "open");
      return ws;
    };
    const request = (ws, value) =>
      new Promise((resolve, reject) => {
        const listen = (raw) => {
          const msg = JSON.parse(raw);
          if (msg.type === "response" && msg.id === value.id) {
            ws.off("message", listen);
            msg.ok ? resolve(msg) : reject(new Error(msg.error));
          }
        };
        ws.on("message", listen);
        ws.send(JSON.stringify(value));
      });
    const eventsOf = (ws) => {
      const events = [];
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type !== "response") events.push(msg);
      });
      return events;
    };
    let a;
    let b;
    try {
      // 静态路由：文件存在则 200（ETag 可用），未落地时 404 且不影响服务启动。
      for (const path of ["/model-manager.js", "/model-picker.css"]) {
        const response = await fetch(http + path);
        assert.equal(response.status, existsSync(new URL(`../public${path}`, import.meta.url)) ? 200 : 404);
      }
      a = await connect();
      b = await connect();
      const eventsB = eventsOf(b);
      // 广播帧与响应不同步，轮询等待目标事件（1s 超时）
      const waitFor = (type) =>
        new Promise((resolve, reject) => {
          const found = () => eventsB.find((event) => event.type === type);
          const hit = found();
          if (hit) return resolve(hit);
          const timer = setTimeout(() => {
            clearInterval(poll);
            reject(new Error(`timeout waiting ${type}`));
          }, 1000);
          const poll = setInterval(() => {
            const hit = found();
            if (hit) {
              clearTimeout(timer);
              clearInterval(poll);
              resolve(hit);
            }
          }, 10);
        });
      const set = await request(a, {
        id: "f1", type: "models.favorites.set", kind: "model", key: "anthropic/claude-x", favorite: true,
      });
      assert.deepEqual(set.data, { provider: [], model: ["anthropic/claude-x"], thinking: [] });
      assert.deepEqual((await waitFor("models.favorites.changed")).data, set.data, "跨窗口收到全量收藏广播");

      const got = await request(a, { id: "g1", type: "models.config.get" });
      const saved = await request(a, {
        id: "s1", type: "models.provider.save",
        providerId: "llm", provider: { baseUrl: "http://localhost:9/v1", api: "openai-completions" },
        baseFingerprint: got.data.fingerprint,
      });
      assert.equal(saved.ok, true);
      assert.notEqual(saved.data.fingerprint, got.data.fingerprint);
      assert.equal((await waitFor("models.config.changed")).type, "models.config.changed", "配置变更广播");

      await assert.rejects(() =>
        request(b, { id: "s2", type: "models.provider.save", providerId: "llm", provider: { apiKey: "!x" }, baseFingerprint: saved.data.fingerprint }),
        /! 开头/,
      );
      const favorites = await request(b, { id: "f2", type: "models.favorites.get" });
      assert.deepEqual(favorites.data, set.data);
    } finally {
      a?.terminate();
      b?.terminate();
      await app.close();
    }
  } finally {
    closeOpenDatabases();
    await rm(dir, { recursive: true, force: true });
  }
});

// 子进程已读旧权威、停在CAS前；父进程先写成功再放行，确定性检查过期写拒绝。
for (const op of ["config", "favorites"]) {
  test(`两进程 ${op}：旧权威捕获后被他人更新，过期CAS必须拒绝`, { timeout: 30000 }, async () => {
    const dir = await tempDir();
    let opponent;
    try {
      const { models, storage } = makeService(dir);
      opponent = runOpponent({ dir, op });
      await opponent.ready();
      if (op === "config") {
        await models.saveProvider({ providerId: "p", provider: { name: "from-parent" }, baseFingerprint: (await models.get()).fingerprint });
      } else {
        await models.setFavorite({ kind: "model", key: "parent/model", favorite: true });
      }
      opponent.release();
      const outcome = await opponent.result();
      assert.equal(outcome.ok, false);
      assert.match(outcome.message, /已被/);
      if (op === "config") {
        assert.equal(storage.readConfig().providers.p.name, "from-parent");
        assert.deepEqual(JSON.parse(await compat(dir)), storage.readConfig());
      } else {
        assert.deepEqual((await models.favorites()).model, ["parent/model"]);
      }
    } finally {
      await opponent?.close();
      closeOpenDatabases();
      await rm(dir, { recursive: true, force: true });
    }
  });
}
