import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, nodeOk, openCommand, ensurePi } from "../scripts/install.mjs";

test("parseArgs 默认全开，参数可关闭，未知参数报错", () => {
  assert.deepEqual(parseArgs([]), { autostart: true, browser: true });
  assert.deepEqual(parseArgs(["--no-autostart"]), { autostart: false, browser: true });
  assert.deepEqual(parseArgs(["--no-autostart", "--no-browser"]), { autostart: false, browser: false });
  assert.throws(() => parseArgs(["--bogus"]), /未知参数/);
});

test("nodeOk 校验 Node >=22.5", () => {
  assert.equal(nodeOk("22.5.0"), true);
  assert.equal(nodeOk("22.4.9"), false);
  assert.equal(nodeOk("23.1.0"), true);
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
