import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:http";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createPiFactory } from "../src/pi.js";
import { Database } from "../src/database.js";
import { createPiModelStorage } from "../src/pi-model-storage.js";
import { createModelsService } from "../src/model-config.js";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "axiom-runtime-"));
  const database = new Database(join(dir, "axiom.db"));
  const storage = createPiModelStorage({ database, home: dir, piDir: join(dir, "pi") });
  await storage.init();
  const options = { credentials: storage.credentials, modelsPath: storage.compatPath,
    modelsStorePath: join(dir, "cache.json"), allowModelNetwork: false };
  const factory = await createPiFactory({ cwd: dir, modelRuntimeOptions: options });
  const models = createModelsService({ storage, factory });
  return { options, factory, models, database, storage,
    close: async () => { database.close(); await rm(dir, { recursive: true, force: true }); } };
}

test("网页保存的自定义连接经 SQLite/派生文件/真实 SDK 发往回环端点，携带正确模型和凭据", async () => {
  const f = await fixture();
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const chunk of [
      { id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "local ok" }, finish_reason: null }] },
      { id: "test", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ]) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let agent;
  try {
    const initial = await f.models.get();
    const saved = await f.models.saveProvider({ providerId: "local-test", baseFingerprint: initial.fingerprint,
      provider: { api: "openai-completions", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "test-only-key" } });
    assert.equal(saved.applied, true);
    const added = await f.models.saveModel({ providerId: "local-test", baseFingerprint: saved.fingerprint,
      model: { id: "local-model", name: "Local model", reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 256 } });
    assert.equal(added.applied, true);
    assert.ok(f.factory.catalog().some((m) => m.key === "local-test/local-model"));
    const runtime = await ModelRuntime.create(f.options);
    const model = (await runtime.getAvailable("local-test"))[0];
    const answer = await runtime.completeSimple(model, { messages: [{ role: "user", content: "local fixture only", timestamp: Date.now() }] }, { maxTokens: 16 });
    assert.equal(answer.stopReason, "stop", answer.errorMessage);
    assert.equal(answer.content[0].text, "local ok");
    assert.equal(requests[0].url, "/v1/chat/completions");
    assert.equal(requests[0].auth, "Bearer test-only-key");
    assert.equal(requests[0].body.model, "local-model");
    assert.equal(JSON.stringify(await f.models.get()).includes("test-only-key"), false);

    agent = await f.factory([], { model: "local-test/local-model" });
    await agent.prompt("first local request");
    assert.equal(agent.result(), "local ok");
    // 同模型重选也必须更新会话 runtime 的端点和凭据，而非仅换目录对象。
    const changed = await f.models.saveProvider({ providerId: "local-test", baseFingerprint: added.fingerprint,
      provider: { baseUrl: `http://127.0.0.1:${server.address().port}/v2`, apiKey: "replacement-test-key" } });
    assert.equal(changed.applied, true);
    await agent.configure({ model: "local-test/local-model" });
    await agent.prompt("second local request");
    assert.equal(agent.result(), "local ok");
    assert.equal(requests.at(-1).url, "/v2/chat/completions");
    assert.equal(requests.at(-1).auth, "Bearer replacement-test-key");
    // 旧会话切到创建之后才新增的供应商，不应 Unknown provider。
    const fresh = await f.models.saveProvider({ providerId: "new-local", baseFingerprint: changed.fingerprint,
      provider: { api: "openai-completions", baseUrl: `http://127.0.0.1:${server.address().port}/v3`, apiKey: "new-test-key" } });
    await f.models.saveModel({ providerId: "new-local", baseFingerprint: fresh.fingerprint,
      model: { id: "new-model", input: ["text"], contextWindow: 8192, maxTokens: 256 } });
    await agent.configure({ model: "new-local/new-model" });
    await agent.prompt("third local request");
    assert.equal(agent.result(), "local ok");
    assert.equal(requests.at(-1).url, "/v3/chat/completions");
    assert.equal(requests.at(-1).auth, "Bearer new-test-key");
    assert.equal(requests.at(-1).body.model, "new-model");
  } finally { await agent?.dispose(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await f.close(); }
});

test("登录凭据优先级明确，表单冲突拒绝；发现与真实SDK认证一致，支持内置默认端点", async () => {
  const f = await fixture();
  const requests = [];
  const models = createModelsService({ factory: f.factory, storage: f.storage,
    discoverFetch: async (url, options) => { requests.push({ url, ...options }); return new Response(JSON.stringify({ data: [{ id: "fixture" }] })); } });
  try {
    const saved = await models.saveProvider({ providerId: "local-test", baseFingerprint: (await models.get()).fingerprint,
      provider: { api: "openai-completions", baseUrl: "https://fixture.invalid/v1", apiKey: "config-key", headers: { "x-retain": "retained", "x-drop": "removed" } } });
    await f.factory.login("local-test", "api_key", { prompt: async () => "stored-key", notify() {} });
    await f.factory.refreshModels();
    assert.equal(f.factory.authProviders().find((p) => p.id === "local-test").authSource, "stored");
    await assert.rejects(models.saveProvider({ providerId: "local-test", baseFingerprint: saved.fingerprint,
      provider: { apiKey: "silently-ignored-key" } }), /登录凭据优先/);
    assert.equal(f.storage.readConfig().providers["local-test"].apiKey, "config-key");
    await models.handle({ type: "models.provider.discover", providerId: "local-test" });
    assert.equal(requests.at(-1).url, "https://fixture.invalid/v1/models");
    assert.equal(requests.at(-1).headers.Authorization, "Bearer stored-key");
    assert.equal(requests.at(-1).headers["x-retain"], "retained");
    const runtime = await ModelRuntime.create(f.options);
    assert.equal((await runtime.getAuth("local-test")).auth.apiKey, "stored-key");
    const updated = await models.saveProvider({ providerId: "local-test", baseFingerprint: saved.fingerprint,
      provider: { headers: { "x-drop": null, "x-retain": { keep: true } } } });
    await models.handle({ type: "models.provider.discover", providerId: "local-test" });
    assert.equal(requests.at(-1).headers["x-drop"], undefined);
    assert.equal(requests.at(-1).headers["x-retain"], "retained");
    await f.factory.logout("local-test"); await f.factory.refreshModels();
    await models.saveProvider({ providerId: "local-test", baseFingerprint: updated.fingerprint, provider: { apiKey: "replacement" } });
    await models.handle({ type: "models.provider.discover", providerId: "local-test" });
    assert.equal(requests.at(-1).headers.Authorization, "Bearer replacement");
    await f.factory.login("openai", "api_key", { prompt: async () => "native-stored", notify() {} });
    await f.factory.refreshModels();
    await models.handle({ type: "models.provider.discover", providerId: "openai" });
    assert.equal(requests.at(-1).url, "https://api.openai.com/v1/models");
    assert.equal(requests.at(-1).headers.Authorization, "Bearer native-stored");
    await assert.rejects(models.handle({ type: "models.provider.discover", providerId: "openai-codex" }), /内置模型目录/);
    assert.doesNotMatch(JSON.stringify(await models.get()), /stored-key|native-stored|replacement|config-key/);
  } finally { await f.close(); }
});

test("Codex 合成 OAuth 凭据落 SQLite，重建后可选并解析订阅认证，不产生真实请求", async () => {
  const f = await fixture();
  try {
    const access = `test.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } })).toString("base64url")}.test`;
    await f.storage.credentials.modify("openai-codex", () => ({ type: "oauth", access, refresh: "test-refresh", expires: Date.now() + 3_600_000, accountId: "test-account" }));
    await f.factory.refreshModels();
    const provider = f.factory.authProviders().find((p) => p.id === "openai-codex");
    assert.equal(provider.configured, true);
    assert.equal(provider.usingOAuth, true);
    const runtime = await ModelRuntime.create(f.options);
    const model = (await runtime.getAvailable("openai-codex"))[0];
    assert.ok(model);
    assert.equal(model.api, "openai-codex-responses");
    assert.equal(model.baseUrl, "https://chatgpt.com/backend-api");
    assert.equal((await runtime.getAuth(model)).auth.apiKey, access);
    assert.equal(JSON.stringify(await f.models.get()).includes(access), false);
    assert.equal((await f.storage.credentials.read("openai-codex")).refresh, "test-refresh");
  } finally { await f.close(); }
});

test("启动/授权刷新错误在 GET 呈现未应用，修复后只重试应用不重写权威", async () => {
  const f = await fixture();
  try {
    f.storage.writeConfig({ providers: { invalid: { models: [{ id: "bad" }] } } });
    await f.storage.syncCompatFile(f.storage.readConfig());
    await assert.rejects(f.factory.refreshModels());
    const before = f.storage.configState().raw;
    const invalid = await f.models.get();
    assert.equal(invalid.applied, false);
    assert.match(invalid.applyError, /应用失败/);
    assert.equal(f.storage.configState().raw, before);
    f.storage.writeConfig({ providers: {} });
    const recovered = await f.models.get();
    assert.equal(recovered.applied, true);
    assert.equal(recovered.applyError, undefined);
  } finally { await f.close(); }
});
