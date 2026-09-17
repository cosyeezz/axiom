import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkUpdate, commitFile, repo } from "../src/update.js";

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
