import { cp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// 本机平台构建，生产依赖单独安装；绝不复制开发目录混装的 node_modules。
const root = fileURLToPath(new URL("../", import.meta.url));
const stage = join(root, ".desktop-stage");
const app = join(stage, "app");
if (process.versions.node !== "24.19.0") throw new Error("打包固定使用 Node 24.19.0，请使用该版本执行脚本");
await rm(stage, { recursive: true, force: true });
await mkdir(app, { recursive: true });
await mkdir(join(stage, "runtime"), { recursive: true });
for (const name of ["src", "public", "package.json", "package-lock.json", "LICENSE"])
  await cp(join(root, name), join(app, name), { recursive: true });
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: app, shell: process.platform === "win32", stdio: "inherit", timeout: 120_000 });
if (result.error || result.status !== 0) throw result.error || new Error("私有依赖安装失败");
await copyFile(process.execPath, join(stage, "runtime", process.platform === "win32" ? "node.exe" : "node"));
const response = await fetch("https://raw.githubusercontent.com/nodejs/node/v24.19.0/LICENSE", { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error("无法获取随包 Node LICENSE");
await writeFile(join(stage, "runtime", "LICENSE"), await response.text());
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await writeFile(join(stage, "manifest.json"), JSON.stringify({ schema: 1, bundleVersion: pkg.version,
  node: process.versions.node, platform: process.platform, arch: process.arch, dataVersion: 1 }, null, 2));
console.log(`已准备 ${stage}（未签名；仅当前平台）`);
