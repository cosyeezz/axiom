#!/usr/bin/env node
// 一键安装：装依赖（复用 service.mjs rebuild 的备份/回滚）→ 可选注册登录自启 → 启动守护服务 → 等健康检查 → 可选打开浏览器。
// 选项：--no-autostart 跳过注册自启；--no-browser 跳过打开浏览器；交互终端且未给参数时逐项询问，默认是。
// 自定义端口写项目根 .env.local（AXIOM_PORT=…），本脚本与 service.mjs、自启注册读取同一来源。
import { fork, spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuild } from "./service.mjs";
import { main as autostart } from "./autostart.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const parseArgs = (argv = []) => {
  const opts = { autostart: true, browser: true };
  for (const arg of argv)
    if (arg === "--no-autostart") opts.autostart = false;
    else if (arg === "--no-browser") opts.browser = false;
    else throw new Error(`未知参数：${arg}（支持 --no-autostart、--no-browser）`);
  return opts;
};

// node >=22.5（package.json engines）
export const nodeOk = (version = process.versions.node) => {
  const [major, minor] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 5);
};

export const openCommand = (platform = process.platform) =>
  platform === "win32"
    ? { command: process.env.ComSpec || "cmd.exe", lead: ["/d", "/s", "/c", "start", ""] }
    : { command: platform === "darwin" ? "open" : "xdg-open", lead: [] };

// ok=服务就绪；busy=端口有响应但不是 axiom（被其他程序占用）；down=无响应
const probe = async (target) => {
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(1500) });
    await res.body?.cancel().catch(() => {});
    return res.ok ? "ok" : "busy";
  } catch { return "down"; }
};

const ask = async (rl, question) => (await rl.question(`${question} [Y/n] `)).trim().toLowerCase() !== "n";

export async function install(argv = process.argv.slice(2), io = console, isTTY = process.stdin.isTTY) {
  if (!nodeOk()) throw new Error(`需要 Node.js >=22.5，当前 ${process.versions.node}，请升级后重试`);
  if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
  const opts = parseArgs(argv);
  if (isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (opts.autostart) opts.autostart = await ask(rl, "注册登录自动启动？");
      if (opts.browser) opts.browser = await ask(rl, "完成后打开浏览器？");
    } finally { rl.close(); }
  }
  if (root.includes("node_modules")) io.log("npm 安装：依赖已就绪，跳过重装。");
  else { io.log("安装依赖（npm ci；已装依赖先备份，失败自动回滚）…"); await rebuild(); }
  if (opts.autostart) await autostart(["enable"]);
  const address = `http://127.0.0.1:${Number(process.env.AXIOM_PORT || 4319)}`;
  const health = `${address}/health`;
  if ((await probe(health)) === "ok") {
    io.log("服务已在运行，不重复启动。");
  } else {
    io.log("启动服务…");
    fork(join(root, "scripts/service.mjs"), [], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    for (let waited = 0; (await probe(health)) !== "ok"; waited += 500) {
      if (waited >= 30000)
        throw new Error(`端口 ${new URL(address).port} 无响应或被占用，请查看 ${join(homedir(), ".axiom", "service.log")}`);
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  if (opts.browser) {
    const opener = openCommand();
    spawn(opener.command, [...opener.lead, address], { stdio: "ignore", windowsHide: true }).unref();
  }
  io.log(`完成：${address}`);
  io.log(`日志 ${join(homedir(), ".axiom", "service.log")}；取消自启：npm run autostart:disable`);
}

// npm 全局 bin 在类 Unix 系统是符号链接，argv[1] 需取 realpath 再比对
const invoked = (() => { try { return realpathSync(process.argv[1] ?? ""); } catch { return ""; } })();
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url)))
  await install().catch((error) => { console.error(`安装失败：${error.message}`); process.exitCode = 1; });
