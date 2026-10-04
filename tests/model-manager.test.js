import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { publicSource } from "./helpers/public-source.js";

const source = await publicSource("model-auth", "model-limits", "model-manager");
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
function harness(overrides = {}) {
  const dom = new JSDOM('<body><div id="root"></div></body>', { runScripts: "outside-only" });
  const data = { fingerprint: "f1", providers: [], catalog: [
    { provider: "a", id: "model", name: "Example model" },
  ], authProviders: [
    { id: "openai-codex", name: "Codex", methods: [{ type: "oauth" }] },
    { id: "a", name: "Alpha", methods: [{ type: "api_key" }, { type: "oauth" }] },
    { id: "env", name: "Environment", methods: [] },
  ], ...overrides };
  const calls = []; let error; let saved = 0;
  dom.window.request = async (type, args) => {
    calls.push({ type, args });
    if (type === "models.config.get") return data;
    if (error) throw new Error(error);
    return { applied: true };
  };
  dom.window.changed = () => { saved++; };
  dom.window.eval(`${source}\nwindow.manager = initModelManager({root: document.getElementById('root'), request, onSaved: changed});`);
  const doc = dom.window.document;
  const button = (text) => [...doc.querySelectorAll("button")].find((b) => b.textContent === text);
  const input = (n, value) => { n.value = value; n.dispatchEvent(new dom.window.Event("input")); };
  return { dom, doc, data, calls, button, input, saved: () => saved, fail: (s) => { error = s; }, load: () => dom.window.manager.load() };
}

test("统一原生供应商：不突出 Codex，不提供模型显隐、模板或能力编辑", async () => {
  const h = harness({ hidden: ["a", "a/model"] });
  try {
    await h.load();
    assert.match(h.doc.querySelector(".mm-nav-item").textContent, /Alpha/);
    assert.ok(h.button("OAuth 登录")); assert.ok(h.button("配置 API Key"));
    assert.match(h.doc.querySelector(".mm-catalog").textContent, /Example model/);
    assert.doesNotMatch(h.doc.body.textContent, /隐藏|恢复显示|Codex 订阅|ChatGPT|添加模型|模板|思考等级/);
    assert.equal(h.doc.querySelector(".mm-catalog input"), null);
    assert.equal(h.doc.querySelector(".mm-limits").parentElement, h.doc.querySelector(".mm-detail"));
    h.input(h.doc.querySelector(".mm-search"), "example");
    assert.equal(h.doc.querySelectorAll(".mm-nav-item").length, 1);
    assert.equal(h.calls.length, 1, "目录只读，不额外拉取上游或读取限额");
  } finally { h.dom.window.close(); }
});

test("环境供应商无伪造登录入口；原生双认证供应商显示两种方式", async () => {
  const h = harness();
  try {
    await h.load();
    [...h.doc.querySelectorAll(".mm-nav-item")].find((b) => b.textContent.includes("Environment")).click();
    assert.equal(h.button("配置 API Key"), undefined); assert.equal(h.button("OAuth 登录"), undefined);
    assert.match(h.doc.querySelector(".mm-auth-section").textContent, /环境凭据/);
  } finally { h.dom.window.close(); }
});

test("Pi 原生配置完整草稿保留：掩码转 keep、未知字段和模型覆盖不丢失，成功后通知", async () => {
  const h = harness({ providers: [{ id: "a", apiKey: { masked: true }, compat: { custom: true, masked: true }, models: [{ id: "private" }], modelOverrides: { model: { contextWindow: 12345 } } }] });
  try {
    await h.load();
    const value = JSON.parse(h.doc.querySelector("textarea").value);
    assert.deepEqual(value.apiKey, { keep: true }); assert.equal(value.compat.custom, true); assert.equal(value.compat.masked, true);
    value.models.push({ id: "new-model" }); h.input(h.doc.querySelector("textarea"), JSON.stringify(value));
    await h.load(); assert.match(h.doc.querySelector("textarea").value, /new-model/);
    h.doc.querySelector(".mm-config-form").dispatchEvent(new h.dom.window.Event("submit", { cancelable: true })); await tick();
    const call = h.calls.find((c) => c.type === "models.provider.configure");
    assert.deepEqual(JSON.parse(JSON.stringify(call.args)), { providerId: "a", baseFingerprint: "f1", provider: value });
    assert.equal(h.saved(), 1); assert.match(h.doc.querySelector(".mm-alert").textContent, /连接尚未验证/);
  } finally { h.dom.window.close(); }
});

test("原生配置失败保留草稿与旧指纹，刷新不得静默覆盖外部改动；显式放弃后采用新指纹", async () => {
  const h = harness();
  try {
    await h.load(); h.input(h.doc.querySelector("textarea"), '{"baseUrl":"https://example.invalid"}');
    h.data.fingerprint = "f2"; await h.load(); h.fail("模型配置已被外部修改");
    h.doc.querySelector(".mm-config-form").dispatchEvent(new h.dom.window.Event("submit", { cancelable: true })); await tick();
    assert.equal(h.calls.find((c) => c.type === "models.provider.configure").args.baseFingerprint, "f1");
    assert.match(h.doc.querySelector("textarea").value, /example.invalid/);
    assert.match(h.doc.querySelector(".mm-alert").textContent, /外部修改/);
    h.button("放弃草稿并重新加载").click(); h.fail("");
    h.doc.querySelector(".mm-config-form").dispatchEvent(new h.dom.window.Event("submit", { cancelable: true })); await tick();
    assert.equal(h.calls.filter((c) => c.type === "models.provider.configure").at(-1).args.baseFingerprint, "f2");
  } finally { h.dom.window.close(); }
});

test("自定义入口只发送 Pi JSON，非法 JSON 不发请求，删除需要确认", async () => {
  const h = harness({ providers: [{ id: "a", models: [] }] });
  try {
    await h.load(); h.button("删除自定义配置").click();
    assert.match(h.doc.querySelector("dialog").textContent, /不删除登录凭据/);
    assert.equal(h.calls.some((c) => c.type === "models.provider.delete"), false);
    h.button("取消").click(); h.button("自定义供应商").click();
    const form = h.doc.querySelector(".mm-config-form"); h.input(form.querySelector("input"), "local");
    h.input(form.querySelector("textarea"), "[]"); form.dispatchEvent(new h.dom.window.Event("submit", { cancelable: true })); await tick();
    assert.equal(h.calls.some((c) => c.type === "models.provider.configure"), false);
    h.input(form.querySelector("textarea"), '{"api":"openai-completions","baseUrl":"http://localhost:1234/v1","models":[{"id":"local"}]}');
    form.dispatchEvent(new h.dom.window.Event("submit", { cancelable: true })); await tick();
    assert.equal(h.calls.find((c) => c.type === "models.provider.configure").args.providerId, "local");
  } finally { h.dom.window.close(); }
});
