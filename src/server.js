import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { command } from "./protocol.js";

const assets = new Map(
  [
    ["/", "public/index.html", "text/html"],
    ["/favicon.svg", "public/favicon.svg", "image/svg+xml"],
    ["/style.css", "public/style.css", "text/css"],
    ["/app.js", "public/app.js"],
    ["/markdown.js", "public/markdown.js"],
    ["/stream-renderer.js", "public/stream-renderer.js"],
    ["/vendor/marked.js", "node_modules/marked/lib/marked.esm.js"],
    ["/vendor/purify.js", "node_modules/dompurify/dist/purify.es.mjs"],
  ].map(([route, file, type = "text/javascript"]) => {
    const body = readFileSync(new URL(`../${file}`, import.meta.url));
    const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
    return [route, { type, body, etag }];
  }),
);

export function createServerApp(sessions) {
  let stopping = false;
  const pending = new Set();
  const server = createServer((req, res) => {
    const asset = assets.get(req.url);
    if (asset) {
      const unchanged = req.headers["if-none-match"] === asset.etag;
      res.writeHead(unchanged ? 304 : 200, {
        "Content-Type": `${asset.type}; charset=utf-8`,
        "Cache-Control": "no-cache",
        ETag: asset.etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; connect-src 'self'; frame-ancestors 'none'",
      });
      res.end(unchanged ? undefined : asset.body);
      return;
    }
    res.writeHead(req.url === "/health" ? 200 : 404, {
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify({
        service: "axiom",
        status: req.url === "/health" ? "ok" : "not_found",
      }),
    );
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
    handleProtocols: () => "axiom",
  });
  server.on("upgrade", (req, socket, head) => {
    const port = server.address().port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const localRequest =
      hosts.includes(req.headers.host) &&
      (!req.headers.origin ||
        req.headers.origin === `http://${req.headers.host}`);
    if (stopping || req.url !== "/ws" || !localRequest) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", (ws) => {
    let unsubscribe;
    const disconnected = new AbortController();
    const send = (message) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Bound network buffering, not task output; reconnect retrieves the current snapshot.
      if (ws.bufferedAmount > 8 * 1024 * 1024) {
        ws.terminate();
        return;
      }
      ws.send(JSON.stringify(message));
    };
    const attach = (id) => {
      sessions.get(id);
      unsubscribe?.();
      unsubscribe = sessions.subscribe(id, send);
      return sessions.snapshot(id);
    };
    ws.on("error", () => {});
    ws.on("close", () => {
      disconnected.abort();
      unsubscribe?.();
    });
    ws.on("message", (raw) => {
      const work = (async () => {
        let request;
        try {
          if (stopping) throw new Error("Service is stopping");
          request = command.parse(JSON.parse(raw.toString()));
          let data;
          switch (request.type) {
            case "capabilities.list":
              data = await sessions.createAgent.capabilities(request.cwd, request.trustProject);
              break;
            case "workspace.pick":
              data = await sessions.pickWorkspace();
              break;
            case "workspace.reveal":
              data = await sessions.revealWorkspace(request.sessionId);
              break;
            case "workspace.browse":
              data = await sessions.browse(request.sessionId, request.path);
              break;
            case "models.list":
              data = sessions.createAgent.catalog();
              break;
            case "sessions.list":
              data = sessions.list();
              break;
            case "session.rename":
              data = await sessions.rename(request.sessionId, request.title);
              break;
            case "session.configure":
              data = await sessions.configure(request.sessionId, request);
              break;
            case "session.defaults.get":
              data = sessions.getDefaults();
              break;
            case "session.defaults.configure":
              data = await sessions.configureDefaults(request.cwd, request);
              break;
            case "session.create": {
              const id = await sessions.create(request.cwd, request);
              if (ws.readyState !== WebSocket.OPEN) {
                await sessions.remove(id);
                return;
              }
              data = attach(id);
              break;
            }
            case "session.attach":
              data = attach(request.sessionId);
              break;
            case "session.close":
              await sessions.remove(request.sessionId);
              break;
            case "prompt":
              data = {
                runId: await sessions.prompt(request.sessionId, request.text, request.queueType),
              };
              break;
            case "queue.withdraw":
              data = sessions.get(request.sessionId).agent.withdraw();
              break;
            case "cancel":
              await sessions.cancel(request.sessionId);
              break;
            case "tasks.read":
              data = await sessions
                .get(request.sessionId)
                .tasks.read(request.taskIds, request.wait, disconnected.signal);
              break;
          }
          send({ type: "response", id: request.id, ok: true, data });
        } catch (error) {
          send({
            type: "response",
            id: request?.id,
            ok: false,
            error: String(error.message ?? error),
          });
        }
      })();
      pending.add(work);
      void work.finally(() => pending.delete(work));
    });
  });
  return {
    server,
    async close() {
      stopping = true;
      const stopped = new Promise((done) => server.close(done));
      for (const ws of wss.clients) ws.terminate();
      await Promise.all([...pending]);
      await sessions.close();
      await stopped;
      await new Promise((done) => wss.close(done));
    },
  };
}
