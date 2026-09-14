import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, nodeOk, openCommand, ensurePi } from "../scripts/install.mjs";
import { firstRunGuide, localAddress, localPort, serviceReady, startBackground } from "../scripts/service.mjs";

test("parseArgs 默认全开，参数可关闭，未知参数报错", () => {
  assert.deepEqual(parseArgs([]), { autostart: true, browser: true });
  assert.deepEqual(parseArgs(["--no-autostart"]), { autostart: false, browser: true });
  assert.deepEqual(parseArgs(["--no-autostart", "--no-browser"]), { autostart: false, browser: false });
  assert.throws(() => parseArgs(["--bogus"]), /未知参数/);
});

test("nodeOk 校验 Node 22.13+ LTS 或 24+", () => {
  assert.equal(nodeOk("22.5.0"), false);
  assert.equal(nodeOk("22.13.0"), true);
  assert.equal(nodeOk("23.0.0"), false);
  assert.equal(nodeOk("22.4.9"), false);
  assert.equal(nodeOk("23.1.0"), false);
  assert.equal(nodeOk("24.0.0"), true);
});

test("旧 Node 在安装、服务和直接启动入口加载 SQLite 前收到升级提示", () => {
  for (const entry of ["scripts/install.mjs", "scripts/service.mjs", "src/main.js"]) {
    for (const version of ["20.19.0", "22.12.0", "23.1.0"]) {
      const url = new URL(`../${entry}`, import.meta.url).href;
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import Module from "node:module";
        Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(version)} });
        const load = Module._load;
        Module._load = function(id, ...args) {
          if (id === "node:sqlite") throw new Error("SQLITE_LOADED_TOO_EARLY");
          return load.call(this, id, ...args);
        };
        await import(${JSON.stringify(url)});
      `], { encoding: "utf8", timeout: 60000 });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /需要 Node.js 22\.13\+/);
      assert.ok(result.stderr.includes(`当前 ${version}`));
      assert.doesNotMatch(result.stderr, /SQLITE_LOADED_TOO_EARLY|ERR_UNKNOWN_BUILTIN_MODULE/);
    }
  }
});

test("ensurePi 缺少 Pi CLI 时全局安装最新版", async () => {
  const calls = [];
  const fake = async (command, args, capture) => {
    calls.push([command, args, capture]);
    if (command === "pi") throw new Error("未找到 pi");
  };
  assert.match(await ensurePi(fake), /安装/);
  assert.deepEqual(calls, [
    ["pi", ["--version"], true],
    ["npm", ["install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent@latest"], undefined],
  ]);
});

test("ensurePi 已有 Pi CLI 时不重复安装", async () => {
  const calls = [];
  assert.match(await ensurePi(async (...call) => { calls.push(call); }), /已有/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "pi");
});

test("ensurePi 安装失败时错误向外传播", async () => {
  const fake = async (command) => {
    if (command === "pi") throw new Error("未找到 pi");
    throw new Error("npm exited 1: EACCES permission denied");
  };
  await assert.rejects(ensurePi(fake), /EACCES/);
});

test("openCommand 按平台选择打开方式", () => {
  assert.deepEqual(openCommand("darwin"), { command: "open", lead: [] });
  assert.deepEqual(openCommand("linux"), { command: "xdg-open", lead: [] });
  assert.equal(openCommand("win32").command, process.env.ComSpec || "cmd.exe");
  assert.deepEqual(openCommand("win32").lead, ["/d", "/s", "/c", "start", ""]);
});

test("localPort 拒绝非法 AXIOM_PORT，接受 0（测试用的“不监听真实端口”哨兵）", () => {
  const saved = process.env.AXIOM_PORT;
  try {
    for (const bad of ["invalid", "-1", "70000", "1.5"]) {
      process.env.AXIOM_PORT = bad;
      assert.throws(localPort, /AXIOM_PORT 无效/, bad);
    }
    process.env.AXIOM_PORT = "4399";
    assert.equal(localPort(), 4399);
    assert.equal(localAddress(), "http://127.0.0.1:4399");
    process.env.AXIOM_PORT = "0";
    assert.equal(localPort(), 0);
    delete process.env.AXIOM_PORT;
    assert.equal(localPort(), 4319);
    process.env.AXIOM_PORT = "";
    assert.equal(localPort(), 4319, "空值等同未设置，与 src/main.js 一致");
  } finally {
    if (saved === undefined) delete process.env.AXIOM_PORT;
    else process.env.AXIOM_PORT = saved;
  }
});

// 用真实 HTTP 服务验证探活语义，不碰真守护进程。
const fakeService = async (status = 200) => {
  const server = createServer((req, res) => {
    res.writeHead(req.url === "/health" ? status : 404);
    res.end("{}");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { address: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) };
};

test("serviceReady 只认 /health 的 2xx，服务消失后转为 false", async () => {
  const service = await fakeService();
  assert.equal(await serviceReady(service.address), true);
  await service.close();
  assert.equal(await serviceReady(service.address), false);
});

test("serviceReady 把非 2xx 响应视为未就绪（端口被别的程序占用）", async () => {
  const service = await fakeService(503);
  assert.equal(await serviceReady(service.address), false);
  await service.close();
});

test("服务已在运行时 startBackground 返回 running 且不派生新进程", async () => {
  const service = await fakeService();
  assert.equal(await startBackground(service.address), "running");
  await service.close();
});

test("firstRunGuide 在非交互终端直接返回，不创建引导标记", async () => {
  const home = await mkdtemp(join(tmpdir(), "axiom-guide-"));
  const saved = process.env.AXIOM_HOME;
  process.env.AXIOM_HOME = home;
  try {
    await firstRunGuide("http://127.0.0.1:1", false);
    assert.equal(existsSync(join(home, ".guided")), false);
  } finally {
    if (saved === undefined) delete process.env.AXIOM_HOME;
    else process.env.AXIOM_HOME = saved;
    await rm(home, { recursive: true, force: true });
  }
});
