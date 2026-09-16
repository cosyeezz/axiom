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

// —— 桌面手动更新检查：只提示手动下载，永不自动安装 ——
const stableSemver = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const parseStable = (tag) => {
  const m = stableSemver.exec(String(tag ?? "").trim());
  const parts = m?.slice(1).map(Number);
  return parts?.every(Number.isSafeInteger) ? parts : null;
};
const downloadBase = `https://github.com/${repo}/releases/download`;

// 只有目标安装器形态才放行：win32 x64 .exe；darwin arm64/x64 .dmg，名称必须含对应架构。
const installerTokens = {
  win32: (arch) => (arch === "x64" ? { ext: /\.exe$/i, arch: /x64|amd64/i } : null),
  darwin: (arch) => {
    const archRe = arch === "arm64" ? /arm64|aarch64/i : arch === "x64" ? /x64|amd64/i : null;
    return archRe ? { ext: /\.dmg$/i, arch: archRe } : null;
  },
};

function installerUrl(assets, platform, arch) {
  const tokens = installerTokens[platform]?.(arch);
  if (!tokens) return "";
  const found = (assets ?? []).find((a) => {
    const name = a?.name ?? "";
    return tokens.arch.test(name) && tokens.ext.test(name)
      && (a?.browser_download_url ?? "").startsWith(`${downloadBase}/`);
  });
  return found?.browser_download_url ?? "";
}

export async function checkDesktopUpdate({
  version,
  platform = process.platform,
  arch = process.arch,
  fetchJson = (url) => fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`GitHub 请求失败 ${r.status}`);
    return r.json();
  }),
} = {}) {
  if (version === undefined) {
    const pkg = JSON.parse(await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
    version = pkg.version;
  }
  const local = String(version);
  const localParts = parseStable(local);
  if (!localParts) throw new Error(`本机版本号无效：${local}`);

  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
  if (!release?.tag_name) throw new Error("没有可用的稳定版发布");
  if (release.draft || release.prerelease) throw new Error("最新发布是预发布，拒绝更新检查");
  const remoteParts = parseStable(release.tag_name);
  if (!remoteParts) throw new Error(`远程版本号无效：${release.tag_name}`);

  const downloadUrl = installerUrl(release.assets, platform, arch);
  const newer = compareVersions(localParts, remoteParts) < 0;
  if (newer && !downloadUrl) throw new Error(`新版本缺少可信的 ${platform}/${arch} 安装包`);
  return {
    available: newer && downloadUrl !== "",
    local,
    remote: release.tag_name,
    manual: true,
    // 不更新或没有适配资产时绝不随便给下载地址（下游只会在 available 时展示）。
    downloadUrl: newer && downloadUrl !== "" ? downloadUrl : "",
  };
}
