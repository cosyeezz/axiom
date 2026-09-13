import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseArgs, nodeOk, openCommand, ensurePi } from "../scripts/install.mjs";

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
      `], { encoding: "utf8", timeout: 15000 });
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
