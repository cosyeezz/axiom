import { createServer } from "vite";
import { fileURLToPath, pathToFileURL } from "node:url";

// 独立前端入口；先在另一终端 npm run dev，不启动/停止任何后端进程。
export async function startDevWeb({ port = 5173, backendPort = 4320, watch = true } = {}) {
  for (const value of [port, backendPort]) {
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error("开发端口必须为 1–65535");
  }
  const origin = `http://127.0.0.1:${port}`;
  const target = `http://127.0.0.1:${backendPort}`;
  const local = (req) => req.headers.host === `127.0.0.1:${port}` && (!req.headers.origin || req.headers.origin === origin);
  const proxy = { target, changeOrigin: true, ws: true, rewriteWsOrigin: true };
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../public", import.meta.url)),
    publicDir: false,
    envDir: false,
    appType: "mpa",
    resolve: { alias: [
      { find: "./vendor/marked.js", replacement: fileURLToPath(new URL("../node_modules/marked/lib/marked.esm.js", import.meta.url)) },
      { find: "./vendor/purify.js", replacement: fileURLToPath(new URL("../node_modules/dompurify/dist/purify.es.mjs", import.meta.url)) },
    ] },
    plugins: [{
      name: "axiom-dev-boundaries",
      configureServer(vite) {
        // 必须在代理改写 Origin 前拒绝跨站请求；loopback 绑定本身不防恶意网页。
        vite.middlewares.use((req, res, next) => {
          if (local(req)) return next();
          res.writeHead(403); res.end("仅允许当前开发页面同源访问");
        });
        vite.httpServer.prependListener("upgrade", (req, socket) => {
          if (!local(req)) socket.destroy();
        });
        // ponytail: 尚无完整草稿/附件/阅读锚点持久化，暂停所有整页自动刷新。
        // 将来建立可靠保存/恢复边界后才解除；CSS 更新消息不受影响。
        const send = vite.ws.send.bind(vite.ws);
        vite.ws.send = (...args) => {
          if (args[0]?.type === "full-reload") {
            vite.config.logger.warn("[Axiom] JS/HTML 已变化；自动刷新已暂停，请先保存草稿/附件再手动刷新。");
            return;
          }
          return send(...args);
        };
      },
    }],
    server: {
      host: "127.0.0.1", port, strictPort: true,
      cors: false,
      watch: watch ? {} : null,
      headers: {
        // 仅 dev：Vite CSS 客户端可能注入 style；生产 server.js 的 CSP 完全不变。
        "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port} http://127.0.0.1:*; img-src 'self' data:; frame-ancestors 'none'`,
      },
      proxy: {
        "^/ws$": proxy,
        "^/health$": { target, changeOrigin: true },
        "^/service/stop$": { target, changeOrigin: true },
      },
    },
  });
  await server.listen();
  server.config.logger.info(`[Axiom] ${origin} → ${target}（请另开终端 npm run dev）\nCSS 热替换；JS/HTML 自动刷新暂停，手动刷新前请保存输入。后端不会因前端保存而重启。`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startDevWeb();
}
