// 检查更新：本地 package.json 版本比对 GitHub 公开仓库 master 的 package.json（git 为唯一更新源，npm 仅发布渠道）。
// 应用：npm 全局安装的实例由 supervisor 执行 npm install -g 重装（含依赖）；开发目录不自动覆盖，由 git 工作流负责。
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = "cosyeezz/axiom";
export const npmSpec = `github:${repo}`;

const greater = (a, b) => {
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

export async function checkUpdate({
  root = fileURLToPath(new URL("..", import.meta.url)),
  version,
  fetchJson = (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`GitHub 请求失败 ${r.status}`);
    return r.json();
  }),
} = {}) {
  const local = version ?? JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
  const remote = (await fetchJson(`https://raw.githubusercontent.com/${repo}/master/package.json`)).version;
  return { available: greater(remote, local), local, remote };
}
