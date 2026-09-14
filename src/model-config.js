import { createHash, randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { canonicalModelsJson } from "./pi-model-storage.js";
import { modelConfigIn, modelOverrideIn, providerConfigIn } from "./protocol.js";

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

// pi 自定义供应商/模型的安全编辑 + 全局收藏：权威数据在 SQLite（pi-model-storage），
// 本模块只负责协议语义（指纹乐观锁、合并规则、脱敏、SDK 校验闸门），不再直接读写文件。
// 协议：docs/model-config-protocol.md。服务端永不读取/回显/记录密钥明文。
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

// 收藏存 SQLite（models/favorites）；读取时归一化：过滤非法、去重，
// 与旧文件语义一致；库内值只可能由本模块写入，结构异常一律回退空表。
// 读取不截断：旧收藏文件单组可能超过上限（导入路径不裁剪），读时静默截断会让写路径以
// 截断值做 CAS 基线，把用户从未见过的条目永久删掉。上限只在「新增」时作为写侧闸门生效。
function normalizeFavorites(parsed) {
  return Object.fromEntries(
    FAVORITE_GROUPS.map((group) => {
      const list = Array.isArray(parsed?.[group]) ? parsed[group] : [];
      return [group, [...new Set(list.filter((key) => typeof key === "string"))]];
    }),
  );
}

// 内置目录的隐藏清单：provider id（整条）或 `provider/id`（单个模型）。
const HIDDEN_CAP = 500;
function normalizeHidden(raw) {
  const list = raw && typeof raw === "object" && Array.isArray(raw.keys) ? raw.keys : [];
  return [...new Set(list.filter((key) => typeof key === "string"))].slice(0, HIDDEN_CAP);
}

export function createModelsService({ factory, storage, discoverTimeoutMs = 15_000, discoverFetch }) {
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
    const { config, invalid } = storage.configState();
    const result = {
      fingerprint: fingerprintOf(config),
      applied: !pendingApply,
      path: storage.compatPath,
      providers: [],
      catalog: factory.modelCatalog?.() ?? factory.catalog(),
      authProviders: factory.authProviders?.() ?? [],
      hidden: normalizeHidden(storage.getHidden()),
    };
    if (pendingApply) result.applyError = pendingApply.applyError;
    // 行存在但读不出可用配置（坏 JSON 或顶层非对象）：必须报错，绝不按空配置展示——
    // 空配置指纹与它相同，用户随手一存就把原值静默覆盖掉。
    if (invalid) {
      result.parseError = "模型配置结构无效：数据库中的配置不是对象，已拒绝按空配置展示";
      return result;
    }
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
    const { raw: expectedRaw, config, invalid } = storage.configState();
    if (invalid) throw new Error("模型配置结构无效（数据库中的配置不是对象），已拒绝写入以避免覆盖");
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

  // 隐藏只作用于 Axiom 的「可选择处」（模型选择器、本页目录）：Pi 运行时目录不动，
  // 已用该模型的会话不会忽然报 Unknown model，只是再也选不到。同名自定义条目存在时
  // 供应商级隐藏不生效（用户已经用覆盖接管了该 id）。
  const hiddenSet = () => new Set(normalizeHidden(storage.getHidden()));
  const customProviderIds = () => {
    const providers = storage.readConfig()?.providers;
    return new Set(providers && typeof providers === "object" && !Array.isArray(providers) ? Object.keys(providers) : []);
  };
  const visibleCatalog = () => {
    const hidden = hiddenSet();
    const custom = customProviderIds();
    return factory.catalog().filter((m) => !hidden.has(m.key) && !(hidden.has(m.provider) && !custom.has(m.provider)));
  };

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
    // 上限只拦「新增」：已超限的旧数据仍要能被用户一条条减下来，不能连删除也一起拒。
    if (favorite && index < 0) {
      if (list.length >= FAVORITE_CAP) throw new Error(`${kind} 收藏最多 ${FAVORITE_CAP} 条`);
      list.push(key);
    }
    if (!favorite && index >= 0) list.splice(index, 1);
    if (!storage.casFavorites(raw, store)) throw new Error("收藏已被其他窗口修改，请刷新后重试");
    return store;
  }

  // 隐藏/恢复：key 必须存在于当前目录（供应商 id 或 `provider/id`），不写会永久失效的垃圾条目。
  // 与 config/favorites/凭据同口径走 CAS：同 HOME 多进程盲写会让先写者的隐藏项复活。
  function writeHidden({ key, hidden }) {
    const known = new Set();
    for (const model of factory.modelCatalog?.() ?? factory.catalog()) {
      known.add(model.provider);
      known.add(model.key);
    }
    if (!known.has(key)) throw new Error(`未知的内置供应商或模型：${key}`);
    const { raw, value } = storage.hiddenState();
    const list = normalizeHidden(value);
    const next = hidden ? [...new Set([...list, key])] : list.filter((entry) => entry !== key);
    if (next.length > HIDDEN_CAP) throw new Error(`隐藏清单最多 ${HIDDEN_CAP} 条`);
    if (!storage.casHidden(raw, next)) throw new Error("隐藏清单已被其他窗口修改，请刷新后重试");
    return { hidden: next };
  }

  // 在线拉取供应商模型列表（只读）：读已保存凭据/地址 → 单次 GET → 解析；不写盘、不触发 refreshModels/广播。
  async function discover(providerId) {
    const config = storage.readConfig();
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
          const entry = mergeProvider(asProvider(providers[providerId]), input);
          // 内联 id 必须与配置键一致（与 renameProvider 同口径）：前端把整条 provider 原样回传
          // 很常见，id 当普通未知字段写进去就会形成「库内键 ≠ 内联 id」，而 GET 回显用键覆盖 id，
          // 用户看不到差异。原本无内联 id 的条目不凭空加上（合并语义：不造字段）。
          if ("id" in entry) entry.id = providerId;
          providers[providerId] = entry;
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
    // 改名 = 整条搬家（含 models/modelOverrides），单次写盘、指纹乐观锁照旧；
    // 前端无法用 save+delete 复现（modelOverrides 没有独立写命令）。
    renameProvider({ providerId, newProviderId, baseFingerprint }) {
      return enqueue(() =>
        mutate(baseFingerprint, (providers) => {
          if (!(providerId in providers)) throw new Error(`Unknown provider：${providerId}`);
          if (newProviderId in providers) throw new Error(`供应商「${newProviderId}」已存在，请换一个 id`);
          const entry = providers[providerId];
          if (entry && typeof entry === "object" && !Array.isArray(entry) && "id" in entry)
            entry.id = newProviderId;
          delete providers[providerId];
          providers[newProviderId] = entry;
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
    overrideModel({ providerId, modelId, override, baseFingerprint }) {
      const input = modelOverrideIn.parse(override);
      return enqueue(() => mutate(baseFingerprint, (providers) => {
        if (!(factory.modelCatalog?.() ?? factory.catalog()).some((m) => m.provider === providerId && m.id === modelId))
          throw new Error("未知模型，请刷新配置页后重试");
        const base = asProvider(providers[providerId]);
        const overrides = { ...base.modelOverrides };
        const next = { ...overrides[modelId] };
        for (const [key, value] of Object.entries(input)) {
          if (value === null) delete next[key];
          else if (key === "headers") next.headers = mergeHeaders(next.headers, value);
          else if (["thinkingLevelMap", "cost", "compat", "samplingParams"].includes(key)) next[key] = { ...next[key], ...value };
          else next[key] = value;
        }
        if (Object.keys(next).length) overrides[modelId] = next;
        else delete overrides[modelId];
        providers[providerId] = { ...base, modelOverrides: overrides };
      }));
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
    listCatalog: visibleCatalog,
    // 单项 mutation（与收藏同语义，无指纹锁：隐藏清单独立于 models.json）。
    setHidden: (request) => enqueue(() => writeHidden(request)),
    handle(request) {
      switch (request.type) {
        case "models.config.get":
          return get();
        case "models.provider.save":
          return this.saveProvider(request);
        case "models.provider.delete":
          return this.deleteProvider(request);
        case "models.provider.rename":
          return this.renameProvider(request);
        case "models.model.override":
          return this.overrideModel(request);
        case "models.model.save":
          return this.saveModel(request);
        case "models.model.delete":
          return this.deleteModel(request);
        case "models.favorites.get":
          return this.favorites();
        case "models.favorites.set":
          return this.setFavorite(request);
        case "models.hidden.set":
          return this.setHidden(request);
        case "models.provider.discover":
          return discover(request.providerId);
        default:
          throw new Error(`未知的模型配置命令：${request.type}`);
      }
    },
  };
}
