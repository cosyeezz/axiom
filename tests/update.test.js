import test from "node:test";
import assert from "node:assert/strict";
import { checkUpdate, npmSpec } from "../src/update.js";

test("checkUpdate 版本比对：远端更新则可用，相同或更旧则不可用", async () => {
  const fetchJson = async () => ({ version: "0.2.0" });
  assert.deepEqual(await checkUpdate({ version: "0.1.0", fetchJson }),
    { available: true, local: "0.1.0", remote: "0.2.0" });
  assert.equal((await checkUpdate({ version: "0.2.0", fetchJson })).available, false);
  assert.equal((await checkUpdate({ version: "0.3.0", fetchJson })).available, false);
  assert.equal(npmSpec, "github:cosyeezz/axiom");
});

test("checkUpdate 非 2xx 响应抛出错误", async () => {
  await assert.rejects(
    checkUpdate({ version: "0.1.0", fetchJson: async () => { throw new Error("GitHub 请求失败 404"); } }),
    /404/,
  );
});
