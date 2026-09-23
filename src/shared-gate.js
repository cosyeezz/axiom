import { createHash, randomBytes } from "node:crypto";
import { link, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { connectGate, serveGate } from "./gate-ipc.js";

// 数据根隔离账本与限额；端点保持在短的用户目录下，避免 Unix socket 路径过长。
export async function gateLayout(home = join(homedir(), ".axiom")) {
  const dir = join(homedir(), ".axiom-gate");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const root = await realpath(home);
  const key = createHash("sha256").update(process.platform === "win32" ? root.toLowerCase() : root).digest("hex").slice(0, 24);
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-usage-${key}` : join(dir, `gate-${key}.sock`);
  const tokenFile = join(dir, `token-${key}`);
  // 先写完同目录临时文件，再用 hard link 原子发布；并发创建不会读到空/半写入的密钥。
  // link 的 EEXIST 表示其他进程已发布，不可用会覆盖目标的 rename。
  const temporary = `${tokenFile}.${process.pid}-${randomBytes(16).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
    try { await link(temporary, tokenFile); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  const token = (await readFile(tokenFile, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("共享闸门密钥无效");
  return { endpoint, token };
}

// 仅对已确定断开的连接重连；不重放可能已在服务端执行的写操作。
export function reconnectingGate(layout, firstClient, connect = connectGate) {
  let client = firstClient, connecting, closed = false;
  return {
    async request(method, data, timeout, options) {
      if (closed) throw new Error("闸门已关闭");
      let current = client;
      if (!current?.connected) {
        connecting ??= connect(layout).then(next => {
          if (closed) { next.close(); throw new Error("闸门已关闭"); }
          client = next;
          return next;
        }).finally(() => { connecting = undefined; });
        current = await connecting;
      }
      try { return await current.request(method, data, timeout, options?.onRequestId
        ? { ...options, onRequestId: id => options.onRequestId(id, current) } : options); }
      catch (error) {
        // 仅重试一次只读操作。写入可能已到达旧 owner，不允许自动重放。
        if (error.code !== "GATE_DISCONNECTED" || !["limits", "view"].includes(method)) throw error;
        if (client !== current && client?.connected) return client.request(method, data, timeout, options);
        if (client === current) client = null;
        connecting ??= connect(layout).then(next => {
          if (closed) { next.close(); throw new Error("闸门已关闭"); }
          client = next;
          return next;
        }).finally(() => { connecting = undefined; });
        return (await connecting).request(method, data, timeout, options);
      }
    },
    close() { closed = true; client?.close(); },
  };
}

export function remoteService(client, initial) {
  let limits = initial.limits;
  const request = (method, data, options) => client.request(method, data, method === "acquire" ? 125000 : 1000, options);
  return {
    async refresh() { const value = await request("limits"); limits = value.limits; },
    gate: {
      get limits() { return limits; },
      async acquire(provider, { kind = "concurrency", model, signal } = {}) {
        if (signal?.aborted) throw signal.reason;
        // 按请求 ID 取消服务端排队；若放行与取消交错，迟到租约仍须归还。
        const result = await new Promise((resolve, reject) => {
          let acquireId, cancelled = false, origin = client;
          // cancel 和 release 属于同一次 socket 上的 acquire；重连后不能转发给新 owner。
          const onOrigin = (method, data) => origin.request(method, data, 1000);
          const abort = () => {
            cancelled = true;
            if (acquireId) void onOrigin("cancel", { acquireId }).catch(() => {});
            reject(signal.reason ?? new Error("已取消"));
          };
          signal?.addEventListener("abort", abort, { once: true });
          request("acquire", { provider, kind, model }, { onRequestId(id, connection) {
            origin = connection ?? client;
            acquireId = id;
            if (cancelled) void onOrigin("cancel", { acquireId }).catch(() => {});
          } }).then(value => {
            signal?.removeEventListener("abort", abort);
            if (signal?.aborted) { void onOrigin("release", { leaseId: value.leaseId }).catch(() => {}); return; }
            resolve({ ...value, release() { void onOrigin("release", { leaseId: value.leaseId }).catch(() => {}); } });
          }, error => { signal?.removeEventListener("abort", abort); reject(error); });
        });
        if (signal?.aborted) { result.release(); throw signal.reason; }
        return result;
      },
      cooldown(provider, durationMs) { return request("cooldown", { provider, durationMs }); },
    },
    store: {
      begin: data => request("begin", { data: { ...data, pid: process.pid } }),
      admit: (requestId, data) => request("admit", { requestId, data }),
      finish: (requestId, data) => request("finish", { requestId, data }),
      attempt: (requestId, data) => request("attempt", { requestId, data }),
      recordGateEvent: data => request("event", { data }),
    },
    async view(filter) { const value = await request("view", { filter }); limits = value.limits; return { ...value, auditFailures: (value.auditFailures ?? 0) + (this.auditFailures ?? 0) }; },
    async configure(value) { const result = await request("configure", { limits: value }); limits = result.limits; return result; },
    close() { client.close(); },
  };
}

export async function shareGate(local, home) {
  // 端点初始化失败时不能启动另一个独立闸门，更不能静默清空限额。
  return claimShared(local, home);
}

async function claimShared(local, home) {
  const layout = await gateLayout(home);
  try {
    const server = await serveGate({ ...layout, service: local });
    const close = local.close.bind(local);
    local.close = async () => { await server.close(); close(); };
    return local;
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    const client = await connectGate(layout);
    const initial = await client.request("limits");
    local.close();
    return remoteService(reconnectingGate(layout, client), initial);
  }
}
