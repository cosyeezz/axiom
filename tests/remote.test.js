// Tailscale 远程访问：认证/绕过/持久化/撤权/登录 全链路测试（全 mock，不装不登录 tailscale）。
// 运行：npm test（node --test tests/*.test.js）
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { createServerApp } from "../src/server.js";
import {
  MAX_WHOIS,
  createRemoteAccess,
  createTailscale,
  isTailnetIPv4,
  selfStatus,
  whoisUser,
} from "../src/remote.js";

const EMAIL = "user@example.com";

const mockTailscale = () => {
  const state = {
    fail: false,
    loginEmail: EMAIL,
    ips: ["100.84.72.19", "fd7a:1ac6::1"],
    whoisCalls: 0,
    hang: false,
  };
  const peers = {
    "100.64.0.10": { LoginName: EMAIL },
    "100.64.0.11": { LoginName: EMAIL.toUpperCase() }, // LoginName 大小写不敏感
    "100.64.0.12": { LoginName: "evil@example.com" }, // 同 tailnet 其他用户
    "100.64.0.13": { LoginName: EMAIL, tagged: true }, // tag 设备
    "100.64.0.14": { LoginName: "alice@github" }, // 非传统邮箱的 LoginName
  };
  return {
    state,
    bin: async () => {
      if (state.fail) {
        const e = new Error("spawn tailscale ENOENT");
        e.code = "ENOENT";
        throw e;
      }
      return "mock-tailscale";
    },
    status: async () => {
      if (state.fail) {
        const e = new Error("spawn tailscale ENOENT");
        e.code = "ENOENT";
        throw e;
      }
      return {
        BackendState: state.loginEmail ? "Running" : "NeedsLogin",
        TailscaleIPs: state.ips,
        AuthURL: "",
        Self: { DNSName: "axiom-host.tailnet.ts.net.", UserID: 1, Online: true, Tags: [] },
        User: { "1": { LoginName: state.loginEmail } },
      };
    },
    whois: async (addr) => {
      state.whoisCalls += 1;
      while (state.hang) await new Promise((r) => setTimeout(r, 5));
      const ip = addr.replace(/^\[/, "").replace(/\]:/, ":").replace(/:\d+$/, "");
      const peer = peers[ip] ?? (ip === "127.0.0.1" ? { LoginName: state.loginEmail } : null);
      if (!peer) throw new Error(`unable to determine peer for ${addr}`);
      return {
        Node: peer.tagged ? { Tags: ["tag:server"] } : {},
        UserProfile: { LoginName: peer.LoginName },
      };
    },
  };
};

const fakeChild = (output) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    if (child.killed) return true;
    child.killed = true;
    queueMicrotask(() => child.emit("close", 1));
    return true;
  };
  // 宏任务发射：保证 login() 里 attach 监听先于数据到达
  if (output) setTimeout(() => child.stderr.emit("data", Buffer.from(output)), 0);
  return child;
};

// 共享 SQLite 最小接口 mock：get(namespace,key) / set(namespace,key,value)，带调用计数。
const fakeDatabase = () => {
  const store = new Map();
  const calls = { get: 0, set: 0 };
  return {
    store,
    calls,
    get: async (ns, key) => {
      calls.get += 1;
      return store.get(`${ns}/${key}`) ?? null;
    },
    set: async (ns, key, value) => {
      calls.set += 1;
      store.set(`${ns}/${key}`, String(value));
    },
  };
};

// bindHost=127.0.0.1 仅为可测试性；生产绑定 mock 状态里的 100.84.72.19。
const setup = async ({
  email = EMAIL,
  loginEmail,
  ttlMs = 15_000,
  urlWaitMs = 20,
  loginTimeoutMs = 150_000,
  spawnLogin,
} = {}) => {
  const home = await mkdtemp(join(tmpdir(), "axiom-remote-"));
  const ts = mockTailscale();
  if (loginEmail !== undefined) ts.state.loginEmail = loginEmail;
  const service = {};
  const app = createServerApp({ close: async () => {} }, service);
  const remote = await createRemoteAccess({
    home,
    app,
    tailscale: ts,
    ttlMs,
    urlWaitMs,
    loginTimeoutMs,
    bindHost: "127.0.0.1",
    spawnLogin,
  });
  // 与 main.js 的 initRemote 一致：把远程访问能力接入 server 的 service 钩子
  service.remoteStatus = remote.status;
  service.remoteConfigure = remote.configure;
  service.remoteLogin = remote.login;
  service.remoteShutdown = remote.shutdown;
  if (email !== null) await remote.configure({ enabled: true, email });
  return {
    ts,
    home,
    app,
    remote,
    async close() {
      await app.close().catch(() => {});
      await rm(home, { recursive: true, force: true });
    },
  };
};

const wsRequest = (ws, value) =>
  new Promise((resolve) => {
    const on = (raw) => {
      const m = JSON.parse(raw);
      if (m.type === "response" && m.id === value.id) {
        ws.off("message", on);
        resolve(m);
      }
    };
    ws.on("message", on);
    ws.send(JSON.stringify(value));
  });

test("selfStatus/whoisUser/isTailnetIPv4 严密字段验证（status/whois 输出非稳定）", () => {
  assert.deepEqual(
    selfStatus({
      BackendState: "Running",
      TailscaleIPs: ["100.84.1.2", "fd7a::1", "0.0.0.0", "999.1.1.1", "not-an-ip"],
      AuthURL: "https://login.tailscale.com/a/abc123",
      Self: { DNSName: "host.x.ts.net.", UserID: 7, Tags: [] },
      User: { "7": { LoginName: "u@e.c" } },
    }),
    {
      ip: "100.84.1.2",
      dnsName: "host.x.ts.net",
      loginEmail: "u@e.c",
      tagged: false,
      authUrl: "https://login.tailscale.com/a/abc123",
      backend: "Running",
    },
  );
  // 异常值 fail closed：空对象、非法 IP、AuthURL 非官方域名、tag 本机
  assert.deepEqual(selfStatus({}), {
    ip: null,
    dnsName: "",
    loginEmail: "",
    tagged: false,
    authUrl: "",
    backend: "",
  });
  assert.deepEqual(
    selfStatus({ TailscaleIPs: ["0.0.0.0", "127.0.0.1"], Self: 3, User: "x" }),
    { ip: null, dnsName: "", loginEmail: "", tagged: false, authUrl: "", backend: "" },
  );
  assert.equal(selfStatus({ AuthURL: "https://evil.example/a/x" }).authUrl, "");
  assert.equal(selfStatus({ Self: { Tags: ["tag:ci"] } }).tagged, true);

  assert.deepEqual(whoisUser({ Node: { Tags: [] }, UserProfile: { LoginName: "a@b" } }), {
    loginName: "a@b",
    tagged: false,
  });
  // 普通设备真实输出省略 Tags；缺 Node/身份或非法标签仍不允许访问。
  assert.equal(whoisUser({}).tagged, true);
  assert.deepEqual(whoisUser({ Node: {}, UserProfile: { LoginName: "a@b" } }), { loginName: "a@b", tagged: false });
  assert.equal(whoisUser({ Node: { Tags: null } }).tagged, true);
  assert.equal(whoisUser({ Node: { Tags: "x" }, UserProfile: { LoginName: 5 } }).tagged, true);
  assert.equal(whoisUser({ Node: { Tags: ["tag:x"] }, UserProfile: { LoginName: "a@b" } }).tagged, true);
  assert.equal(whoisUser().tagged, true);

  assert.equal(isTailnetIPv4("100.64.0.1"), true);
  assert.equal(isTailnetIPv4("100.127.255.254"), true);
  assert.equal(isTailnetIPv4("100.63.0.1"), false);
  assert.equal(isTailnetIPv4("100.128.0.0"), false);
  assert.equal(isTailnetIPv4("127.0.0.1"), false);
  assert.equal(isTailnetIPv4("0.0.0.0"), false);
  assert.equal(isTailnetIPv4("fd7a::1"), false);
  assert.equal(isTailnetIPv4("axiom-host.ts.net"), false);
  assert.equal(isTailnetIPv4(""), false);
});

test("默认禁用；配置原子持久化（0600/无临时残留）；串行 FIFO；重载自动上线；损坏回退", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "axiom-remote-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const app = createServerApp({ close: async () => {} });
  t.after(() => app.close());
  const remote = await createRemoteAccess({ home, app, tailscale: mockTailscale(), bindHost: "127.0.0.1" });

  let s = await remote.status();
  assert.equal(s.enabled, false);
  assert.equal(s.active, false);
  assert.equal(s.installed, true);
  assert.equal(s.online, true); // Tailscale 连接状态（mock Running）
  assert.equal(s.loginEmail, EMAIL); // 本机账号自动可见
  assert.equal(s.authUrl, null);

  await remote.configure({ enabled: true, email: EMAIL });
  const file = join(home, "remote.json");
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { enabled: true, email: EMAIL });
  if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);
  s = await remote.status();
  assert.equal(s.enabled, true);
  assert.equal(s.active, true);
  assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+$/);

  // 串行 FIFO：先禁用后启用，最终必须是启用
  await Promise.all([
    remote.configure({ enabled: false }),
    remote.configure({ enabled: true, email: EMAIL }),
  ]);
  assert.equal((await remote.status()).enabled, true);
  assert.equal((await readdir(home)).filter((f) => f.endsWith(".tmp")).length, 0);

  // 新实例读取同一配置 → 自动上线（持久化生效，重启后地址不变：与本地同端口）
  await app.close();
  const app2 = createServerApp({ close: async () => {} });
  t.after(() => app2.close());
  const remote2 = await createRemoteAccess({
    home,
    app: app2,
    tailscale: mockTailscale(),
    bindHost: "127.0.0.1",
  });
  assert.equal((await remote2.status()).active, true);

  // 损坏文件 → 回退默认禁用（fail closed）
  await writeFile(file, "{oops", "utf8");
  const app3 = createServerApp({ close: async () => {} });
  t.after(() => app3.close());
  const remote3 = await createRemoteAccess({
    home,
    app: app3,
    tailscale: mockTailscale(),
    bindHost: "127.0.0.1",
  });
  const broken = await remote3.status();
  assert.equal(broken.enabled, false);
  assert.equal(broken.active, false);
});

test("共享 database：幂等导入旧 JSON 且旧文件只读；SQLite 唯一权威；configure 只写库", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "axiom-remote-db-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const file = join(home, "remote.json");
  await writeFile(file, JSON.stringify({ enabled: true, email: EMAIL }, null, 2) + "\n", "utf8");
  const original = await readFile(file, "utf8");
  const db = fakeDatabase();
  const create = async () => {
    const app = createServerApp({ close: async () => {} });
    t.after(() => app.close());
    return createRemoteAccess({ home, app, database: db, tailscale: mockTailscale(), bindHost: "127.0.0.1" });
  };

  // 首次启动：从旧 JSON 幂等导入，enabled 许可自动上线
  const remote = await create();
  let s = await remote.status();
  assert.equal(s.enabled, true);
  assert.equal(s.active, true);
  assert.deepEqual(JSON.parse(db.store.get("remote/config")), { enabled: true, email: EMAIL });
  assert.equal(await readFile(file, "utf8"), original); // 旧文件只读保留，未被改写

  // 重启：SQLite 权威，旧 JSON 改动被忽略且不重复导入
  await writeFile(file, JSON.stringify({ enabled: false, email: "evil@example.com" }), "utf8");
  const stale = await readFile(file, "utf8");
  const remote2 = await create();
  s = await remote2.status();
  assert.equal(s.enabled, true);
  assert.equal(s.active, true);
  assert.equal(db.calls.set, 1); // 幂等：未再次导入

  // configure：只写 SQLite，旧 JSON 保持只读，无临时文件残留
  await remote2.configure({ enabled: false });
  s = await remote2.status();
  assert.equal(s.enabled, false);
  assert.equal(s.active, false);
  assert.deepEqual(JSON.parse(db.store.get("remote/config")), { enabled: false, email: "" });
  assert.equal(await readFile(file, "utf8"), stale);
  assert.equal((await readdir(home)).filter((f) => f.endsWith(".tmp")).length, 0);
});

test("共享 database：无旧 JSON 默认禁用并落库；损坏 SQLite 值 fail closed", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "axiom-remote-db2-"));
  t.after(() => rm(home, { recursive: true, force: true }));

  // 库与旧文件皆空：导入默认禁用并固化，不产生 remote.json
  const db = fakeDatabase();
  const app = createServerApp({ close: async () => {} });
  t.after(() => app.close());
  const remote = await createRemoteAccess({ home, app, database: db, tailscale: mockTailscale(), bindHost: "127.0.0.1" });
  const s = await remote.status();
  assert.equal(s.enabled, false);
  assert.equal(s.active, false);
  assert.deepEqual(JSON.parse(db.store.get("remote/config")), { enabled: false, email: "" });
  assert.equal(await readdir(home).then((f) => f.includes("remote.json")), false);

  // 库中值损坏：同 JSON 损坏策略，回退默认禁用（fail closed）
  const db2 = fakeDatabase();
  db2.store.set("remote/config", "{oops");
  const app2 = createServerApp({ close: async () => {} });
  t.after(() => app2.close());
  const remote2 = await createRemoteAccess({ home, app: app2, database: db2, tailscale: mockTailscale(), bindHost: "127.0.0.1" });
  const broken = await remote2.status();
  assert.equal(broken.enabled, false);
  assert.equal(broken.active, false);
});

test("whois 认证：同账号放行；tag/他账号/未启用/伪造头/Host/Origin 拒绝；缓存与并发上限", async (t) => {
  const fx = await setup();
  t.after(() => fx.close());
  let port = new URL(await fx.remote.status().then((s) => s.url)).port;
  const req = (ip, headers = {}, remotePort = 5555) => ({
    headers: { host: `127.0.0.1:${port}`, ...headers },
    socket: { remoteAddress: ip, remotePort },
  });

  assert.equal(await fx.remote.authorize(req("100.64.0.10")), true); // 同邮箱
  assert.equal(await fx.remote.authorize(req("100.64.0.11")), true); // 大小写不敏感
  assert.equal(await fx.remote.authorize(req("100.64.0.12")), false); // 同 tailnet 他账号
  assert.equal(await fx.remote.authorize(req("100.64.0.13")), false); // tag 设备
  assert.equal(await fx.remote.authorize(req("100.64.0.99")), false); // 非 tailnet 来源（whois 失败）
  assert.equal(await fx.remote.authorize(req("100.64.0.14")), false); // alice@github ≠ 本账号

  // Host 白名单 / Origin 同源校验
  assert.equal(await fx.remote.authorize(req("100.64.0.10", { host: "evil.example:1" })), false);
  assert.equal(await fx.remote.authorize(req("100.64.0.10", { origin: "http://evil.example" })), false);
  assert.equal(
    await fx.remote.authorize(req("100.64.0.10", { origin: `http://127.0.0.1:${port}` })),
    true,
  );
  // IPv4-mapped IPv6 来源地址归一化
  assert.equal(await fx.remote.authorize(req("::ffff:100.64.0.10")), true);

  // 客户端伪造头绝不生效：来源仍是他账号
  assert.equal(
    await fx.remote.authorize(
      req("100.64.0.12", {
        "x-tailscale-user": EMAIL,
        "x-webauth-user": EMAIL,
        "x-forwarded-for": "100.64.0.10",
      }),
    ),
    false,
  );

  // 未启用时一律拒绝（含同账号）；重启用后远程 server 端口会换新（测试特有：本地未监听回退临时端口），需刷新
  await fx.remote.configure({ enabled: false });
  assert.equal(await fx.remote.authorize(req("100.64.0.10")), false);
  await fx.remote.configure({ enabled: true, email: EMAIL });
  port = new URL((await fx.remote.status()).url).port;

  // whois 结果 TTL 缓存：同 IP 不重复 fork（configure 会清缓存，先预热一次）
  await fx.remote.authorize(req("100.64.0.10"));
  const before = fx.ts.state.whoisCalls;
  await fx.remote.authorize(req("100.64.0.10"));
  assert.equal(fx.ts.state.whoisCalls, before);

  // 并发上限：同 IP 去重 + 超上限 fail closed
  fx.ts.state.hang = true;
  const beforeHang = fx.ts.state.whoisCalls;
  const pending = Array.from({ length: MAX_WHOIS + 6 }, (_, i) =>
    fx.remote.authorize(req(`100.99.0.${i + 1}`)).catch(() => false),
  );
  await new Promise((r) => setTimeout(r, 40)); // 让 MAX 个进入挂起，其余被 cap 拒绝
  assert.equal(fx.ts.state.whoisCalls - beforeHang, MAX_WHOIS); // 恰好 MAX 个在飞
  fx.ts.state.hang = false; // 解除挂起，全部收尾为拒绝
  const results = await Promise.all(pending);
  assert.equal(results.filter(Boolean).length, 0);
});

test("远程 HTTP/WS 需验证且受限；本地 server 不受影响", async (t) => {
  const fx = await setup();
  t.after(() => fx.close());
  const { url } = await fx.remote.status();
  assert.equal((await fetch(`${url}/health`)).status, 200); // 本机来源 = 同账号

  // 远程入口禁用服务管理
  assert.equal((await fetch(`${url}/service/stop`, { method: "POST" })).status, 403);

  // 外来 Origin 的 WS 握手 401
  const bad = new WebSocket(`${url.replace("http", "ws")}/ws`, { origin: "https://evil.example" });
  bad.on("error", () => {});
  const [, res] = await once(bad, "unexpected-response");
  assert.equal(res.statusCode, 401);
  bad.terminate();

  // 远程 WS：remote.get 可读（local:false），configure/login/restart 全被拒
  const ws = new WebSocket(`${url.replace("http", "ws")}/ws`);
  await once(ws, "open");
  const got = await wsRequest(ws, { id: "1", type: "remote.get" });
  assert.equal(got.ok, true);
  assert.deepEqual(got.data, {
    enabled: true,
    email: EMAIL,
    url,
    installed: true,
    online: true,
    active: true,
    loginEmail: EMAIL,
    error: "",
    backend: "Running",
    tagged: false,
    authUrl: null,
    local: false,
  });
  const deniedConfigure = await wsRequest(ws, {
    id: "2",
    type: "remote.configure",
    enabled: false,
    email: EMAIL,
  });
  assert.equal(deniedConfigure.ok, false);
  assert.match(deniedConfigure.error, /远程连接不允许修改/);
  const deniedLogin = await wsRequest(ws, { id: "3", type: "remote.login" });
  assert.equal(deniedLogin.ok, false);
  const deniedRestart = await wsRequest(ws, { id: "4", type: "service.restart", mode: "quick" });
  assert.equal(deniedRestart.ok, false);
  ws.close();

  // 本地 server 一切照旧：remote.get local:true，configure 可用
  await new Promise((done) => fx.app.server.listen(0, "127.0.0.1", done));
  const localPort = fx.app.server.address().port;
  const lws = new WebSocket(`ws://127.0.0.1:${localPort}/ws`);
  await once(lws, "open");
  const localGet = await wsRequest(lws, { id: "1", type: "remote.get" });
  assert.equal(localGet.data.local, true);
  lws.close();
});

test("remote.login：未登录复用/新取官方 authUrl；已登录返回空；缺失给指引；child 有界", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "axiom-remote-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const ts = mockTailscale();
  ts.state.loginEmail = ""; // 未登录
  ts.state.ips = [];
  const app = createServerApp({ close: async () => {} });
  t.after(() => app.close());
  const spawned = [];
  let output = "To authenticate, visit:\n\n\thttps://login.tailscale.com/a/0987654321abcdef\n";
  const remote = await createRemoteAccess({
    home,
    app,
    tailscale: ts,
    urlWaitMs: 500,
    bindHost: "127.0.0.1",
    spawnLogin: async () => {
      const c = fakeChild(output);
      spawned.push(c);
      return c;
    },
  });

  // 1) 未登录 → pending + 严格官方 authUrl
  const first = await remote.login();
  assert.equal(first.state, "pending");
  assert.match(first.authUrl, /^https:\/\/login\.tailscale\.com\/a\/[0-9a-zA-Z]+$/);

  // 2) 进行中重复点击 → 同一会话同一 URL，不重复 fork
  const again = await remote.login();
  assert.equal(again.state, "pending");
  assert.equal(again.authUrl, first.authUrl);
  assert.equal(spawned.length, 1);

  // 3) URL 跨 chunk 截断也能按完整行提取（收到换行即返回）
  spawned[0].emit("close", 0); // 结束第一会话
  await remote.status();
  output = "";
  const third = remote.login();
  setTimeout(() => {
    const c = spawned[spawned.length - 1]; // remote 实际创建的 child
    c.stderr.emit("data", Buffer.from("visit https://login.tail"));
    setTimeout(() => c.stderr.emit("data", Buffer.from("scale.com/a/ff0099aabb\n")), 5);
  }, 0);
  const thirdResult = await third;
  assert.equal(thirdResult.state, "pending");
  assert.equal(thirdResult.authUrl, "https://login.tailscale.com/a/ff0099aabb");
  spawned[spawned.length - 1].emit("close", 0); // 结束第三会话，避免下一登录复用
  await new Promise((r) => setTimeout(r, 5));

  // 4) child 退出且无 URL → unavailable + 指引
  const beforeCount = spawned.length;
  const exitedPromise = remote.login();
  const exitedChild = await new Promise((done) => {
    const check = () => (spawned.length > beforeCount ? done(spawned[spawned.length - 1]) : setTimeout(check, 2));
    check();
  });
  exitedChild.emit("close", 1);
  const exited = await exitedPromise;
  assert.equal(exited.state, "unavailable");
  assert.equal(exited.authUrl, "");
  assert.match(exited.guidance, /登录链接|客户端/);

  // 5) 登录完成（status 报告 loginEmail）→ logged-in，authUrl 空，不再 fork
  const before = spawned.length;
  ts.state.loginEmail = EMAIL;
  ts.state.ips = ["100.84.72.19"];
  const done = await remote.login();
  assert.equal(done.state, "logged-in");
  assert.equal(done.loginEmail, EMAIL);
  assert.equal(done.authUrl, "");
  assert.equal(spawned.length, before);

  // 6) 未登录且 status.AuthURL 为空 → fork up 获取 URL（已持有时 login 入口直接复用，不 fork）
  ts.state.loginEmail = "";
  ts.state.ips = [];
  const reuse = await remote.login();
  assert.equal(reuse.state, "pending");
  assert.equal(reuse.authUrl, ""); // mock 未打印，仍在获取
  assert.equal(spawned.length, before + 1);
  spawned[before].emit("close", 1);
  await remote.status();

  // 7) CLI 缺失 → unavailable + 安装指引
  ts.state.fail = true;
  const missing = await remote.login();
  assert.equal(missing.state, "unavailable");
  assert.equal(missing.authUrl, "");
  assert.match(missing.guidance, /安装|客户端/);
  ts.state.fail = false;
});

test("remote.login：生命周期有界（超时 kill）；app.close 清理登录子进程", async (t) => {
  {
    const fx = await setup({
      email: null,
      loginEmail: "",
      urlWaitMs: 10,
      loginTimeoutMs: 40,
      spawnLogin: async () => fakeChild(""),
    });
    t.after(() => fx.close());
    const r = await fx.remote.login();
    assert.equal(r.state, "pending");
    assert.equal(r.authUrl, ""); // 还没打印
    await new Promise((r2) => setTimeout(r2, 90));
    const s = await fx.remote.status();
    assert.equal(s.authUrl, null); // 会话已超时回收
  }
  {
    // app.close() 必须终止登录子进程
    const home = await mkdtemp(join(tmpdir(), "axiom-remote-"));
    t.after(() => rm(home, { recursive: true, force: true }));
    const ts = mockTailscale();
    ts.state.loginEmail = "";
    ts.state.ips = [];
    const service = {};
    const app = createServerApp({ close: async () => {} }, service);
    let child;
    const remote = await createRemoteAccess({
      home,
      app,
      tailscale: ts,
      urlWaitMs: 10,
      bindHost: "127.0.0.1",
      spawnLogin: async () => (child = fakeChild("")),
    });
    service.remoteShutdown = remote.shutdown; // main.js 同款接线
    await remote.login();
    await app.close();
    assert.equal(child.killed, true);
  }
});

test("撤权 fail closed：本机身份变更 → 停用并断开旧远程连接；未登录不可开启", async (t) => {
  // alice@github 这类非传统邮箱 LoginName 也可作为本机账号（无 TLD 校验）
  const fx = await setup({ email: "alice@github", loginEmail: "alice@github", ttlMs: 1 });
  t.after(() => fx.close());
  assert.equal((await fx.remote.status()).active, true);

  // 允许他人账号 → 服务端拒绝（同账号需求）
  await assert.rejects(
    () => fx.remote.configure({ enabled: true, email: "friend@example.com" }),
    /一致|账号/,
  );

  // 本机身份变更（换账号登录）→ 旧许可立即失效，远程连接被断开
  const ws = new WebSocket(`${(await fx.remote.status()).url.replace("http", "ws")}/ws`);
  await once(ws, "open");
  const wsClosed = once(ws, "close"); // 提前注册：停用可能先于断言完成
  fx.ts.state.loginEmail = "someone-else@example.com";
  // fail closed 最多两个 status 周期生效（探测→串行队列执行停用），轮询至收敛
  let s;
  for (let i = 0; i < 10; i++) {
    s = await fx.remote.status();
    if (!s.active) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(s.active, false);
  assert.equal(s.online, true); // Tailscale 本身仍在运行（语义与远程 server 无关）
  assert.match(s.error, /变更|停用/);
  await wsClosed; // 旧远程连接立即断开

  // 未登录不可开启；空 LoginName 拒绝
  const fx2 = await setup({ email: null, loginEmail: "" });
  t.after(() => fx2.close());
  await assert.rejects(() => fx2.remote.configure({ enabled: true, email: "x@example.com" }), /未登录/);
  await assert.rejects(() => fx2.remote.configure({ enabled: true, email: "" }), /LoginName/);
});

test("配置变更/停用立即断开旧远程连接；后续请求拒绝", async (t) => {
  const fx = await setup({ ttlMs: 1 });
  t.after(() => fx.close());
  const ws = new WebSocket(`${(await fx.remote.status()).url.replace("http", "ws")}/ws`);
  await once(ws, "open");
  const wsClosed = once(ws, "close"); // 提前注册：配置变更可能先于断言完成
  await fx.remote.configure({ enabled: true, email: EMAIL }); // 任意配置变更都断旧连接
  await wsClosed;
  await fx.remote.configure({ enabled: false });
  const s = await fx.remote.status();
  assert.equal(s.active, false);
  assert.equal(s.url, null);
  assert.equal((await fx.remote.status()).enabled, false);
});

test("createTailscale：whois 旗标在地址前、TAILSCALE_BE_CLI=1、ENOENT 回退候选路径", async (t) => {
  const calls = [];
  const run = async (bin, args, options) => {
    calls.push({ bin, args, options });
    if (bin === "missing") {
      const e = new Error("spawn missing ENOENT");
      e.code = "ENOENT";
      throw e;
    }
    if (args[0] === "version") return "1.0";
    return "{}";
  };
  const ts = createTailscale("missing", run, ["C:\\Program Files\\Tailscale\\tailscale.exe"]);
  await ts.status();
  await ts.whois("100.64.0.1:4319");
  const probe = calls[0];
  assert.deepEqual(probe.args, ["version"]);
  const who = calls.find((c) => c.args[0] === "whois");
  assert.deepEqual(who.args, ["whois", "--json", "100.64.0.1:4319"]); // 旗标必须在地址前
  assert.equal(who.bin, "C:\\Program Files\\Tailscale\\tailscale.exe"); // ENOENT 回退
  assert.equal(who.options.env.TAILSCALE_BE_CLI, "1"); // macOS app CLI 兼容
  assert.ok(who.options.timeout > 0 && who.options.maxBuffer > 0);
  assert.ok(who.options.windowsHide);

  // 全部候选都缺失 → bin() 报 ENOENT
  const ts2 = createTailscale("missing", run, []);
  await assert.rejects(() => ts2.bin(), /未找到|ENOENT/);
});
