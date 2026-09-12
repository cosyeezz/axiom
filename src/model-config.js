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
let sdkResolveConfigValue;
try {
  const sdkDist = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
  sdkModelConfig = (await import(pathToFileURL(join(sdkDist, "core", "model-config.js")).href)).ModelConfig;
  // discover 用：与 SDK 完全一致的 $VAR/${VAR}/$$/$! 插值语义；命令型值在调用前拦截，绝不执行。
  sdkResolveConfigValue = (await import(pathToFileURL(join(sdkDist, "core", "resolve-config-value.js")).href)).resolveConfigValue;
} catch {
  sdkModelConfig = undefined;
  sdkResolveConfigValue = undefined;
}

// pi 自定义供应商/模型（~/.pi/agent/models.json）的安全编辑 + 全局收藏。
// 协议：docs/model-config-protocol.md。服务端永不读取/回显/记录密钥明文。
const EMPTY_FINGERPRINT = createHash("sha256").update("").digest("hex");
const digest = (raw) => createHash("sha256").update(raw).digest("hex");
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const FAVORITE_GROUPS = ["provider", "model", "thinking"];
const FAVORITE_CAP = 200;
// discover（在线拉取模型列表）：接口均已按官方文档核实；重定向可能把凭据带到第三方，直接禁止。
const DISCOVER_APIS = {
  "openai-completions": { path: (base) => `${base}/models` },
  "openai-responses": { path: (base) => `${base}/models` },
  "anthropic-messages": { path: (base) => `${base}/v1/models?limit=1000`, defaultBase: "https://api.anthropic.com" },
  "google-generative-ai": { path: (base) => `${base}/models?pageSize=1000`, defaultBase: "https://generativelanguage.googleapis.com/v1beta" },
};
const DISCOVER_BODY_LIMIT = 5 * 1024 * 1024;
const DISCOVER_MODEL_CAP = 500;
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
  // Ollama 等模型的 id 合法含冒号（如 llama3.1:8b）；只有 thinking 组用最后一个冒号切分等级。
  const colon = kind === "model" ? -1 : key.lastIndexOf(":");
  const level = kind === "model" ? "" : key.slice(colon + 1);
  const modelKey = kind === "model" ? key : key.slice(0, colon);
  if (kind === "thinking" && !LEVELS.includes(level)) invalid(`${key}（应为 provider/model:level）`);
  const slash = modelKey.indexOf("/");
  if (slash <= 0 || slash === modelKey.length - 1) invalid(`${key}（应为 provider/model）`);
  if (!providerPattern.test(modelKey.slice(0, slash))) invalid(`${key}（供应商 id 不合法）`);
}

// discover：只读取已保存供应商的凭据与地址发起一次 GET；错误文案全部固定，绝不回传请求头/密钥/上游响应体。
function resolveDiscoverSecret(value, label) {
  if (typeof value !== "string") throw new Error(`${label}：凭据值无效`);
  if (value.startsWith("!")) throw new Error(`${label}：命令执行型凭据不支持在线拉取模型列表`);
  if (!sdkResolveConfigValue) throw new Error(`${label}：无法加载 SDK 凭据解析器，请检查 SDK 版本`);
  let resolved;
  try { resolved = sdkResolveConfigValue(value); }
  catch { throw new Error(`${label}：凭据解析失败，请检查环境变量配置`); }
  if (resolved === undefined || resolved === "") throw new Error(`${label}：凭据无法解析（如环境变量缺失）`);
  return resolved;
}

async function readBodyCapped(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > DISCOVER_BODY_LIMIT) {
      await reader.cancel().catch(() => {});
      throw new Error("模型列表响应体过大，已拒绝解析");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

// 响应 → { models, truncated }；只透传接口确实给出的字段：id / name（及 Google 确实给出的 contextWindow、maxTokens）。
// 未知 reasoning/上下文一律省略，不从名称/型号猜测。
function parseDiscoverBody(api, body) {
  if (api === "google-generative-ai") {
    const entries = Array.isArray(body?.models) ? body.models : [];
    const models = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || typeof entry.name !== "string" || !entry.name) continue;
      // 仅保留真正能对话的模型（embedding/TTS 等被 supportedGenerationMethods 明确排除，非猜测）；字段缺失时不猜，保留。
      if (Array.isArray(entry.supportedGenerationMethods) && !entry.supportedGenerationMethods.includes("generateContent")) continue;
      const raw = entry.name.startsWith("models/") ? entry.name.slice("models/".length) : entry.name;
      const model = { id: raw };
      if (typeof entry.displayName === "string" && entry.displayName) model.name = entry.displayName;
      if (Number.isFinite(entry.inputTokenLimit) && entry.inputTokenLimit > 0) model.contextWindow = entry.inputTokenLimit;
      if (Number.isFinite(entry.outputTokenLimit) && entry.outputTokenLimit > 0) model.maxTokens = entry.outputTokenLimit;
      models.push(model);
    }
    return { models, truncated: Boolean(body.nextPageToken) };
  }
  if (api === "anthropic-messages") {
    const entries = Array.isArray(body?.data) ? body.data : [];
    const models = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id) continue;
      const model = { id: entry.id };
      if (typeof entry.display_name === "string" && entry.display_name) model.name = entry.display_name;
      models.push(model);
    }
    return { models, truncated: body.has_more === true };
  }
  // OpenAI 兼容：{ data: [...] }；部分兼容服务器直接返回数组，一并兼容。
  const entries = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : null;
  if (!entries) throw new Error("模型列表响应结构无法识别");
  const models = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id) continue;
    const model = { id: entry.id };
    if (typeof entry.name === "string" && entry.name) model.name = entry.name;
    models.push(model);
  }
  return { models, truncated: false };
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
  discoverTimeoutMs = 15_000,
  discoverFetch,
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

  // 在线拉取供应商模型列表（只读）：读已保存凭据/地址 → 单次 GET → 解析；不写盘、不触发 refreshModels/广播。
  async function discover(providerId) {
    const content = await readRaw();
    if (content === null) throw new Error(`Unknown provider：${providerId}`);
    let config;
    try {
      config = JSON.parse(content);
    } catch {
      // 不带 error.message：可能含文件原文片段（密钥风险）。
      throw new Error("models.json 不是有效 JSON，无法读取该供应商配置");
    }
    const providers = config?.providers;
    if (providers === null || typeof providers !== "object" || Array.isArray(providers))
      throw new Error("models.json 结构无效（providers 必须是对象），无法读取该供应商配置");
    const provider = providers[providerId];
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) throw new Error(`Unknown provider：${providerId}`);

    if (provider.oauth) throw new Error("该供应商使用 OAuth 登录，暂不支持在线拉取模型列表");
    const api = typeof provider.api === "string" ? provider.api : "";
    const spec = DISCOVER_APIS[api];
    if (!spec)
      throw new Error(
        api ? `不支持的 api 类型：${api}（支持：${Object.keys(DISCOVER_APIS).join("、")}）` : "该供应商未配置 api 类型，无法拉取模型列表",
      );
    let base = typeof provider.baseUrl === "string" ? provider.baseUrl.replace(/\/+$/, "") : "";
    if (!base && spec.defaultBase) base = spec.defaultBase;
    if (!base) throw new Error("该供应商未配置 baseUrl，无法拉取模型列表");
    try {
      const url = new URL(base);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅支持 http/https");
    } catch {
      throw new Error("该供应商 baseUrl 不是有效的 http/https 地址");
    }

    const headers = {};
    let apiKey;
    if (provider.apiKey !== undefined && provider.apiKey !== null) apiKey = resolveDiscoverSecret(provider.apiKey, "apiKey");
    if (provider.headers && typeof provider.headers === "object" && !Array.isArray(provider.headers)) {
      for (const [name, value] of Object.entries(provider.headers))
        headers[name] = resolveDiscoverSecret(value, `headers.${name}`);
    }
    if (provider.authHeader === true && !apiKey) throw new Error("authHeader 已启用但无法解析 apiKey");
    if (apiKey && api === "anthropic-messages") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (apiKey && api === "google-generative-ai") {
      headers["x-goog-api-key"] = apiKey;
    } else if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (apiKey && provider.authHeader === true && !("Authorization" in headers)) headers.Authorization = `Bearer ${apiKey}`;

    let response;
    try {
      response = await (discoverFetch ?? fetch)(spec.path(base), {
        method: "GET",
        headers,
        redirect: "error", // 重定向可能把凭据带到第三方地址，直接失败
        signal: AbortSignal.timeout(discoverTimeoutMs),
      });
    } catch (error) {
      if (error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new Error("拉取模型列表超时，请稍后重试");
      throw new Error("无法连接到模型列表地址（网络错误或重定向被拒绝）");
    }
    if (!response.ok) throw new Error(`供应商返回 HTTP ${response.status}，已拒绝解析响应内容`);
    let text;
    try { text = await readBodyCapped(response); }
    catch (error) {
      if (error?.message === "模型列表响应体过大，已拒绝解析") throw error;
      throw new Error("读取模型列表响应失败或超时，请重试");
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("模型列表响应不是有效 JSON");
    }
    const { models, truncated } = parseDiscoverBody(api, body);
    return models.length > DISCOVER_MODEL_CAP ? { models: models.slice(0, DISCOVER_MODEL_CAP), truncated: true } : { models, truncated };
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
        case "models.provider.discover":
          return discover(request.providerId);
        default:
          throw new Error(`未知的模型配置命令：${request.type}`);
      }
    },
  };
}
