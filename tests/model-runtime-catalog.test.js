import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiFactory } from "../src/pi.js";

test("配置目录包含未登录模型，安全投影不泄露凭据", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-catalog-"));
  try {
    const factory = await createPiFactory({ cwd: dir, modelRuntimeOptions: {
      modelsPath: join(dir, "models.json"),
      credentials: { read: async () => undefined, list: async () => [], modify: async () => undefined, delete: async () => {} },
    } });
    const models = factory.modelCatalog();
    assert.ok(models.some((m) => m.provider === "openai-codex"));
    for (const model of models) {
      assert.equal("headers" in model, false);
      assert.equal("apiKey" in model, false);
      assert.ok(Array.isArray(model.levels));
    }
    const codex = factory.authProviders().find((p) => p.id === "openai-codex");
    assert.ok(codex.methods.some((m) => m.type === "oauth"));
    assert.equal("credential" in codex, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
