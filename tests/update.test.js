import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkUpdate, checkDesktopUpdate, commitFile, repo } from "../src/update.js";

const old = "a".repeat(40), latest = "b".repeat(40);

test("真实安装布局：无 _resolved、版本不变也更新，记录提交后仅新 master 触发", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-update-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "0.1.4" }));
    const fetchJson = async (url) => {
      assert.equal(url, "https://api.github.com/repos/cosyeezz/axiom/commits/master");
      return { sha: latest };
    };
    const check = () => checkUpdate({ root, fetchJson });
    assert.deepEqual(await check(), {
      available: true, local: "0.1.4 (提交未知)", remote: "bbbbbbb", sha: latest,
    });
    await writeFile(join(root, commitFile), old);
    assert.equal((await check()).available, true);
    await writeFile(join(root, commitFile), latest);
    assert.equal((await check()).available, false);
    await writeFile(join(root, commitFile), "broken");
    assert.equal((await check()).available, true);
    await rm(join(root, commitFile));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "0.1.4", _resolved: `git+https://github.com/cosyeezz/axiom.git#${latest}` }));
    assert.equal((await check()).available, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("GitHub 失败或返回非法 SHA 时不伪报已是最新", async () => {
  await assert.rejects(checkUpdate({ fetchJson: async () => { throw new Error("GitHub 请求失败 404"); } }), /404/);
  await assert.rejects(checkUpdate({ fetchJson: async () => ({ sha: "master & echo bad" }) }), /无效/);
});

// —— 桌面手动更新 ——
const URL_BASE = `https://github.com/${repo}/releases/download`;
const lm = (name) => ({ name, browser_download_url: `${URL_BASE}/v1.0.0/${name}` });

const mkRelease = (over = {}) => ({
  tag_name: "v1.0.0", draft: false, prerelease: false,
  assets: [lm("Axiom-1.0.0-win32-x64-unsigned.exe"), lm("Axiom-1.0.0-macOS-arm64-unsigned.dmg"), lm("Axiom-1.0.0-macOS-universal.dmg")],
  ...over,
});

const req = (url) => { assert.equal(url, `https://api.github.com/repos/${repo}/releases/latest`); return mkRelease(); };

const fields = async (opts) => {
  const f = await checkDesktopUpdate(opts);
  assert.deepEqual(Object.keys(f).sort(), ["available", "downloadUrl", "local", "manual", "remote"].sort(), "恰好输出五个字段");
  return f;
};

test("桌面：win32 x64 有更新，只有目标 .exe 进 downloadUrl，manual:true", async () => {
  const f = await fields({ version: "0.1.7", platform: "win32", arch: "x64", fetchJson: req });
  assert.equal(f.available, true);
  assert.equal(f.local, "0.1.7");
  assert.equal(f.remote, "v1.0.0");
  assert.equal(f.manual, true);
  assert.equal(f.downloadUrl, `${URL_BASE}/v1.0.0/Axiom-1.0.0-win32-x64-unsigned.exe`);
});

test("桌面：darwin arm64 匹配 arm64 .dmg；x64 拒绝 arm64 资产", async () => {
  const arm = await fields({ version: "0.1.7", platform: "darwin", arch: "arm64", fetchJson: req });
  assert.equal(arm.available, true);
  assert.equal(arm.downloadUrl, `${URL_BASE}/v1.0.0/Axiom-1.0.0-macOS-arm64-unsigned.dmg`);

  await assert.rejects(fields({ version: "0.1.7", platform: "darwin", arch: "x64", fetchJson: req }), /缺少可信/);
});

test("桌面：远程版本不高于本机时不提示更新（release 无效，下载地址恒为空）", async () => {
  const f = await fields({ version: "v1.0.0", platform: "win32", arch: "x64", fetchJson: req });
  assert.equal(f.available, false);
  assert.equal(f.downloadUrl, "");
});

test("桌面：draft / prerelease / 非三段 tag 拒绝更新检查", async () => {
  for (const over of [{ draft: true }, { prerelease: true }, { tag_name: "v1.0" }, { tag_name: "v1.0.0-beta.1" }]) {
    await assert.rejects(checkDesktopUpdate({ version: "0.1.7", platform: "win32", arch: "x64", fetchJson: async () => mkRelease(over) }), /拒绝|无效/);
  }
});

test("桌面：无 release（HTTP 失败 / 空对象）时不伪报已是最新", async () => {
  await assert.rejects(checkDesktopUpdate({ version: "0.1.7", platform: "win32", arch: "x64", fetchJson: async () => { throw new Error("GitHub 请求失败 404"); } }), /404/);
  await assert.rejects(checkDesktopUpdate({ version: "0.1.7", platform: "win32", arch: "x64", fetchJson: async () => ({}) }), /没有可用/);
});

test("桌面：不支持的平台/架构或缺少适配资产时报错，不伪报最新", async () => {
  await assert.rejects(fields({ version: "0.1.7", platform: "linux", arch: "x64", fetchJson: req }), /缺少可信/);
  await assert.rejects(fields({ version: "0.1.7", platform: "win32", arch: "arm64", fetchJson: req }), /缺少可信/);
  const dup = await fields({ version: "0.1.7", platform: "darwin", arch: "arm64", fetchJson: async () => mkRelease({ assets: [lm("Axiom-1.0.0-macOS-universal.dmg"), lm("Axiom-1.0.0-macOS-arm64-unsigned.dmg")] }) });
  assert.equal(dup.downloadUrl, `${URL_BASE}/v1.0.0/Axiom-1.0.0-macOS-arm64-unsigned.dmg`, "多候选时优先选精确 arm64 资产");
});

test("桌面：资产不在 releases/download 白名单域时即使名称匹配也不放行", async () => {
  const evil = { name: "Axiom-1.0.0-win32-x64-unsigned.exe", browser_download_url: "https://evil.example.com/Axiom-1.0.0-win32-x64-unsigned.exe" };
  await assert.rejects(fields({ version: "0.1.7", platform: "win32", arch: "x64", fetchJson: async () => mkRelease({ assets: [evil] }) }), /缺少可信/);
});

test("桌面：本机版本非三段时拒绝，不静默当最新", async () => {
  await assert.rejects(checkDesktopUpdate({ version: "oldest", platform: "win32", arch: "x64", fetchJson: req }), /本机版本号无效/);
  await assert.rejects(checkDesktopUpdate({ version: "0.1", platform: "win32", arch: "x64", fetchJson: req }), /本机版本号无效/);
  // 未传 version 时回退到仓库 package.json 的当前版本，走正常比较。
  const f = await fields({ platform: "win32", arch: "x64", fetchJson: req });
  assert.equal(f.remote, "v1.0.0");
  assert.equal(typeof f.available, "boolean");
});
