import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { connectGate, serveGate } from "./gate-ipc.js";

// 用户级固定端点，不随 AXIOM_HOME/dev/prod 改变。Windows 权限依赖用户目录 ACL。
export async function gateLayout() {
  const dir = join(homedir(), ".axiom-gate");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const key = createHash("sha256").update(homedir().toLowerCase()).digest("hex").slice(0, 24);
  const endpoint = process.platform === "win32" ? `\\\\.\\pipe\\axiom-usage-${key}` : join(dir, "gate.sock");
  const tokenFile = join(dir, "token");
  try { await writeFile(tokenFile, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  // 首个进程创建文件到写完之间存在短窗口；只重读，不覆盖别人的密钥。
  for (let i = 0; i < 5; i++) {
    const token = (await readFile(tokenFile, "utf8")).trim();
    if (/^[a-f0-9]{64}$/.test(token)) return { endpoint, token };
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("共享闸门密钥无效");
}

export function remoteService(client, initial) {
  let limits = initial.limits;
  const request = (method, data) => client.request(method, data, method === "acquire" ? 125000 : 1000);
  return {
    async refresh() { const value = await request("view"); limits = value.limits; },
    gate: {
      get limits() { return limits; },
      async acquire(provider, { kind = "concurrency", signal } = {}) {
        if (signal?.aborted) throw signal.reason;
        // 取消关闭专属连接会影响共享客户端，采用取消后归还 + 服务端TTL兜底。
        const result = await new Promise((resolve, reject) => {
          const abort = () => reject(signal.reason ?? new Error("已取消"));
          signal?.addEventListener("abort", abort, { once: true });
          request("acquire", { provider, kind }).then(value => {
            signal?.removeEventListener("abort", abort);
            if (signal?.aborted) { void request("release", { leaseId: value.leaseId }).catch(() => {}); return; }
            resolve(value);
          }, error => { signal?.removeEventListener("abort", abort); reject(error); });
        });
        if (signal?.aborted) { await request("release", { leaseId: result.leaseId }); throw signal.reason; }
        return { ...result, release() { void request("release", { leaseId: result.leaseId }).catch(() => {}); } };
      },
      cooldown(provider, durationMs) { return request("cooldown", { provider, durationMs }); },
    },
    store: {
      begin: data => request("begin", { data }),
      admit: (requestId, data) => request("admit", { requestId, data }),
      finish: (requestId, data) => request("finish", { requestId, data }),
      attempt: (requestId, data) => request("attempt", { requestId, data }),
      recordGateEvent: data => request("event", { data }),
    },
    async view(filter) { const value = await request("view", { filter }); limits = value.limits; return value; },
    async configure(value) { const result = await request("configure", { limits: value }); limits = result.limits; return result; },
    close() { client.close(); },
  };
}

export async function shareGate(local) {
  try { return await claimShared(local); }
  catch {
    console.warn("共享闸门不可用：本实例暂不限流，仅保留本地用量记录");
    local.gate.configure({});
    return local;
  }
}

async function claimShared(local) {
  const layout = await gateLayout();
  try {
    const server = await serveGate({ ...layout, service: local });
    const close = local.close.bind(local);
    local.close = async () => { await server.close(); close(); };
    return local;
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    const client = await connectGate(layout);
    const initial = await client.request("view");
    local.close();
    return remoteService(client, initial);
  }
}
