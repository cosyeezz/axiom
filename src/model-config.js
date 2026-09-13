import { createHash, randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { canonicalModelsJson } from "./pi-model-storage.js";
import { modelConfigIn, providerConfigIn } from "./protocol.js";

// SDK 0.85.1 未公开导出 ModelConfig（models.json schema 校验器），从实际安装位置
// 经包入口定位后按文件 URL 深路径加载。
// ponytail: 依赖已锁定 SDK 的内部布局；升级后不可加载时拒绝写入，不能绕过配置校验。
let sdkModelConfig;
try {
  const sdkDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
  sdkModelConfig = (await import(pathToFileURL(join(sdkDist, "core", "model-config.js")).href)).ModelConfig;
} catch {
  sdkModelConfig = undefined;
}

// pi 自定义供应商/模型的安全编辑 + 全局收藏：权威数据在 SQLite（pi-model-storage），
// 本模块只负责协议语义（指纹乐观锁、合并规则、脱敏、SDK 校验闸门），不再直接读写文件。
// 协议：docs/model-config-protocol.md。服务端永不读取/回显/记录密钥明文。
const digest = (raw) => createHash("sha256").update(raw).digest("hex");
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const FAVORITE_GROUPS = ["provider", "model", "thinking"];
const FAVORITE_CAP = 200;
const providerPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// $VAR / ${VAR} 环境变量插值前缀；$$ 与 $! 是字面转义，归为 literal。
const envPattern = /^\$\{?[A-Za-z_]\w*\}?/;

const kindOf = (value) => (value.startsWith("!") ? "command" : envPattern.test(value) ? "env" : "literal");
const maskHeaders = (headers) =>
  headers && typeof headers === "object" && !Array.isArray(headers)
    ? Object.fromEntries(
        Object.entries(headers).map(([name, value]) => [
          name,
          typeof value === "string" ? { masked: true, kind: kindOf(value) } : value,
        ]),
      )
    : headers;
const maskModel = (model) =>
  model && typeof model === "object" && !Array.isArray(model)
    ? { ...model, headers: maskHeaders(model.headers) }
    : model;

function maskProvider(id, provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider))
    return { id, invalid: true };
  return {
    ...provider,
    id,
    apiKey: typeof provider.apiKey === "string" ? { masked: true, kind: kindOf(provider.apiKey) } : provider.apiKey,
    headers: maskHeaders(provider.headers),
    models: Array.isArray(provider.models) ? provider.models.map(maskModel) : provider.models,
    modelOverrides:
      provider.modelOverrides && typeof provider.modelOverrides === "object" && !Array.isArray(provider.modelOverrides)
        ? Object.fromEntries(Object.entries(provider.modelOverrides).map(([key, value]) => [key, maskModel(value)]))
        : provider.modelOverrides,
  };
}

// {keep:true} → 现值（无则报错）；字符串 → 新值（禁 ! 前导命令型）；null → 删除（返回 undefined）。
function resolveSecret(value, existing, label) {
  if (value && typeof value === "object") {
    if (existing === undefined) throw new Error(`${label}：没有可保留的已有值`);
    return existing;
  }
  if (typeof value === "string") {
    if (value.startsWith("!")) throw new Error(`${label}：不允许新增 ! 开头的命令执行型凭据`);
    return value;
  }
  return undefined;
}

function checkBaseUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}：baseUrl 不是有效 URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${label}：baseUrl 仅支持 http/https`);
}

function mergeHeaders(previous, input) {
  const merged = { ...(previous && typeof previous === "object" ? previous : {}) };
  for (const [name, value] of Object.entries(input)) {
    const resolved = resolveSecret(value, merged[name], `headers.${name}`);
    if (resolved === undefined) delete merged[name];
    else merged[name] = resolved;
  }
  return Object.keys(merged).length ? merged : undefined;
}

// provider.save 为合并语义：已知字段覆盖/null 删除，未知顶层字段与 models/modelOverrides 原样保留。
function mergeProvider(current, input) {
  const next = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) {
      delete next[key];
    } else if (key === "apiKey") {
      const resolved = resolveSecret(value, current.apiKey, "apiKey");
      if (resolved === undefined) delete next.apiKey;
      else next.apiKey = resolved;
    } else if (key === "headers") {
      const merged = mergeHeaders(current.headers, value);
      if (merged) next.headers = merged;
      else delete next.headers;
    } else if (key === "baseUrl") {
      checkBaseUrl(value, "baseUrl");
      next.baseUrl = value;
    } else {
      next[key] = value;
    }
  }
  return next;
}

// model.save 为整条替换：仅 headers 的 {keep:true} 参照同 id 现有条目。
function applyModel(existing, input) {
  const next = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (key === "headers") {
      const merged = mergeHeaders(existing?.headers, value);
      if (merged) next.headers = merged;
    } else if (key === "baseUrl") {
      checkBaseUrl(value, "baseUrl");
      next.baseUrl = value;
    } else {
      next[key] = value;
    }
  }
  return next;
}

function validFavoriteKey(kind, key) {
  const invalid = (message) => {
    throw new Error(`无效的${kind === "model" ? "模型" : kind === "thinking" ? "思考等级" : "供应商"} key：${message}`);
  };
  if (kind === "provider") {
    if (!providerPattern.test(key)) invalid(`${key}`);
    return;
  }
  if (kind === "model" && key.includes(":")) invalid(`${key}（不应包含冒号）`);
  const colon = kind === "model" ? -1 : key.lastIndexOf(":");
  const level = kind === "model" ? "" : key.slice(colon + 1);
  const modelKey = kind === "model" ? key : key.slice(0, colon);
  if (kind === "thinking" && !LEVELS.includes(level)) invalid(`${key}（应为 provider/model:level）`);
  const slash = modelKey.indexOf("/");
  if (slash <= 0 || slash === modelKey.length - 1) invalid(`${key}（应为 provider/model）`);
  if (!providerPattern.test(modelKey.slice(0, slash))) invalid(`${key}（供应商 id 不合法）`);
}

// 收藏存 SQLite（models/favorites）；读取时归一化：过滤非法、去重、截断到上限，
// 与旧文件语义一致；库内值只可能由本模块写入，结构异常一律回退空表。
function normalizeFavorites(parsed) {
  return Object.fromEntries(
    FAVORITE_GROUPS.map((group) => {
      const list = Array.isArray(parsed?.[group]) ? parsed[group] : [];
      return [group, [...new Set(list.filter((key) => typeof key === "string"))].slice(0, FAVORITE_CAP)];
    }),
  );
}

export function createModelsService({ factory, storage }) {
  // 单进程内串行化：配置写与收藏写共用一条 promise 链，避免读-改-写交错。
  let chain = Promise.resolve();
  const enqueue = (run) => {
    const task = chain.then(run);
    chain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };
  // 权威配置的指纹：对规范序列化做摘要；权威为空与旧「文件缺失」同语义（空配置）。
  const fingerprintOf = (config) => digest(canonicalModelsJson(config));
  // SDK/扩展异常可能夹带配置原文；仅暴露固定提示和已知系统错误码，截断不等于脱敏。
  const sanitizeApplyError = (error) => `应用失败，请重试${["EACCES", "EPERM", "EBUSY", "ENOSPC", "ENOENT", "EIO"].includes(error?.code) ? `（${error.code}）` : ""}`;
  // 挂起应用状态：库已落库但派生/刷新未完成。GET 读取路径顺带重试（GET 幂等、不重放任何
  // mutation，是比客户端重发写命令更安全的自愈入口）；重试成功即清除，无挂起时 GET 不额外刷新。
  let pendingApply = null;

  async function get() {
    if (pendingApply)
      await enqueue(async () => {
        if (!pendingApply) return;
        try {
          await storage.syncCompatFile(storage.readConfig());
          if (factory.refreshModels) await factory.refreshModels();
          pendingApply = null;
        } catch (error) {
          pendingApply.applyError = sanitizeApplyError(error);
        }
      });
    const config = storage.readConfig();
    const result = {
      fingerprint: fingerprintOf(config),
      applied: !pendingApply,
      path: storage.compatPath,
      providers: [],
      catalog: factory.catalog(),
    };
    if (pendingApply) result.applyError = pendingApply.applyError;
    // 导入期告警只在权威配置为空时展示：一旦用户开始配置，旧文件的问题不再 relevant。
    const imported = storage.importErrors();
    if (!Object.keys(config.providers ?? {}).length && imported.length)
      result.parseError = imported.map(({ source, error }) => `${source}：${error}`).join("；");
    // providers 缺失视为空配置（与写路径一致）；仅类型不符才报 parseError。
    const providers = config.providers === undefined ? {} : config.providers;
    if (providers === null || typeof providers !== "object" || Array.isArray(providers)) {
      result.parseError = "模型配置结构无效：providers 必须是对象";
      return result;
    }
    result.providers = Object.entries(providers).map(([id, provider]) => maskProvider(id, provider));
    return result;
  }

  // 所有写命令：指纹乐观锁 → 权威读取 → 变更 → SDK 真实 schema 校验 → 权威落库 →
  // 派生兼容文件重建 + SDK 模型目录刷新（应用阶段）。全部写命令经 enqueue 单进程内串行；
  // 跨进程丢更新由落库 CAS 防护（比较起点权威原文，冲突即拒绝，不自动重放）。
  // 回执协议：库写入失败（指纹/CAS 冲突/校验拒绝/SQLite 异常）照常抛错，权威未变；
  // 库已落库但派生/刷新失败时不抛——权威已变，抛错会让 UI 误以为保存失败而丢弃编辑。
  // 此时返回 { fingerprint, applied: false, applyError }，同时记为挂起状态：后续任意
  // models.config.get 读取路径顺带重试派生+刷新并在响应返回 applyError（有 = 已保存未应用，
  // 无 = 已应用）。GET 幂等且不重放 mutation，是最安全的自愈入口；也可拿同一 fingerprint
  // 重试保存，乐观锁照常通过，apply 幂等重算同一配置。
  async function mutate(baseFingerprint, apply) {
    // 起点捕获库内权威原文：异步校验窗口结束后用它做单语句 CAS 比较，跨进程不丢更新。
    const { raw: expectedRaw, config } = storage.configState();
    if (fingerprintOf(config) !== baseFingerprint) throw new Error("模型配置已被外部修改，请刷新配置页后重试");
    const providers = config.providers === undefined ? {} : config.providers;
    if (providers === null || typeof providers !== "object" || Array.isArray(providers))
      throw new Error("模型配置结构无效（providers 必须是对象），已拒绝写入以避免覆盖");
    if (config.providers === undefined) config.providers = {};
    apply(config.providers);
    if (!sdkModelConfig) throw new Error("无法加载 Pi 配置校验器，已拒绝保存；请检查 SDK 版本");
    // SDK 校验器只接受文件路径：规范序列化写入临时文件校验后即删（临时文件永不落密钥副本留盘）。
    const tmp = `${storage.compatPath}.tmp-validate-${randomUUID()}`;
    try {
      await writeFile(tmp, canonicalModelsJson(config), { mode: 0o600 });
      const check = await sdkModelConfig.load(tmp);
      if (check.getError()) throw new Error("模型配置未通过校验，已放弃保存；请检查 Pi 模型参数与供应商配置");
    } finally {
      await rm(tmp, { force: true }).catch(() => {});
    }
    // 异步校验窗口内他人可能已写：单语句 CAS（原文全等才覆盖）原子落库，失败即冲突。
    if (!storage.casConfig(expectedRaw, config)) throw new Error("模型配置已被外部修改，请刷新配置页后重试");
    const fingerprint = fingerprintOf(config);
    try {
      // 重新读取权威以缩小陈旧窗口；文件写入跨await，仍不保证跨进程镜像实时一致。
      await storage.syncCompatFile(storage.readConfig());
      if (factory.refreshModels) await factory.refreshModels();
      pendingApply = null;
    } catch (error) {
      pendingApply = { fingerprint, applyError: sanitizeApplyError(error) };
      return { fingerprint, applied: false, applyError: pendingApply.applyError };
    }
    return { fingerprint, applied: true };
  }

  const sameId = (id) => (entry) => entry && typeof entry === "object" && entry.id === id;
  const asProvider = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const asModels = (provider) => (Array.isArray(provider.models) ? provider.models : []);

  async function writeFavorites({ kind, key, favorite }) {
    validFavoriteKey(kind, key);
    // 收藏同样用CAS，避免额外事务接口；冲突明确拒绝，由用户刷新重试，不虚报成功。
    const { raw, value } = storage.favoritesState();
    const store = normalizeFavorites(value);
    const list = store[kind];
    const index = list.indexOf(key);
    if (favorite && index < 0) list.push(key);
    if (!favorite && index >= 0) list.splice(index, 1);
    for (const group of FAVORITE_GROUPS)
      if (store[group].length > FAVORITE_CAP) throw new Error(`${group} 收藏最多 ${FAVORITE_CAP} 条`);
    if (!storage.casFavorites(raw, store)) throw new Error("收藏已被其他窗口修改，请刷新后重试");
    return store;
  }

  return {
    get,
    saveProvider({ providerId, provider, baseFingerprint }) {
      const input = providerConfigIn.parse(provider);
      return enqueue(() =>
        mutate(baseFingerprint, (providers) => {
          providers[providerId] = mergeProvider(asProvider(providers[providerId]), input);
        }),
      );
    },
    deleteProvider({ providerId, baseFingerprint }) {
      return enqueue(() =>
        mutate(baseFingerprint, (providers) => {
          if (!(providerId in providers)) throw new Error(`Unknown provider：${providerId}`);
          delete providers[providerId];
        }),
      );
    },
    saveModel({ providerId, model, baseFingerprint }) {
      const input = modelConfigIn.parse(model);
      return enqueue(() =>
        mutate(baseFingerprint, (providers) => {
          const base = asProvider(providers[providerId]);
          const models = asModels(base);
          const existing = models.find(sameId(input.id));
          const entry = applyModel(existing, input);
          const index = models.findIndex(sameId(input.id));
          if (index >= 0) models[index] = entry;
          else models.push(entry);
          providers[providerId] = { ...base, models };
        }),
      );
    },
    deleteModel({ providerId, modelId, baseFingerprint }) {
      return enqueue(() =>
        mutate(baseFingerprint, (providers) => {
          if (!(providerId in providers)) throw new Error(`Unknown provider：${providerId}`);
          const base = asProvider(providers[providerId]);
          const models = asModels(base);
          const index = models.findIndex(sameId(modelId));
          if (index < 0) throw new Error(`Unknown model：${providerId}/${modelId}`);
          models.splice(index, 1);
          providers[providerId] = { ...base, models };
        }),
      );
    },
    favorites: () => normalizeFavorites(storage.getFavorites()),
    // 单项 mutation：读-改-写单条，返回全量三组对象；不做整表替换，避免并发丢失。
    setFavorite: (request) => enqueue(() => writeFavorites(request)),
    handle(request) {
      switch (request.type) {
        case "models.config.get":
          return get();
        case "models.provider.save":
          return this.saveProvider(request);
        case "models.provider.delete":
          return this.deleteProvider(request);
        case "models.model.save":
          return this.saveModel(request);
        case "models.model.delete":
          return this.deleteModel(request);
        case "models.favorites.get":
          return this.favorites();
        case "models.favorites.set":
          return this.setFavorite(request);
        default:
          throw new Error(`未知的模型配置命令：${request.type}`);
      }
    },
  };
}
