import test from "node:test";
import assert from "node:assert/strict";
import {
  vbsScript,
  launchdPlist,
  systemdUnit,
  vbsStr,
  xmlText,
  systemdArg,
  main,
} from "../scripts/autostart.mjs";

// 含空格的合成路径，验证三平台转义；纯函数测试，不触碰真实注册位置。
const node = "/dir with space/node";
const cwd = "/my projects/axiom";
const service = "/my projects/axiom/scripts/service.mjs";

test("windows vbs：隐藏启动、设置工作目录、引号翻倍", () => {
  const s = vbsScript(node, service, cwd);
  assert.match(s, /, 0, False\r?\n?$/); // 0 = 隐藏窗口
  assert.ok(s.includes(`sh.CurrentDirectory = "${cwd}"`));
  // 命令行参数各自带引号，整体作为 VBS 字面量引号翻倍
  assert.ok(s.includes(`sh.Run """${node}"" ""${service}"""`));
  assert.equal(vbsStr('a"b'), '"a""b"');
});

test("macos plist：RunAtLoad、参数顺序、XML 转义", () => {
  const p = launchdPlist("com.test&a<b", node, service, "a&b<c");
  assert.match(p, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(p, /<string>com\.test&amp;a&lt;b<\/string>/);
  assert.match(p, /<string>a&amp;b&lt;c<\/string>/);
  const args = p.slice(p.indexOf("<key>ProgramArguments</key>"));
  assert.ok(args.indexOf(node) < args.indexOf(service), "node 在前、service.mjs 在后");
  assert.ok(args.includes(`<string>${node}</string>`));
});

test("linux unit：ExecStart 引号转义、工作目录、default.target", () => {
  const u = systemdUnit(node, service, cwd);
  assert.match(u, /^WorkingDirectory="\/my projects\/axiom"$/m);
  assert.match(
    u,
    /^ExecStart="\/dir with space\/node" "\/my projects\/axiom\/scripts\/service\.mjs"$/m,
  );
  assert.match(u, /^WantedBy=default\.target$/m); // 登录时拉起，非立即启动
  // 引号内 \ 与 " 转义，$ 翻倍避免展开
  assert.equal(systemdArg('a"b\\c$d'), '"a\\"b\\\\c$$d"');
});

test("CLI：import 无副作用，未知命令报用法且退出码 1", async () => {
  const err = console.error;
  console.error = () => {};
  try {
    await main(["bogus"]);
    assert.equal(process.exitCode, 1);
  } finally {
    console.error = err;
    process.exitCode = undefined;
  }
});
