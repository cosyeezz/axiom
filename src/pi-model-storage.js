import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// SDK 0.85.1 未公开导出 resolveConfigValue/isCommandConfigValue（auth.json $VAR 插值语义），
// 与 model-config.js 相同：从实际安装位置经包入口定位后按文件 URL 深路径加载。
// 加载失败只降级（读值不再做环境插值），不阻断启动。
let sdkResolveConfigValue;
let sdkIsCommandConfigValue;
try {
  const sdkDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
  const mod = await import(pathToFileURL(join(sdkDist, "core", "resolve-config-value.js")).href);
  sdkResolveConfigValue = mod.resolveConfigValue;
  sdkIsCommandConfigValue = mod.isCommandConfigValue;
} catch {}

// 模型配置/凭据的 SQLite 权威存储：供应商、模型、API keys、收藏全部入库，
// Pi 运行时零手工配置——凭据以内存 CredentialStore 注入 ModelRuntime（SDK 标准接口），
// 模型目录因 SDK 只接受文件路径，写 Axiom 私有派生文件 models.compat.json（仅派生非权威，
// 每次写库后全量重写，可随时删除重建）。首次启动幂等导入既有 Pi 配置（models.json/auth.json）
// 与旧收藏文件：只读源文件、绝不回写；导入后打迁移标记，此后不再从旧文件覆盖。
// 密钥明文仅存 SQLite（用户明确同意）；本模块所有对外读取均不返回明文。
const NAMESPACE = "models";
const AUTH_NAMESPACE = "auth";
const MIGRATED_NAMESPACE = "migrated";
const CONFIG_KEY = "config";
const FAVORITES_KEY = "favorites";
const IMPORT_ERROR_KEY = "importError";

// 权威配置的规范序列化：指纹、SDK 校验、派生文件三处共用，保证三 view 一致。
export function canonicalModelsJson(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
// auth.json 条目的宽松形状检查（与 SDK ReadOnlyAuthStorage 一致的最小校验）。
const isCredential = (value) =>
  isPlainObject(value) &&
  ((value.type === "api_key" && (value.key === undefined || typeof value.key === "string")) ||
    (value.type === "oauth" &&
      typeof value.access === "string" &&
      typeof value.refresh === "string" &&
      typeof value.expires === "number" &&
      Number.isFinite(value.expires)));

export function createPiModelStorage({ database, home, piDir = getAgentDir() }) {
  const compatPath = join(home, "models.compat.json");
  const sources = {
    models: join(piDir, "models.json"),
    auth: join(piDir, "auth.json"),
    favorites: join(home, "models-favorites.json"),
  };

  // ---- 权威配置（models/config） -------------------------------------------------
  const readConfig = () => {
    const stored = database.get(NAMESPACE, CONFIG_KEY);
    // 库内值只可能由本模块写入；外部篡改导致结构非法时按空配置兜底，不让进程崩溃。
    return isPlainObject(stored) ? stored : { providers: {} };
  };

  // 原子写派生兼容文件：SDK 只接受 models.json 路径，故权威配置全量镜像到该私有文件。
  // 0600：文件含真实密钥；write/rename 任一步失败都完整清理临时文件后向上抛
  //（权威已入库，下次写配置/重启自动重建）。临时文件名用 randomUUID，永不复用。
  // rename 瞬时占用（Windows 杀软/并发读取目标文件报 EPERM/EBUSY）：有限次退避重试，
  // 绝不先删目标——删了就丢旧镜像，失败窗口内 SDK 会读到不存在的模型目录。
  const syncCompatFile = async (config) => {
    const tmp = `${compatPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tmp, canonicalModelsJson(config), { mode: 0o600 });
      for (let attempt = 0; ; attempt += 1) {
        try {
          await rename(tmp, compatPath);
          break;
        } catch (error) {
          if (attempt >= 2 || !(error?.code === "EPERM" || error?.code === "EBUSY")) throw error;
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        }
      }
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
  };

  // 权威落库（仅 SQLite）。派生兼容文件由调用方按需经 syncCompatFile 显式重建，
  // 两阶段分离让上层能区分「库写入失败」（应报错）与「派生/刷新失败」（部分成功，可重试应用）。
  const writeConfig = (config) => {
    database.set(NAMESPACE, CONFIG_KEY, config);
  };

  // ---- 跨进程 CAS：修同 HOME 多进程读-改-写丢更新 --------------------------------
  // 权威库文件（main.js 以 join(home, "axiom.db") 打开）。每次 CAS 开短连接用完即关：
  // 无常驻第二连接/版本列/锁文件/新依赖（node:sqlite 为内置）。比较+写入是单条 SQL
  // 语句＝SQLite 语句级原子事务；WAL 下多连接安全，busy_timeout 兜底写锁竞争。
  const dbPath = join(home, "axiom.db");
  const withStore = (run) => {
    mkdirSync(home, { recursive: true });
    const db = new DatabaseSync(dbPath);
    try {
      db.exec("PRAGMA busy_timeout = 5000");
      return run(db);
    } finally {
      db.close();
    }
  };
  const readRaw = (db, namespace, key) =>
    db.prepare("SELECT value FROM store WHERE namespace = ? AND key = ?").get(namespace, key)?.value;
  // expectedRaw 为 undefined（行尚不存在）→ 仅当行仍不存在时插入；否则原文全等才覆盖。
  // 返回 false = 他人已抢先写入：调用方转为固定脱敏冲突错误，绝不自动重放（fn 可能有副作用）。
  const compareAndSet = (db, namespace, key, expectedRaw, next) =>
    expectedRaw === undefined
      ? db
          .prepare("INSERT INTO store (namespace, key, value) VALUES (?, ?, ?) ON CONFLICT(namespace, key) DO NOTHING")
          .run(namespace, key, next).changes === 1
      : db.prepare("UPDATE store SET value = ? WHERE namespace = ? AND key = ? AND value = ?").run(next, namespace, key, expectedRaw).changes === 1;

  // 写路径起点捕获：raw 为库内原文（CAS 期望值）；config 解析兜底与 readConfig 同语义。
  const configState = () =>
    withStore((db) => {
      const raw = readRaw(db, NAMESPACE, CONFIG_KEY);
      const stored = raw === undefined ? undefined : JSON.parse(raw);
      return { raw, config: isPlainObject(stored) ? stored : { providers: {} } };
    });
  // 库内为紧凑 JSON（与 database.set 一致）；非派生文件的规范序列化。
  const casConfig = (raw, config) => withStore((db) => compareAndSet(db, NAMESPACE, CONFIG_KEY, raw, JSON.stringify(config)));
  const favoritesState = () =>
    withStore((db) => {
      const raw = readRaw(db, NAMESPACE, FAVORITES_KEY);
      return { raw, value: raw === undefined ? undefined : JSON.parse(raw) };
    });
  const casFavorites = (raw, store) =>
    withStore((db) => compareAndSet(db, NAMESPACE, FAVORITES_KEY, raw, JSON.stringify({ version: 1, ...store })));
  const credentialState = (providerId) =>
    withStore((db) => {
      const raw = readRaw(db, AUTH_NAMESPACE, providerId);
      const stored = raw === undefined ? undefined : JSON.parse(raw);
      return { raw, current: isCredential(stored) ? stored : undefined };
    });

  // ---- 凭据（auth/<providerId>）：pi-ai CredentialStore 实现 ---------------------
  // 单进程单写者：modify/delete 走同一条 promise 链串行化；跨进程见下方 CAS。
  // 跨进程由落库时的 CAS（比较 fn 调用前的权威原文）防丢更新。OAuth 刷新等运行时写入全部落库。
  let chain = Promise.resolve();
  const enqueue = (run) => {
    const task = chain.then(run);
    chain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
  const rawCredential = (providerId) => {
    const stored = database.get(AUTH_NAMESPACE, providerId);
    return isCredential(stored) ? stored : undefined;
  };
  // 与 SDK AuthStorage.read 完全一致：api_key 且非命令型时解析 $VAR/${VAR} 插值；
  // 命令型/其余类型原样返回（命令由 getAuth 阶段的专用通道执行，这里绝不执行）。
  const resolveForRead = (credential) => {
    if (credential.type !== "api_key" || !credential.key) return structuredClone(credential);
    if (sdkIsCommandConfigValue?.(credential.key)) return structuredClone(credential);
    const resolve = sdkResolveConfigValue ?? ((key) => key);
    return { ...credential, key: resolve(credential.key, credential.env) };
  };

  const credentials = {
    async read(providerId, options) {
      options?.signal?.throwIfAborted();
      const credential = rawCredential(providerId);
      return credential ? resolveForRead(credential) : undefined;
    },
    // 元数据枚举：只有 providerId 与 type，绝不暴露任何 key 值。
    async list(options) {
      options?.signal?.throwIfAborted();
      return database
        .list(AUTH_NAMESPACE)
        .filter(({ value }) => isCredential(value))
        .map(({ key, value }) => ({ providerId: key, type: value.type }));
    },
    modify(providerId, fn, options) {
      return enqueue(async () => {
        options?.signal?.throwIfAborted();
        const { raw: expectedRaw, current } = credentialState(providerId);
        const next = await fn(current ? structuredClone(current) : undefined);
        // 与 SDK AuthStorage.modify 一致：fn 返回 undefined 表示放弃变更，保留现值。
        if (next === undefined) return current;
        // 异步 fn 期间他人可能已写：CAS 原文比较失败即冲突——固定脱敏错误，不自动重放。
        if (!withStore((db) => compareAndSet(db, AUTH_NAMESPACE, providerId, expectedRaw, JSON.stringify(next))))
          throw new Error("凭据已被其他进程修改，本次写入已取消，请重试");
        return structuredClone(next);
      });
    },
    async delete(providerId, options) {
      options?.signal?.throwIfAborted();
      await enqueue(() => {
        database.delete(AUTH_NAMESPACE, providerId);
      });
    },
  };

  // ---- 首次幂等导入 ----------------------------------------------------------------
  // 导入告警去重：坏文件在修复前每次 init 都会重读重报，同一来源同一消息只记一条。
  const recordImportError = (source, error) => {
    const list = importErrors();
    if (list.some((item) => item.source === source && item.error === error)) return;
    database.set(NAMESPACE, IMPORT_ERROR_KEY, [...list, { source, error }]);
  };
  // 来源修复后其历史告警已过时，全部清除（避免空权威页面上出现陈旧噪音）。
  const clearImportErrors = (source) => {
    const list = importErrors();
    const rest = list.filter((item) => item.source !== source);
    if (rest.length !== list.length) database.set(NAMESPACE, IMPORT_ERROR_KEY, rest);
  };

  // 单文件导入门闩：仅成功导入后才打标记，此后不再读该源文件（旧配置此后只是历史，
  // 不再覆盖权威）。读失败/坏 JSON/结构拒绝：记录去重告警且不打标记——用户修好原文件后
  // 下次 init 自动重新导入（与 README「坏文件保留并警告，修复后可再次导入」一致），
  // 每次重试只多读一个小文件，代价可忽略。JSON 解析错误不携带 error.message
  //（V8 SyntaxError 可能附带文件原文片段，有密钥泄露风险）。
  const importOnce = async (source, apply) => {
    if (database.get(MIGRATED_NAMESPACE, source) !== undefined) return;
    let raw;
    try {
      raw = await readFile(source, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return; // 无旧配置：零导入，不打标记（用户日后建文件可再导）
      recordImportError(source, "无法读取旧配置文件，已跳过导入");
      return;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      recordImportError(source, "不是有效 JSON，已跳过导入；原文件未改动，可在本页重新配置");
      return;
    }
    if (!(await apply(value))) return; // 部分拒绝：告警已记录，不打标记，修复后下次 init 重试
    database.set(MIGRATED_NAMESPACE, source, true);
    clearImportErrors(source);
  };

  // 已知损坏的结构不进权威（UI 是唯一修复入口，坏结构一旦入库将无法通过 UI 修复）。
  // 返回 true = 本来源干净（可打标记）；false = 有条目被拒（不打标记，修复后重导）。
  const importModels = (value) => {
    if (!isPlainObject(value) || (value.providers !== undefined && !isPlainObject(value.providers))) {
      recordImportError(sources.models, "结构无效（顶层/providers 必须是对象），已跳过导入；原文件未改动");
      return false;
    }
    if (database.get(NAMESPACE, CONFIG_KEY) === undefined) database.set(NAMESPACE, CONFIG_KEY, value);
    return true;
  };
  const importAuth = (value) => {
    if (!isPlainObject(value)) {
      recordImportError(sources.auth, "结构无效（顶层必须是对象），已跳过导入；原文件未改动");
      return false;
    }
    let clean = true;
    for (const [providerId, credential] of Object.entries(value)) {
      if (!isCredential(credential)) {
        recordImportError(sources.auth, `provider「${providerId}」的凭据格式无效，已跳过该条`);
        clean = false;
        continue;
      }
      // 权威已有的 providerId 一律不覆盖：UI 新值 / 上次导入优先，旧文件只是历史。
      if (database.get(AUTH_NAMESPACE, providerId) === undefined)
        database.set(AUTH_NAMESPACE, providerId, credential);
    }
    return clean;
  };
  const importFavorites = (value) => {
    if (isPlainObject(value) && database.get(NAMESPACE, FAVORITES_KEY) === undefined)
      database.set(NAMESPACE, FAVORITES_KEY, value);
    return isPlainObject(value);
  };

  const readFavoritesRaw = () => database.get(NAMESPACE, FAVORITES_KEY);
  const writeFavoritesRaw = (store) => database.set(NAMESPACE, FAVORITES_KEY, { version: 1, ...store });

  // 启动装配：幂等导入 → 全量重建派生兼容文件（幂等：任意时刻删掉 compat 文件重启即恢复）。
  // 必须在 createPiFactory 之前 await 完成，SDK 首次读模型目录时兼容文件已就绪。
  const init = async () => {
    await importOnce(sources.models, importModels);
    await importOnce(sources.auth, importAuth);
    await importOnce(sources.favorites, importFavorites);
    await syncCompatFile(readConfig());
  };

  // 导入期告警（get() 在权威配置为空时转成 parseError 展示）。
  const importErrors = () => database.get(NAMESPACE, IMPORT_ERROR_KEY) ?? [];

  // ModelRuntime.create 的注入参数：凭据走内存注入（零文件），模型目录走派生兼容文件。
  const runtimeOptions = () => ({ credentials, modelsPath: compatPath });

  return {
    compatPath,
    sources,
    init,
    importErrors,
    readConfig,
    writeConfig,
    configState,
    casConfig,
    favoritesState,
    casFavorites,
    syncCompatFile,
    canonicalModelsJson,
    getFavorites: readFavoritesRaw,
    setFavorites: writeFavoritesRaw,
    credentials,
    runtimeOptions,
  };
}
