import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sessions } from "../src/sessions.js";

// catalog = 已鉴权可用模型；modelCatalog = 已定义（含暂未鉴权）。
function stubFactory() {
  const factory = async () => ({ historyEntries: () => [], abort: async () => {}, dispose: () => {}, subscribe: () => () => {} });
  factory.catalog = () => [{ key: "a/b", levels: ["off"] }];
  factory.modelCatalog = () => [{ key: "a/b", levels: ["off"] }, { key: "c/d", levels: ["off"] }];
  return factory;
}

// Windows 下 close 后句柄释放有延迟，rm 直接删 axiom.db 会 EBUSY，重试兜底。
const cleanup = (dir) => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

test("validateSelection：恢复会话放行已定义未鉴权模型，新建仍拒绝", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-restore-"));
  const fallback = new Sessions((() => {
    const f = stubFactory();
    delete f.modelCatalog;
    return f;
  })(), join(dir, "defaults.json"));
  let sessions;
  try {
    sessions = new Sessions(stubFactory(), join(dir, "defaults.json"));
    // 恢复（selection.sessionFile 注入）：c/d 已定义但未鉴权，放行。
    await sessions.validateSelection(dir, { model: "c/d", sessionFile: "x.jsonl" });
    // 新建/修改：同一模型保持拒绝。
    await assert.rejects(sessions.validateSelection(dir, { model: "c/d" }), /Unknown model/);
    // 真正无效（目录里根本没有）恢复也报错，不自动换模型。
    await assert.rejects(
      sessions.validateSelection(dir, { model: "x/y", sessionFile: "x.jsonl" }),
      /Unknown model/);
    // 无 modelCatalog 方法时恢复回退 catalog（?? 兜底）。
    await assert.rejects(
      fallback.validateSelection(dir, { model: "c/d", sessionFile: "x.jsonl" }),
      /Unknown model/);
  } finally {
    await Promise.allSettled([sessions?.close(), fallback.close()]);
    await cleanup(dir);
  }
});

test("create 恢复路径注入 sessionFile：历史模型未鉴权可恢复，新建同模型报错", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-restore-create-"));
  const sessions = new Sessions(stubFactory(), join(dir, "defaults.json"));
  try {
    // 恢复：saved.sessionFile 存在，历史模型 c/d 未鉴权但已定义 → 通过。
    const id = await sessions.create(dir, { model: "c/d" }, { id: "restore-1", sessionFile: join(dir, "x.jsonl") });
    assert.ok(id);
    // 新建：同一 selection 无 saved → 走 catalog → 拒绝。
    await assert.rejects(sessions.create(dir, { model: "c/d" }), /Unknown model/);
  } finally {
    await sessions.close();
    await cleanup(dir);
  }
});
