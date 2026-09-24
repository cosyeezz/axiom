import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createSender } from "./transport.js";
import { WebSocketServer, WebSocket } from "ws";
import { command } from "./protocol.js";
import { ACTIVE_TASK_STATES } from "./task-execution.js";
import { createModelAuthService } from "./model-auth.js";

// 开发模式下前端资源按 mtime 惰性重读（改完刷新页面即可，不必重启服务）；
// 生产沿用启动期预读，请求路径上零额外 IO。
const dev = process.env.AXIOM_DEV === "1";
const digest = (body) => `"${createHash("sha256").update(body).digest("base64url")}"`;
const load = (file) => {
  const url = new URL(`../${file}`, import.meta.url);
  const body = readFileSync(url);
  return { url, body, etag: digest(body), mtime: dev ? statSync(url).mtimeMs : 0 };
};
const freshen = (asset) => {
  if (!dev) return;
  try {
    const mtime = statSync(asset.url).mtimeMs;
    if (mtime === asset.mtime) return;
    const body = readFileSync(asset.url);
    Object.assign(asset, { body, etag: digest(body), mtime });
  } catch {} // 编辑器保存瞬间可能读到临时缺失：保留上一版，下次请求再取
};

const assets = new Map(
  [
    ["/", "public/index.html", "text/html"],
    ["/favicon.svg", "public/favicon.svg", "image/svg+xml"],
    ["/style.css", "public/style.css", "text/css"],
    ["/theme.js", "public/theme.js"],
    ["/app.js", "public/app.js"],
    ["/composer-controls.js", "public/composer-controls.js"],
    ["/composer-controls.css", "public/composer-controls.css", "text/css"],
    ["/icons.js", "public/icons.js"],
    ["/session-cache.js", "public/session-cache.js"],
    ["/session-details.js", "public/session-details.js"],
    ["/compaction-view.js", "public/compaction-view.js"],
    ["/transport.js", "public/transport.js"],
    ["/todo.js", "public/todo.js"],
    ["/todo.css", "public/todo.css", "text/css"],
    ["/question.js", "public/question.js"],
    ["/question.css", "public/question.css", "text/css"],
    ["/service-settings.js", "public/service-settings.js"],
    ["/usage-audit.js", "public/usage-audit.js"],
    ["/file-picker.js", "public/file-picker.js"],
    ["/tooltip.js", "public/tooltip.js"],
    ["/tooltip.css", "public/tooltip.css", "text/css"],
    ["/file-picker.css", "public/file-picker.css", "text/css"],
    ["/markdown.js", "public/markdown.js"],
    ["/stream-renderer.js", "public/stream-renderer.js"],
    ["/stream-playback.js", "public/stream-playback.js"],
    ["/markdown-scan.js", "public/markdown-scan.js"],
    ["/memory-tags.js", "public/memory-tags.js"],
    ["/clipboard.js", "public/clipboard.js"],
    ["/answer-tags.js", "public/answer-tags.js"],
    ["/vendor/marked.js", "node_modules/marked/lib/marked.esm.js"],
    ["/vendor/purify.js", "node_modules/dompurify/dist/purify.es.mjs"],
  ].map(([route, file, type = "text/javascript"]) => [route, { type, ...load(file) }]),
);

// 模型管理器/选择器（前端可选资源）：落地后重启生效，缺失时安全跳过、请求 404。
for (const [route, file, type = "text/javascript"] of [
  ["/model-manager.js", "public/model-manager.js"],
  ["/model-limits.js", "public/model-limits.js"],
  ["/model-auth.js", "public/model-auth.js"],
  ["/model-manager.css", "public/model-manager.css", "text/css"],
  ["/model-picker.js", "public/model-picker.js"],
  ["/model-picker.css", "public/model-picker.css", "text/css"],
]) {
  try {
    assets.set(route, { type, ...load(file) });
  } catch {} // 未落地：不注册路由
}

export function createServerApp(sessions, service = {}) {
  const sender = createSender();
  const instanceId = service.instanceId || randomUUID();
  const modelAuth = createModelAuthService({ auth: sessions.createAgent,
    onChanged: () => broadcast({ type: "models.config.changed" }) });
  let stopping = false, closing = false;
  let remoteServer = null;
  let remoteAuthorize = null;
  let generation = 0; // 每次停用/变更递增，作废在途的异步鉴权
  const pending = new Set();
  const remoteClients = new Set();
  const hasActiveWork = () => sessions.list().some((item) => item.status !== "idle") ||
    [...(sessions.items?.values() || [])].some((item) => item.configuring || item.loading ||
      item.notifying || item.todoScheduled || item.notificationScheduled ||
      [...(item.tasks?.jobs.values() || [])].some((task) => ACTIVE_TASK_STATES.includes(task.status)));
  const handleRequest = (req, res, isLocal) => {
    if (req.url === "/service/stop") {
      if (!isLocal) {
        res.writeHead(403);
        res.end();
        return;
      }
      const host = req.headers.host;
      const port = server.address().port;
      if (req.method !== "POST" || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) ||
          (req.headers.origin && req.headers.origin !== `http://${host}`)) {
        res.writeHead(403); res.end(); return;
      }
      if (!service.stop || stopping) {
        res.writeHead(409); res.end("服务不受守护进程管理或正在停止"); return;
      }
      if (hasActiveWork()) {
        res.writeHead(409); res.end("还有任务正在运行，请先停止任务再执行 axiom stop"); return;
      }
      stopping = true;
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ service: "axiom", pid: service.supervisorPid }));
      service.stop();
      return;
    }
    const asset = assets.get(req.url);
    if (asset) {
      freshen(asset);
      const unchanged = req.headers["if-none-match"] === asset.etag;
      res.writeHead(unchanged ? 304 : 200, {
        "Content-Type": `${asset.type}; charset=utf-8`,
        "Cache-Control": "no-cache",
        ETag: asset.etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          // img-src 加 data: 仅为显示消息内嵌的 base64 图片预览，其余策略不放宽。
          `default-src 'self'; connect-src 'self'${isLocal && /^http:\/\/127\.0\.0\.1:\d+$/.test(service.maintenance?.url || "") ? ` ${service.maintenance.url}` : ""}; img-src 'self' data:; frame-ancestors 'none'`,
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
        ...(req.url === "/health" && service.instanceId ? { instanceId: service.instanceId, version: service.version } : {}),
      }),
    );
  };
  const server = createServer((req, res) => handleRequest(req, res, true));
  const wss = new WebSocketServer({
    noServer: true,
    // 4 张 × 5MiB 图片 base64 后约 27MiB，预留 JSON 结构余量。
    maxPayload: 32 * 1024 * 1024,
    perMessageDeflate: false,
    handleProtocols: () => "axiom",
  });
  const acceptUpgrade = (req, socket, head, isRemote) => {
    if (closing || req.url !== "/ws") {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (isRemote) {
        ws.isRemote = true;
        ws.upgradeSocket = socket; // 供连接后周期重验读取对端地址（ws 包不暴露 .socket）
        remoteClients.add(ws);
        ws.on("close", () => remoteClients.delete(ws));
      }
      wss.emit("connection", ws, req); // 传递 upgrade 请求供远程连接周期性重验
    });
  };
  // 广播给所有客户端（跨窗口共享）：models.config.changed / models.favorites.changed。
  const broadcast = (message) => {
    sender.broadcast(wss.clients, message);
  };
  server.on("upgrade", (req, socket, head) => {
    // 服务可经 AXIOM_HOST 绑定内网/远程地址供桌面壳或其他设备直连，故不再限定 loopback Host；
    // 同源校验仍保留（Origin 必须与 Host 同源，或无 Origin 的非浏览器客户端），防跨源页面接入。
    const host = req.headers.host;
    const allowed =
      typeof host === "string" && host.length > 0 &&
      (!req.headers.origin ||
        req.headers.origin === `http://${host}` ||
        req.headers.origin === `https://${host}`);
    if (!allowed) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    acceptUpgrade(req, socket, head, false);
  });
  // 远程 server 与本地共用同一请求处理与 wss；准入前多一道 tailscale whois 验证。
  const createRemoteServer = (authorize) => {
    if (remoteServer) throw new Error("远程 server 已在运行");
    remoteAuthorize = authorize;
    const rejectSocket = (socket) =>
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    // 异步鉴权等待期间若发生停用/许可变更（generation 变化），不得再放行。
    const guarded = async (req) => {
      const atStart = generation;
      const ok = await authorize(req);
      return ok && atStart === generation;
    };
    const rs = createServer((req, res) => {
      guarded(req).then(
        (ok) => {
          if (!ok) {
            res.writeHead(403);
            res.end();
            return;
          }
          handleRequest(req, res, false);
        },
        () => {
          res.writeHead(403);
          res.end();
        },
      );
    });
    rs.on("upgrade", (req, socket, head) => {
      guarded(req).then(
        (ok) => {
          if (ok) acceptUpgrade(req, socket, head, true);
          else rejectSocket(socket);
        },
        () => rejectSocket(socket),
      );
    });
    rs.on("close", () => {
      if (remoteServer === rs) remoteServer = null;
    });
    remoteServer = rs;
    return rs;
  };
  const dropRemote = () => {
    generation += 1; // 停用/变更即作废在途鉴权
    for (const ws of remoteClients) ws.terminate();
  };
  wss.on("connection", (ws, source) => {
    let unsubscribe, attachSequence = 0;
    // 远程连接：每条消息与每 30s 重验身份（whois/status 按 IP 短 TTL 缓存，代价有界），
    // 撤权后的旧连接最多存活一个 TTL。
    const reauth = async () => {
      if (!ws.isRemote) return true;
      if (!remoteAuthorize || ws.readyState !== WebSocket.OPEN) return false;
      const atStart = generation;
      try {
        const allowed = await remoteAuthorize({
          headers: { host: source?.headers?.host },
          socket: {
            remoteAddress: ws.upgradeSocket?.remoteAddress,
            remotePort: ws.upgradeSocket?.remotePort,
          },
        });
        return allowed && atStart === generation && ws.readyState === WebSocket.OPEN;
      } catch {
        return false;
      }
    };
    let reauthTimer;
    if (ws.isRemote) {
      reauthTimer = setInterval(() => {
        reauth().then((ok) => {
          if (!ok) ws.terminate();
        });
      }, 30_000);
      ws.on("close", () => clearInterval(reauthTimer));
    }
    const send = (message) => sender.send(ws, message);
    const attach = async (id) => {
      const sequence = ++attachSequence;
      // 先订阅再取快照；未加载会话只读 JSONL，不为浏览历史恢复 SDK 或唤醒任务。
      // create() 后续恢复时沿用 stub 的 listener 集合。
      unsubscribe?.();
      unsubscribe = sessions.subscribe(id, send);
      if (ws.readyState !== WebSocket.OPEN) return;
      if (sequence !== attachSequence) throw new Error("会话切换已被后续请求替代");
      return sessions.snapshot(id, { epoch: instanceId });
    };
    ws.on("error", () => {});
    ws.on("close", () => {
      modelAuth.close(ws);
      unsubscribe?.();
    });
    ws.on("message", (raw) => {
      const work = (async () => {
        let request, requestId;
        try {
          const input = JSON.parse(raw.toString());
          if (typeof input?.id === "string" && input.id.length <= 200) requestId = input.id;
          request = command.parse(input);
          if (stopping && request.type !== "service.status") throw new Error("服务正在维护，请在设置中查看进度");
          if (!(await reauth())) {
            ws.terminate(); // 撤权/变更后旧远程连接立即失效
            return;
          }
          // reauth 是异步边界：同一轮多个请求可能都通过最前面的检查。
          if (stopping && request.type !== "service.status") throw new Error("服务正在维护，请在设置中查看进度");
          let data;
          switch (request.type) {
            case "service.status":
              data = { managed: Boolean(service.restart) && !ws.isRemote, error: service.error || "", version: service.version || "", importDir: service.importDir || "", dev: Boolean(service.dev), ...(!ws.isRemote && service.maintenance ? { maintenance: service.maintenance } : {}) };
              break;
            case "service.update.check":
              if (ws.isRemote) throw new Error("请在本机检查服务更新");
              if (service.dev) throw new Error("开发环境通过 Git 更新，不执行安装版更新");
              if (!service.checkUpdate) throw new Error("更新检查不可用");
              data = await service.checkUpdate();
              break;
            case "service.restart":
              if (ws.isRemote) throw new Error("远程连接不允许重启服务");
              if (!service.restart) throw new Error("请通过 npm start 启动服务后再使用重启功能");
              if (request.mode === "update" && service.dev) throw new Error("开发环境不执行安装版更新");
              if (request.mode === "update" && !request.sha) throw new Error("请先检查更新并确认目标版本");
              if (hasActiveWork())
                throw new Error("还有会话正在运行，请先停止所有任务再重启");
              stopping = true;
              try { data = { restarting: true, ...await service.restart(request.mode, request.sha) }; }
              catch (error) { stopping = false; throw error; }
              break;
            case "capabilities.list":
              data = await sessions.createAgent.capabilities(request.cwd, request.trustProject);
              // 全局默认编辑器不能选中服务启动目录的项目资源。
              if (!request.cwd) data = { ...data, ...Object.fromEntries(
                ["skills", "mcp", "plugins"].map((kind) => [kind, data[kind].filter((entry) => entry.scope !== "project")]),
              ) };
              break;
            case "files.browse":
              data = await sessions.listFiles(request);
              break;
            case "workspace.reveal":
              data = await sessions.revealWorkspace(request.sessionId);
              break;
            case "workspace.browse":
              data = await sessions.browse(request.sessionId, request.path, request.query);
              break;
            case "models.list":
              // 隐藏清单只影响这里（模型选择器等选取入口），Pi 运行时目录不动。
              data = service.models ? service.models.listCatalog() : sessions.createAgent.catalog();
              break;
            case "models.auth.list":
            case "models.auth.start":
            case "models.auth.status":
            case "models.auth.respond":
            case "models.auth.cancel":
            case "models.auth.logout":
              data = await modelAuth.handle(request, ws);
              break;
            case "models.config.get":
            case "models.provider.discover":
            case "models.provider.save":
            case "models.provider.delete":
            case "models.model.override":
            case "models.model.save":
            case "models.model.delete":
            case "models.favorites.get":
            case "models.favorites.set":
            case "models.hidden.set": {
              if (!service.models) throw new Error("模型配置服务未启用");
              data = await service.models.handle(request);
              if (!["models.config.get", "models.favorites.get", "models.provider.discover"].includes(request.type)) {
                if (request.type === "models.favorites.set")
                  broadcast({ type: "models.favorites.changed", data });
                else broadcast({ type: "models.config.changed" });
              }
              break;
            }
            case "usage.backfill":
              if (!service.usage?.backfill) throw new Error("请在共享闸门所属实例导入历史");
              data = await service.usage.backfill();
              break;
            case "usage.get":
              if (!service.usage) throw new Error("用量服务未启用");
              data = await service.usage.view(request);
              break;
            case "usage.configure":
              if (!service.usage) throw new Error("用量服务未启用");
              data = await service.usage.configure(request.limits);
              broadcast({ type: "usage.changed" });
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
            case "task.budget.get":
              data = sessions.getTaskBudget();
              break;
            case "task.budget.configure":
              data = await sessions.configureTaskBudget(request.budget);
              break;
            case "session.defaults.get":
              data = request.cwd ? await sessions.workspaceDefaults(request.cwd) : sessions.getDefaults();
              break;
            case "session.defaults.configure":
              data = await sessions.configureDefaults(request.cwd, request);
              break;
            case "session.defaults.list":
              data = sessions.listDefaults();
              break;
            case "session.defaults.delete":
              data = await sessions.deleteDefaults(request.cwd);
              break;
            case "session.create": {
              const id = await sessions.create(request.cwd, request, undefined, true);
              if (ws.readyState !== WebSocket.OPEN) {
                await sessions.remove(id);
                return;
              }
              data = await attach(id);
              break;
            }
            case "session.import": {
              const id = await sessions.importSession(request.path, request.cwd);
              if (ws.readyState !== WebSocket.OPEN) {
                await sessions.remove(id);
                return;
              }
              data = await attach(id);
              break;
            }
            case "session.points":
              data = await sessions.safePoints(request.sessionId);
              break;
            case "session.revert":
              data = await sessions.revert(request.sessionId, request.entryId);
              break;
            case "session.fork":
              data = await sessions.fork(request.sessionId, request.entryId);
              break;
            case "session.continue":
              data = await sessions.continueFromPoint(request.sessionId);
              break;
            case "session.duplicate": {
              const id = await sessions.duplicate(request.sessionId);
              if (ws.readyState !== WebSocket.OPEN) {
                await sessions.remove(id);
                return;
              }
              data = await attach(id);
              break;
            }
            case "session.attach":
              data = await attach(request.sessionId);
              break;
            case "session.compaction.messages":
              data = await sessions.compactionMessages(request.sessionId, request.compactionId);
              break;
            case "session.compaction.attempt":
              data = await sessions.compactionAttempt(request.sessionId, request.runId, request.knownRequests, request.revision);
              break;
            case "session.compaction.start":
              data = await sessions.startCompaction(request.sessionId, request.mode);
              break;
            case "session.compaction.cancel":
              data = await sessions.cancelCompaction(request.sessionId, request.runId);
              break;
            case "session.skills.refresh":
              data = { skills: await sessions.refreshSkills(request.sessionId) };
              break;
            case "session.close":
              await sessions.remove(request.sessionId);
              sender.broadcast(wss.clients, { type: "session.deleted", sessionId: request.sessionId }, ws);
              break;
            case 'todo.action':
              data = await sessions.todoAction(request.sessionId, request.action, request.text);
              break;
            case 'todo.get': {
              const { id, type, sessionId, itemId, ...query } = request;
              data = (await sessions.ensureLoaded(sessionId)).todo.read({ ...query, ...(itemId ? { id: itemId } : {}) });
              break;
            }
            case "prompt":
              data = {
                runId: await sessions.prompt(request.sessionId, request.text, request.queueType, request.images),
              };
              break;
            case "queue.withdraw":
              data = await sessions.withdraw(request.sessionId, request.recall);
              break;
            case "question.reply":
              data = sessions.replyQuestion(request.sessionId, request.toolCallId, request.answers);
              break;
            case "cancel":
              if (request.mode === "safe") await sessions.safeStop(request.sessionId);
              else await sessions.cancel(request.sessionId);
              break;
            case "session.retry":
              data = { runId: await sessions.retry(request.sessionId) };
              break;
            case "task.cancel":
              data = await sessions.cancelTask(request.sessionId, request.taskId, { mode: request.mode, reason: request.reason });
              break;
            case "task.append":
              data = await sessions.appendTask(request.sessionId, request.taskId, request.text, request.mode);
              break;
            case "task.retry":
              data = await sessions.retryTask(request.sessionId, request.taskId);
              break;
            case "tasks.read":
              data = (await sessions.ensureLoaded(request.sessionId)).tasks.read(request.taskId, request.resultId);
              break;
            case "remote.get":
              data = {
                enabled: false,
                email: "",
                url: null,
                installed: false,
                online: false,
                active: false,
                loginEmail: "",
                error: "",
                backend: "",
                tagged: false,
                authUrl: null,
                ...(service.remoteStatus ? await service.remoteStatus() : {}),
                // 本地连接 true；经 Tailscale 远程 server 接入的连接为 false，
                // 前端据此隐藏远程配置管理入口（远程用户也不允许调用 remote.configure/login）。
                local: !ws.isRemote,
                ...(ws.isRemote ? { authUrl: null } : {}),
              };
              break;
            case "remote.configure":
              if (ws.isRemote) throw new Error("远程连接不允许修改远程访问配置");
              if (!service.remoteConfigure) throw new Error("远程访问功能不可用");
              data = { ...await service.remoteConfigure(request), local: true };
              break;
            case "remote.login":
              if (ws.isRemote) throw new Error("远程连接不允许触发登录");
              if (!service.remoteLogin) throw new Error("远程访问功能不可用");
              data = { ...await service.remoteLogin(), local: true };
              break;
          }
          send({ type: "response", id: request.id, ok: true, data });
          // 首屏回执先发出；进程准备失败作为会话事件报告，不阻塞打开 UI。
          if (["session.create", "session.attach"].includes(request.type)) {
            const id = data.sessionId;
            setImmediate(() => {
              // 只有确知会话已被移除才跳过；Sessions 替身（预览/测试桩）没有 items 时照旧走后台装配。
              if (closing || sessions.items?.has(id) === false) return;
              void sessions.ensureLoaded(id).catch(error => send({ type: "error", sessionId: id,
                data: { message: `会话后台启动失败：${error.message}` } }));
            });
          }
        } catch (error) {
          send({
            type: "response",
            id: request?.id ?? requestId,
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
    createRemoteServer,
    dropRemote,
    resume() { stopping = false; },
    // 先关闭新写请求入口，再等已接受请求及任务收尾；状态读取仍可用。
    prepareStop() { stopping = true; },
    hasActiveWork: () => pending.size > 0 || hasActiveWork(),
    async close() {
      closing = true;
      stopping = true;
      service.remoteShutdown?.(); // 清理登录子进程
      dropRemote();
      const remoteClosed = remoteServer
        ? new Promise((done) => {
            remoteServer.closeAllConnections();
            remoteServer.close(done);
          })
        : null;
      const stopped = new Promise((done) => server.close(done));
      for (const ws of wss.clients) ws.terminate();
      await Promise.all([...pending]);
      await sessions.close();
      await stopped;
      if (remoteClosed) await remoteClosed;
      await new Promise((done) => wss.close(done));
    },
  };
}
