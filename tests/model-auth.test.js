import test from "node:test";
import assert from "node:assert/strict";
import { createModelAuthService } from "../src/model-auth.js";
import { CredentialSynchronizationError } from "@earendil-works/pi-coding-agent";

const SECRET = "sk-super-secret-do-not-leak-42";

// 假 auth：script(interaction) 由各测试自定义登录脚本。
function fakeAuth(script) {
  const calls = { logins: [], refreshed: 0, changed: 0 };
  return {
    calls,
    authProviders: () => [{ id: "fake", name: "Fake", methods: [{ type: "oauth" }, { type: "api_key" }] }],
    login: async (providerId, authType, interaction) => { calls.logins.push({ providerId, authType }); await script(interaction); },
    logout: async () => {},
    refreshModels: async () => { calls.refreshed++; },
  };
}

async function waitFor(fn, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) assert.fail("waitFor 超时");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const noLeak = (value) => assert.ok(!JSON.stringify(value ?? null).includes(SECRET), "响应中泄露了 secret");
const status = (svc, flowId, owner) => svc.handle({ type: "models.auth.status", flowId }, owner);

test("start → prompt/respond → success：全程响应不含 token，refreshModels/onChanged 被调用", async () => {
  let loginDone;
  const done = new Promise((r) => (loginDone = r));
  const auth = fakeAuth(async (interaction) => {
    // 非法 URL 里带 token，必须被安全层丢弃
    interaction.notify({ type: "auth_url", url: `http://evil.example/cb#access_token=${SECRET}`, instructions: "evil" });
    interaction.notify({ type: "auth_url", url: "https://idp.example/authorize?client_id=abc", instructions: "打开登录页" });
    const code = await interaction.prompt({ type: "text", message: "粘贴授权码", placeholder: "code" });
    assert.equal(code, "the-code");
    interaction.notify({ type: "info", message: "登录成功", links: [{ url: `http://evil.example/token?t=${SECRET}`, label: "token" }] });
    loginDone();
  });
  const svc = createModelAuthService({ auth, onChanged: () => auth.calls.changed++ });

  const started = await svc.handle({ type: "models.auth.start", providerId: "fake", authType: "oauth" }, "ws-A");
  assert.equal(started.status, "running");
  assert.deepEqual(started.prompt, null);
  noLeak(started);

  await waitFor(() => status(svc, started.flowId, "ws-A").then((v) => v.prompt?.id));
  const withPrompt = await status(svc, started.flowId, "ws-A");
  assert.equal(withPrompt.prompt.type, "text");
  assert.equal(withPrompt.prompt.message, "粘贴授权码");
  noLeak(withPrompt);

  await svc.handle({ type: "models.auth.respond", flowId: started.flowId, promptId: withPrompt.prompt.id, value: "the-code" }, "ws-A");
  await done;
  const final = await waitFor(() => status(svc, started.flowId, "ws-A").then((v) => (v.status === "success" ? v : null)));
  assert.equal(auth.calls.logins.length, 1);
  assert.equal(auth.calls.refreshed, 1);
  assert.ok(auth.calls.changed >= 1);
  noLeak(final);
  svc.close("ws-A");
});

test("SDK 抛错时 error 脱敏为通用文案，不透出 SDK 错误详情", async () => {
  const auth = fakeAuth(async () => {
    throw new Error(`refresh_token=${SECRET} POST https://internal-idp.example/token failed: 401`);
  });
  const svc = createModelAuthService({ auth });
  const started = await svc.handle({ type: "models.auth.start", providerId: "fake", authType: "oauth" }, "ws-A");
  const final = await waitFor(() => status(svc, started.flowId, "ws-A").then((v) => (v.status === "error" ? v : null)));
  assert.equal(final.error, "登录失败，请检查网络与凭据后重试");
  assert.equal(final.credentialsSaved, false);
  noLeak(final);
});

test("凭据保存后刷新失败明确部分成功；广播异常不伪装成登录失败", async () => {
  const auth = fakeAuth(async () => {});
  auth.refreshModels = async () => { throw new Error(SECRET); };
  const svc = createModelAuthService({ auth });
  const started = await svc.handle({ type: "models.auth.start", providerId: "fake", authType: "oauth" }, "A");
  const result = await waitFor(() => status(svc, started.flowId, "A").then((v) => v.status === "error" && v));
  assert.equal(result.credentialsSaved, true);
  assert.equal(result.applied, false);
  assert.match(result.error, /无需重复授权/);
  noLeak(result);
  svc.close("A");
  const second = createModelAuthService({ auth: fakeAuth(async () => {}), onChanged: () => { throw new Error(SECRET); } });
  const ok = await second.handle({ type: "models.auth.start", providerId: "fake", authType: "api_key" }, "B");
  const applied = await waitFor(() => status(second, ok.flowId, "B").then((v) => v.status === "success" && v));
  assert.equal(applied.applied, true);
  assert.equal(applied.credentialsSaved, true);
  second.close("B");
});

test("SDK 登录凭据已落库但同步失败，重建目录可恢复且不泄漏错误携带的 credential", async () => {
  for (const canRecover of [true, false]) {
    const auth = fakeAuth(async () => { throw new CredentialSynchronizationError("fake", "login", { type: "api_key", key: SECRET }); });
    if (!canRecover) auth.refreshModels = async () => { throw new Error(SECRET); };
    const svc = createModelAuthService({ auth });
    const started = await svc.handle({ type: "models.auth.start", providerId: "fake", authType: "api_key" }, "A");
    const result = await waitFor(() => status(svc, started.flowId, "A").then((v) => v.status !== "running" && v));
    assert.equal(result.status, canRecover ? "success" : "error");
    assert.equal(result.credentialsSaved, true);
    assert.equal(result.applied, canRecover);
    if (!canRecover) assert.match(result.error, /无需重复授权/);
    noLeak(result);
    svc.close("A");
  }
});

test("凭据已保存后取消或超时，等待目录收尾并报告真实成功/部分成功", async () => {
  for (const timed of [false, true]) for (const applyOk of [false, true]) {
    let release;
    const auth = fakeAuth(async () => {});
    auth.refreshModels = () => new Promise((resolve, reject) => { release = () => applyOk ? resolve() : reject(new Error(SECRET)); });
    const svc = createModelAuthService({ auth, flowTimeoutMs: timed ? 30 : 2000 });
    const start = await svc.handle({ type: "models.auth.start", providerId: "fake", authType: "oauth" }, "A");
    await waitFor(() => release);
    if (timed) await new Promise((resolve) => setTimeout(resolve, 60));
    else await svc.handle({ type: "models.auth.cancel", flowId: start.flowId }, "A");
    const pending = await status(svc, start.flowId, "A");
    assert.equal(pending.credentialsSaved, true);
    assert.equal(pending.status, "running");
    release();
    const result = await waitFor(() => status(svc, start.flowId, "A").then((v) => v.status !== "running" && v));
    assert.equal(result.status, applyOk ? "success" : "error");
    assert.equal(result.credentialsSaved, true);
    assert.equal(result.applied, applyOk);
    if (!applyOk) assert.match(result.error, /无需重复授权/);
    noLeak(result); svc.close("A");
  }
});

test("跨 owner 拒绝 status/respond/cancel，本 owner 不受影响", async () => {
  const auth = fakeAuth(async (interaction) => { await interaction.prompt({ type: "text", message: "code" }); });
  const svc = createModelAuthService({ auth });
  const started = await svc.handle({ type: "models.auth.start", providerId: "fake", authType: "oauth" }, "ws-A");
  const promptId = await waitFor(() => status(svc, started.flowId, "ws-A").then((v) => v.prompt?.id));

  await assert.rejects(() => status(svc, started.flowId, "ws-B"), /登录流程已失效/);
  await assert.rejects(
    () => svc.handle({ type: "models.auth.respond", flowId: started.flowId, promptId, value: "x" }, "ws-B"),
    /登录流程已失效/,
  );
  await assert.rejects(() => svc.handle({ type: "models.auth.cancel", flowId: started.flowId }, "ws-B"), /登录流程已失效/);
  // 同 owner 仍可正常操作
  assert.equal((await status(svc, started.flowId, "ws-A")).status, "running");
  svc.close("ws-A");
});

test("cancel 中止：SDK 的 prompt 被拒，状态停在 cancelled 且不翻转为 error", async () => {
  let promptRejected;
  const rejected = new Promise((r) => (promptRejected = r));
  const auth = fakeAuth(async (interaction) => {
    try { await interaction.prompt({ type: "text", message: "code" }); } catch (error) { promptRejected(); throw error; }
  });
  const svc = createModelAuthService({ auth });
  const started = await svc.handle({ type: "models.auth.start", providerId: "fake", authType: "oauth" }, "ws-A");
  await waitFor(() => status(svc, started.flowId, "ws-A").then((v) => v.prompt?.id));

  const cancelled = await svc.handle({ type: "models.auth.cancel", flowId: started.flowId }, "ws-A");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.prompt, null);
  await rejected;
  await new Promise((r) => setTimeout(r, 30)); // 给登录 promise 翻转状态的机会
  const st = await status(svc, started.flowId, "ws-A");
  assert.equal(st.status, "cancelled");
  assert.equal(st.error, undefined);
  svc.close("ws-A");
});

test("非法 URL 不回传：非 https/本机 的 auth_url 与 links 被丢弃", async () => {
  const auth = fakeAuth(async (interaction) => {
    interaction.notify({ type: "auth_url", url: "javascript:alert(1)", instructions: "x" });
    interaction.notify({ type: "auth_url", url: `http://evil.example/cb?t=${SECRET}`, instructions: "x" });
    interaction.notify({ type: "auth_url", url: "https://ok.example/a", instructions: "y" });
    interaction.notify({ type: "info", message: "m", links: [{ url: "ftp://x/y", label: "drop" }, { url: "https://ok2.example/b", label: "keep" }] });
  });
  const svc = createModelAuthService({ auth });
  const started = await svc.handle({ type: "models.auth.start", providerId: "fake", authType: "oauth" }, "ws-A");
  const v = await waitFor(() => status(svc, started.flowId, "ws-A").then((s) => (s.events.length >= 4 ? s : null)));
  assert.equal(v.events[0].url, undefined);
  assert.equal(v.events[1].url, undefined);
  assert.equal(v.events[2].url, "https://ok.example/a");
  assert.deepEqual(v.events[3].links, [{ url: "https://ok2.example/b", label: "keep" }]);
  assert.ok(!JSON.stringify(v).includes("evil.example"));
  noLeak(v);
});
