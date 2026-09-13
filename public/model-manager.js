// 设置页「模型与供应商」面板：编辑 Axiom SQLite 中 的自定义/覆盖供应商与模型。
// 协议见 docs/model-config-protocol.md v1：
//   models.config.get → { fingerprint, path, parseError?, providers:[…], catalog:[…] }
//   models.provider.save/delete、models.model.save/delete（baseFingerprint 防外部改动覆盖）
//   密钥（apiKey / headers.*）GET 时为 { masked, kind } 掩码；保存支持 { keep:true } / 字符串 / null
// 导出 initModelManager({ root, request, onSaved }) → { load }；root 由 index.html 提供，
// onSaved 供主入口刷新模型下拉；所有请求失败在面板内展示，绝不向上抛。

const API_TYPES = [
  ["openai-completions", "OpenAI Chat Completions（兼容性最好）"],
  ["openai-responses", "OpenAI Responses"],
  ["anthropic-messages", "Anthropic Messages"],
  ["google-generative-ai", "Google Generative AI"],
];

// 常见供应商模板：baseUrl/api/apiKey 预填均可改；本地服务保留占位 key（pi 要求有鉴权才在 /model 可见）。
export const PROVIDER_TEMPLATES = [
  { id: "custom", label: "自定义（OpenAI 兼容）", api: "openai-completions" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", api: "openai-completions", apiKey: "$OPENAI_API_KEY",
    models: [{ id: "gpt-5.1", name: "GPT-5.1", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxTokens: 128000 }] },
  { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com", api: "anthropic-messages", apiKey: "$ANTHROPIC_API_KEY",
    models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }] },
  { id: "google", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", api: "google-generative-ai", apiKey: "$GEMINI_API_KEY",
    models: [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", reasoning: true, input: ["text", "image"], contextWindow: 1048576, maxTokens: 65536 }] },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions", apiKey: "$OPENROUTER_API_KEY",
    models: [{ id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5 (OpenRouter)", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 }] },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", api: "openai-completions", apiKey: "$DEEPSEEK_API_KEY",
    models: [{ id: "deepseek-chat", name: "DeepSeek Chat", contextWindow: 128000, maxTokens: 8192 }] },
  { id: "xai", label: "xAI（Grok）", baseUrl: "https://api.x.ai/v1", api: "openai-completions", apiKey: "$XAI_API_KEY",
    models: [{ id: "grok-4", name: "Grok 4", reasoning: true, input: ["text", "image"], contextWindow: 256000, maxTokens: 32768 }] },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", api: "openai-completions", apiKey: "$GROQ_API_KEY",
    models: [{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: 128000, maxTokens: 32768 }] },
  { id: "moonshot", label: "Moonshot Kimi", baseUrl: "https://api.moonshot.cn/v1", api: "openai-completions", apiKey: "$MOONSHOT_API_KEY",
    models: [{ id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo", reasoning: true, contextWindow: 256000, maxTokens: 16384 }] },
  { id: "zai", label: "智谱 ZAI（GLM）", baseUrl: "https://open.bigmodel.cn/api/paas/v4", api: "openai-completions", apiKey: "$ZAI_API_KEY",
    models: [{ id: "glm-4.7", name: "GLM-4.7", reasoning: true, contextWindow: 200000, maxTokens: 128000 }] },
  { id: "ollama", label: "Ollama（本地）", baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "ollama",
    compat: { supportsDeveloperRole: false },
    models: [{ id: "llama3.1:8b" }, { id: "qwen2.5-coder:7b" }] },
  { id: "lmstudio", label: "LM Studio（本地）", baseUrl: "http://localhost:1234/v1", api: "openai-completions", apiKey: "lm-studio",
    compat: { supportsDeveloperRole: false },
    models: [{ id: "local-model" }] },
  { id: "vllm", label: "vLLM（本地）", baseUrl: "http://localhost:8000/v1", api: "openai-completions", apiKey: "vllm",
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    models: [{ id: "qwen2.5-7b-instruct" }] },
];

const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MASK_KINDS = { command: "命令取值（!…）", env: "环境变量引用（$…）", literal: "已存值" };

// 供编辑表单直接托管的字段；其余（compat、cost、samplingParams…）走「高级字段」JSON。
const MANAGED_PROVIDER_KEYS = ["id", "baseUrl", "api", "authHeader", "apiKey", "headers", "models", "modelOverrides"];
const MANAGED_MODEL_KEYS = ["id", "name", "api", "reasoning", "input", "contextWindow", "maxTokens"];

const isMask = (value) => Boolean(value) && typeof value === "object" && value.masked === true;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
// 保存前把掩码对象还原成 keep 语义；掩码只出现在 apiKey/headers 值里，其余原样深拷贝。
function keepMasked(value) {
  if (isMask(value)) return { keep: true };
  if (Array.isArray(value)) return value.map(keepMasked);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, keepMasked(item)]));
  return value;
}
// 掩码对象与 {keep:true} 结构不同但语义相同，脏检查用排序键序列化消除顺序差异。
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

// 最小 DOM 构建助手：子节点文本一律走 textContent，杜绝 innerHTML 注入。
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false || value === null) continue;
    if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (["disabled", "checked", "hidden", "selected", "open", "multiple"].includes(key)) node[key] = Boolean(value);
    else if (key === "value") node.value = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function field(labelText, control, hint) {
  return el("div", { class: "mm-field" }, el("span", { class: "mm-field-label" }, labelText), control,
    hint ? el("span", { class: "mm-field-hint" }, hint) : null);
}
function badge(text, tone = "") {
  return el("span", { class: `mm-badge${tone ? ` mm-badge-${tone}` : ""}` }, text);
}
function parseJsonText(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return { value: {} };
  try { return { value: JSON.parse(trimmed) }; }
  catch (error) { return { error: `高级字段 JSON 无法解析：${error.message}` }; }
}

export function initModelManager({ root, request, onSaved }) {
  if (!root || !(root instanceof Node)) throw new Error("initModelManager 需要一个根容器节点");
  const state = {
    loaded: false, loading: false, path: "", fingerprint: "", parseError: "",
    providers: [], catalog: [], open: new Set(), draft: null,
    editForms: new Map(), newRows: new Map(), armed: null, loadToken: 0,
  };

  const skeleton = buildSkeleton();
  root.replaceChildren(skeleton);
  const $ = (selector) => skeleton.querySelector(selector);
  const alertBox = () => $(".mm-alert");
  const catalogBox = () => $(".mm-catalog");
  const providersBox = () => $(".mm-providers");
  const pathLine = () => $(".mm-path");

  // ── 骨架 ────────────────────────────────────────────────────────────────
  function buildSkeleton() {
    return el("div", { class: "mm" },
      el("div", { class: "mm-head" },
        el("div", { class: "mm-head-text" },
          el("h3", {}, "模型与供应商"),
          el("p", { class: "mm-path", title: "配置存储位置" }, "Axiom SQLite")),
        el("div", { class: "mm-head-actions" },
          el("button", { type: "button", class: "secondary", onclick: () => void load() }, "刷新"),
          el("button", { type: "button", onclick: openDraft }, "添加供应商"))),
      el("div", { class: "mm-alert", role: "alert" }),
      el("section", { class: "mm-section" },
        el("h4", {}, "当前可用模型目录"),
        el("p", { class: "mm-hint" }, "内置、扩展发现与自定义供应商合并后的可用模型（只读）。保存更改后此目录即时更新。"),
        el("div", { class: "mm-catalog" })),
      el("section", { class: "mm-section" },
        el("h4", {}, "自定义与覆盖（SQLite）"),
        el("div", { class: "mm-providers" })));
  }

  function showAlert(tone, message, actions = []) {
    alertBox().replaceChildren(el("div", { class: `mm-alert-inner mm-alert-${tone}` },
      el("span", { class: "mm-alert-text" }, message),
      actions.length ? el("span", { class: "mm-alert-actions" },
        ...actions.map(({ label, onclick }) => el("button", { type: "button", class: "secondary", onclick }, label))) : null));
  }
  const clearAlert = () => alertBox().replaceChildren();
  const isConflict = (error) => /已被外部修改/.test(error?.message ?? "");

  // ── 加载 ────────────────────────────────────────────────────────────────
  // silent=true 用于写操作后的回读：保留提示条（例如「已保存」不被冲掉）。
  async function load({ silent = false, notify = false } = {}) {
    const token = ++state.loadToken;
    state.loading = true;
    try {
      const data = await request("models.config.get", {});
      if (token !== state.loadToken) return;
      state.loaded = true;
      state.path = data.path || "Axiom SQLite";
      state.fingerprint = data.fingerprint || "";
      state.parseError = data.parseError || "";
      state.providers = Array.isArray(data.providers) ? data.providers : [];
      state.catalog = Array.isArray(data.catalog) ? data.catalog : [];
      state.editForms.clear();
      state.newRows.clear();
      if (!silent) clearAlert();
      if (state.parseError) showAlert("warn", `旧模型配置导入失败，请在此重新配置：${state.parseError}`,
        [{ label: "重新加载", onclick: () => void load() }]);
      if (data.applied === false) showAlert("warn", `配置已保存，但尚未应用：${data.applyError || "请重试应用"}`,
        [{ label: "重试应用", onclick: () => void load({ notify: true }) }]);
      pathLine().textContent = state.path;
      renderCatalog();
      renderProviders();
      if (notify && data.applied !== false) await Promise.resolve(onSaved?.()).catch(() => {});
      return data;
    } catch (error) {
      if (token !== state.loadToken) return;
      showAlert("error", `无法加载模型配置：${error.message || error}`,
        [{ label: "重试", onclick: () => void load() }]);
    } finally {
      if (token === state.loadToken) state.loading = false;
    }
  }

  // 写操作统一入口：成功后更新指纹 → 静默回读渲染 → 通知主入口刷新下拉。
  async function submit(button, run, { successMessage } = {}) {
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "保存中…"; }
    try {
      const result = await run();
      state.fingerprint = result?.fingerprint || state.fingerprint;
      const current = await load({ silent: true });
      const application = current?.applied !== undefined ? current : result;
      if (application?.applied === false) showAlert("warn", `配置已保存，但尚未应用：${application.applyError || "请重试应用"}`,
        [{ label: "重试应用", onclick: () => void load({ notify: true }) }]);
      else if (current && successMessage) showAlert("ok", successMessage);
      await Promise.resolve(onSaved?.()).catch(() => {});
    } catch (error) {
      showAlert(isConflict(error) ? "warn" : "error",
        isConflict(error)
          ? "模型配置已被其他窗口修改，当前更改未写入。请重新加载后再编辑。"
          : `保存失败：${error.message || error}`,
        [{ label: "重新加载", onclick: () => void load() }]);
      if (button) { button.disabled = false; button.textContent = label; }
    }
  }

  // ── 只读目录 ───────────────────────────────────────────────────────────
  function renderCatalog() {
    const groups = new Map();
    for (const model of state.catalog) {
      if (!groups.has(model.provider)) groups.set(model.provider, []);
      groups.get(model.provider).push(model);
    }
    const customIds = new Set(state.providers.map((provider) => provider.id));
    const content = groups.size
      ? [...groups.entries()].map(([provider, models]) => el("div", { class: "mm-catalog-group" },
          el("div", { class: "mm-catalog-provider" },
            el("span", { class: "mm-catalog-provider-name mm-mono" }, provider),
            badge(customIds.has(provider) ? "自定义" : "内置 / 扩展", customIds.has(provider) ? "accent" : "")),
          el("div", { class: "mm-catalog-models" },
            ...models.map((model) => el("div", { class: "mm-catalog-model" },
              el("code", { class: "mm-mono" }, model.key || `${model.provider}/${model.id}`),
              model.name && model.name !== model.id ? el("span", { class: "mm-catalog-model-name" }, model.name) : null,
              el("span", { class: "mm-catalog-model-tags" },
                model.levels?.length ? badge("推理") : null,
                Array.isArray(model.input) && model.input.includes("image") ? badge("图片") : null))))))
      : [el("p", { class: "mm-empty" }, "当前没有可用模型（可能缺少认证配置）。")];
    catalogBox().replaceChildren(...content);
  }

  // ── 供应商表单数据 ⇄ 载荷 ───────────────────────────────────────────────
  function providerForm(provider, template) {
    const snap = provider ?? {};
    const headers = snap.headers && typeof snap.headers === "object" && !Array.isArray(snap.headers) ? snap.headers : {};
    return {
      snap,
      id: snap.id || suggestId(template?.id === "custom" || !template ? "my-provider" : template.id),
      baseUrl: snap.baseUrl ?? template?.baseUrl ?? "",
      api: snap.api ?? template?.api ?? "openai-completions",
      authHeader: Boolean(snap.authHeader),
      apiKeyValue: isMask(snap.apiKey) ? "" : String(snap.apiKey ?? template?.apiKey ?? ""),
      apiKeyMasked: isMask(snap.apiKey),
      apiKeyKind: isMask(snap.apiKey) ? snap.apiKey.kind : "",
      apiKeyClear: false,
      headerRows: Object.entries(headers).map(([name, value]) => ({
        name, value: isMask(value) ? "" : String(value), masked: isMask(value), kind: isMask(value) ? value.kind : "",
      })),
      extrasText: jsonExtras(snap, MANAGED_PROVIDER_KEYS, template?.compat ? { compat: clone(template.compat) } : undefined),
    };
  }
  function jsonExtras(source, managedKeys, preset) {
    const extras = {};
    if (preset) Object.assign(extras, clone(preset));
    for (const [key, value] of Object.entries(source ?? {}))
      if (!managedKeys.includes(key)) extras[key] = clone(value);
    return Object.keys(extras).length ? JSON.stringify(extras, null, 2) : "";
  }
  function suggestId(base) {
    const taken = new Set(state.providers.map((provider) => provider.id));
    if (state.draft?.form?.id) taken.add(state.draft.form.id);
    if (!taken.has(base)) return base;
    for (let index = 2; ; index++) if (!taken.has(`${base}-${index}`)) return `${base}-${index}`;
  }

  // 保存载荷：合并语义（发送 null = 删除，缺省 = 不动）；models/modelOverrides 由专门命令管理。
  function buildProviderPayload(form) {
    const snap = form.snap ?? {};
    const extras = parseJsonText(form.extrasText);
    if (extras.error) return { error: extras.error };
    const payload = keepMasked(extras.value);
    if (String(form.baseUrl ?? "").trim()) payload.baseUrl = String(form.baseUrl).trim();
    else if (hasOwn(snap, "baseUrl")) payload.baseUrl = null;
    if (form.api) payload.api = form.api;
    else if (hasOwn(snap, "api")) payload.api = null;
    if (form.authHeader) payload.authHeader = true;
    else if (snap.authHeader) payload.authHeader = null;
    if (form.apiKeyClear) payload.apiKey = null;
    else if (String(form.apiKeyValue ?? "").trim()) payload.apiKey = String(form.apiKeyValue).trim();
    else if (isMask(snap.apiKey)) payload.apiKey = { keep: true };
    else if (typeof snap.apiKey === "string" && snap.apiKey) payload.apiKey = snap.apiKey;
    const rows = (form.headerRows ?? []).filter((row) => row.name.trim());
    if (rows.length) {
      payload.headers = {};
      for (const row of rows)
        payload.headers[row.name.trim()] = row.masked && !row.value ? { keep: true } : row.value;
    } else if (hasOwn(snap, "headers")) payload.headers = null;
    delete payload.models;
    delete payload.modelOverrides;
    return { value: payload };
  }
  function validateProvider(form, payload) {
    const errors = [];
    const id = form.id.trim();
    if (!PROVIDER_ID.test(id)) errors.push("供应商 id 需以字母或数字开头，仅含字母、数字、点、下划线、连字符（≤64 位）");
    else if (id !== (form.snap?.id ?? "") && state.providers.some((provider) => provider.id === id))
      errors.push(`供应商 id「${id}」已存在（保存会合并进它；如需覆盖请直接编辑该条目）`);
    if (payload.baseUrl && !/^https?:\/\//i.test(payload.baseUrl)) errors.push("baseUrl 必须是 http/https 绝对地址");
    if (typeof payload.apiKey === "string" && payload.apiKey.startsWith("!"))
      errors.push("出于安全考虑，不能新增命令执行型（! 开头）密钥；已有命令型密钥留空即可保留");
    for (const [name, value] of Object.entries(payload.headers ?? {}))
      if (typeof value === "string" && value.startsWith("!")) errors.push(`请求头「${name}」不能使用 ! 开头的命令值`);
    return errors;
  }

  // ── 模型表单数据 ⇄ 载荷（upsert 整条替换；未知字段经快照原样保留） ───────
  function modelForm(model) {
    const snap = clone(model ?? {});
    return {
      snap,
      id: snap.id ?? "",
      name: snap.name ?? "",
      api: snap.api ?? "",
      reasoning: Boolean(snap.reasoning),
      image: Array.isArray(snap.input) && snap.input.includes("image"),
      contextWindow: snap.contextWindow ?? "",
      maxTokens: snap.maxTokens ?? "",
      extrasText: jsonExtras(snap, MANAGED_MODEL_KEYS),
    };
  }
  function buildModelPayload(form) {
    const extras = parseJsonText(form.extrasText);
    if (extras.error) return { error: extras.error };
    const payload = keepMasked(extras.value);
    payload.id = String(form.id ?? "").trim();
    if (String(form.name ?? "").trim()) payload.name = String(form.name).trim();
    else delete payload.name;
    if (form.api) payload.api = form.api;
    else delete payload.api;
    if (form.reasoning) payload.reasoning = true;
    else delete payload.reasoning;
    if (form.image) payload.input = ["text", "image"];
    else delete payload.input;
    for (const key of ["contextWindow", "maxTokens"]) {
      const raw = String(form[key] ?? "").trim();
      if (/^\d+$/.test(raw) && Number(raw) > 0) payload[key] = Number(raw);
      else delete payload[key];
    }
    if (!payload.id) return { error: "模型 id 不能为空" };
    return { value: payload };
  }
  const modelDirty = (form) => stable(buildModelPayload(form).value) !== stable(keepMasked(form.snap));
  const providerDirty = (form) => {
    const current = buildProviderPayload(form);
    if (current.error) return true;
    return stable(current.value) !== stable(buildProviderPayload(providerForm(form.snap)).value);
  };

  // ── 供应商区渲染 ────────────────────────────────────────────────────────
  function renderProviders() {
    const parts = [];
    if (state.draft) parts.push(draftCard(state.draft));
    if (!state.providers.length && !state.draft)
      parts.push(el("p", { class: "mm-empty" },
        "尚无自定义供应商。内置与扩展发现的模型不受影响（见上方目录）；要覆盖内置供应商，可添加同名 id 的条目。"));
    for (const provider of state.providers)
      parts.push(state.open.has(provider.id) ? providerEditor(provider) : providerCard(provider));
    providersBox().replaceChildren(...parts);
  }

  function providerCard(provider) {
    const models = Array.isArray(provider.models) ? provider.models : [];
    return el("div", { class: "mm-provider" },
      el("div", { class: "mm-provider-row" },
        el("button", { type: "button", class: "mm-provider-summary",
          "aria-label": `展开编辑 ${provider.id}`,
          onclick: () => { state.open.add(provider.id); renderProviders(); } },
          el("span", { class: "mm-provider-id mm-mono" }, provider.id),
          provider.api ? badge(provider.api, "accent") : null,
          el("span", { class: "mm-provider-meta" },
            `${models.length} 个模型`,
            provider.baseUrl ? ` · ${provider.baseUrl}` : "",
            provider.modelOverrides ? ` · ${Object.keys(provider.modelOverrides).length} 项内置覆盖` : "",
            isMask(provider.apiKey) ? " · 已配密钥" : "")),
        el("span", { class: "mm-provider-actions" },
          el("button", { type: "button", class: "secondary", onclick: () => { state.open.add(provider.id); renderProviders(); } }, "编辑"),
          deleteButton(`provider:${provider.id}`, (button) => {
            state.open.delete(provider.id);
            state.editForms.delete(provider.id);
            void submit(button, () =>
              request("models.provider.delete", { providerId: provider.id, baseFingerprint: state.fingerprint }),
              { successMessage: `已删除供应商「${provider.id}」。` });
          }))));
  }

  function draftCard(draft) {
    const form = draft.form;
    const templateSelect = el("select", { "aria-label": "供应商模板",
      onchange: (event) => applyTemplate(draft, event.target.value) },
      ...PROVIDER_TEMPLATES.map((template) => new Option(template.label, template.id, false, template.id === draft.templateId)));
    return el("div", { class: "mm-provider mm-provider-open mm-draft" },
      el("div", { class: "mm-provider-title" },
        el("strong", {}, draft.saved ? "编辑供应商（新建）" : "添加供应商"),
        field("模板", templateSelect, "切换模板会覆盖连接字段与示例模型")),
      el("div", { class: "mm-form" }, ...providerControls(form)),
      extrasField(form, "provider"),
      el("div", { class: "mm-form-actions" },
        el("button", { type: "button", class: "mm-primary",
          onclick: (event) => void saveProviderForm(event.currentTarget, form, { draft }) },
          draft.saved ? "保存供应商" : "创建供应商"),
        el("button", { type: "button", class: "secondary", onclick: closeDraft }, draft.saved ? "完成" : "取消")),
      el("div", { class: "mm-models-head" },
        el("h5", {}, "模型"),
        el("button", { type: "button", class: "secondary", onclick: () => {
          draft.rows.push({ mid: `mm-new-${Date.now()}-${draft.rows.length}`, snap: {} });
          renderProviders();
        } }, "添加模型")),
      draft.rows.length
        ? el("div", { class: "mm-models" }, ...draft.rows.map((row) =>
            modelRow(form.id.trim() || "未命名供应商", row, { isNew: true, onRemove: () => {
              draft.rows = draft.rows.filter((item) => item !== row);
              renderProviders();
            } })))
        : el("p", { class: "mm-hint" }, "暂无模型；模板示例会自动填充，也可用「添加模型」录入。"),
      el("p", { class: "mm-hint" }, "模型逐条保存（upsert），未保存的示例模型不会写入文件。"));
  }

  function providerEditor(provider) {
    let form = state.editForms.get(provider.id);
    if (!form) { form = providerForm(provider); state.editForms.set(provider.id, form); }
    const freshRows = Array.isArray(provider.models) ? provider.models : [];
    const pending = state.newRows.get(provider.id) ?? [];
    return el("div", { class: "mm-provider mm-provider-open" },
      el("div", { class: "mm-provider-title" },
        el("strong", { class: "mm-mono" }, provider.id),
        el("span", { class: "mm-provider-meta" }, "id 创建后不可修改；改名请删除后重建")),
      el("div", { class: "mm-form" }, ...providerControls(form, provider.id)),
      extrasField(form, "provider"),
      el("div", { class: "mm-form-actions" },
        el("button", { type: "button", class: "mm-primary",
          onclick: (event) => void saveProviderForm(event.currentTarget, form, { existing: provider.id }) }, "保存供应商"),
        el("button", { type: "button", class: "secondary", onclick: () => {
          state.open.delete(provider.id);
          state.editForms.delete(provider.id);
          renderProviders();
        } }, "取消")),
      el("div", { class: "mm-models-head" },
        el("h5", {}, `模型（${freshRows.length + pending.length}）`),
        el("button", { type: "button", class: "secondary", onclick: () => {
          const list = state.newRows.get(provider.id) ?? [];
          list.push({ mid: `mm-new-${Date.now()}-${list.length}`, snap: {} });
          state.newRows.set(provider.id, list);
          renderProviders();
        } }, "添加模型")),
      freshRows.length + pending.length
        ? el("div", { class: "mm-models" },
            ...freshRows.map((model) => modelRow(provider.id, { snap: model })),
            ...pending.map((row) => modelRow(provider.id, row, { isNew: true, onRemove: () => {
              state.newRows.set(provider.id, pending.filter((item) => item !== row));
              renderProviders();
            } })))
        : el("p", { class: "mm-hint" }, "该供应商暂无 models 条目（可能仅覆盖内置供应商的 baseUrl/headers）。"));
  }

  function providerControls(form, existingId) {
    const idInput = el("input", { type: "text", value: form.id, placeholder: "例如 my-proxy", spellcheck: "false",
      oninput: (event) => { form.id = event.target.value; } });
    if (existingId) { idInput.value = existingId; idInput.disabled = true; }
    const apiKeyInput = el("input", { type: "password", value: form.apiKeyValue, autocomplete: "off", spellcheck: "false",
      placeholder: form.apiKeyMasked
        ? `已配置（${MASK_KINDS[form.apiKeyKind] ?? "掩码值"}）——留空保留，输入新值替换`
        : "留空不设置；可填 sk-…、$ENV_VAR 或 ${ENV}",
      oninput: (event) => { form.apiKeyValue = event.target.value; } });
    const reveal = el("input", { type: "checkbox", "aria-label": "显示 API Key",
      onchange: (event) => { apiKeyInput.type = event.target.checked ? "text" : "password"; } });
    const clearKey = el("input", { type: "checkbox", checked: form.apiKeyClear, "aria-label": "清除已保存的 API Key",
      onchange: (event) => { form.apiKeyClear = event.target.checked; apiKeyInput.disabled = event.target.checked; } });
    const headersBox = el("div", { class: "mm-headers" },
      ...form.headerRows.map((row) => headerRow(form, row)),
      el("button", { type: "button", class: "secondary mm-headers-add", onclick: () => {
        form.headerRows.push({ name: "", value: "", masked: false, kind: "" });
        renderProviders();
      } }, "添加请求头"));
    return [
      field(existingId ? "供应商 id（不可修改）" : "供应商 id", idInput, "与内置供应商同名即为覆盖，例如 anthropic"),
      field("Base URL", el("input", { type: "text", value: form.baseUrl, spellcheck: "false",
        placeholder: "https://…/v1（本地服务如 http://localhost:11434/v1）",
        oninput: (event) => { form.baseUrl = event.target.value; } })),
      field("API 协议", el("select", { "aria-label": "API 协议",
        onchange: (event) => { form.api = event.target.value; } },
        new Option("（不设置）", "", false, form.api === ""),
        ...API_TYPES.map(([value, label]) => new Option(label, value, false, form.api === value)))),
      field("API Key", el("span", { class: "mm-key" }, apiKeyInput,
        el("label", { class: "mm-check" }, reveal, "显示"),
        form.apiKeyMasked ? el("label", { class: "mm-check mm-check-danger" }, clearKey, "清除已存") : null),
        "密钥不回显：留空保留现值，只有新输入的值会被传输"),
      field("Authorization: Bearer 头", el("span", { class: "mm-key" }, el("input", { type: "checkbox", checked: form.authHeader,
        "aria-label": "附加 Authorization Bearer 头",
        onchange: (event) => { form.authHeader = event.target.checked; } })),
        "自动附加 Authorization: Bearer <apiKey>"),
      field("自定义请求头", headersBox, "值支持 $ENV 引用；掩码值留空即原样保留"),
    ];
  }

  function headerRow(form, row) {
    return el("div", { class: "mm-header-row" },
      el("input", { type: "text", value: row.name, placeholder: "Header 名称", spellcheck: "false",
        "aria-label": "请求头名称",
        oninput: (event) => { row.name = event.target.value; } }),
      el("input", { type: "password", value: row.value, autocomplete: "off", spellcheck: "false",
        "aria-label": "请求头值",
        placeholder: row.masked ? `已配置（${MASK_KINDS[row.kind] ?? "掩码值"}）——留空保留` : "值或 $ENV",
        oninput: (event) => { row.value = event.target.value; } }),
      el("button", { type: "button", class: "secondary mm-header-remove", "aria-label": `删除请求头 ${row.name || "(未命名)"}`,
        onclick: () => { form.headerRows = form.headerRows.filter((item) => item !== row); renderProviders(); } }, "✕"));
  }

  function extrasField(form, kind) {
    const textarea = el("textarea", { class: "mm-extras", rows: kind === "provider" ? 4 : 3, spellcheck: "false",
      "aria-label": "高级字段 JSON",
      placeholder: kind === "provider"
        ? '{"compat":{"supportsDeveloperRole":false},"oauth":"radius"}'
        : '{"cost":{"input":3,"output":15},"samplingParams":{"temperature":0.7}}',
      oninput: (event) => { form.extrasText = event.target.value; } });
    textarea.value = form.extrasText ?? "";
    return el("details", { class: "mm-advanced" },
      el("summary", {}, "高级字段（JSON：compat / cost / samplingParams 等；掩码值原样保留）"),
      textarea);
  }

  function applyTemplate(draft, templateId) {
    const template = PROVIDER_TEMPLATES.find((item) => item.id === templateId) ?? PROVIDER_TEMPLATES[0];
    draft.templateId = template.id;
    const previousId = draft.form?.id ?? "";
    draft.form = providerForm(null, template);
    if (previousId.trim()) draft.form.id = previousId;
    draft.rows = (template.models ?? []).map((model, index) => ({ mid: `mm-new-t${index}`, snap: clone(model) }));
    renderProviders();
  }

  function openDraft() {
    if (state.draft) { renderProviders(); return; }
    state.draft = { saved: false, templateId: "custom", rows: [], form: null };
    applyTemplate(state.draft, "custom");
  }
  function closeDraft() {
    state.draft = null;
    clearAlert();
    renderProviders();
  }

  // ── 保存动作 ────────────────────────────────────────────────────────────
  async function saveProviderForm(button, form, { draft, existing } = {}) {
    const built = buildProviderPayload(form);
    if (built.error) return showAlert("error", `保存失败：${built.error}`);
    const id = form.id.trim();
    const errors = validateProvider(form, built.value);
    if (errors.length) return showAlert("error", `保存失败：${errors.join("；")}`);
    await submit(button, () =>
        request("models.provider.save", { providerId: id, provider: built.value, baseFingerprint: state.fingerprint }),
      { successMessage: `已保存供应商「${id}」。` })
      .then(() => {
        if (draft) draft.saved = true;
        else if (existing) { state.open.add(existing); state.editForms.delete(existing); }
      });
  }

  function modelRow(providerId, row, { isNew = false, onRemove } = {}) {
    if (!row.form) row.form = modelForm(row.snap);
    const form = row.form;
    const saveButton = el("button", { type: "button", class: isNew ? "mm-primary" : "secondary",
      onclick: (event) => void saveModel(event.currentTarget) }, isNew ? "保存模型" : "保存修改");
    const build = () => buildModelPayload(form);
    const sync = () => {
      const built = build();
      saveButton.disabled = Boolean(built.error) || (!isNew && !modelDirty(form));
      if (built.error) saveButton.title = built.error;
      else saveButton.removeAttribute("title");
    };
    const saveModel = async (button) => {
      const built = build();
      if (built.error) return showAlert("error", `模型保存失败：${built.error}`);
      await submit(button, () =>
          request("models.model.save", { providerId, model: built.value, baseFingerprint: state.fingerprint }),
        { successMessage: `已保存模型「${built.value.id}」。` })
        .then(() => { if (isNew) onRemove?.(); });
    };
    const deleteModel = (button) =>
      void submit(button, () =>
        request("models.model.delete", { providerId, modelId: String(form.snap.id ?? ""), baseFingerprint: state.fingerprint }),
        { successMessage: `已删除模型「${form.snap.id}」。` });
    const grid = el("div", { class: "mm-model-grid" },
      field("模型 id", el("input", { type: "text", value: form.id, placeholder: "模型 id（传给 API）", spellcheck: "false",
        oninput: (event) => { form.id = event.target.value; sync(); } })),
      field("显示名称", el("input", { type: "text", value: form.name, placeholder: "留空使用 id",
        oninput: (event) => { form.name = event.target.value; sync(); } })),
      field("上下文窗口（tokens）", el("input", { type: "number", min: "1", value: form.contextWindow, placeholder: "默认 128000",
        oninput: (event) => { form.contextWindow = event.target.value; sync(); } })),
      field("最大输出（tokens）", el("input", { type: "number", min: "1", value: form.maxTokens, placeholder: "默认 16384",
        oninput: (event) => { form.maxTokens = event.target.value; sync(); } })),
      field("API 协议覆盖", el("select", { "aria-label": "API 协议覆盖",
        onchange: (event) => { form.api = event.target.value; sync(); } },
        new Option("跟随供应商", "", false, form.api === ""),
        ...API_TYPES.map(([value, label]) => new Option(label, value, false, form.api === value)))),
      el("div", { class: "mm-model-checks" },
        el("label", { class: "mm-check" }, el("input", { type: "checkbox", checked: form.reasoning,
          onchange: (event) => { form.reasoning = event.target.checked; sync(); } }), "支持推理"),
        el("label", { class: "mm-check" }, el("input", { type: "checkbox", checked: form.image,
          onchange: (event) => { form.image = event.target.checked; sync(); } }), "支持图片输入")));
    const advanced = extrasField(form, "model");
    advanced.addEventListener("toggle", sync);
    sync();
    return el("div", { class: "mm-model" },
      grid, advanced,
      el("div", { class: "mm-model-actions" },
        saveButton,
        isNew && onRemove
          ? el("button", { type: "button", class: "secondary", onclick: onRemove }, "移除")
          : deleteButton(`model:${providerId}:${row.mid}`, deleteModel, { armedLabel: "确认删除模型？" })));
  }

  // 两段式删除确认：第一次点击进入待确认态（4 秒或失焦后还原），第二次才真正执行。
  function deleteButton(armKey, onConfirm, { armedLabel = "确认删除？" } = {}) {
    const button = el("button", { type: "button", class: "secondary mm-danger", "aria-label": "删除" }, "删除");
    let timer;
    const disarm = () => {
      if (state.armed === armKey) state.armed = null;
      clearTimeout(timer);
      button.textContent = "删除";
      button.classList.remove("mm-armed");
    };
    button.addEventListener("click", () => {
      if (state.armed === armKey) { disarm(); onConfirm(button); return; }
      state.armed = armKey;
      button.textContent = armedLabel;
      button.classList.add("mm-armed");
      timer = setTimeout(disarm, 4000);
    });
    button.addEventListener("blur", () => { if (state.armed === armKey) disarm(); });
    return button;
  }

  return { load };
}
