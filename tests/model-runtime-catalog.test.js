import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiFactory } from "../src/pi.js";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { command } from "../src/protocol.js";
import { createModelAuthService } from "../src/model-auth.js";

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
    assert.deepEqual(codex.methods.map((m) => m.type), ["oauth"]);
    for (const provider of factory.authProviders()) {
      for (const method of provider.methods) {
        assert.ok(command.safeParse({ id: "test", type: "models.auth.start", providerId: provider.id, authType: method.type }).success,
          `${provider.id}/${method.type} 必须能通过真实 WS 协议`);
      }
    }
    assert.ok(factory.authProviders().find((p) => p.id === "openai").methods.some((m) => m.type === "api_key"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("真实 SDK API Key 经协议、授权桥接、保存及重建目录，可被请求认证解析（不联网）", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-login-"));
  const stored = new Map();
  const options = {
    modelsPath: join(dir, "models.json"), modelsStorePath: join(dir, "cache.json"), allowModelNetwork: false,
    credentials: {
      read: async (id) => stored.get(id), list: async () => [...stored].map(([providerId, c]) => ({ providerId, type: c.type })),
      modify: async (id, fn) => { const c = await fn(stored.get(id)); if (c) stored.set(id, c); return stored.get(id); },
      delete: async (id) => { stored.delete(id); },
    },
  };
  const factory = await createPiFactory({ cwd: dir, modelRuntimeOptions: options });
  const svc = createModelAuthService({ auth: factory });
  const owner = {};
  try {
    assert.equal(factory.authProviders().find((p) => p.id === "openai").configured, false);
    const authType = factory.authProviders().find((p) => p.id === "openai").methods[0].type;
    const started = await svc.handle(command.parse({ id: "start", type: "models.auth.start", providerId: "openai", authType }), owner);
    const wait = async (predicate) => {
      for (let i = 0; i < 200; i++) {
        const v = await svc.handle({ type: "models.auth.status", flowId: started.flowId }, owner);
        if (predicate(v)) return v;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail("SDK 登录流程未完成");
    };
    const next = await wait((v) => v.prompt);
    await svc.handle({ type: "models.auth.respond", flowId: started.flowId, promptId: next.prompt.id, value: "test-only-api-key" }, owner);
    const result = await wait((v) => v.status !== "running");
    assert.equal(result.status, "success");
    assert.equal(JSON.stringify(result).includes("test-only-api-key"), false);
    assert.equal(factory.authProviders().find((p) => p.id === "openai").configured, true);
    assert.ok(factory.catalog().some((m) => m.provider === "openai"));
    const runtime = await ModelRuntime.create(options);
    const model = runtime.getModels("openai")[0];
    assert.equal((await runtime.getAuth(model)).auth.apiKey, "test-only-api-key");
    await writeFile(options.modelsPath, '{"providers":{"bad":{"models":[{"id":"x"}]}}}');
    await assert.rejects(factory.refreshModels(), /模型目录应用失败/);
    assert.ok(factory.catalog().some((m) => m.provider === "openai"), "错误刷新不覆盖已应用目录");
    assert.match(factory.modelApplicationError(), /模型目录应用失败/);
    await writeFile(options.modelsPath, '{"providers":{}}');
    await factory.refreshModels();
    assert.equal(factory.modelApplicationError(), "");
  } finally { svc.close(owner); await rm(dir, { recursive: true, force: true }); }
});
