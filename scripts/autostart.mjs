#!/usr/bin/env node
// 登录自动启动注册：Windows「启动」文件夹 VBS 隐藏启动 / macOS LaunchAgents RunAtLoad / Linux systemd --user。
// 只写或删除注册文件：统一下次登录生效；enable 不立即启动，disable 不停止已在运行的服务，无需管理员。
// 日志由 scripts/service.mjs（supervisor）自行写入 ~/.axiom/service.log，此处不做 shell 重定向。
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const run = promisify(execFile);
export const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const serviceEntry = join(projectDir, "scripts", "service.mjs");
export const label = "com.cosyeezz.axiom";
export const unitName = "axiom.service";

// —— 转义与生成函数（纯函数，供测试）——
// VBS 字符串字面量：内部引号翻倍
export const vbsStr = (s) => `"${s.replace(/"/g, '""')}"`;
export const xmlText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// systemd ExecStart 参数：双引号包裹以支持空格；引号内 \ 和 " 需转义，$ 翻倍避免变量展开
export const systemdArg = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "$$$$").replace(/%/g, "%%").replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;

const vbsArg = (s) => `"${s}"`;
export function vbsScript(nodeExe, service, cwd) {
  return [
    `Set sh = CreateObject("WScript.Shell")`,
    `sh.CurrentDirectory = ${vbsStr(cwd)}`,
    // 0 = 隐藏窗口，False = 不等待
    `sh.Run ${vbsStr(`${vbsArg(nodeExe)} ${vbsArg(service)}`)}, 0, False`,
  ].join("\r\n");
}

export function launchdPlist(name, nodeExe, service, cwd) {
  const x = xmlText;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${x(name)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${x(nodeExe)}</string>
    <string>${x(service)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${x(cwd)}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

export function systemdUnit(nodeExe, service, cwd) {
  return `[Unit]
Description=Axiom service

[Service]
Type=simple
WorkingDirectory=${systemdArg(cwd).replace(/\$\$/g, "$")}
ExecStart=${systemdArg(nodeExe)} ${systemdArg(service)}

[Install]
WantedBy=default.target
`;
}

// —— 各平台注册文件位置与动作 ——
const startupDir = () =>
  join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
    "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const vbsPath = () => join(startupDir(), "axiom-service.vbs");
const plistPath = () => join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const unitPath = () => join(homedir(), ".config", "systemd", "user", unitName);

async function enableWindows() {
  await mkdir(startupDir(), { recursive: true });
  await writeFile(vbsPath(), '\ufeff' + vbsScript(process.execPath, serviceEntry, projectDir), "utf16le");
}
async function disableWindows() {
  await rm(vbsPath(), { force: true });
}
async function enableMac() {
  await mkdir(dirname(plistPath()), { recursive: true });
  await writeFile(plistPath(), launchdPlist(label, process.execPath, serviceEntry, projectDir));
}
async function disableMac() {
  await rm(plistPath(), { force: true });
}
async function enableLinux() {
  if (!existsSync("/run/systemd/system"))
    throw new Error("未检测到 systemd（本系统不是以 systemd 引导），无法注册登录自动启动");
  await run("systemctl", ["--user", "show-environment"]);
  await mkdir(dirname(unitPath()), { recursive: true });
  await writeFile(unitPath(), systemdUnit(process.execPath, serviceEntry, projectDir));
  // 只 enable 不 --now：下次登录由 default.target 拉起，不立即启动
  await run("systemctl", ["--user", "enable", unitName]);
}
async function disableLinux() {
  // 只 disable 不 stop：不影响正在运行的服务
  if (existsSync("/run/systemd/system"))
    if (existsSync(unitPath())) await run("systemctl", ["--user", "disable", unitName]);
  await rm(unitPath(), { force: true });
}

const actions = {
  win32: [enableWindows, disableWindows],
  darwin: [enableMac, disableMac],
  linux: [enableLinux, disableLinux],
};

// 注册文件是否还在：只用于「要不要再问一次注册自启」，不作为服务状态判断。
// ponytail: Linux 用户若手工 systemctl disable 而未删 unit 会被判定为已注册（少问一次，无副作用）。
export const isEnabled = () =>
  platform() === "win32" ? existsSync(vbsPath()) : platform() === "darwin" ? existsSync(plistPath()) : existsSync(unitPath());

export async function main(argv = process.argv.slice(2)) {
  const pair = actions[platform()];
  if (!pair) throw new Error(`不支持的平台：${platform()}`);
  const [cmd] = argv;
  if (cmd === "enable") {
    await pair[0]();
    console.log("已注册登录自动启动，下次登录生效。");
  } else if (cmd === "disable") {
    await pair[1]();
    console.log("已移除登录自动启动，不影响正在运行的服务。");
  } else {
    console.error("用法：node scripts/autostart.mjs enable|disable");
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
