// 独立 loopback 维护入口：随机端口，token 经 env 告知 worker。
// host/origin/token 三重校验（host 最先），任一失败一律 404 空响应——不暴露路径与存在性。
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { sanitize } from "./maint-state.mjs";

const MAX_BODY = 1024;
const hash = (value) => createHash("sha256").update(value).digest();
const json = (res, code, payload, allow) => {
  allow();
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

export async function startMaintServer({ state, token, origins = [], recover, redactions = [] }) {
  const tokenHash = hash(token);
  const server = createServer((req, res) => {
    const fail = () => { res.writeHead(404); res.end(); };
    // host 校验最先（含预检），origin 其次，任何不匹配直接 404。
    if (req.headers.host !== `127.0.0.1:${server.address().port}`) return fail();
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) return fail();
    const allow = () => {
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
    };
    // 预检不带 Authorization：host/origin 已过即可放行预检。
    if (req.method === "OPTIONS") {
      allow();
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
      });
      return res.end();
    }
    const match = /^Bearer (.+)$/s.exec(req.headers.authorization || "");
    if (!match || match[1].length !== token.length || !timingSafeEqual(hash(match[1]), tokenHash)) return fail();
    let pathname;
    try { pathname = new URL(req.url, "http://maint").pathname; }
    catch { return fail(); }
    if (req.method === "GET" && pathname === "/status") {
      allow();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(state.data));
    }
    if (req.method === "POST" && pathname === "/recover") {
      if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) return fail();
      let body = "", overflow = false;
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) { overflow = true; req.destroy(); } // 超限直接断开，不回包
      });
      return req.on("end", () => {
        if (overflow) return;
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = undefined; }
        // 严格对象：拒绝数组/原始值/多余键。
        const mode = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.mode : undefined;
        if (typeof mode !== "string" || !["quick", "rebuild"].includes(mode) ||
            Object.keys(parsed).some((key) => key !== "mode"))
          return json(res, 400, { error: 'body 必须是 {"mode":"quick"} 或 {"mode":"rebuild"}' }, allow);
        let result;
        try { result = recover(mode); }
        // 500 报文也脱敏：错误信息可能含安装/用户路径，页面不可见源码位置。
        catch (error) { return json(res, 500, { error: `恢复请求处理失败：${sanitize(error.message, redactions)}` }, allow); }
        if (result.error) return json(res, result.code ?? 409, { error: result.error }, allow);
        return json(res, 202, { accepted: true, mode, operationId: result.operationId }, allow);
      });
    }
    fail();
  });
  // 慢请求（慢速发体/慢loris）到期直接销毁 socket，而非仅标记空闲。
  server.setTimeout(5000, (socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  origins.push(url); // 自身源同样允许（同源 fetch 场景）
  return { url, close: () => new Promise((done) => server.close(done)) };
}
