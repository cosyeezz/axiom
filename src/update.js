// 检查更新：比对本地安装与 GitHub 公开仓库 master。
// npm 从 github 安装的实例按 package.json _resolved 里的提交 SHA 比对（内容变更即可发现，无需改版本号）；
// 开发目录等无 SHA 时退回版本号比对。GitHub API 未认证限流 60 次/时/IP，个人使用足够。
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
  sha,
  fetchJson = (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(`GitHub 请求失败 ${r.status}`);
    return r.json();
  }),
} = {}) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  version ??= pkg.version;
  sha ??= pkg._resolved?.match(/#([0-9a-f]{7,40})$/i)?.[1];
  if (sha) {
    const commit = (await fetchJson(`https://api.github.com/repos/${repo}/commits/master`)).sha;
    return {
      available: commit.slice(0, sha.length) !== sha,
      local: `${version} (${sha.slice(0, 7)})`,
      remote: commit.slice(0, 7),
    };
  }
  const remote = (await fetchJson(`https://raw.githubusercontent.com/${repo}/master/package.json`)).version;
  return { available: greater(remote, version), local: version, remote };
}
