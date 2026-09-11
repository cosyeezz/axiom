import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
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

// pi 自定义供应商/模型（~/.pi/agent/models.json）的安全编辑 + 全局收藏。
// 协议：docs/model-config-protocol.md。服务端永不读取/回显/记录密钥明文。
const EMPTY_FINGERPRINT = createHash("sha256").update("").digest("hex");
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

async function readFavorites(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return Object.fromEntries(FAVORITE_GROUPS.map((group) => [group, []]));
    if (error instanceof SyntaxError) throw new Error(`收藏文件损坏（${path}）：${error.message}`);
    throw error;
  }
  return Object.fromEntries(
    FAVORITE_GROUPS.map((group) => {
      const list = Array.isArray(parsed?.[group]) ? parsed[group] : [];
      return [group, [...new Set(list.filter((key) => typeof key === "string"))].slice(0, FAVORITE_CAP)];
    }),
  );
}

export function createModelsService({
  factory,
  modelsPath = join(getAgentDir(), "models.json"),
  favoritesPath,
}) {
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
  const readRaw = async () => {
    try {
      return await readFile(modelsPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };

  async function get() {
    const content = await readRaw();
    const result = {
      fingerprint: content === null ? EMPTY_FINGERPRINT : digest(content),
      path: modelsPath,
      providers: [],
      catalog: factory.catalog(),
    };
    if (content === null) return result;
    let config;
    try {
      config = JSON.parse(content);
    } catch {
      // 不回传 error.message：V8 的 JSON SyntaxError 可能附带文件原文片段（密钥风险）。
      result.parseError = "models.json 不是有效 JSON，无法展示当前配置";
      return result;
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      result.parseError = "models.json 结构无效：顶层必须是对象";
      return result;
    }
    // providers 缺失视为空配置（与写路径一致）；仅类型不符才报 parseError。
    const providers = config.providers === undefined ? {} : config.providers;
    if (providers === null || typeof providers !== "object" || Array.isArray(providers)) {
      result.parseError = "models.json 结构无效：providers 必须是对象";
      return result;
    }
    result.providers = Object.entries(providers).map(([id, provider]) => maskProvider(id, provider));
    return result;
  }

  // 所有写命令：指纹乐观锁 → 解析（损坏/结构无效一律拒绝，绝不覆盖）→ 变更 →
  // SDK 真实 schema 校验 → 备份 → 临时文件 + rename 原子写 → 刷新 SDK 模型目录。
  async function mutate(baseFingerprint, apply) {
    const content = await readRaw();
    const fingerprint = content === null ? EMPTY_FINGERPRINT : digest(content);
    if (fingerprint !== baseFingerprint) throw new Error("models.json 已被外部修改，请刷新配置页后重试");
    let config;
    if (content === null) {
      config = { providers: {} };
    } else {
      try {
        config = JSON.parse(content);
      } catch {
        // 不带 error.message：可能包含文件原文片段（密钥风险）。
        throw new Error("models.json 不是有效 JSON，已拒绝写入以避免覆盖损坏内容");
      }
      if (!config || typeof config !== "object" || Array.isArray(config))
        throw new Error("models.json 结构无效，已拒绝写入以避免覆盖");
      if (config.providers === undefined) config.providers = {};
      else if (config.providers === null || typeof config.providers !== "object" || Array.isArray(config.providers))
        throw new Error("models.json 结构无效（providers 必须是对象），已拒绝写入以避免覆盖");
    }
    apply(config.providers);
    const json = `${JSON.stringify(config, null, 2)}\n`;
    if (!sdkModelConfig) throw new Error("无法加载 Pi 配置校验器，已拒绝保存；请检查 SDK 版本");
    await mkdir(dirname(modelsPath), { recursive: true });
    const tmp = `${modelsPath}.tmp-${process.pid}-${Date.now()}`;
    // 0600：models.json 可能含真实密钥，临时文件与备份一律收紧；rename 后正式文件继承该权限。
    await writeFile(tmp, json, { mode: 0o600 });
    try {
      if (sdkModelConfig) {
        const check = await sdkModelConfig.load(tmp);
        if (check.getError()) throw new Error("models.json 未通过校验，已放弃保存；请检查 Pi 模型参数与供应商配置");
      }
      // 复查指纹：堵住 SDK 校验期间的外部改动窗口期，rename 前最后一道锁。
      const latest = await readRaw();
      if ((latest === null ? EMPTY_FINGERPRINT : digest(latest)) !== baseFingerprint)
        throw new Error("models.json 已被外部修改，请刷新配置页后重试");
      if (content !== null) {
        await copyFile(modelsPath, `${modelsPath}.bak`);
        await chmod(`${modelsPath}.bak`, 0o600);
      }
      await rename(tmp, modelsPath);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
    if (factory.refreshModels) await factory.refreshModels();
    return { fingerprint: digest(json) };
  }

  const sameId = (id) => (entry) => entry && typeof entry === "object" && entry.id === id;
  const asProvider = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const asModels = (provider) => (Array.isArray(provider.models) ? provider.models : []);

  async function writeFavorites({ kind, key, favorite }) {
    validFavoriteKey(kind, key);
    const store = await readFavorites(favoritesPath);
    const list = store[kind];
    const index = list.indexOf(key);
    if (favorite && index < 0) list.push(key);
    if (!favorite && index >= 0) list.splice(index, 1);
    for (const group of FAVORITE_GROUPS)
      if (store[group].length > FAVORITE_CAP) throw new Error(`${group} 收藏最多 ${FAVORITE_CAP} 条`);
    await mkdir(dirname(favoritesPath), { recursive: true });
    const tmp = `${favoritesPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, `${JSON.stringify({ version: 1, ...store }, null, 2)}\n`);
    await rename(tmp, favoritesPath);
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
    favorites: () => readFavorites(favoritesPath),
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
