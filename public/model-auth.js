// 登录流程完全由 Pi 驱动；这里仅呈现事件、收集回答，不接触 token。
export function createModelAuth({ request, onChanged }) {
  let active = null;
  const node = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
  const button = (text, run) => { const b = node("button", text); b.type = "button"; b.className = "secondary"; b.onclick = run; return b; };
  const link = (url, text) => {
    try { if (!["http:", "https:"].includes(new URL(url).protocol)) return null; } catch { return null; }
    const a = node("a", text || "打开授权页面"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
  };
  async function login(provider, method) {
    if (active) return;
    const dialog = node("dialog"); dialog.className = "mm-dialog mm-auth-dialog";
    const body = node("div"); body.className = "settings-body";
    const title = node("h2", `${provider.name || provider.id} · ${method.name || (method.type === "oauth" ? "账号授权" : "API Key")}`);
    title.id = "mm-auth-title"; dialog.setAttribute("aria-labelledby", title.id);
    const status = node("p", "正在准备登录…"); status.setAttribute("role", "status");
    const events = node("div"); events.className = "mm-auth-events";
    const prompt = node("form"); const error = node("p"); error.className = "mm-dialog-error"; error.setAttribute("role", "alert");
    const actions = node("div"); actions.className = "dialog-actions";
    const cancel = button("取消", () => {
      if (dialog.close) dialog.close();
      else dialog.dispatchEvent(new Event("close"));
    }); actions.append(cancel);
    body.append(title, status, events, prompt, error, actions); dialog.append(body); document.body.append(dialog);
    const flow = { id: null, closed: false, timer: null, promptId: null }; active = flow;
    const close = () => {
      if (flow.closed) return; flow.closed = true; clearTimeout(flow.timer); active = null;
      if (flow.id) void request("models.auth.cancel", { flowId: flow.id }).catch(() => {});
      dialog.remove();
    };
    dialog.addEventListener("close", close); dialog.addEventListener("cancel", close);
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    function render(data) {
      status.textContent = data.status === "success" ? "凭据已保存，模型目录已更新。连接尚未验证。"
        : data.status === "error" ? (data.credentialsSaved ? "凭据已保存 · 目录未应用" : "登录未完成")
        : data.status === "cancelled" ? (data.credentialsSaved
          ? `凭据已保存 · ${data.applied ? "目录已更新，连接尚未验证" : "目录未应用，请刷新配置页；无需重复授权"}`
          : "登录已取消或超时，请关闭后重试。")
        : data.credentialsSaved ? "凭据已保存，正在应用模型目录；无需重复授权。" : "请按照提示完成登录";
      events.replaceChildren();
      for (const event of data.events || []) {
        const row = node("p", event.message || event.instructions || "");
        const url = event.url || event.verificationUri;
        if (url) { const a = link(url); if (a) row.append(a); }
        if (event.userCode) row.append(node("code", ` ${event.userCode}`));
        for (const item of event.links || []) { const a = link(item.url, item.label); if (a) row.append(a); }
        events.append(row);
      }
      if ((data.prompt?.id ?? null) !== flow.promptId) {
        prompt.replaceChildren(); flow.promptId = data.prompt?.id ?? null;
        const p = data.prompt;
        if (p) {
          const label = node("label", p.message); let input;
          if (p.type === "select") {
            input = node("select");
            for (const option of p.options || []) { const o = node("option", option.label); o.value = option.id; input.append(o); }
          } else { input = node("input"); input.type = p.type === "secret" ? "password" : "text"; input.placeholder = p.placeholder || ""; input.autocomplete = "off"; }
          input.required = true; label.append(input);
          const submit = node("button", "继续"); submit.type = "submit"; prompt.append(label, submit);
          prompt.onsubmit = async (event) => {
            event.preventDefault(); submit.disabled = true; error.textContent = "";
            const value = input.value;
            // secret/text 提交后清空；select 保留选项，失败重试不会变成空值。
            if (p.type !== "select") input.value = "";
            try { await request("models.auth.respond", { flowId: flow.id, promptId: p.id, value }); }
            catch (e) { error.textContent = e.message || "提交失败，请重试"; submit.disabled = false; }
          };
          input.focus();
        }
      }
      if (["success", "error", "cancelled"].includes(data.status)) {
        prompt.replaceChildren(); cancel.textContent = "关闭";
        if (data.status === "error") error.textContent = data.error || "登录失败，请重新登录";
        flow.id = null;
        if (data.status === "success" || data.credentialsSaved) void Promise.resolve().then(() => onChanged?.()).catch(() => {});
        return false;
      }
      return true;
    }
    async function poll() {
      if (flow.closed || !flow.id) return;
      try {
        const data = await request("models.auth.status", { flowId: flow.id });
        if (!flow.closed && render(data)) flow.timer = setTimeout(poll, 800);
      } catch (e) { if (!flow.closed) error.textContent = e.message || "登录连接已断开，请关闭后重试"; }
    }
    try {
      const data = await request("models.auth.start", { providerId: provider.id, authType: method.type });
      flow.id = data.flowId;
      if (flow.closed) { await request("models.auth.cancel", { flowId: flow.id }); return; }
      if (render(data)) void poll();
    } catch (e) { if (!flow.closed) error.textContent = e.message || "无法开始登录"; }
  }
  function section(provider) {
    const box = node("section"); box.className = "mm-auth-section";
    box.append(node("h4", "账号与授权"), node("p", provider.configured
      ? "检测到凭据配置 · 不代表连接验证通过。网页登录凭据保存在 Axiom；也可能来自环境变量或配置引用。"
      : "选择认证方式。网页提交的凭据保存在 Axiom，不回显密钥。"));
    if (provider.id === "openai-codex") box.append(node("p", "登录后可选择浏览器授权或设备码；远程部署优先使用设备码，并按 OpenAI 提示确认账号权限。"));
    const sourceNames = { stored: "已保存的登录凭据（优先于表单 API Key）", runtime: "运行时覆盖", environment: "环境配置", models_json_key: "供应商表单", models_json_command: "已有命令引用", fallback: "供应商配置" };
    if (sourceNames[provider.authSource]) box.append(node("p", `认证来源：${sourceNames[provider.authSource]}。清除登录凭据不会删除表单或环境凭据。`));
    if (!provider.methods?.length) box.append(node("p", "此供应商没有网页登录入口，请按供应商要求配置环境凭据或自定义连接。"));
    const actions = node("div"); actions.className = "mm-head-actions";
    for (const method of provider.methods || []) actions.append(button(method.type === "oauth"
      ? (provider.id === "openai-codex" ? "使用 ChatGPT 登录" : "登录 / 重新授权") : "配置 API Key", () => void login(provider, method)));
    if (provider.configured) actions.append(button("清除登录凭据", async () => {
      const b = actions.lastElementChild; b.disabled = true;
      try { await request("models.auth.logout", { providerId: provider.id }); await onChanged?.(); }
      catch (e) { box.append(node("p", e.message || "登出失败")); b.disabled = false; }
    }));
    box.append(actions); return box;
  }
  return { section };
}
