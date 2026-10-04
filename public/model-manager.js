import { createModelAuth } from "./model-auth.js";
import { createModelLimits } from "./model-limits.js";

// Pi 提供供应商、认证方式与模型目录。网页只呈现，不维护厂商模板或模型显隐清单。
const node = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (className) n.className = className;
  return n;
};
const button = (text, run) => {
  const b = node("button", text, "secondary"); b.type = "button"; b.onclick = run; return b;
};
const editable = (config) => {
  const secret = (value) => value?.masked === true ? { keep: true } : value;
  const headers = (value) => value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key, v]) => [key, secret(v)])) : value;
  const model = (value) => ({ ...value, ...("headers" in value ? { headers: headers(value.headers) } : {}) });
  // 只转换约定的秘密位置，未知能力字段中同名的 masked 属性仍原样往返。
  return { ...config,
    ...("apiKey" in config ? { apiKey: secret(config.apiKey) } : {}),
    ...("headers" in config ? { headers: headers(config.headers) } : {}),
    ...(config.models ? { models: config.models.map(model) } : {}),
    ...(config.modelOverrides ? { modelOverrides: Object.fromEntries(Object.entries(config.modelOverrides).map(([id, v]) => [id, model(v)])) } : {}),
  };
};

export function initModelManager({ root, request, onSaved }) {
  const state = { data: { providers: [], catalog: [], authProviders: [] }, selected: "", query: "", token: 0, drafts: new Map() };
  const shell = node("div", "", "mm");
  const head = node("div", "", "mm-head");
  const intro = node("div");
  intro.append(node("h3", "模型与供应商"), node("p", "选择供应商，配置 API Key 或登录账号。模型由 Pi 提供。", "mm-hint"));
  const actions = node("div", "", "mm-head-actions");
  actions.append(button("刷新", () => void load()), button("自定义供应商", () => { state.selected = ":new"; render(); }));
  head.append(intro, actions);
  const alert = node("p", "", "mm-alert"); alert.setAttribute("role", "alert");
  const split = node("div", "", "mm-split");
  const nav = node("nav", "", "mm-nav"); nav.setAttribute("aria-label", "供应商");
  const search = node("input", "", "mm-search"); search.type = "search";
  search.placeholder = "搜索供应商或模型"; search.setAttribute("aria-label", search.placeholder);
  search.oninput = () => { state.query = search.value; renderNav(); };
  const list = node("div", "", "mm-nav-list");
  const detail = node("section", "", "mm-detail"); detail.setAttribute("aria-label", "供应商详情");
  nav.append(search, list); split.append(nav, detail); shell.append(head, alert, split); root.replaceChildren(shell);
  const auth = createModelAuth({ request, onChanged: () => load({ notify: true }) });
  const message = (text) => { alert.textContent = text; };

  function providers() {
    const all = new Map();
    for (const p of state.data.authProviders) all.set(p.id, p);
    for (const p of state.data.providers) if (!all.has(p.id)) all.set(p.id, { id: p.id, name: p.id, methods: [] });
    for (const m of state.data.catalog) if (!all.has(m.provider)) all.set(m.provider, { id: m.provider, name: m.provider, methods: [] });
    return [...all.values()].sort((a, b) => Number(Boolean(b.configured)) - Number(Boolean(a.configured)) ||
      (a.name || a.id).localeCompare(b.name || b.id));
  }
  const models = (id) => state.data.catalog.filter((m) => m.provider === id);
  function renderNav() {
    const query = state.query.trim().toLowerCase();
    const items = providers().filter((p) => [p.id, p.name, ...models(p.id).flatMap((m) => [m.id, m.name])]
      .some((s) => String(s || "").toLowerCase().includes(query)));
    list.replaceChildren(...items.map((p) => {
      const b = button("", () => { state.selected = p.id; render(); }); b.className = "secondary mm-nav-item";
      b.setAttribute("aria-current", String(state.selected === p.id));
      b.append(node("span", p.name || p.id, "mm-nav-id"), node("span", `${p.configured ? "凭据已配置" : "未配置凭据"} · ${models(p.id).length} 个模型`, "mm-nav-meta"));
      return b;
    }));
    if (!items.length) list.append(node("p", "没有匹配的供应商。", "mm-hint"));
  }
  function render() {
    const all = providers();
    if (state.selected !== ":new" && !all.some((p) => p.id === state.selected)) state.selected = all[0]?.id || "";
    renderNav(); detail.replaceChildren();
    if (state.selected === ":new") {
      detail.append(node("h4", "自定义供应商"), node("p", "仅在使用代理、私有端点或 Pi 未收录的模型时需要。", "mm-hint"), configEditor(""));
      return;
    }
    const p = all.find((entry) => entry.id === state.selected);
    if (!p) { detail.append(node("p", "暂无供应商，请刷新目录或添加自定义供应商。", "mm-hint")); return; }
    detail.append(node("h4", p.name || p.id), node("code", p.id, "mm-provider-id"), auth.section(p));
    const catalog = node("details", "", "mm-catalog");
    const entries = models(p.id);
    catalog.append(node("summary", `模型（${entries.length}）`), node("p", "目录由 Pi 解析。配置凭据后可在会话中选择模型；连接是否可用以实际请求为准。", "mm-hint"));
    const rows = node("div", "", "mm-catalog-models");
    for (const m of entries) {
      const row = node("div", "", "mm-catalog-model");
      row.append(node("span", m.name || m.id), node("code", m.id)); rows.append(row);
    }
    catalog.append(rows);
    const limits = createModelLimits({ providerId: p.id, models: entries, request });
    limits.classList.add("mm-limits");
    const advanced = node("details", "", "mm-advanced");
    advanced.append(node("summary", "自定义配置（Pi models.json）"), configEditor(p.id));
    detail.append(catalog, limits, advanced);
  }

  // 自定义配置直接编辑 Pi 的 provider 对象；已有密钥以 keep 占位，SDK 校验后原子替换。
  // 草稿跨切换/刷新保留，保存失败不清空；不把 Pi 的能力再次翻译成另一套模型表单。
  function configEditor(id) {
    const original = state.data.providers.find((p) => p.id === id);
    const key = id || ":new";
    let draft = state.drafts.get(key);
    if (!draft) {
      const { id: ignored, ...config } = original || {};
      draft = { id, text: JSON.stringify(editable(config), null, 2), fingerprint: state.data.fingerprint };
      state.drafts.set(key, draft);
    }
    const form = node("form", "", "mm-config-form");
    if (!id) {
      const label = node("label", "供应商 ID"); const input = node("input"); input.required = true;
      input.pattern = "[A-Za-z0-9][A-Za-z0-9._-]{0,63}"; input.value = draft.id;
      input.oninput = () => { draft.id = input.value; }; label.append(input); form.append(label);
    }
    const label = node("label", "Pi 供应商配置 JSON");
    const text = node("textarea", "", "mm-extras"); text.rows = 12; text.spellcheck = false; text.value = draft.text;
    text.oninput = () => { draft.text = text.value; }; label.append(text);
    const help = node("p", '使用 Pi 原生字段：baseUrl、api、models、modelOverrides 等。已有密钥的 {"keep":true} 表示保留；不要粘贴 OAuth token。保存会替换此供应商的自定义配置。', "mm-hint");
    const docs = node("a", "Pi 自定义模型文档");
    docs.href = "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md";
    docs.target = "_blank"; docs.rel = "noopener noreferrer";
    const save = button("保存配置", () => {}); save.type = "submit";
    const reset = button("放弃草稿并重新加载", () => { state.drafts.delete(key); render(); });
    const controls = node("div", "", "mm-head-actions"); controls.append(save, reset);
    if (original) controls.append(button("删除自定义配置", async () => {
      const dialog = node("dialog", "", "mm-dialog"); const body = node("div", "", "settings-body");
      body.append(node("h2", "删除自定义配置？"), node("p", `将删除 ${id} 的自定义模型与覆盖，不删除登录凭据或 Pi 内置目录。`));
      const actions = node("div", "", "dialog-actions");
      actions.append(button("取消", () => dialog.remove()), button("删除", async () => {
        dialog.remove(); await persist("models.provider.delete", { providerId: id, baseFingerprint: draft.fingerprint });
      }));
      body.append(actions); dialog.append(body); document.body.append(dialog);
      dialog.addEventListener("close", () => dialog.remove());
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    }));
    async function persist(type, args) {
      save.disabled = true; message("");
      try {
        const result = await request(type, args);
        state.drafts.delete(key); state.selected = args.providerId;
        const loaded = await load({ notify: true });
        if (!loaded) message("配置已保存，但回读失败，请刷新；无需重复保存。");
        else if (loaded.applied === false || result.applied === false) message("配置已保存，但目录尚未应用，请检查配置后刷新。");
        else message("配置已保存。连接尚未验证。");
      } catch (error) { message(error.message || "保存失败，请重试"); }
      finally { save.disabled = false; }
    }
    form.onsubmit = async (event) => {
      event.preventDefault();
      let provider;
      try {
        provider = JSON.parse(draft.text);
        if (!provider || typeof provider !== "object" || Array.isArray(provider)) throw new Error();
      } catch { message("配置必须是有效的 JSON 对象。"); return; }
      await persist("models.provider.configure", { providerId: draft.id.trim(), provider, baseFingerprint: draft.fingerprint });
    };
    form.append(help, docs, label, controls); return form;
  }
  async function load({ notify = false } = {}) {
    const token = ++state.token;
    try {
      const data = await request("models.config.get", {});
      if (token !== state.token) return;
      state.data = { ...data, providers: data.providers || [], catalog: data.catalog || [], authProviders: data.authProviders || [] };
      message(data.parseError || (data.applied === false ? "配置已保存，但目录尚未应用，请检查配置后刷新。" : ""));
      render();
      if (notify && data.applied !== false) await Promise.resolve(onSaved?.()).catch(() => {});
      return data;
    } catch (error) { if (token === state.token) message(`无法加载配置：${error.message || error}`); }
  }
  render();
  return { load };
}
