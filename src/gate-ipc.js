import net from "node:net";
import { randomUUID, timingSafeEqual } from "node:crypto";

const MAX_LINE = 65536;
const authenticated = (actual, expected) => typeof actual === "string" && Buffer.byteLength(actual) === Buffer.byteLength(expected)
  && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));

// 每条连接拥有自己的租约集合；断线取消排队并归还所有已发令牌。
export async function serveGate({ endpoint, token, service }) {
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    const controller = new AbortController(), leases = new Map(), acquisitions = new Map();
    let buffer = "", pending = 0;
    const send = data => { if (!socket.destroyed) socket.write(`${JSON.stringify(data)}\n`); };
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    socket.on("close", () => { sockets.delete(socket); controller.abort(); for (const lease of leases.values()) lease.release(); leases.clear(); });
    socket.on("data", chunk => {
      buffer += chunk;
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n"), line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (Buffer.byteLength(line) > MAX_LINE) { socket.destroy(); return; }
        let request;
        try { request = JSON.parse(line); } catch { socket.destroy(); return; }
        if (!authenticated(request.token, token) || typeof request.id !== "string" || ++pending > 256) { socket.destroy(); return; }
        void (async () => {
          try {
            let data;
            switch (request.method) {
              case "acquire": {
                if (typeof request.provider !== "string" || request.provider.length > 200 || !["rpm", "concurrency"].includes(request.kind)) throw new Error("invalid acquire");
                if (request.model !== undefined && (typeof request.model !== "string" || request.model.length > 1000)) throw new Error("invalid model");
                if (acquisitions.has(request.id)) throw new Error("duplicate acquire id");
                const abort = new AbortController();
                const onClose = () => abort.abort();
                controller.signal.addEventListener("abort", onClose, { once: true });
                acquisitions.set(request.id, abort);
                let lease;
                try { lease = await service.gate.acquire(request.provider, { kind: request.kind, model: request.model, signal: abort.signal }); }
                finally { acquisitions.delete(request.id); controller.signal.removeEventListener("abort", onClose); }
                if (socket.destroyed || abort.signal.aborted) { lease.release(); return; }
                const leaseId = randomUUID();
                if (request.kind === "concurrency") leases.set(leaseId, lease);
                data = { leaseId, waitMs: lease.waitMs, queueDepth: lease.queueDepth, bypassed: lease.bypassed };
                break;
              }
              case "release": leases.get(request.leaseId)?.release(); leases.delete(request.leaseId); data = {}; break;
              case "cancel": acquisitions.get(request.acquireId)?.abort(); data = {}; break;
              case "limits": data = { limits: service.gate.limits }; break;
              case "view": data = service.view(request.filter ?? {}); break;
              case "configure": data = service.configure(request.limits); break;
              case "begin":
                if (request.data?.pid !== undefined && (!Number.isSafeInteger(request.data.pid) || request.data.pid <= 0)) throw new Error("invalid pid");
                data = service.store.begin(request.data); break;
              case "admit": service.store.admit(request.requestId, request.data); data = {}; break;
              case "finish": service.store.finish(request.requestId, request.data); data = {}; break;
              case "attempt": service.store.attempt(request.requestId, request.data); data = {}; break;
              case "cooldown": service.gate.cooldown(request.provider, request.durationMs); data = {}; break;
              case "event": service.store.recordGateEvent(request.data); data = {}; break;
              default: throw new Error("unknown method");
            }
            send({ id: request.id, data });
          } catch { send({ id: request.id, error: "闸门操作失败" }); }
          finally { pending--; }
        })();
      }
      if (Buffer.byteLength(buffer) > MAX_LINE) socket.destroy();
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(endpoint, () => { server.removeListener("error", reject); resolve(); }); });
  return { close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve); }) };
}

export async function connectGate({ endpoint, token, connectTimeoutMs = 1000, timeoutMs = 125000 }) {
  const socket = net.createConnection(endpoint);
  socket.on("error", () => {});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("闸门连接超时")); }, connectTimeoutMs);
    socket.once("error", fail); socket.once("connect", () => { clearTimeout(timer); socket.removeListener("error", fail); resolve(); });
    function fail(error) { clearTimeout(timer); reject(error); }
  });
  const pending = new Map(), expiredAcquires = new Set(); let buffer = "";
  socket.setEncoding("utf8"); socket.on("error", () => {});
  socket.on("close", () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Object.assign(new Error("闸门连接已断开"), { code: "GATE_DISCONNECTED" })); } pending.clear(); expiredAcquires.clear(); });
  socket.on("data", chunk => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n"), line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      if (Buffer.byteLength(line) > 8 * 1024 * 1024) { socket.destroy(); return; }
      let response; try { response = JSON.parse(line); } catch { socket.destroy(); return; }
      const item = pending.get(response.id);
      if (!item) {
        if (expiredAcquires.delete(response.id) && response.data?.leaseId && !socket.destroyed)
          socket.write(`${JSON.stringify({ id: randomUUID(), method: "release", leaseId: response.data.leaseId, token })}\n`);
        continue;
      }
      pending.delete(response.id); clearTimeout(item.timer);
      if (response.error) item.reject(new Error(response.error)); else item.resolve(response.data);
    }
    if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) socket.destroy();
  });
  return {
    request(method, data = {}, waitMs = timeoutMs, { onRequestId } = {}) {
      if (socket.destroyed) return Promise.reject(Object.assign(new Error("闸门不可用"), { code: "GATE_DISCONNECTED" }));
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          // 仅取消这一笔；迟到的 acquire 成功响应仍需归还令牌，不能关闭持有其他租约的共享连接。
          if (method === "acquire" && !socket.destroyed) {
            expiredAcquires.add(id);
            socket.write(`${JSON.stringify({ id: randomUUID(), method: "cancel", acquireId: id, token })}\n`);
          }
          reject(new Error("闸门响应超时"));
        }, waitMs);
        pending.set(id, { resolve, reject, timer });
        socket.write(`${JSON.stringify({ ...data, id, method, token })}\n`);
        onRequestId?.(id);
      });
    },
    get connected() { return !socket.destroyed; },
    close() { socket.destroy(); },
  };
}
