// Tailscale 远程访问：独立 HTTP server 只绑定本机 Tailscale IP（严格 100.64.0.0/10），
// 用 `tailscale whois --json IP:port` 验证来源用户的 LoginName（绝不信任客户端请求头）。
// 配置持久化在 AXIOM_HOME/remote.json，默认禁用，只能由本地连接修改；
// 只允许「与本机登录账号同 LoginName」的 tailnet 用户，本机身份变更立即 fail closed。
import { execFile, spawn } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const configSchema = z
  .object({ enabled: z.boolean(), email: z.string().trim().max(254) })
  .strict();

const execOptions = { timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true };
// macOS 的 Tailscale app 内置 CLI 需要 TAILSCALE_BE_CLI=1 才按 CLI 行为运行；其他平台忽略。
const cliEnv = () => ({ ...process.env, TAILSCALE_BE_CLI: "1" });
const defaultRun = (bin, args, options) =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { ...execOptions, env: cliEnv(), ...options }, (error, stdout) =>
      error ? reject(error) : resolve(stdout),
    );
  });

const defaultCandidates = () => {
  const extra = [];
  if (process.platform === "win32") {
    // Git Bash 里 `command -v tailscale` 常见 /c/Program Files/...；Node PATH 解析失败时回退安装目录。
    if (process.env.ProgramFiles) extra.push(join(process.env.ProgramFiles, "Tailscale", "tailscale.exe"));
    extra.push("C:\\Program Files\\Tailscale\\tailscale.exe");
  } else if (process.platform === "darwin") {
    // 官方 app 内置 CLI 与 Homebrew（x64/arm64）安装位置。
    extra.push("/usr/local/bin/tailscale", "/opt/homebrew/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale");
  }
  return extra;
};

// 注入 run/candidates 以便测试 mock；真实环境 execFile（不 shell、5s 超时、输出上限）。
export const createTailscale = (
  bin = process.env.AXIOM_TAILSCALE_BIN || "tailscale",
  run = defaultRun,
  candidates = defaultCandidates(),
) => {
  const options = [...new Set([bin, ...candidates].filter(Boolean))];
  let resolved = null;
  const resolve = async () => {
    if (resolved) return resolved;
    let last = new Error("未找到 tailscale 命令：请先安装并登录 Tailscale");
    last.code = "ENOENT";
    for (const candidate of options) {
      try {
        await run(candidate, ["version"], { timeout: 5000, maxBuffer: 65536 });
        resolved = candidate;
        return candidate;
      } catch (error) {
        last = error;
        if (error?.code !== "ENOENT") {
          resolved = candidate; // 二进制存在但报错：仍选它，让调用方看到真实错误
          return candidate;
        }
      }
    }
    throw last;
  };
  const call = async (args, overrides = {}) =>
    run(await resolve(), args, { ...execOptions, env: cliEnv(), ...overrides });
  return {
    bin: resolve,
    status: async () => JSON.parse(await call(["status", "--json"])),
    whois: async (addrPort) =>
      JSON.parse(await call(["whois", "--json", addrPort], { maxBuffer: 64 * 1024 })),
  };
};

// Tailscale IPv4 固定在 100.64.0.0/10（CGNAT）；拒绝 0.0.0.0/环回/DNS 名等异常值。
export const isTailnetIPv4 = (ip) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip));
  if (!m) return false;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) && o[0] === 100 && o[1] >= 64 && o[1] <= 127;
};

// status --json 输出格式非稳定：逐字段做类型验证，异常一律回退空值（fail closed）。
// AuthURL：tailscaled 已持有的待认证官方链接（https://login.tailscale.com/a/...）可直接复用；
// BackendState：NeedsLogin/NeedsMachineAuth/Stopped/Running 必须区分，Stopped 不等于未登录；
// Self.Tags：本机是 tag 设备（无个人账号）时拒绝整个功能。
export function selfStatus(status) {
  const ips = Array.isArray(status?.TailscaleIPs)
    ? status.TailscaleIPs.filter((ip) => typeof ip === "string" && ip)
    : [];
  const self = status?.Self;
  const dnsName = typeof self?.DNSName === "string" ? self.DNSName.replace(/\.$/, "") : "";
  const userId = self?.UserID;
  const users = status?.User;
  const profile = users && userId != null ? users[userId] : null;
  const authUrl = typeof status?.AuthURL === "string" ? status.AuthURL : "";
  const selfTags = self?.Tags;
  return {
    ip: ips.find((ip) => isTailnetIPv4(ip)) ?? null,
    dnsName,
    loginEmail: typeof profile?.LoginName === "string" ? profile.LoginName : "",
    tagged: Array.isArray(selfTags) ? selfTags.length > 0 : false,
    authUrl: authUrl.startsWith("https://login.tailscale.com/a/") ? authUrl : "",
    backend: typeof status?.BackendState === "string" ? status.BackendState : "",
  };
}

// whois --json → 来源用户；Node/Tags/LoginName 缺失或非法一律按拒绝处理（fail closed）。
export function whoisUser(who) {
  const node = who?.Node;
  const tags = node?.Tags;
  const loginName = who?.UserProfile?.LoginName;
  return {
    loginName: typeof loginName === "string" ? loginName : "",
    // Tailscale 对无标签设备省略 Tags（omitempty）；缺 Node 或非法 Tags 仍拒绝。
    tagged: !node || (tags !== undefined && (!Array.isArray(tags) || tags.length > 0)),
  };
}

const describeError = (error) =>
  error?.code === "ENOENT"
    ? "未找到 tailscale 命令：请先安装并登录 Tailscale"
    : String(error?.message ?? error);

// 登录触发：bare `tailscale up`（无旗标 = 官方语义：只补登录，不改任何既有设置；
// `login` 子命令会先 SwitchToEmptyProfile 并强制重新认证，不可用）。AuthURL 打印在
// stderr（stdout 一并按完整行扫描），拿到 URL 后即可 kill CLI：pending 登录由
// tailscaled 守护进程持有，用户完成浏览器认证即登录成功；up 无超时旗标，
// child 生命周期由 loginTimeoutMs 外部兜底 kill。
const defaultSpawnLogin = (bin) =>
  spawn(bin, ["up"], { env: cliEnv(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
const AUTH_URL = /https:\/\/login\.tailscale\.com\/a\/[0-9a-zA-Z]+/; // 成功 URL 严格限定官方链接

// whois 并发上限：缓存未命中的每个 IP 最多同时 fork 一个进程，超过即拒绝（fail closed）。
export const MAX_WHOIS = 8;
const LOGIN_OUTPUT_CAP = 256 * 1024; // 登录子进程输出总量上限，防无界内存

export async function createRemoteAccess({
  home,
  app,
  tailscale = createTailscale(),
  ttlMs = 30_000,
  spawnLogin = defaultSpawnLogin,
  urlWaitMs = 1500,
  loginTimeoutMs = 150_000,
  bindHost = null, // 测试注入：默认用验证过的本机 Tailscale IP
}) {
  const path = join(home, "remote.json");
  let config = { enabled: false, email: "" };
  try {
    config = configSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    // ponytail: 缺失/损坏一律回退默认禁用（安全侧优先），首次保存即自愈
  }

  let server = null;
  let hosts = [];
  let url = null;
  let error = "";
  let installed = false;
  let loginEmail = "";
  let backend = "";
  let selfTagged = false;
  let authUrl = "";
  let statusAt = 0;
  let refresh = null; // status 刷新 in-flight 去重，防同一瞬间 fork 多个 tailscale status
  let loginSession = null;
  const whoisCache = new Map();
  const inflight = new Map();
  let chain = Promise.resolve();

  const enqueue = (fn) => {
    const result = chain.then(fn, fn);
    chain = result.then(() => {}, () => {});
    return result;
  };

  const hostHeader = (ip, port) =>
    ip.includes(":") ? `[${ip.toLowerCase()}]:${port}` : `${ip.toLowerCase()}:${port}`;

  const whoisOnce = async (ip, port) => {
    const address = ip.includes(":") ? `[${ip}]:${port}` : port ? `${ip}:${port}` : ip;
    const who = whoisUser(await tailscale.whois(address));
    if (whoisCache.size > 1000) whoisCache.clear();
    whoisCache.set(ip, { who, expires: Date.now() + ttlMs });
    return who;
  };
  const whois = (ip, port) => {
    const cached = whoisCache.get(ip);
    if (cached?.expires > Date.now()) return Promise.resolve(cached.who);
    const pending = inflight.get(ip);
    if (pending) return pending; // 连接级去重：同 IP 并发验证共用一次 whois
    if (inflight.size >= MAX_WHOIS)
      return Promise.reject(new Error("whois 并发已达上限")); // 拒绝而非排队，防 fork 风暴
    const task = whoisOnce(ip, port).finally(() => inflight.delete(ip));
    inflight.set(ip, task);
    return task;
  };

  const status = async () => {
    if (Date.now() - statusAt > ttlMs && !refresh) {
      refresh = (async () => {
        statusAt = Date.now();
        try {
          const self = selfStatus(await tailscale.status());
          installed = true;
          loginEmail = self.loginEmail;
          backend = self.backend;
          selfTagged = self.tagged;
          authUrl = self.authUrl;
          // 本机身份变更：旧许可 fail closed。执行时按当前许可重判，
          // 避免与 configure 竞态、把新许可刚启动的 listener 延后关掉。
          if (config.enabled && server && loginEmail) {
            void enqueue(async () => {
              if (!config.enabled || !server) return;
              if (loginEmail && loginEmail.toLowerCase() !== config.email.toLowerCase()) {
                await stop();
                error = `本机 Tailscale 账号已变更（${loginEmail}），远程访问已按原许可停用`;
              }
            });
          }
        } catch (e) {
          installed = false;
          loginEmail = "";
          backend = "";
          selfTagged = false;
          authUrl = "";
          if (!server) error = describeError(e);
        } finally {
          refresh = null;
        }
      })();
    }
    await refresh;
    return {
      enabled: config.enabled,
      email: config.email,
      url,
      installed,
      online: installed && backend === "Running", // Tailscale 运行连接状态
      active: Boolean(server), // 远程访问 server 是否在监听（前端另可用 url 非空判断）
      loginEmail,
      error,
      backend,
      tagged: selfTagged,
      authUrl: loginSession?.url ?? (authUrl || null),
    };
  };

  // 唯一信任来源：socket 对端地址 + tailscaled whois；请求头一律不可信。
  const authorize = async (req) => {
    if (!config.enabled) return false;
    const host = String(req.headers.host || "").toLowerCase();
    if (!hosts.includes(host)) return false;
    const origin = req.headers.origin;
    if (origin && origin.toLowerCase() !== `http://${host}`) return false;
    const ip = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    if (!ip || !config.email) return false;
    let who;
    try {
      who = await whois(ip, req.socket.remotePort);
    } catch {
      return false; // 非 tailnet 来源、限流、tailscale 不可用：一律拒绝
    }
    if (who.tagged) return false;
    if (who.loginName.toLowerCase() !== config.email.toLowerCase()) return false;
    const self = await status(); // 本机账号仍须与许可一致且 backend Running（NeedsLogin 旧档案不放行）
    return (
      self.online === true &&
      !self.tagged && // 本机是 tag 设备：无个人账号，整体拒绝
      self.loginEmail.toLowerCase() === config.email.toLowerCase()
    );
  };

  const start = async () => {
    error = "";
    let self;
    try {
      self = selfStatus(await tailscale.status());
      installed = true;
    } catch (e) {
      installed = false;
      error = describeError(e);
      return false;
    }
    loginEmail = self.loginEmail;
    backend = self.backend;
    selfTagged = self.tagged;
    authUrl = self.authUrl;
    if (self.tagged) {
      error = "本机是 tag 设备（无个人 Tailscale 账号），远程访问不可用";
      return false;
    }
    if (!self.loginEmail) {
      error =
        self.backend === "NeedsMachineAuth"
          ? "本机设备待在 Tailscale 管理后台授权（NeedsMachineAuth）"
          : "本机 Tailscale 未登录";
      return false;
    }
    // Stopped 不清空身份：账号仍在，只是未连接；不能误导用户重新登录。
    if (self.backend === "Stopped") {
      error = "Tailscale 已停用（Stopped），请先在官方客户端恢复连接";
      return false;
    }
    if (!self.ip) {
      // selfStatus 仅接受 100.64.0.0/10 真实 v4；0.0.0.0/DNS/环回等异常值都落到这里。
      error = "未获取到本机 Tailscale IP（100.64.0.0/10；tailscale 可能未连接）";
      return false;
    }
    if (self.loginEmail.toLowerCase() !== config.email.toLowerCase()) {
      error = `本机 Tailscale 账号（${self.loginEmail}）与允许邮箱（${config.email}）不一致，保持停用`;
      return false;
    }
    const host = bindHost ?? self.ip;
    const rs = app.createRemoteServer(authorize);
    try {
      await new Promise((resolve, reject) => {
        const fail = (e) => reject(e);
        rs.once("error", fail);
        // 与本地 server 同端口（绑定 IP 不同不冲突）；本地未监听时回退临时端口（仅测试场景）。
        const port = app.server?.address()?.port ?? 0;
        rs.listen({ host, port }, () => {
          rs.off("error", fail);
          resolve();
        });
      });
    } catch (e) {
      rs.close(); // 释放失败的 server 引用，否则之后重试会命中「已在运行」
      error = `远程 server 监听 ${host} 失败：${describeError(e)}`;
      return false;
    }
    const bound = rs.address();
    hosts = [
      hostHeader(host, bound.port),
      self.dnsName ? `${self.dnsName.toLowerCase()}:${bound.port}` : null,
    ].filter(Boolean);
    url = `http://${host.includes(":") ? `[${host}]` : host}:${bound.port}`;
    server = rs;
    return true;
  };

  const stop = async () => {
    app.dropRemote(); // 任何变更都立即断开旧远程连接并作废在途鉴权（generation 递增）
    if (server) {
      const closing = new Promise((done) => server.close(done));
      server.closeAllConnections();
      await closing;
    }
    server = null;
    hosts = [];
    url = null;
  };

  // 串行化所有更改（先校验再持久化后应用），避免并发互相覆盖。
  const configure = (request) =>
    enqueue(async () => {
      const enabled = Boolean(request.enabled);
      const email = String(request.email ?? "").trim();
      // LoginName 不一定是传统邮箱（如 GitHub 登录为 alice@github），只做最宽松校验。
      if (enabled && !email.includes("@"))
        throw new Error("启用远程访问需要 Tailscale LoginName（如 user@example.com 或 alice@github）");
      if (enabled) {
        statusAt = 0; // 强制取最新本机账号
        const fresh = await status();
        if (!fresh.installed) throw new Error("未找到 tailscale 命令：请先安装 Tailscale");
        if (fresh.tagged) throw new Error("本机是 tag 设备（无个人 Tailscale 账号），远程访问不可用");
        if (!fresh.loginEmail) throw new Error("本机 Tailscale 未登录，请先完成登录");
        if (fresh.loginEmail.toLowerCase() !== email.toLowerCase())
          throw new Error(`允许邮箱须与本机登录账号一致（当前登录：${fresh.loginEmail}）`);
      }
      const next = { enabled, email };
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
      await rename(temporary, path); // 临时文件 + rename 原子落盘
      config = next;
      await stop();
      whoisCache.clear();
      if (enabled) await start();
      return status();
    });

  // remote.login：仅本地显式触发的登录（固定 argv：bare up，不改任何网络配置）。
  // 按完整行有界扫描 stdout/stderr 提取官方 AuthURL；child 生命周期有界（timer 兜底 kill），
  // 进行中重复调用复用同一会话；收到完整换行即返回。
  const endLogin = () => {
    const session = loginSession;
    loginSession = null;
    if (!session) return;
    clearTimeout(session.timer);
    try {
      session.child?.kill?.();
    } catch {}
    session.wake?.(); // 唤醒等待者，避免悬挂
  };
  const login = async () => {
    statusAt = 0; // 强制取最新登录态
    const fresh = await status();
    if (fresh.tagged)
      return {
        state: "unavailable",
        loginEmail: "",
        authUrl: "",
        guidance: "本机是 tag 设备（无个人 Tailscale 账号），无需登录",
      };
    if (fresh.installed && fresh.loginEmail)
      return { state: "logged-in", loginEmail: fresh.loginEmail, authUrl: "" };
    if (loginSession) return { state: "pending", loginEmail: "", authUrl: loginSession.url ?? "" };
    // tailscaled 已持有待认证的官方 AuthURL：直接复用，避免多余 fork up。
    if (fresh.authUrl) return { state: "pending", loginEmail: "", authUrl: fresh.authUrl };
    let bin;
    try {
      bin = await tailscale.bin();
    } catch {
      return {
        state: "unavailable",
        loginEmail: "",
        authUrl: "",
        guidance: "未找到 tailscale 命令：请安装官方 Tailscale 客户端",
      };
    }
    let child;
    try {
      child = await spawnLogin(bin);
    } catch {
      return {
        state: "unavailable",
        loginEmail: "",
        authUrl: "",
        guidance: "无法启动 tailscale 命令行：请打开官方 Tailscale 客户端完成登录",
      };
    }
    const session = { child, url: null, closed: false, timer: null, output: 0, wake: null };
    const waitForUrl = new Promise((done) => {
      session.wake = done;
    });
    loginSession = session;
    session.timer = setTimeout(endLogin, loginTimeoutMs); // 外部有界兜底 kill
    const scanners = [];
    const scanLine = (line) => {
      const found = line.match(AUTH_URL);
      if (found && !session.url) session.url = found[0];
    };
    const attach = (stream) => {
      if (!stream?.on) return;
      const state = { rest: "" };
      const scanner = {
        feed(chunk) {
          state.rest += chunk.toString("utf8");
          const lines = state.rest.split("\n"); // chunk 可能截断 URL，按完整行提取
          state.rest = lines.pop() ?? "";
          for (const line of lines) scanLine(line);
        },
        flush() {
          scanLine(state.rest);
        },
      };
      scanners.push(scanner);
      stream.on("data", (chunk) => {
        session.output += chunk.length;
        if (session.output > LOGIN_OUTPUT_CAP) {
          session.closed = true;
          session.wake?.();
          endLogin(); // 有界：输出异常膨胀即终止
          return;
        }
        scanner.feed(chunk);
        if (session.url) session.wake?.(); // 收到完整行即返回，不空等窗口
      });
    };
    attach(child.stdout);
    attach(child.stderr);
    const finish = () => {
      session.closed = true;
      for (const scanner of scanners) scanner.flush();
      session.wake?.();
      if (loginSession === session) endLogin();
    };
    child.on?.("error", finish);
    child.on?.("close", finish);
    let waitTimer;
    await Promise.race([waitForUrl, new Promise((done) => { waitTimer = setTimeout(done, urlWaitMs); })]);
    clearTimeout(waitTimer);
    if (!session.url && session.closed)
      return {
        state: "unavailable",
        loginEmail: "",
        authUrl: "",
        guidance:
          "tailscale 登录命令已退出且未给出登录链接：请确认 Tailscale 服务正在运行，或打开官方客户端完成登录",
      };
    // authUrl 空串 = 仍在获取中，前端稍后重试 remote.login 或轮询 remote.get。
    return { state: "pending", loginEmail: "", authUrl: session.url ?? "" };
  };

  const shutdown = () => endLogin(); // 进程退出时清理登录子进程

  if (config.enabled) await start();

  return { authorize, configure, status, login, shutdown };
}
