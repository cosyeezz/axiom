import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, nodeOk, openCommand } from "../scripts/install.mjs";

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

test("openCommand 按平台选择打开方式", () => {
  assert.deepEqual(openCommand("darwin"), { command: "open", lead: [] });
  assert.deepEqual(openCommand("linux"), { command: "xdg-open", lead: [] });
  assert.equal(openCommand("win32").command, process.env.ComSpec || "cmd.exe");
  assert.deepEqual(openCommand("win32").lead, ["/d", "/s", "/c", "start", ""]);
});
