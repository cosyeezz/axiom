import { randomUUID } from "node:crypto";

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ? url.href : undefined;
  } catch { return undefined; }
};
const text = (value) => String(value ?? "").slice(0, 2000);
function eventView(event) {
  if (event.type === "auth_url") return { type: event.type, url: safeUrl(event.url), instructions: text(event.instructions) };
  if (event.type === "device_code") return { type: event.type, verificationUri: safeUrl(event.verificationUri), userCode: text(event.userCode) };
  return { type: "info", message: text(event.message), links: (event.links || []).slice(0, 10).map((l) => ({ url: safeUrl(l.url), label: text(l.label) })).filter((l) => l.url) };
}

// 一个连接一个登录流程。SDK 负责授权/落库/刷新 token；桥接层不保存或回传凭据。
export function createModelAuthService({ auth, onChanged = () => {}, flowTimeoutMs = 600_000 }) {
  const flows = new Map();
  const view = (flow) => ({ flowId: flow.id, providerId: flow.providerId, status: flow.status,
    events: flow.events, prompt: flow.prompt, ...(flow.error ? { error: flow.error } : {}) });
  function cancel(flow) {
    if (flow.status === "running") {
      flow.status = "cancelled"; flow.controller.abort(); flow.reject?.(new Error("Cancelled"));
    }
    clearTimeout(flow.timer); flow.prompt = null;
  }
  function close(owner) { const flow = flows.get(owner); if (flow) cancel(flow); flows.delete(owner); }
  const get = (owner, id) => {
    const flow = flows.get(owner);
    if (!flow || flow.id !== id) throw new Error("登录流程已失效，请重新登录");
    return flow;
  };
  async function handle(request, owner) {
    if (request.type === "models.auth.list") return { providers: auth.authProviders() };
    if (request.type === "models.auth.logout") {
      if (!auth.authProviders().some((p) => p.id === request.providerId)) throw new Error("未知供应商");
      // 同供应商登录尚在进行时不允许另一窗口登出，避免登录完成后凭据复活。
      if ([...flows.values()].some((f) => f.providerId === request.providerId && f.status === "running")) throw new Error("请先取消该供应商的登录");
      try { await auth.logout(request.providerId); await auth.refreshModels(); await onChanged(); }
      catch { throw new Error("登出或刷新失败，请刷新配置页后重试"); }
      return { ok: true };
    }
    if (request.type === "models.auth.start") {
      const provider = auth.authProviders().find((p) => p.id === request.providerId);
      if (!provider?.methods.some((m) => m.type === request.authType)) throw new Error("供应商不支持此登录方式");
      if (flows.get(owner)?.status === "running" || [...flows.values()].some((f) => f.providerId === request.providerId && f.status === "running")) throw new Error("登录正在进行，请先完成或取消");
      close(owner);
      const flow = { id: randomUUID(), providerId: request.providerId, controller: new AbortController(), status: "running", events: [], prompt: null };
      flows.set(owner, flow);
      flow.timer = setTimeout(() => cancel(flow), flowTimeoutMs); flow.timer.unref?.();
      const signal = flow.controller.signal;
      const interaction = {
        signal,
        notify(event) { if (!signal.aborted) { flow.events.push(eventView(event)); if (flow.events.length > 30) flow.events.shift(); } },
        prompt(p) {
          signal.throwIfAborted(); p.signal?.throwIfAborted();
          return new Promise((resolve, reject) => {
            const id = randomUUID();
            flow.prompt = { id, type: p.type, message: text(p.message), placeholder: text(p.placeholder),
              ...(p.type === "select" ? { options: p.options.map((o) => ({ id: o.id, label: text(o.label) })) } : {}) };
            const clean = () => { signal.removeEventListener("abort", abort); p.signal?.removeEventListener("abort", abort); flow.prompt = null; flow.resolve = null; flow.reject = null; };
            const abort = () => { clean(); reject(new Error("Cancelled")); };
            flow.resolve = (value) => { clean(); resolve(value); }; flow.reject = (error) => { clean(); reject(error); };
            signal.addEventListener("abort", abort, { once: true }); p.signal?.addEventListener("abort", abort, { once: true });
          });
        },
      };
      void Promise.resolve().then(() => auth.login(request.providerId, request.authType, interaction)).then(async () => {
        await auth.refreshModels(); await onChanged();
        if (!signal.aborted) flow.status = "success";
      }).catch(() => {
        if (!signal.aborted) { flow.status = "error"; flow.error = "登录或目录刷新失败，请检查网络与凭据后重试"; }
      }).finally(() => { clearTimeout(flow.timer); flow.prompt = null; });
      return view(flow);
    }
    const flow = get(owner, request.flowId);
    if (request.type === "models.auth.status") return view(flow);
    if (request.type === "models.auth.cancel") { cancel(flow); return view(flow); }
    if (request.type === "models.auth.respond") {
      if (flow.status !== "running" || flow.prompt?.id !== request.promptId || !flow.resolve) throw new Error("登录步骤已更新，请按当前提示操作");
      if (typeof request.value !== "string" || !request.value.trim() || request.value.length > 8192) throw new Error("请输入有效的登录信息");
      if (flow.prompt.type === "select" && !flow.prompt.options.some((o) => o.id === request.value)) throw new Error("无效的登录选项");
      flow.resolve(request.value); return view(flow);
    }
    throw new Error("未知登录命令");
  }
  return { handle, close };
}
