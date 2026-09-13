import { readFile, rename, rm, writeFile } from "node:fs/promises";
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
// Axiom 私有的内置目录可见性清单（不写入 models.json：SDK schema 只认 provider 定义）。
const HIDDEN_KEY = "hidden";
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
  // 0600：文件含真实密钥；写失败向上抛（权威已入库，下次写配置/重启自动重建）。
  const syncCompatFile = async (config) => {
    const tmp = `${compatPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, canonicalModelsJson(config), { mode: 0o600 });
    try {
      await rename(tmp, compatPath);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
  };

  const writeConfig = async (config) => {
    database.set(NAMESPACE, CONFIG_KEY, config);
    await syncCompatFile(readConfig());
  };

  // ---- 凭据（auth/<providerId>）：pi-ai CredentialStore 实现 ---------------------
  // 单进程单写者：modify/delete 走同一条 promise 链串行化（CredentialStore 契约的进程内部分；
  // 跨进程互斥由 SQLite 语句级原子性兜底）。OAuth 刷新等运行时写入全部落库。
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
        const current = rawCredential(providerId);
        const next = await fn(current ? structuredClone(current) : undefined);
        // 与 SDK AuthStorage.modify 一致：fn 返回 undefined 表示放弃变更，保留现值。
        if (next === undefined) return current;
        database.set(AUTH_NAMESPACE, providerId, next);
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
  const recordImportError = (source, error) => {
    const list = database.get(NAMESPACE, IMPORT_ERROR_KEY) ?? [];
    list.push({ source, error });
    database.set(NAMESPACE, IMPORT_ERROR_KEY, list);
  };

  // 单文件导入门闩：标记存在 → 永不再读该源文件（旧配置此后只是历史，不再覆盖权威）。
  // JSON 解析错误不携带 error.message（V8 SyntaxError 可能附带文件原文片段，有密钥泄露风险）。
  const importOnce = async (source, apply) => {
    if (database.get(MIGRATED_NAMESPACE, source) !== undefined) return;
    let raw;
    try {
      raw = await readFile(source, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return; // 无旧配置：零导入，不打标记（用户日后建文件可再导）
      database.set(MIGRATED_NAMESPACE, source, true);
      recordImportError(source, "无法读取旧配置文件，已跳过导入");
      return;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      database.set(MIGRATED_NAMESPACE, source, true);
      recordImportError(source, "不是有效 JSON，已跳过导入；原文件未改动，可在本页重新配置");
      return;
    }
    await apply(value);
    database.set(MIGRATED_NAMESPACE, source, true);
  };

  // 已知损坏的结构不进权威（UI 是唯一修复入口，坏结构一旦入库将无法通过 UI 修复）。
  const importModels = (value) => {
    if (!isPlainObject(value) || (value.providers !== undefined && !isPlainObject(value.providers))) {
      recordImportError(sources.models, "结构无效（顶层/providers 必须是对象），已跳过导入；原文件未改动");
      return;
    }
    if (database.get(NAMESPACE, CONFIG_KEY) === undefined) database.set(NAMESPACE, CONFIG_KEY, value);
  };
  const importAuth = (value) => {
    if (!isPlainObject(value)) {
      recordImportError(sources.auth, "结构无效（顶层必须是对象），已跳过导入；原文件未改动");
      return;
    }
    for (const [providerId, credential] of Object.entries(value)) {
      if (!isCredential(credential)) {
        recordImportError(sources.auth, `provider「${providerId}」的凭据格式无效，已跳过该条`);
        continue;
      }
      if (database.get(AUTH_NAMESPACE, providerId) === undefined)
        database.set(AUTH_NAMESPACE, providerId, credential);
    }
  };
  const importFavorites = (value) => {
    if (isPlainObject(value) && database.get(NAMESPACE, FAVORITES_KEY) === undefined)
      database.set(NAMESPACE, FAVORITES_KEY, value);
  };

  const readHiddenRaw = () => database.get(NAMESPACE, HIDDEN_KEY);
  const writeHiddenRaw = (keys) => database.set(NAMESPACE, HIDDEN_KEY, { version: 1, keys });

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
    syncCompatFile,
    canonicalModelsJson,
    getFavorites: readFavoritesRaw,
    setFavorites: writeFavoritesRaw,
    getHidden: readHiddenRaw,
    setHidden: writeHiddenRaw,
    credentials,
    runtimeOptions,
  };
}
