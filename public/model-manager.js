// 设置页「模型与供应商」面板：编辑 Axiom SQLite 中 的自定义/覆盖供应商与模型。
// 协议见 docs/model-config-protocol.md v1：
//   models.config.get → { fingerprint, path, parseError?, providers:[…], catalog:[…] }
//   models.provider.save/delete、models.model.save/delete（baseFingerprint 防外部改动覆盖）
//   models.provider.discover({providerId}) → { models:[{id,name?,input?,reasoning?,contextWindow?,maxTokens?}], truncated? }
//     （只读发现已保存供应商的可用模型；结果仅作勾选待选清单，不自动保存/启用任何模型）
//   密钥（apiKey / headers.*）GET 时为 { masked, kind } 掩码；保存支持 { keep:true } / 字符串 / null
// 布局：左侧供应商导航（可搜索供应商或模型，内置/扩展目录作为只读导航项；自定义项悬停
// 显示重命名/删除图标，删除与重命名都走原生 <dialog> 确认），右侧详情分「连接」（只留 id /
// 协议 / Base URL / API Key）与「模型」两段，其余配置收进折叠区，模型行同样折叠成摘要行；
// 窄屏退化为单列。
// 草稿语义：未保存的编辑表单跨重渲染与刷新保留（editForms/newRows/modelRows），
// 只有保存成功或用户显式取消才丢弃；保存失败在面板内提示并可重试。
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
// 虚拟导航项：新建供应商草稿。冒号不是合法供应商 id 字符，不会与真实条目撞车。
const DRAFT = ":draft";

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
let fieldSeq = 0;
// 字段统一 label[for] 关联：点击标签聚焦控件，键盘/读屏可用。
function field(labelText, control, hint, wide = false) {
  const target = ["INPUT", "SELECT", "TEXTAREA"].includes(control.tagName)
    ? control
    : control.querySelector("input, select, textarea");
  if (target && !target.id) target.id = `mm-f-${++fieldSeq}`;
  return el("div", { class: `mm-field${wide ? " mm-field-wide" : ""}` },
    el("label", { class: "mm-field-label", for: target?.id }, labelText), control,
    hint ? el("span", { class: "mm-field-hint" }, hint) : null);
}
function badge(text, tone = "") {
  return el("span", { class: `mm-badge${tone ? ` mm-badge-${tone}` : ""}` }, text);
}
// 高级字段只接受 JSON 对象：数组/标量一律报错，不做隐式转换。
function parseJsonText(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return { value: {} };
  try {
    const value = JSON.parse(trimmed);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { error: "高级字段必须是 JSON 对象（以 { 开头）" };
    return { value };
  }
  catch (error) { return { error: `高级字段 JSON 无法解析：${error.message}` }; }
}

const SVG_NS = "http://www.w3.org/2000/svg";
// 图标与会话操作菜单同源（app.js session-actions），保证同一套视觉语言。
const ICONS = {
  rename: "M16 3l5 5L8 21H3v-5L16 3zM13 6l5 5M3 16l5 5",
  delete: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
};
function icon(path) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

// 原生 <dialog> + showModal()：Esc 关闭、焦点陷阱、背景遮罩全由浏览器提供，不自造弹层。
// jsdom 未实现 showModal/close，退化为 open 属性（仅测试环境走到）。
function openModal(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}
function closeModal(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else {
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
  }
}
// 确认/输入对话框：始终挂在 body（脱离面板重渲染），关闭即移除。
// onConfirm 返回字符串 = 校验失败：留在弹窗里显示，不关闭也不发请求。
function openDialog({ title, description, body, confirmLabel, danger = false, onConfirm }) {
  const error = el("p", { class: "mm-dialog-error", role: "alert" });
  const dialog = el("dialog", { class: "mm-dialog", "aria-labelledby": "mm-dialog-title" },
    el("div", { class: "settings-body" },
      el("h2", { id: "mm-dialog-title" }, title),
      description ? el("p", { class: "mm-dialog-desc" }, description) : null,
      body ?? null,
      error,
      el("div", { class: "dialog-actions" },
        el("button", { type: "button", class: "secondary", onclick: () => closeModal(dialog) }, "取消"),
        el("button", { type: "button", class: danger ? "danger" : undefined,
          onclick: () => {
            const problem = onConfirm();
            if (typeof problem === "string" && problem) { error.textContent = problem; return; }
            closeModal(dialog);
          } }, confirmLabel))));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  openModal(dialog);
  (body?.querySelector("input") ?? dialog.querySelector(".dialog-actions button:last-child")).focus();
  return { dialog, submit: () => dialog.querySelector(".dialog-actions button:last-child").click() };
}

export function initModelManager({ root, request, onSaved }) {
  if (!root || !(root instanceof Node)) throw new Error("initModelManager 需要一个根容器节点");
  const state = {
    loaded: false, loading: false, path: "", fingerprint: "", parseError: "",
    providers: [], catalog: [], selected: "", query: "", draft: null,
    // 草稿仓库：editForms=供应商连接表单；newRows=待保存的新模型行；modelRows=既有模型行（键 providerId\0modelId）。
    editForms: new Map(), newRows: new Map(), modelRows: new Map(),
    // 拉取面板状态（键 providerId）：status=loading/ready/error/blocked，models/byId=发现结果原文，
    // checked=勾选的模型 id，token=丢弃过期响应（并发拉取/切回旧供应商）。结果只在内存，不落盘。
    discover: new Map(),
    loadToken: 0,
  };

  const skeleton = buildSkeleton();
  root.replaceChildren(skeleton);
  const $ = (selector) => skeleton.querySelector(selector);
  const alertBox = () => $(".mm-alert");
  const navListBox = () => $(".mm-nav-list");
  const detailBox = () => $(".mm-detail");
  const pathLine = () => $(".mm-path");

  // ── 骨架：左导航 + 右详情分栏；搜索框常驻，只在输入时重绘列表不动详情/焦点 ──
  function buildSkeleton() {
    return el("div", { class: "mm" },
      el("div", { class: "mm-head" },
        el("div", { class: "mm-head-text" },
          el("h3", {}, "模型与供应商"),
          el("p", { class: "mm-path", title: "配置存储位置" }, "Axiom SQLite")),
        el("div", { class: "mm-head-actions" },
          el("button", { type: "button", class: "secondary", onclick: () => void load() }, "刷新"),
          el("button", { type: "button", onclick: () => openDraft() }, "添加供应商"))),
      el("div", { class: "mm-alert", role: "alert" }),
      el("div", { class: "mm-split" },
        el("nav", { class: "mm-nav", "aria-label": "供应商导航" },
          el("input", { type: "search", class: "mm-search", placeholder: "搜索供应商或模型…",
            "aria-label": "搜索供应商或模型", autocomplete: "off", spellcheck: "false",
            oninput: (event) => { state.query = event.target.value; renderNavList(); } }),
          el("div", { class: "mm-nav-list" })),
        el("section", { class: "mm-detail", "aria-label": "供应商详情" })));
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
  // 草稿表单不因回读/刷新而清空；只在保存成功或用户取消时精确清除。
  // silent=true 用于写操作后的回读：保留提示条（例如「已保存」不被冲掉）。
  async function load({ silent = false } = {}) {
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
      if (!silent) clearAlert();
      if (state.parseError) showAlert("warn", `旧模型配置导入失败，请在此重新配置：${state.parseError}`,
        [{ label: "重新加载", onclick: () => void load() }]);
      pathLine().textContent = state.path;
      renderProviders();
    } catch (error) {
      if (token !== state.loadToken) return;
      showAlert("error", `无法加载模型配置：${error.message || error}`,
        [{ label: "重试", onclick: () => void load() }]);
    } finally {
      if (token === state.loadToken) state.loading = false;
    }
  }

  // 写操作统一入口：成功后先落定 onSuccess（保存后状态），再静默回读渲染 → 通知主入口；返回是否成功。
  // 失败时不重建界面：草稿原地保留、按钮恢复可重试。
  async function submit(button, run, { successMessage, onSuccess } = {}) {
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "保存中…"; }
    try {
      const result = await run();
      state.fingerprint = result?.fingerprint || state.fingerprint;
      onSuccess?.();
      await load({ silent: true });
      if (successMessage) showAlert("ok", successMessage);
      await Promise.resolve(onSaved?.()).catch(() => {});
      return true;
    } catch (error) {
      showAlert(isConflict(error) ? "warn" : "error",
        isConflict(error)
          ? "模型配置已被其他窗口修改，当前更改未写入。请重新加载后再编辑。"
          : `保存失败：${error.message || error}`,
        [{ label: "重新加载", onclick: () => void load() }]);
      if (button) { button.disabled = false; button.textContent = label; }
      alertBox().firstElementChild?.scrollIntoView?.({ block: "nearest" });
      return false;
    }
  }

  // ── 左侧导航 ────────────────────────────────────────────────────────────
  const catalogByProvider = () => {
    const map = new Map();
    for (const model of state.catalog) {
      if (!map.has(model.provider)) map.set(model.provider, []);
      map.get(model.provider).push(model);
    }
    return map;
  };

  // 搜索同时命中供应商 id 与其下模型（自定义 models 或目录条目）的 id/名称/key。
  function navGroups() {
    const query = state.query.trim().toLowerCase();
    const catalogMap = catalogByProvider();
    const customIds = new Set(state.providers.map((provider) => provider.id));
    const hit = (text) => !query || String(text ?? "").toLowerCase().includes(query);
    const modelHit = (model) => hit(model.id) || hit(model.name) || hit(model.key);
    const custom = state.providers.filter((provider) =>
      hit(provider.id) || (Array.isArray(provider.models) && provider.models.some(modelHit)) ||
      (catalogMap.get(provider.id) ?? []).some(modelHit));
    const builtin = [...catalogMap.entries()]
      .filter(([id, models]) => !customIds.has(id) && (hit(id) || models.some(modelHit)))
      .map(([id, models]) => ({ id, models }));
    return { custom, builtin };
  }

  // 该供应商是否存在未保存草稿（连接表单脏 / 新模型行 / 既有模型行脏）。
  function isPending(providerId) {
    if (state.newRows.get(providerId)?.length) return true;
    const form = state.editForms.get(providerId);
    if (form && providerDirty(form)) return true;
    const prefix = `${providerId}\u0000`;
    for (const [key, row] of state.modelRows)
      if (key.startsWith(prefix) && row.form && modelDirty(row.form, false)) return true;
    return false;
  }

  function navItem(id, title, meta, { draft = false, actions = [] } = {}) {
    const selected = state.selected === id;
    const button = el("button", { type: "button",
      class: `mm-nav-item${draft ? " mm-nav-draft" : ""}`,
      "aria-current": selected ? "true" : undefined,
      onclick: () => { state.selected = id; renderProviders(); } },
      el("span", { class: "mm-nav-id" }, title,
        !draft && isPending(id) ? el("span", { class: "mm-dot", title: "有未保存的修改", "aria-label": "有未保存的修改" }) : null),
      meta ? el("span", { class: "mm-nav-meta" }, meta) : null);
    return el("div", { class: `mm-nav-row${selected ? " mm-nav-selected" : ""}` },
      button,
      actions.length ? el("span", { class: "mm-nav-actions" }, ...actions) : null);
  }

  // 行内图标按钮（导航项与模型行共用）：默认隐藏，悬停/聚焦时出现；删除图标悬停变红。
  // preventDefault 防止总结行内的图标点击顺带展开/收起。
  function iconButton(kind, label, onclick) {
    return el("button", { type: "button", class: `mm-icon-btn mm-icon-${kind}`, title: label,
      "aria-label": label, "aria-haspopup": "dialog",
      onclick: (event) => { event.preventDefault(); event.stopPropagation(); onclick(); } }, icon(ICONS[kind]));
  }

  // 重命名后把按旧 id 缓存的草稿/未保存行搬到新 id，避免用户正在编辑的内容被丢掉。
  function rekeyProviderCaches(from, to) {
    if (state.editForms.has(from)) { state.editForms.set(to, state.editForms.get(from)); state.editForms.delete(from); }
    if (state.newRows.has(from)) { state.newRows.set(to, state.newRows.get(from)); state.newRows.delete(from); }
    const prefix = `${from}\u0000`;
    for (const [key, row] of [...state.modelRows.entries()]) {
      if (!key.startsWith(prefix)) continue;
      state.modelRows.delete(key);
      state.modelRows.set(`${to}\u0000${row.snap.id}`, row);
    }
    state.discover.delete(from);
  }

  // ── 删除 / 重命名：统一原生 dialog 确认，不再用「点两次」的表内确认 ────────
  function confirmDeleteProvider(provider) {
    const models = Array.isArray(provider.models) ? provider.models.length : 0;
    openDialog({
      title: `删除供应商「${provider.id}」？`,
      description: `该供应商${models ? `及其 ${models} 个模型配置` : "配置"}会被删除，此操作不可撤销。`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: () => void submit(null, () =>
          request("models.provider.delete", { providerId: provider.id, baseFingerprint: state.fingerprint }),
        {
          successMessage: `已删除供应商「${provider.id}」。`,
          onSuccess: () => {
            state.editForms.delete(provider.id);
            state.newRows.delete(provider.id);
            pruneProviderRows(provider.id);
            state.discover.delete(provider.id);
            if (state.selected === provider.id) state.selected = "";
          },
        }),
    });
  }

  function confirmDeleteModel(providerId, modelId) {
    openDialog({
      title: `删除模型「${modelId}」？`,
      description: `将从供应商「${providerId}」移除该模型配置，此操作不可撤销。`,
      confirmLabel: "删除",
      danger: true,
      onConfirm: () => void submit(null, () =>
          request("models.model.delete", { providerId, modelId, baseFingerprint: state.fingerprint }),
        {
          successMessage: `已删除模型「${modelId}」。`,
          onSuccess: () => state.modelRows.delete(`${providerId}\u0000${modelId}`),
        }),
    });
  }

  function openRenameDialog(provider) {
    const input = el("input", { type: "text", value: provider.id, spellcheck: "false", maxlength: "64",
      autocomplete: "off", "aria-label": "新的供应商 id" });
    const { dialog, submit: requestRename } = openDialog({
      title: `重命名供应商「${provider.id}」`,
      description: "模型与内置覆盖配置随新 id 一起迁移；指向旧 id 的收藏需要重新添加。",
      body: el("div", { class: "mm-field" },
        el("label", { class: "mm-field-label", for: "mm-rename-id" }, "新的供应商 id"), input),
      confirmLabel: "重命名",
      onConfirm: () => {
        const next = input.value.trim();
        if (!PROVIDER_ID.test(next)) return "id 需以字母或数字开头，仅含字母、数字、点、下划线、连字符（≤64 位）";
        if (next === provider.id) return undefined;
        if (state.providers.some((item) => item.id === next)) return `供应商「${next}」已存在，请换一个 id`;
        void submit(null, () =>
            request("models.provider.rename", { providerId: provider.id, newProviderId: next, baseFingerprint: state.fingerprint }),
          {
            successMessage: `已将供应商「${provider.id}」重命名为「${next}」。`,
            onSuccess: () => { rekeyProviderCaches(provider.id, next); state.selected = next; },
          });
        return undefined;
      },
    });
    input.id = "mm-rename-id";
    // 单入口：输入框内按 Enter 提交；聚焦在按钮上时交给按钮自身的点击，避免重复提交。
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.target.tagName === "BUTTON") return;
      event.preventDefault();
      requestRename();
    });
  }

  function renderNavList() {
    const { custom, builtin } = navGroups();
    const items = [];
    if (state.draft) {
      const label = state.draft.form?.id?.trim() || "新供应商";
      items.push(navItem(DRAFT, `＋ ${label}`, state.draft.saved ? "已保存 · 可继续添加模型" : "草稿（未保存）", { draft: true }));
    }
    if (custom.length) {
      items.push(el("div", { class: "mm-nav-group" }, "自定义与覆盖"));
      for (const provider of custom) {
        const models = Array.isArray(provider.models) ? provider.models.length : 0;
        const overrides = provider.modelOverrides && typeof provider.modelOverrides === "object"
          ? Object.keys(provider.modelOverrides).length : 0;
        items.push(navItem(provider.id, provider.id,
          `${models} 个模型${overrides ? ` · 覆盖 ${overrides} 项` : ""}`, {
            actions: [
              iconButton("rename", `重命名供应商「${provider.id}」`, () => openRenameDialog(provider)),
              iconButton("delete", `删除供应商「${provider.id}」`, () => confirmDeleteProvider(provider)),
            ],
          }));
      }
    }
    if (builtin.length) {
      items.push(el("div", { class: "mm-nav-group" }, "内置与扩展（只读）"));
      for (const entry of builtin)
        items.push(navItem(entry.id, entry.id, `${entry.models.length} 个模型`));
    }
    if (!items.length)
      items.push(el("p", { class: "mm-hint" },
        state.query.trim() ? "没有匹配的供应商或模型。" : "尚无自定义供应商。"));
    navListBox().replaceChildren(...items);
  }

  // ── 右侧详情路由：草稿 / 自定义编辑器 / 只读目录页；自动选中首个可用项 ──
  function renderDetail() {
    if (state.draft && state.selected === DRAFT) {
      detailBox().replaceChildren(draftCard(state.draft));
      return;
    }
    const provider = state.providers.find((item) => item.id === state.selected);
    if (provider) {
      detailBox().replaceChildren(providerEditor(provider));
      return;
    }
    const catalogMap = catalogByProvider();
    if (!state.draft && catalogMap.has(state.selected)) {
      detailBox().replaceChildren(catalogDetail(state.selected, catalogMap.get(state.selected)));
      return;
    }
    const { custom, builtin } = navGroups();
    const fallback = custom[0]?.id ?? builtin[0]?.id ?? "";
    if (fallback && fallback !== state.selected) {
      state.selected = fallback;
      renderDetail();
      return;
    }
    detailBox().replaceChildren(el("p", { class: "mm-empty" },
      "尚无自定义供应商。内置与扩展发现的模型不受影响（见左侧目录）；要覆盖内置供应商，可添加同名 id 的条目，或点右上角「添加供应商」。"));
  }

  function renderProviders() {
    renderNavList();
    renderDetail();
  }

  // ── 只读目录页：模型名称 + 实际 ID + 真实能力（推理/图片） ────────────────
  function catalogModelRow(model) {
    return el("div", { class: "mm-catalog-model" },
      model.name && model.name !== model.id ? el("span", { class: "mm-catalog-model-name" }, model.name) : null,
      el("code", { class: "mm-mono" }, model.id),
      el("span", { class: "mm-catalog-model-tags" },
        model.levels?.length ? badge("推理") : null,
        Array.isArray(model.input) && model.input.includes("image") ? badge("图片") : null));
  }

  function catalogDetail(id, models) {
    return el("div", {},
      el("div", { class: "mm-provider-title" },
        el("strong", { class: "mm-mono" }, id),
        badge("内置 / 扩展")),
      el("p", { class: "mm-hint" },
        "此供应商由内置配置或扩展发现提供，此处只读。要修改连接或模型，可添加同名 id 的自定义条目进行覆盖。"),
      models.length
        ? el("div", { class: "mm-catalog-models" }, ...models.map(catalogModelRow))
        : el("p", { class: "mm-hint" }, "该供应商当前没有可用模型（可能缺少认证）。"),
      el("div", { class: "mm-form-actions" },
        el("button", { type: "button", class: "secondary", onclick: () => openDraft(id) }, `添加同名覆盖「${id}」`)));
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
  function buildModelPayload(form, isNew = false) {
    const extras = parseJsonText(form.extrasText);
    if (extras.error) return { error: extras.error };
    const payload = keepMasked(extras.value);
    // 既有模型的 id 以快照为准（upsert 按 id 定位，改输入框不是改名只会造出重复条目）；
    // 新行才允许填写 id。
    const id = String((isNew ? form.id : form.snap?.id) ?? "").trim();
    if (!id) return { error: "模型 id 不能为空" };
    payload.id = id;
    if (String(form.name ?? "").trim()) payload.name = String(form.name).trim();
    else delete payload.name;
    if (form.api) payload.api = form.api;
    else delete payload.api;
    if (form.reasoning) payload.reasoning = true;
    else delete payload.reasoning;
    if (form.image) payload.input = ["text", "image"];
    else delete payload.input;
    // 数字字段非法时明确报错，绝不悄悄删除用户已填的值。
    for (const [key, label] of [["contextWindow", "上下文窗口"], ["maxTokens", "最大输出"]]) {
      const raw = String(form[key] ?? "").trim();
      if (!raw) delete payload[key];
      else if (/^\d+$/.test(raw) && Number(raw) > 0) payload[key] = Number(raw);
      else return { error: `${label}必须是正整数，「${raw}」无法保存（不会静默丢弃该字段）` };
    }
    return { value: payload };
  }
  const modelDirty = (form, isNew) => {
    const built = buildModelPayload(form, isNew);
    return Boolean(built.error) || stable(built.value) !== stable(keepMasked(form.snap));
  };
  const providerDirty = (form) => {
    const current = buildProviderPayload(form);
    if (current.error) return true;
    return stable(current.value) !== stable(buildProviderPayload(providerForm(form.snap)).value);
  };

  const pruneProviderRows = (providerId) => {
    const prefix = `${providerId}\u0000`;
    for (const key of [...state.modelRows.keys()])
      if (key.startsWith(prefix)) state.modelRows.delete(key);
  };

  // ── 详情：新建供应商草稿 ────────────────────────────────────────────────
  function draftCard(draft) {
    const form = draft.form;
    const templateSelect = el("select", { "aria-label": "供应商模板",
      onchange: (event) => applyTemplate(draft, event.target.value) },
      ...PROVIDER_TEMPLATES.map((template) => new Option(template.label, template.id, false, template.id === draft.templateId)));
    return el("div", {},
      el("div", { class: "mm-provider-title" },
        el("strong", {}, draft.saved ? "继续编辑新供应商" : "添加供应商"),
        field("模板", templateSelect, "切换模板会覆盖连接字段与示例模型")),
      el("div", { class: "mm-section" },
        el("h5", { class: "mm-section-title" }, "连接"),
        el("div", { class: "mm-form" }, ...connectionFields(form)),
        advancedConnection(form),
        extrasField(form, "provider"),
        el("div", { class: "mm-form-actions" },
          el("button", { type: "button", class: "mm-primary",
            onclick: (event) => void saveProviderForm(event.currentTarget, form, { draft }) },
            draft.saved ? "保存供应商" : "创建供应商"),
          el("button", { type: "button", class: "secondary", onclick: closeDraft }, draft.saved ? "完成" : "取消"))),
      el("div", { class: "mm-section" },
        el("div", { class: "mm-models-head" },
          el("h5", {}, `模型（${draft.rows.length}）`),
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
        el("p", { class: "mm-hint" }, "模型逐条保存（upsert），未保存的示例模型不会写入文件。")));
  }

  // ── 详情：既有供应商编辑器 ──────────────────────────────────────────────
  function providerEditor(provider) {
    let form = state.editForms.get(provider.id);
    if (!form) { form = providerForm(provider); state.editForms.set(provider.id, form); }
    const freshRows = Array.isArray(provider.models) ? provider.models : [];
    const pending = state.newRows.get(provider.id) ?? [];
    const overrides = provider.modelOverrides && typeof provider.modelOverrides === "object"
      ? Object.keys(provider.modelOverrides).length : 0;
    return el("div", {},
      el("div", { class: "mm-provider-title" },
        el("strong", { class: "mm-mono" }, provider.id),
        el("span", { class: "mm-provider-meta" },
          `${freshRows.length} 个模型${overrides ? ` · 覆盖 ${overrides} 项内置模型` : ""}`)),
      el("div", { class: "mm-section" },
        el("h5", { class: "mm-section-title" }, "连接"),
        el("div", { class: "mm-form" }, ...connectionFields(form, provider.id)),
        advancedConnection(form),
        extrasField(form, "provider"),
        el("div", { class: "mm-form-actions" },
          el("button", { type: "button", class: "mm-primary",
            onclick: (event) => void saveProviderForm(event.currentTarget, form, { existing: provider.id }) }, "保存供应商"),
          el("button", { type: "button", class: "secondary", onclick: () => {
            state.editForms.delete(provider.id);
            state.newRows.delete(provider.id);
            pruneProviderRows(provider.id);
            renderProviders();
          } }, "取消"))),
      el("div", { class: "mm-section" },
        el("div", { class: "mm-models-head" },
          el("h5", {}, `模型（${freshRows.length + pending.length}）`),
          el("span", { class: "mm-models-actions" },
            el("button", { type: "button", class: "secondary", title: "只读拉取该供应商当前可用的模型列表",
              onclick: () => void startDiscover(provider.id, form) }, "拉取模型列表…"),
            el("button", { type: "button", class: "secondary", onclick: () => {
              const list = state.newRows.get(provider.id) ?? [];
              list.push({ mid: `mm-new-${Date.now()}-${list.length}`, snap: {} });
              state.newRows.set(provider.id, list);
              renderProviders();
            } }, "添加模型"))),
        discoverPanel(provider),
        freshRows.length + pending.length
          ? el("div", { class: "mm-models" },
              ...freshRows.map((model) => modelRow(provider.id, model)),
              ...pending.map((row) => modelRow(provider.id, row, { isNew: true, onRemove: () => {
                state.newRows.set(provider.id, (state.newRows.get(provider.id) ?? []).filter((item) => item !== row));
                renderProviders();
              } })))
          : el("p", { class: "mm-hint" }, "该供应商暂无 models 条目（可能仅覆盖内置供应商的 baseUrl/headers）。")));
  }

  // 连接区只留日常必改项：id（仅草稿）/ Base URL / API 协议 / API Key；其余全部折叠。
  function connectionFields(form, existingId) {
    const apiKeyInput = el("input", { type: "password", value: form.apiKeyValue, autocomplete: "off", spellcheck: "false",
      placeholder: form.apiKeyMasked
        ? `已配置（${MASK_KINDS[form.apiKeyKind] ?? "掩码值"}）——留空保留，输入新值替换`
        : "留空不设置；可填 sk-…、$ENV_VAR 或 ${ENV}",
      oninput: (event) => { form.apiKeyValue = event.target.value; } });
    const reveal = el("input", { type: "checkbox", "aria-label": "显示 API Key",
      onchange: (event) => { apiKeyInput.type = event.target.checked ? "text" : "password"; } });
    const clearKey = el("input", { type: "checkbox", checked: form.apiKeyClear, "aria-label": "清除已保存的 API Key",
      onchange: (event) => { form.apiKeyClear = event.target.checked; apiKeyInput.disabled = event.target.checked; } });
    const idField = existingId ? [] : [field("供应商 id", el("input", { type: "text", value: form.id,
      placeholder: "例如 my-proxy；与内置供应商同名即为覆盖", spellcheck: "false",
      oninput: (event) => { form.id = event.target.value; renderNavList(); } }), "创建后不可修改；改名用左侧列表的铅笔图标", true)];
    return [
      ...idField,
      field("Base URL", el("input", { type: "text", value: form.baseUrl, spellcheck: "false",
        placeholder: "https://…/v1（本地服务如 http://localhost:11434/v1）",
        oninput: (event) => { form.baseUrl = event.target.value; } }), undefined, true),
      field("API 协议", el("select", { "aria-label": "API 协议",
        onchange: (event) => { form.api = event.target.value; } },
        new Option("（不设置）", "", false, form.api === ""),
        ...API_TYPES.map(([value, label]) => new Option(label, value, false, form.api === value)))),
      field("API Key", el("span", { class: "mm-key" }, apiKeyInput,
        el("label", { class: "mm-check" }, reveal, "显示"),
        form.apiKeyMasked ? el("label", { class: "mm-check mm-check-danger" }, clearKey, "清除已存") : null),
        "密钥不回显：留空保留现值，只有新输入的值会被传输"),
    ];
  }

  // 高级连接：默认折叠，展开状态在重渲染（如新增请求头）后保留。
  function advancedConnection(form) {
    const headersBox = el("div", { class: "mm-headers" },
      ...form.headerRows.map((row) => headerRow(form, row)),
      el("button", { type: "button", class: "secondary mm-headers-add", onclick: () => {
        form.headerRows.push({ name: "", value: "", masked: false, kind: "" });
        renderProviders();
      } }, "添加请求头"));
    return el("details", { class: "mm-advanced", open: Boolean(form.advancedOpen),
      ontoggle: (event) => { form.advancedOpen = event.target.open; } },
      el("summary", {}, "高级连接（Bearer 头 / 自定义请求头）"),
      el("div", { class: "mm-form" },
        field("Authorization: Bearer 头", el("span", { class: "mm-key" }, el("input", { type: "checkbox", checked: form.authHeader,
          "aria-label": "附加 Authorization Bearer 头",
          onchange: (event) => { form.authHeader = event.target.checked; } })),
          "自动附加 Authorization: Bearer <apiKey>"),
        field("自定义请求头", headersBox, "值支持 $ENV 引用；掩码值留空即原样保留")));
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

  function openDraft(prefillId) {
    if (!state.draft) {
      state.draft = { saved: false, savedId: "", templateId: "custom", rows: [], form: null };
      applyTemplate(state.draft, "custom");
    }
    if (prefillId) state.draft.form.id = prefillId;
    state.selected = DRAFT;
    renderProviders();
  }
  function closeDraft() {
    const savedId = state.draft?.savedId ?? "";
    state.draft = null;
    clearAlert();
    if (state.selected === DRAFT) state.selected = savedId;
    renderProviders();
  }

  // ── 保存动作 ────────────────────────────────────────────────────────────
  // submit 返回 false（校验失败/网络失败/冲突）时不动任何状态：草稿与表单
  // 原地保留，错误在面板顶部展示，可直接修正后重试。
  async function saveProviderForm(button, form, { draft, existing } = {}) {
    const built = buildProviderPayload(form);
    if (built.error) return showAlert("error", `保存失败：${built.error}`);
    const id = form.id.trim();
    const errors = validateProvider(form, built.value);
    if (errors.length) return showAlert("error", `保存失败：${errors.join("；")}`);
    await submit(button, () =>
        request("models.provider.save", { providerId: id, provider: built.value, baseFingerprint: state.fingerprint }),
      {
        successMessage: `已保存供应商「${id}」。`,
        // onSuccess 在回读渲染前执行：只有真正成功才落定保存后状态。
        onSuccess: () => {
          if (draft) { draft.saved = true; draft.savedId = id; }
          else if (existing) { state.editForms.delete(existing); pruneProviderRows(existing); }
        },
      });
  }

  // ── 拉取模型列表：只读发现 → 勾选 → 显式批量加入 ──────────────────────────────
  // 发现请求只带 providerId（服务端按已保存配置请求上游），草稿密钥绝不外发；
  // 结果仅作待选清单，只有点「添加选中的模型」才逐条串行 models.model.save。
  function discoverEntry(providerId) {
    let entry = state.discover.get(providerId);
    if (!entry) {
      entry = { status: "", models: [], byId: new Map(), truncated: false, error: "", query: "", checked: new Set(), token: 0, saving: false };
      state.discover.set(providerId, entry);
    }
    return entry;
  }
  const savedModelIds = (provider) =>
    new Set((Array.isArray(provider?.models) ? provider.models : []).map((model) => model.id).filter(Boolean));

  async function startDiscover(providerId, form) {
    const entry = discoverEntry(providerId);
    if (entry.saving) return; // 批量保存进行中，不接受新的发现请求
    // 连接字段有未保存修改时拒绝拉取：发现按已保存配置执行，草稿密钥绝不外发。
    if (form && providerDirty(form)) {
      entry.status = "blocked";
      entry.error = "连接信息有未保存的修改，请先「保存供应商」再拉取模型列表。";
      renderProviders();
      return;
    }
    const token = ++entry.token;
    entry.status = "loading";
    entry.error = "";
    renderProviders();
    try {
      const data = await request("models.provider.discover", { providerId });
      if (token !== entry.token) return; // 过期响应（并发拉取/旧供应商）：直接丢弃
      const models = (Array.isArray(data?.models) ? data.models : [])
        .filter((model) => model && typeof model.id === "string" && model.id);
      entry.models = models;
      entry.byId = new Map(models.map((model) => [model.id, model]));
      entry.truncated = Boolean(data?.truncated);
      const added = savedModelIds(state.providers.find((item) => item.id === providerId));
      entry.checked = new Set([...entry.checked].filter((id) => entry.byId.has(id) && !added.has(id)));
      entry.status = "ready";
    } catch (error) {
      if (token !== entry.token) return;
      entry.status = "error";
      entry.error = error?.message || String(error);
    }
    renderProviders();
  }

  // 保存载荷只透传协议声明且确实返回的字段：未返回的能力一律不猜、不补默认值。
  function discoverPayload(model) {
    const payload = { id: model.id };
    for (const key of ["name", "input", "reasoning", "contextWindow", "maxTokens"])
      if (model[key] !== undefined) payload[key] = model[key];
    return payload;
  }

  // 批量保存勾选项：不经 submit（其逐条回读会反复重绘且冲掉拉取面板的即时状态），
  // 串行 await、每成功更新指纹；结束后统一静默回读一次，失败项保留勾选可直接重试。
  async function saveDiscovered(button, providerId) {
    const entry = state.discover.get(providerId);
    const ids = [...entry.checked];
    if (!ids.length || entry.saving) return;
    entry.saving = true;
    button.disabled = true;
    button.textContent = "保存中…";
    let savedCount = 0;
    let conflict = false;
    const failures = [];
    for (const id of ids) {
      try {
        const result = await request("models.model.save",
          { providerId, model: discoverPayload(entry.byId.get(id)), baseFingerprint: state.fingerprint });
        state.fingerprint = result?.fingerprint || state.fingerprint;
        entry.checked.delete(id);
        savedCount++;
      } catch (error) {
        if (isConflict(error)) { conflict = true; break; } // 指纹已过期，余下必然同样失败
        failures.push(`${id}：${error?.message || error}`);
      }
    }
    entry.saving = false;
    if (savedCount > 0) await load({ silent: true });
    if (conflict)
      showAlert("warn", `模型配置已被外部修改：已写入 ${savedCount} 个模型，其余保持勾选未写入。请重新加载后重试。`,
        [{ label: "重新加载", onclick: () => void load() }]);
    else if (failures.length)
      showAlert("error", `已添加 ${savedCount} 个模型，${failures.length} 个失败（保留勾选，可直接重试）：${failures.join("；")}`);
    else if (savedCount > 0)
      showAlert("ok", `已添加 ${savedCount} 个模型。`);
    renderProviders();
    if (savedCount > 0) await Promise.resolve(onSaved?.()).catch(() => {});
  }

  // 发现面板：loading / blocked+error（内联重试）/ 结果列表（搜索 + 多选 + 已添加禁用）。
  // 搜索与勾选只局部更新列表与按钮，不整棵重绘，保住输入焦点与滚动位置。
  function discoverPanel(provider) {
    const entry = state.discover.get(provider.id);
    if (!entry?.status) return null;
    const providerId = provider.id;
    const box = el("div", { class: "mm-discover" });
    if (entry.status === "loading") {
      box.append(el("p", { class: "mm-hint", role: "status" }, "正在拉取模型列表…"));
      return box;
    }
    if (entry.status === "blocked" || entry.status === "error") {
      box.append(el("span", { class: "mm-discover-error", role: "alert" }, entry.error),
        el("button", { type: "button", class: "secondary",
          onclick: () => void startDiscover(providerId, state.editForms.get(providerId)) }, "重试"));
      return box;
    }
    if (!entry.models.length) {
      box.append(el("p", { class: "mm-hint" }, "供应商未返回任何模型，可检查连接信息后重新拉取。"));
      return box;
    }
    const added = savedModelIds(provider);
    const listBox = el("div", { class: "mm-discover-list" });
    const saveButton = el("button", { type: "button", class: "mm-primary",
      onclick: (event) => void saveDiscovered(event.currentTarget, providerId) });
    const countLabel = el("span", { class: "mm-hint" });
    const sync = () => {
      saveButton.disabled = entry.saving || entry.checked.size === 0;
      saveButton.textContent = entry.saving ? "保存中…" : `添加选中的模型（${entry.checked.size}）`;
      countLabel.textContent = `已选 ${entry.checked.size} / 共 ${entry.models.length}`;
    };
    const renderRows = () => {
      const query = entry.query.trim().toLowerCase();
      const hit = (model) => !query || model.id.toLowerCase().includes(query) || String(model.name ?? "").toLowerCase().includes(query);
      const visible = entry.models.filter(hit);
      listBox.replaceChildren(...(visible.length
        ? visible.map((model) => discoverRow(providerId, model, added.has(model.id), sync))
        : [el("p", { class: "mm-hint" }, "没有匹配的模型。")]));
    };
    box.append(...[
      el("h5", {}, `拉取到 ${entry.models.length} 个模型`),
      el("input", { type: "search", class: "mm-discover-search", value: entry.query,
        placeholder: "搜索模型 id 或名称…", "aria-label": "搜索拉取到的模型", autocomplete: "off", spellcheck: "false",
        oninput: (event) => { entry.query = event.target.value; renderRows(); } }),
      listBox,
      entry.truncated ? el("p", { class: "mm-hint" }, "结果可能不完整（列表被截断）。") : null,
      el("div", { class: "mm-discover-foot" }, saveButton, countLabel),
    ].filter(Boolean));
    renderRows();
    sync();
    return box;
  }

  function discoverRow(providerId, model, added, onToggle) {
    const entry = state.discover.get(providerId);
    const meta = [];
    if (model.contextWindow !== undefined) meta.push(`上下文 ${model.contextWindow}`);
    if (model.maxTokens !== undefined) meta.push(`输出 ${model.maxTokens}`);
    return el("label", { class: `mm-discover-row${added ? " mm-added" : ""}` },
      el("input", { type: "checkbox", checked: entry.checked.has(model.id), disabled: added || entry.saving,
        "aria-label": `${added ? "已添加" : "选择模型"} ${model.id}`,
        onchange: (event) => {
          if (event.target.checked) entry.checked.add(model.id);
          else entry.checked.delete(model.id);
          onToggle?.();
        } }),
      model.name && model.name !== model.id ? el("span", { class: "mm-discover-name" }, model.name) : null,
      el("code", {}, model.id),
      meta.length ? el("span", { class: "mm-discover-meta" }, meta.join(" · ")) : null,
      el("span", { class: "mm-catalog-model-tags" },
        added ? badge("已添加") : null,
        model.reasoning === true ? badge("推理") : null,
        Array.isArray(model.input) && model.input.includes("image") ? badge("图片") : null));
  }

  // 既有模型的行对象进缓存（键 providerId\0modelId），跨重渲染/回读保留未保存编辑；
  // snap 每次对齐最新数据，脏检查始终以最新落盘内容为基准。
  function modelRow(providerId, snapOrRow, { isNew = false, onRemove } = {}) {
    let row;
    if (isNew) {
      row = snapOrRow;
    } else {
      const key = `${providerId}\u0000${snapOrRow.id}`;
      row = state.modelRows.get(key) ?? { snap: {} };
      row.snap = clone(snapOrRow);
      state.modelRows.set(key, row);
    }
    if (!row.form) row.form = modelForm(row.snap);
    const form = row.form;
    const build = () => buildModelPayload(form, isNew);
    const saveButton = el("button", { type: "button", class: isNew ? "mm-primary" : "secondary",
      onclick: (event) => void saveModel(event.currentTarget) }, isNew ? "保存模型" : "保存修改");
    const sync = () => {
      const built = build();
      saveButton.disabled = Boolean(built.error) || (!isNew && !modelDirty(form, isNew));
      if (built.error) saveButton.title = built.error;
      else saveButton.removeAttribute("title");
    };
    const saveModel = async (button) => {
      const built = build();
      if (built.error) return showAlert("error", `模型保存失败：${built.error}`);
      const ok = await submit(button, () =>
          request("models.model.save", { providerId, model: built.value, baseFingerprint: state.fingerprint }),
        { successMessage: `已保存模型「${built.value.id}」。` });
      if (!ok) return; // 失败：新行草稿不被移除，既有行表单保留
      if (isNew) onRemove?.();
      else state.modelRows.delete(`${providerId}\u0000${form.snap.id}`);
    };
    const idInput = el("input", { type: "text", value: isNew ? String(form.id ?? "") : String(row.snap.id ?? ""),
      spellcheck: "false", disabled: !isNew,
      title: isNew ? undefined : "模型 id 创建后不可修改；改名请新建一条再删除旧条目",
      oninput: (event) => { form.id = event.target.value; sync(); } });
    const grid = el("div", { class: "mm-model-grid" },
      field(isNew ? "模型 id" : "模型 id（不可修改）", idInput,
        isNew ? "传给 API 的标识，保存后不可改" : undefined),
      field("显示名称", el("input", { type: "text", value: form.name, placeholder: "留空使用 id",
        oninput: (event) => { form.name = event.target.value; sync(); } })),
      field("上下文窗口（tokens）", el("input", { type: "text", inputmode: "numeric", value: form.contextWindow,
        placeholder: "默认 128000", spellcheck: "false",
        oninput: (event) => { form.contextWindow = event.target.value; sync(); } })),
      field("最大输出（tokens）", el("input", { type: "text", inputmode: "numeric", value: form.maxTokens,
        placeholder: "默认 16384", spellcheck: "false",
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
    const displayId = isNew ? (String(form.id ?? "").trim() || "新模型") : String(row.snap.id ?? "");
    const displayName = String(form.name ?? "").trim();
    // 新建/未保存的行默认展开，已保存的行折叠成摘要行；展开状态跨重渲染保留。
    if (row.expanded === undefined) row.expanded = isNew;
    return el("details", { class: `mm-model${isNew ? " mm-model-new" : ""}`, open: row.expanded,
      ontoggle: (event) => { row.expanded = event.target.open; } },
      el("summary", { class: "mm-model-summary" },
        el("span", { class: "mm-caret", "aria-hidden": "true" }, "▸"),
        el("span", { class: "mm-model-id mm-mono" }, displayId),
        displayName && displayName !== displayId ? el("span", { class: "mm-model-name" }, displayName) : null,
        el("span", { class: "mm-catalog-model-tags" },
          form.reasoning ? badge("推理") : null,
          form.image ? badge("图片") : null),
        !isNew && modelDirty(form, false)
          ? el("span", { class: "mm-dot", title: "有未保存的修改", "aria-label": "有未保存的修改" })
          : null,
        el("span", { class: "mm-model-row-actions" },
          isNew && onRemove
            ? iconButton("delete", `移除未保存的模型「${displayId}」`, onRemove)
            : iconButton("delete", `删除模型「${displayId}」`, () => confirmDeleteModel(providerId, String(row.snap.id ?? ""))))),
      grid, advanced,
      el("div", { class: "mm-model-actions" }, saveButton));
  }

  renderProviders();
  return { load };
}
