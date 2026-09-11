import test from "node:test";
import assert from "node:assert/strict";
import { checkUpdate, npmSpec } from "../src/update.js";

test("npm 安装实例按提交 SHA 比对：master 前进即发现更新", async () => {
  const fetchJson = async () => ({ sha: "b".repeat(40) });
  const newer = await checkUpdate({ version: "0.1.1", sha: "a".repeat(40), fetchJson });
  assert.deepEqual(newer, { available: true, local: "0.1.1 (aaaaaaa)", remote: "bbbbbbb" });
  const same = await checkUpdate({ version: "0.1.1", sha: "b".repeat(40), fetchJson });
  assert.equal(same.available, false);
  assert.equal(npmSpec, "github:cosyeezz/axiom");
});

test("无提交记录时退回版本号比对：远端更新则可用，相同或更旧则不可用", async () => {
  const fetchJson = async () => ({ version: "0.2.0" });
  assert.deepEqual(await checkUpdate({ version: "0.1.0", fetchJson }),
    { available: true, local: "0.1.0", remote: "0.2.0" });
  assert.equal((await checkUpdate({ version: "0.2.0", fetchJson })).available, false);
  assert.equal((await checkUpdate({ version: "0.3.0", fetchJson })).available, false);
});

test("checkUpdate 非 2xx 响应抛出错误", async () => {
  await assert.rejects(
    checkUpdate({ version: "0.1.0", fetchJson: async () => { throw new Error("GitHub 请求失败 404"); } }),
    /404/,
  );
});
