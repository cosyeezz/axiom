#!/usr/bin/env node
// 一键安装：检查/补装 Pi CLI → 装依赖（复用 service.mjs rebuild 的备份/回滚）→ 可选注册登录自启 → 启动守护服务 → 等健康检查 → 可选打开浏览器。
// 选项：--no-autostart 跳过注册自启；--no-browser 跳过打开浏览器；交互终端且未给参数时逐项询问，默认是。
// 自定义端口写项目根 .env.local（AXIOM_PORT=…），本脚本与 service.mjs、自启注册读取同一来源。
import { existsSync, realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homeDir, localAddress, openPage, rebuild, run, startBackground } from "./service.mjs";
import { main as autostart } from "./autostart.mjs";
export { nodeOk } from "../src/database.js";
export { openCommand } from "./service.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const parseArgs = (argv = []) => {
  const opts = { autostart: true, browser: true };
  for (const arg of argv)
    if (arg === "--no-autostart") opts.autostart = false;
    else if (arg === "--no-browser") opts.browser = false;
    else throw new Error(`未知参数：${arg}（支持 --no-autostart、--no-browser）`);
  return opts;
};

// 浏览器打开方式与开页动作在 service.mjs（axiom 首次引导也要用）；openCommand 仍从本模块转出供测试与兼容。

// Pi CLI 缺失才全局装最新版，已有不强制升级。安装失败错误原样抛出。
export const ensurePi = async (execute = viaShell) => {
  if (await execute("pi", ["--version"], true).then(() => true, () => false)) return "已有 Pi CLI";
  await execute("npm", ["install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent@latest"]);
  return "已全局安装 @earendil-works/pi-coding-agent@latest";
};

// Windows 的 npm/pi 全局 bin 是 .cmd 垫片；命令和参数仅来自上面的固定字面量。
const viaShell = (command, args, capture = false) =>
  process.platform === "win32"
    ? run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `${command} ${args.join(" ")}`], root, capture)
    : run(command, args, root, capture);

const ask = async (rl, question) => (await rl.question(`${question} [Y/n] `)).trim().toLowerCase() !== "n";

export async function install(argv = process.argv.slice(2), io = console, isTTY = process.stdin.isTTY) {
  if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
  const opts = parseArgs(argv);
  if (isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (opts.autostart) opts.autostart = await ask(rl, "注册登录自动启动？");
      if (opts.browser) opts.browser = await ask(rl, "完成后打开浏览器？");
    } finally { rl.close(); }
  }
  io.log("检查 Pi CLI（未安装时将通过 npm 安装最新版）…");
  io.log(`Pi CLI：${await ensurePi()}`);
  if (root.includes("node_modules")) io.log("npm 安装：依赖已就绪，跳过重装。");
  else { io.log("安装依赖（npm ci；已装依赖先备份，失败自动回滚）…"); await rebuild(); }
  if (opts.autostart) await autostart(["enable"]);
  const address = localAddress();
  io.log((await startBackground(address)) === "running" ? "服务已在运行，不重复启动。" : "服务已在后台启动。");
  if (opts.browser) openPage(address);
  // 与 axiom 首次引导共享同一个「不再打扰」标记：setup 问过的就不再问第二遍。
  await mkdir(homeDir(), { recursive: true });
  await writeFile(join(homeDir(), ".guided"), "");
  io.log(`完成：${address}`);
  io.log(`日志 ${join(homeDir(), "service.log")}；服务在后台运行，停止：axiom stop，重启：axiom；取消自启：npm run autostart:disable`);
}

// npm 全局 bin 在类 Unix 系统是符号链接，argv[1] 需取 realpath 再比对
const invoked = (() => { try { return realpathSync(process.argv[1] ?? ""); } catch { return ""; } })();
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url)))
  await install().catch((error) => { console.error(`安装失败：${error.message}`); process.exitCode = 1; });
