// 始终按 GitHub master 提交检查，不依赖版本号或 npm 是否保留 _resolved。
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = "cosyeezz/axiom";
export const npmSpec = `github:${repo}`;
export const commitFile = ".axiom-commit";

export function validateCommit(sha) {
  if (!/^[0-9a-f]{40}$/i.test(sha ?? "")) throw new Error("无效的 GitHub 提交 SHA");
  return sha.toLowerCase();
}

export async function checkUpdate({
  root = fileURLToPath(new URL("..", import.meta.url)),
  version,
  sha,
  fetchJson = (url) => fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`GitHub 请求失败 ${r.status}`);
    return r.json();
  }),
} = {}) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  version ??= pkg.version;
  if (sha === undefined) {
    try { sha = (await readFile(join(root, commitFile), "utf8")).trim(); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    sha ||= pkg._resolved?.match(/#([0-9a-f]{40})$/i)?.[1];
  }
  // 旧安装没有可靠提交记录时必须更新一次，不能拿相同版本号当作已是最新。
  const localSha = /^[0-9a-f]{40}$/i.test(sha ?? "") ? sha.toLowerCase() : undefined;
  const commit = validateCommit((await fetchJson(`https://api.github.com/repos/${repo}/commits/master`)).sha);
  return {
    available: commit !== localSha,
    local: localSha ? `${version} (${localSha.slice(0, 7)})` : `${version} (提交未知)`,
    remote: commit.slice(0, 7),
    sha: commit,
  };
}
