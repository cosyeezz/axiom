import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { publicSource } from "./helpers/public-source.js";
import { modelOverrideIn } from "../src/protocol.js";

// 被测模块与 file-picker.test.js 同一装载方式：model-manager 现已 import model-auth（登录 UI），
// 装载顺序为先剥 export 求值 model-auth.js，再去掉 import 行并剥 export 求值 model-manager.js，
// 两个模块在同一 eval 作用域内共享符号。
const authSource = (await readFile(new URL("../public/model-auth.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const limitsSource = (await readFile(new URL("../public/model-limits.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const source = await publicSource("model-manager");
const tick = () => new Promise(setImmediate);
// 组件在窗口 realm 内构造对象，跨 realm 的 deepStrictEqual 会因原型不同而失败，先转成本 realm。
const j = (value) => JSON.parse(JSON.stringify(value));

const masked = (kind) => ({ masked: true, kind });

function harness() {
  const dom = new JSDOM("<!doctype html><body><div id='root'></div></body>", { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const calls = [];
  window.request = (type, args) => {
    const call = { type, args };
    calls.push(call);
    return new Promise((resolve, reject) => {
      call.resolve = resolve;
      call.reject = reject;
    });
  };
  window.eval(`${authSource}\n${limitsSource}\n${source}\nwindow.init = initModelManager; window.templates = PROVIDER_TEMPLATES;`);
  const saved = [];
  const manager = window.init({
    root: window.document.getElementById("root"),
    request: window.request,
    onSaved: () => saved.push(true),
  });
  // get 的返回在多次调用间延续（保存/删除后的回读沿用最新配置），overrides 做合并。
  let current = { fingerprint: "fp-1", path: "~/.pi/agent/models.json", providers: [], catalog: [] };
  const settle = async () => { for (let index = 0; index < 6; index++) await tick(); };
  const pending = (type) => calls.filter((call) => call.type === type && !call.settled);
  const lastPending = (type) => pending(type).at(-1);
  const flushGet = (overrides = {}) => {
    current = { ...current, ...overrides };
    for (const call of pending("models.config.get")) {
      call.settled = true;
      call.resolve({ ...current });
    }
  };
  const root = () => window.document.getElementById("root");
  const button = (text) => [...window.document.querySelectorAll("button")].find((node) => node.textContent === text);
  const setInput = (input, value) => {
    input.value = value;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const navItem = (text) => [...root().querySelectorAll(".mm-nav-item")].find((node) => node.textContent.includes(text));
  const detail = () => root().querySelector(".mm-detail");
  // 详情页分两级：「供应商」（连接）与「模型」。模型行只在模型分区渲染。
  const tab = (label) => [...root().querySelectorAll(".mm-tabs .mm-tab")].find((node) => node.textContent.startsWith(label));
  const openModels = async () => { tab("模型").click(); await settle(); };
  const openConnection = async () => { tab("供应商").click(); await settle(); };
  const selectProvider = async (id, { models = false } = {}) => {
    navItem(id).click();
    await settle();
    if (models) await openModels();
  };
  return { window, calls, saved, manager, settle, pending, lastPending, flushGet, button, setInput, navItem, detail,
    selectProvider, root, tab, openModels, openConnection };
}

test("模板常量覆盖常见供应商与本地服务", () => {
  const h = harness();
  const byId = Object.fromEntries(h.window.templates.map((template) => [template.id, template]));
  assert.equal(byId.anthropic.api, "anthropic-messages");
  assert.equal(byId["openai"].baseUrl, "https://api.openai.com/v1");
  assert.equal(byId.ollama.baseUrl, "http://localhost:11434/v1");
  assert.ok(byId.ollama.models[0].id.startsWith("llama"));
  h.window.close();
});

test("供应商协议清除后回读、再次保存和刷新仍保持不设置，新建仍用模板", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "anthropic-messages" }] });
  await loaded;
  const apiSelect = () => h.detail().querySelector('select[aria-label="API 协议"]');
  assert.equal(apiSelect().value, "anthropic-messages");
  apiSelect().value = "";
  apiSelect().dispatchEvent(new h.window.Event("change", { bubbles: true }));
  h.button("保存供应商").click();
  const save = h.lastPending("models.provider.save");
  assert.equal(save.args.provider.api, null);
  save.settled = true;
  save.resolve({});
  await h.settle();
  h.flushGet({ fingerprint: "fp-2", providers: [{ id: "p1" }] });
  await h.settle();
  assert.equal(apiSelect().value, "", "保存回读不能补成 OpenAI");
  h.button("保存供应商").click();
  assert.equal(Object.hasOwn(h.lastPending("models.provider.save").args.provider, "api"), false);
  h.lastPending("models.provider.save").resolve({});
  await h.settle();
  h.flushGet();
  await h.settle();
  const refreshed = h.manager.load();
  h.flushGet();
  await refreshed;
  assert.equal(apiSelect().value, "");
  h.button("添加供应商").click();
  assert.equal(apiSelect().value, "openai-completions", "新建模板默认值不变");
  h.window.close();
});

test("加载后导航合并展示自定义与内置目录，默认选中目录模型且能力可展开编辑", async () => {
  const h = harness();
  const loaded = h.manager.load();
  await h.settle();
  assert.equal(h.calls[0].type, "models.config.get");
  assert.equal(Object.keys(h.calls[0].args).length, 0);
  h.flushGet({
    catalog: [
      { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", key: "anthropic/claude-sonnet-4-5", reasoning: true, levels: ["off", "high"], input: ["text", "image"] },
      { provider: "openai", id: "gpt-5.1", name: "GPT-5.1", key: "openai/gpt-5.1", levels: [], input: ["text"] },
    ],
  });
  await h.settle();
  await loaded;
  // 自定义与内置目录合并进同一个「供应商」分组（不再有只读的「内置与扩展」分组）。
  const groups = [...h.root().querySelectorAll(".mm-nav-group")].map((node) => node.textContent);
  assert.deepEqual(groups, ["供应商"]);
  assert.ok(h.navItem("anthropic"), "目录供应商进入导航");
  assert.ok(h.navItem("openai"));
  // 无自定义供应商时自动选中第一个目录项；模型在「模型」分区：模型名称 + 实际 id + 图片徽标。
  await h.openModels();
  const detail = h.detail();
  assert.match(detail.textContent, /Claude Sonnet 4\.5/);
  assert.match(detail.textContent, /claude-sonnet-4-5/);
  const badges = [...detail.querySelectorAll(".mm-badge")].map((node) => node.textContent);
  assert.equal(badges.filter((text) => text === "图片").length, 1);
  // 推理能力在目录条目上以思考等级（levels）呈现：勾选状态落在展开行的等级列表里。
  const levels = [...detail.querySelectorAll(".mm-thinking-levels input:checked")]
    .map((box) => box.parentElement.textContent).sort();
  assert.deepEqual(levels, ["high", "off"], "目录 levels 渲染为思考等级勾选");
  assert.equal(h.saved.length, 0, "初次加载不触发 onSaved");
  h.window.close();
});

test("自定义供应商进编辑器，掩码密钥不泄露、不注入；目录供应商同页可编辑", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{
      id: "my-proxy",
      baseUrl: "https://proxy.example.com/v1",
      api: "anthropic-messages",
      apiKey: masked("literal"),
      headers: { "x-key": masked("env") },
      models: [{ id: "claude-opus-5", name: "Claude Opus 5", reasoning: true, input: ["text", "image"], contextWindow: 200000 }],
    }],
    catalog: [
      { provider: "my-proxy", id: "claude-opus-5", name: "Claude Opus 5", key: "my-proxy/claude-opus-5", levels: ["high"], input: ["text", "image"] },
      { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", key: "anthropic/claude-sonnet-4-5", levels: ["high"], input: ["text"] },
    ],
  });
  await h.settle();
  await loaded;
  // my-proxy 已自定义 → 出现在「供应商」分组；内置目录与自定义并列展示，不再拆只读分组。
  assert.ok(h.navItem("my-proxy"));
  assert.ok(h.navItem("anthropic"));

  await h.selectProvider("my-proxy");
  const form = h.detail();
  // 拉取入口在「模型」分区：点击后才发起只读发现请求（专项测试见文件末尾拉取分组）。
  await h.openModels();
  const fetchBtn = [...h.detail().querySelectorAll("button")].find((b) => b.textContent === "拉取模型列表…");
  assert.ok(fetchBtn, "供应商模型分区提供拉取模型列表入口");
  assert.equal(fetchBtn.disabled, false, "协议已定，按钮默认启用");
  await h.openConnection();
  const keyInput = form.querySelector("input[type='password']");
  assert.equal(keyInput.value, "", "已配置的密钥不下发明文");
  assert.match(keyInput.placeholder, /留空保留/);
  const headerValue = form.querySelector(".mm-header-row input[type='password']");
  assert.equal(headerValue.value, "");
  // 小眼睛只切换本次输入的可见性，且不篡改已配置的值。
  const eye = form.querySelector(".mm-key-reveal");
  assert.equal(eye.getAttribute("aria-pressed"), "false");
  const iconBefore = eye.querySelector("path").getAttribute("d");
  eye.click();
  assert.equal(keyInput.type, "text", "点小眼睛可将本次输入切换为明文");
  assert.notEqual(eye.querySelector("path").getAttribute("d"), iconBefore, "图标同步切换为斜杠眼");
  assert.equal(eye.getAttribute("aria-pressed"), "true");
  eye.click();
  assert.equal(keyInput.type, "password");
  assert.equal(keyInput.value, "", "回显后密钥仍为空，不会把已存密钥泄露到界面");
  assert.equal(h.root().textContent.includes("masked"), false, "掩码对象不出现在界面文本中");

  // 内置 anthropic 目录页：连接分区只给内置说明与自定义连接入口，模型行在模型分区（覆盖语义）。
  await h.selectProvider("anthropic");
  const connection = h.detail();
  assert.ok([...connection.querySelectorAll("button")].some((b) => b.textContent === "配置自定义连接"));
  assert.ok([...connection.querySelectorAll("button")].some((b) => b.textContent === "隐藏此供应商"));
  assert.equal(connection.querySelector(".mm-model"), null, "连接分区不渲染模型行");
  await h.openModels();
  const catalog = h.detail();
  assert.match(catalog.textContent, /claude-sonnet-4-5/);
  assert.match(catalog.textContent, /展开模型可配置名称、上下文和思考等级/);
  assert.ok(catalog.querySelector(".mm-model"), "目录模型行可直接展开编辑");
  assert.equal(catalog.querySelector(".mm-form"), null, "连接表单仍收敛在草稿/编辑器里");
  h.window.close();
});

test("搜索同时命中供应商与模型，过滤左右两组导航", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{ id: "p1", api: "openai-completions", models: [{ id: "gpt-x", name: "GPT X" }] }],
    catalog: [
      { provider: "openai", id: "gpt-5.1", name: "GPT-5.1", key: "openai/gpt-5.1", levels: [], input: ["text"] },
      { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", key: "anthropic/claude-sonnet-4-5", levels: [], input: ["text"] },
    ],
  });
  await h.settle();
  await loaded;
  const search = h.root().querySelector(".mm-search");
  const visible = () => [...h.root().querySelectorAll(".mm-nav-item")].map((node) => node.textContent);

  h.setInput(search, "gpt");
  assert.deepEqual(visible().filter((text) => !text.includes("＋")), ["p1", "openai"].map((id) => h.navItem(id).textContent), "gpt 命中自定义模型与 openai 目录");
  assert.ok(!h.navItem("anthropic"), "anthropic 被过滤");

  h.setInput(search, "claude");
  assert.ok(h.navItem("anthropic"), "claude 命中目录模型");
  assert.ok(!h.navItem("p1"));

  h.setInput(search, "zzz");
  assert.match(h.root().textContent, /没有匹配的供应商或模型/);
  h.setInput(search, "");
  assert.ok(h.navItem("p1") && h.navItem("anthropic"));
  h.window.close();
});

test("模板新增供应商：载荷含模板预填且不带 models，成功后刷新并回调 onSaved", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet();
  await h.settle();
  await loaded;
  h.button("添加供应商").click();
  await h.settle();
  const draft = h.detail();
  const select = draft.querySelector("select");
  select.value = "anthropic";
  select.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  await h.settle();
  const draftAfter = h.detail();
  setInput_on(draftAfter.querySelector(".mm-form input[type='text']"), "my-anthropic", h);
  // 模型分区在供应商落盘前禁用：模板示例模型只以提示存在，不渲染可编辑行。
  assert.equal(h.tab("模型").disabled, true, "草稿阶段模型分区禁用");
  assert.equal(draftAfter.querySelector(".mm-model"), null, "草稿不渲染模型行");
  assert.match(draftAfter.textContent, /已准备 1 条待写入的模型/);
  h.button("保存供应商").click();
  await h.settle();
  const save = h.lastPending("models.provider.save");
  assert.ok(save, "发出 provider.save");
  assert.equal(save.args.providerId, "my-anthropic");
  assert.equal(save.args.baseFingerprint, "fp-1");
  assert.deepEqual(j(save.args.provider), {
    baseUrl: "https://api.anthropic.com",
    api: "anthropic-messages",
    apiKey: "$ANTHROPIC_API_KEY",
  });
  save.settled = true;
  save.resolve({ fingerprint: "fp-2" });
  await h.settle();
  assert.ok(h.lastPending("models.config.get"), "保存后回读目录");
  h.flushGet({ fingerprint: "fp-2", providers: [{ id: "my-anthropic", baseUrl: "https://api.anthropic.com", api: "anthropic-messages" }] });
  await h.settle();
  assert.equal(h.saved.length, 1);
  assert.match(h.root().textContent, /已保存供应商「my-anthropic」/);
  // 保存成功后草稿关闭，直接停在新供应商的「模型」分区，模板示例模型迁为待保存行。
  assert.ok(!h.navItem("＋ "), "草稿导航项消失");
  assert.ok(h.navItem("my-anthropic"), "已保存供应商进入导航");
  assert.equal(h.tab("模型").getAttribute("aria-selected"), "true", "自动跳到模型分区");
  assert.ok([...h.detail().querySelectorAll(".mm-model input[type='text']")].some((input) => input.value === "claude-sonnet-4-5"),
    "模板示例模型迁移为该供应商的待保存行");
  h.window.close();
});

function setInput_on(input, value, h) {
  h.setInput(input, value);
}

test("密钥保存语义：空=keep、新值=字符串、清除=null、禁止新增 ! 命令值", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", apiKey: masked("command"), headers: { "x-a": masked("env") } }],
  });
  await h.settle();
  await loaded;
  await h.selectProvider("p1");
  const saveAndSettle = async () => {
    h.button("保存供应商").click();
    await h.settle();
    const save = h.lastPending("models.provider.save");
    save.settled = true;
    save.resolve({ fingerprint: `fp-${h.calls.length}` });
    await h.settle();
    h.flushGet();
    await h.settle();
    return save;
  };
  const keyOf = () => h.detail().querySelector("input[type='password']");

  let save = await saveAndSettle();
  assert.deepEqual(j(save.args.provider.apiKey), { keep: true }, "掩码+空输入=keep");
  assert.deepEqual(j(save.args.provider.headers), { "x-a": { keep: true } });

  h.setInput(keyOf(), "sk-new");
  save = await saveAndSettle();
  assert.equal(save.args.provider.apiKey, "sk-new");

  const clear = h.detail().querySelector("input[aria-label='清除已保存的 API Key']");
  clear.checked = true;
  clear.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  save = await saveAndSettle();
  assert.equal(save.args.provider.apiKey, null);

  const before = h.calls.length;
  h.setInput(keyOf(), "!secret-factory");
  h.button("保存供应商").click();
  await h.settle();
  assert.equal(h.calls.length, before, "非法密钥不发请求");
  assert.match(h.root().textContent, /不能新增命令执行型/);
  h.window.close();
});

test("删除改为导航/行内图标 + 原生弹窗确认：取消不发请求，确认才发", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [{ id: "m1", contextWindow: 1000 }] }],
  });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  const dialog = () => h.window.document.querySelector(".mm-dialog");
  const dialogButton = (text) => [...dialog().querySelectorAll(".dialog-actions button")].find((node) => node.textContent === text);
  const modelDelete = () => h.detail().querySelector(".mm-model-row-actions .mm-icon-delete");

  // 模型：图标 → 弹窗；取消不发请求
  modelDelete().click();
  await h.settle();
  assert.match(dialog().textContent, /删除模型「m1」/);
  assert.equal(h.calls.length, 1, "只打开弹窗，不发请求");
  dialogButton("取消").click();
  await h.settle();
  assert.equal(h.calls.length, 1, "取消不发请求");
  assert.equal(dialog(), null, "弹窗关闭后从 DOM 摘除");

  // 再次打开 → 确认才发请求
  modelDelete().click();
  await h.settle();
  dialogButton("删除").click();
  await h.settle();
  const modelDel = h.lastPending("models.model.delete");
  assert.deepEqual(j(modelDel.args), { providerId: "p1", modelId: "m1", baseFingerprint: "fp-1" });
  modelDel.settled = true;
  modelDel.resolve({ fingerprint: "fp-7" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-7", providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [] }] });
  await h.settle();
  assert.match(h.root().textContent, /已删除模型「m1」/);
  assert.equal(h.detail().querySelectorAll(".mm-model").length, 0, "模型行已移除");

  // 供应商：删除移到左侧导航行的图标
  const beforeProviderDelete = h.calls.length;
  h.navItem("p1").parentElement.querySelector(".mm-icon-delete").click();
  await h.settle();
  assert.match(dialog().textContent, /删除供应商「p1」/);
  assert.equal(h.calls.length, beforeProviderDelete, "只打开弹窗，不发请求");
  dialogButton("删除").click();
  await h.settle();
  const del = h.lastPending("models.provider.delete");
  assert.deepEqual(j(del.args), { providerId: "p1", baseFingerprint: "fp-7" });
  del.settled = true;
  del.resolve({ fingerprint: "fp-8" });
  await h.settle();
  h.flushGet({ providers: [] });
  await h.settle();
  assert.match(h.root().textContent, /已删除供应商「p1」/);
  assert.equal(h.detail().querySelector(".mm-model"), null, "供应商详情已退场");
  assert.ok(!h.navItem("p1"), "导航项已移除");
  h.window.close();
});

test("重命名走原子命令：弹窗校验失败留在弹窗，成功后缓存随新 id 迁移", async () => {
  const h = harness();
  const loaded = h.manager.load();
  const provider = { id: "p1", baseUrl: "https://p1.example.com/v1", api: "openai-completions", apiKey: masked("literal"), models: [{ id: "m1", contextWindow: 1000 }] };
  h.flushGet({ providers: [provider] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1");
  // 制造一份未保存编辑，验证重命名后草稿跟着迁移
  h.setInput(h.detail().querySelector(".mm-form input[type='text']"), "https://edited.example.com/v1");
  const dialog = () => h.window.document.querySelector(".mm-dialog");
  const confirm = () => [...dialog().querySelectorAll(".dialog-actions button")].find((node) => node.textContent === "重命名");
  const openRename = async () => { h.navItem("p1").parentElement.querySelector(".mm-icon-rename").click(); await h.settle(); };

  await openRename();
  const input = dialog().querySelector("input[type='text']");
  assert.equal(input.value, "p1", "输入框预填当前 id");
  h.setInput(input, "bad id!");
  confirm().click();
  await h.settle();
  assert.equal(h.calls.length, 1, "非法 id 不发请求");
  assert.ok(dialog(), "校验失败时弹窗保留");
  assert.match(dialog().querySelector(".mm-dialog-error").textContent, /仅含字母/);

  h.setInput(input, "p1");
  confirm().click();
  await h.settle();
  assert.equal(h.calls.length, 1, "id 未变化不发请求");
  assert.equal(dialog(), null, "无改动直接关窗");

  await openRename();
  const input2 = dialog().querySelector("input[type='text']");
  h.setInput(input2, "p1-new");
  const enter = new h.window.Event("keydown", { bubbles: true });
  enter.key = "Enter";
  input2.dispatchEvent(enter);
  await h.settle();
  const rename = h.lastPending("models.provider.rename");
  assert.deepEqual(j(rename.args), { providerId: "p1", newProviderId: "p1-new", baseFingerprint: "fp-1" });
  rename.settled = true;
  rename.resolve({ fingerprint: "fp-2" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-2", providers: [{ ...provider, id: "p1-new" }] });
  await h.settle();
  assert.match(h.root().textContent, /已将供应商「p1」重命名为「p1-new」/);
  const navIds = () => [...h.root().querySelectorAll(".mm-nav-id")].map((node) => node.textContent);
  assert.deepEqual(navIds(), ["p1-new"], "导航只剩新 id");
  assert.equal(h.detail().querySelector(".mm-form input[type='text']").value, "https://edited.example.com/v1", "未保存编辑随新 id 保留");
  h.window.close();
});

test("模型价格字段回填、非法值阻止保存、零费率与 tiers 保留", async () => {
  const h = harness();
  const loaded = h.manager.load();
  const tiers = [{ inputTokensAbove: 200000, input: 6, output: 30, cacheRead: .6, cacheWrite: 7.5 }];
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [{ id: "m1", cost: { input: 3, output: 15, cacheRead: .3, cacheWrite: 3.75, tiers } }] }] });
  await h.settle(); await loaded; await h.selectProvider("p1", { models: true });
  const model = h.detail().querySelector(".mm-model");
  const input = model.querySelector('[aria-label="费用·输入（USD/百万 tokens）"]');
  const saveButton = model.querySelector(".mm-model-actions button");
  assert.equal(input.value, "3");
  assert.equal(saveButton.disabled, true);
  h.setInput(input, "-1");
  assert.equal(saveButton.disabled, true);
  assert.match(saveButton.title, /非负数/);
  h.setInput(input, "abc");
  assert.equal(saveButton.disabled, true);
  h.setInput(input, "0");
  assert.equal(saveButton.disabled, false);
  saveButton.click(); await h.settle();
  const save = h.lastPending("models.model.save");
  assert.deepEqual(j(save.args.model.cost), { input: 0, output: 15, cacheRead: .3, cacheWrite: 3.75, tiers });
  save.settled = true; save.resolve({ fingerprint: "fp-4" });
  await h.settle(); h.flushGet(); await h.settle(); h.window.close();
});

test("模型编辑为整条替换 upsert：未知字段保留、脏检查阻止空写", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{
      id: "p1",
      baseUrl: "https://p.example.com",
      api: "openai-completions",
      models: [{ id: "m1", name: "Old", cost: { input: 3, output: 9 }, contextWindow: 1000, reasoning: true, note: "keepme" }],
    }],
  });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  const saveButton = [...h.detail().querySelectorAll(".mm-model-actions button")]
    .find((node) => node.textContent === "保存修改");
  assert.equal(saveButton.disabled, true, "未更改的模型不可保存");
  const model = h.detail().querySelector(".mm-model");
  const numeric = model.querySelectorAll("input[inputmode='numeric']");
  h.setInput(numeric[0], "2000");
  assert.equal(saveButton.disabled, false);
  saveButton.click();
  await h.settle();
  const save = h.lastPending("models.model.save");
  assert.deepEqual(j(save.args), {
    providerId: "p1",
    baseFingerprint: "fp-1",
    model: { note: "keepme", cost: { input: 3, output: 9 }, id: "m1", name: "Old", reasoning: true, contextWindow: 2000 },
  });
  save.settled = true;
  save.resolve({ fingerprint: "fp-4" });
  await h.settle();
  h.flushGet();
  await h.settle();
  assert.equal(h.saved.length, 1);
  h.window.close();
});

test("自定义供应商模型的思考等级勾选回退到目录 levels，与会话选择器一致", async () => {
  const h = harness();
  const loaded = h.manager.load();
  // 配置原文没有 levels 字段（只有 thinkingLevelMap）；目录条目才带服务端算出的真实可用等级。
  h.flushGet({
    providers: [{
      id: "kiro",
      api: "openai-completions",
      models: [{ id: "claude-opus-5", reasoning: true, thinkingLevelMap: { high: "high", xhigh: "xhigh" } }],
    }],
    catalog: [{
      provider: "kiro", id: "claude-opus-5", key: "kiro/claude-opus-5",
      levels: ["off", "minimal", "low", "medium", "high", "xhigh"], input: ["text"],
    }],
  });
  await h.settle();
  await loaded;
  await h.selectProvider("kiro", { models: true });
  const row = h.detail().querySelector(".mm-models .mm-model");
  const checked = [...row.querySelectorAll(".mm-thinking-levels input:checked")]
    .map((box) => box.parentElement.textContent);
  assert.deepEqual(checked, ["off", "minimal", "low", "medium", "high", "xhigh"],
    "未显式映射的等级仍可用，勾选状态必须照目录 levels 显示，不能只勾映射里那两个");
  h.window.close();
});

test("添加模型走 upsert，只发改动字段", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  h.button("添加模型").click();
  await h.settle();
  const model = [...h.detail().querySelectorAll(".mm-model")].at(-1);
  const inputs = model.querySelectorAll("input[type='text']");
  h.setInput(inputs[0], "new-model");
  h.setInput(inputs[1], "New Model");
  const save = [...model.querySelectorAll("button")].find((node) => node.textContent === "保存模型");
  save.click();
  await h.settle();
  const call = h.lastPending("models.model.save");
  assert.deepEqual(j(call.args.model), { id: "new-model", name: "New Model" });
  call.settled = true;
  call.resolve({ fingerprint: "fp-3" });
  await h.settle();
  h.flushGet();
  await h.settle();
  assert.match(h.root().textContent, /已保存模型「new-model」/);
  h.window.close();
});

test("保存失败保留草稿：新模型行不被移除，供应商表单值与按钮均可重试", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });

  // 新模型行保存失败：行留在原地、输入值保留。
  h.button("添加模型").click();
  await h.settle();
  const row = () => [...h.detail().querySelectorAll(".mm-model")].at(-1);
  h.setInput(row().querySelector("input[type='text']"), "draft-m");
  row().querySelector(".mm-model-actions button").click();
  await h.settle();
  const save = h.lastPending("models.model.save");
  save.settled = true;
  save.reject(new Error("服务端校验失败"));
  await h.settle();
  assert.match(h.root().textContent, /保存失败：服务端校验失败/);
  assert.ok(row(), "失败的草稿行未被移除");
  assert.equal(row().querySelector("input[type='text']").value, "draft-m", "草稿输入值保留");
  assert.equal(row().querySelector(".mm-model-actions button").disabled, false, "按钮恢复可重试");
  // 重试成功后草稿才移除。
  row().querySelector(".mm-model-actions button").click();
  await h.settle();
  const retry = h.lastPending("models.model.save");
  assert.equal(retry.args.model.id, "draft-m");
  retry.settled = true;
  retry.resolve({ fingerprint: "fp-5" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-5", providers: [{ id: "p1", api: "openai-completions", models: [{ id: "draft-m" }] }] });
  await h.settle();
  assert.match(h.root().textContent, /已保存模型「draft-m」/);
  h.window.close();
});

test("供应商草稿保存失败不关闭草稿、表单保留，成功后才转入已保存供应商", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet();
  await h.settle();
  await loaded;
  h.button("添加供应商").click();
  await h.settle();
  h.setInput(h.detail().querySelector(".mm-form input[type='text']"), "p9");
  h.button("保存供应商").click();
  await h.settle();
  const save = h.lastPending("models.provider.save");
  save.settled = true;
  save.reject(new Error("写入失败"));
  await h.settle();
  assert.match(h.root().textContent, /保存失败：写入失败/);
  assert.equal(h.detail().querySelector(".mm-form input[type='text']").value, "p9", "草稿 id 保留");
  assert.ok(h.navItem("＋ p9"), "草稿仍在导航");
  assert.equal(h.tab("模型").disabled, true, "失败后仍未落盘，模型分区保持禁用");
  h.button("保存供应商").click();
  await h.settle();
  const retry = h.lastPending("models.provider.save");
  retry.settled = true;
  retry.resolve({ fingerprint: "fp-6" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-6", providers: [{ id: "p9", api: "openai-completions" }] });
  await h.settle();
  assert.ok(!h.navItem("＋ p9"), "成功后草稿关闭");
  assert.ok(h.navItem("p9"), "新供应商进入导航并被选中");
  assert.equal(h.tab("模型").disabled, false, "落盘后模型分区可用");
  assert.match(h.root().textContent, /已保存供应商「p9」，现在可以配置它的模型/);
  h.window.close();
});

test("保存失败与外部修改冲突都在面板内展示，冲突可重新加载并携带新指纹", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions" }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1");
  const baseUrlInput = () => [...h.detail().querySelectorAll(".mm-form input[type='text']")]
    .find((input) => input.value.startsWith("https://"));
  h.setInput(baseUrlInput(), "https://changed.example.com/v1");
  h.button("保存供应商").click();
  await h.settle();
  const save = h.lastPending("models.provider.save");
  save.settled = true;
  save.reject(new Error("校验失败：api 缺失"));
  await h.settle();
  const root = h.root();
  assert.match(root.textContent, /保存失败：校验失败/);
  assert.equal(save.args.baseFingerprint, "fp-1");
  assert.equal(baseUrlInput().value, "https://changed.example.com/v1", "失败后表单值原地保留");

  // 冲突：错误消息带「已被外部修改」，重新加载（草稿保留）后再保存使用新指纹。
  h.button("保存供应商").click();
  await h.settle();
  const conflict = h.lastPending("models.provider.save");
  conflict.settled = true;
  conflict.reject(new Error("models.json 已被外部修改"));
  await h.settle();
  assert.match(root.textContent, /已被其他窗口修改/);
  const reload = [...root.querySelectorAll(".mm-alert button")].find((node) => node.textContent === "重新加载");
  reload.click();
  await h.settle();
  h.flushGet({ fingerprint: "fp-99" });
  await h.settle();
  // 重载后表单仍展开且编辑保留，直接再次保存。
  assert.equal(baseUrlInput().value, "https://changed.example.com/v1", "显式重载不丢未保存编辑");
  h.button("保存供应商").click();
  await h.settle();
  const retry = h.lastPending("models.provider.save");
  assert.equal(retry.args.baseFingerprint, "fp-99", "重新加载后携带新指纹");
  retry.settled = true;
  retry.resolve({ fingerprint: "fp-100" });
  await h.settle();
  h.flushGet();
  await h.settle();
  h.window.close();
});

test("模型 id 只读防止伪装重命名：既有行输入禁用，载荷恒用快照 id", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [{ id: "m1" }] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  const model = h.detail().querySelector(".mm-model");
  const idInput = model.querySelector("input[type='text']");
  assert.equal(idInput.disabled, true, "既有模型 id 输入框禁用");
  assert.equal(idInput.value, "m1");
  // 即使绕过 UI 改掉 form.id，载荷也以快照 id 为准。
  h.setInput(idInput, "hacked");
  h.setInput([...model.querySelectorAll("input[type='text']")].find((input) => !input.disabled), "New Name");
  const saveButton = [...model.querySelectorAll("button")].find((node) => node.textContent === "保存修改");
  saveButton.click();
  await h.settle();
  const save = h.lastPending("models.model.save");
  assert.equal(save.args.model.id, "m1", "载荷使用快照 id，不会 upsert 出重复条目");
  assert.equal(save.args.model.name, "New Name");
  save.settled = true;
  save.resolve({ fingerprint: "fp-9" });
  await h.settle();
  h.flushGet();
  await h.settle();
  h.window.close();
});

test("非法数字被明确拦截不静默删除，高级字段仅接受 JSON 对象", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [{ id: "m1", contextWindow: 1000 }] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  const model = h.detail().querySelector(".mm-model");
  const context = model.querySelector("input[inputmode='numeric']");
  const saveButton = [...model.querySelectorAll("button")].find((node) => node.textContent === "保存修改");
  h.setInput(context, "abc");
  assert.equal(saveButton.disabled, true, "非法数字禁用保存");
  assert.match(saveButton.title, /上下文窗口必须是正整数/);
  assert.match(saveButton.title, /不会静默丢弃/, "明确提示不会悄悄删值");
  h.setInput(context, "2000");
  assert.equal(saveButton.disabled, false);
  assert.equal(saveButton.title, "");

  // 供应商高级字段在连接分区：填数组 → 点击保存被拦截，不发请求。
  await h.openConnection();
  const extras = h.detail().querySelector(".mm-advanced textarea");
  h.setInput(extras, "[1,2]");
  const before = h.calls.length;
  h.button("保存供应商").click();
  await h.settle();
  assert.equal(h.calls.length, before, "非对象 JSON 不发请求");
  assert.match(h.root().textContent, /高级字段必须是 JSON 对象/);
  h.window.close();
});

test("重渲染与导航切换不丢未保存编辑，脏项带圆点，取消后还原", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [
      { id: "p1", api: "openai-completions", models: [{ id: "m1", name: "Old" }] },
      { id: "p2", api: "openai-completions", models: [] },
    ],
  });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  const nameInput = () => [...h.detail().querySelectorAll(".mm-model input[type='text']")]
    .find((input) => input.value === "Old" || input.value === "Renamed");
  h.setInput(nameInput(), "Renamed");

  // 重渲染（添加模型行）后既有行编辑仍在。
  h.button("添加模型").click();
  await h.settle();
  assert.equal(nameInput().value, "Renamed", "重渲染不丢模型编辑");
  assert.equal(h.detail().querySelectorAll(".mm-model").length, 2);

  // 切到 p2 再切回，编辑仍在，分区选择也记住，导航出现未保存圆点。
  await h.selectProvider("p2");
  await h.selectProvider("p1");
  assert.equal(h.tab("模型").getAttribute("aria-selected"), "true", "分区选择按供应商记住");
  assert.equal(nameInput().value, "Renamed", "切换供应商不丢编辑");
  assert.ok(h.navItem("p1").querySelector(".mm-dot"), "脏供应商带未保存圆点");

  // 新增的连接字段草稿同样跨分区/跨供应商保留。
  await h.openConnection();
  const baseUrlInput = () => [...h.detail().querySelectorAll(".mm-form input[type='text']")]
    .find((input) => input.placeholder.includes("https://"));
  h.setInput(baseUrlInput(), "https://draft.example.com");
  await h.selectProvider("p2");
  await h.selectProvider("p1");
  assert.equal(baseUrlInput().value, "https://draft.example.com", "连接字段草稿跨切换保留");

  // 取消（连接分区）才真正丢弃：连接表单与模型行都还原。
  h.button("取消").click();
  await h.settle();
  assert.ok(!h.navItem("p1").querySelector(".mm-dot"), "取消后圆点消失");
  await h.openModels();
  assert.equal(nameInput().value, "Old", "取消还原模型编辑");
  assert.equal(h.detail().querySelectorAll(".mm-model").length, 1, "取消清掉新增行");
  h.window.close();
});

test("字段使用 label[for] 关联控件，键盘可聚焦", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1");
  const labels = [...h.detail().querySelectorAll(".mm-field-label")];
  assert.ok(labels.length >= 3);
  // 请求头字段在无行时没有可关联控件（各行输入有独立 aria-label），其余字段必须 label[for] 关联。
  const linked = labels.filter((label) => label.htmlFor);
  assert.ok(linked.length >= labels.length - 1);
  for (const label of linked) {
    const control = h.window.document.getElementById(label.htmlFor);
    assert.ok(control, "for 指向真实控件");
    assert.equal(["INPUT", "SELECT"].includes(control.tagName), true);
  }
  assert.equal(h.root().querySelector(".mm-search").getAttribute("aria-label"), "搜索供应商或模型");
  h.window.close();
});

test("parseError 时提示且目录可浏览；加载失败不抛出并提供重试", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ parseError: "Unexpected token } in JSON", catalog: [
    { provider: "openai", id: "gpt-5.1", name: "GPT-5.1", key: "openai/gpt-5.1", levels: [], input: ["text"] },
  ] });
  await h.settle();
  await loaded;
  let root = h.root();
  assert.match(root.textContent, /旧模型配置导入失败/);
  assert.ok(h.navItem("openai"), "目录照常进入导航");
  await h.openModels();
  assert.match(h.detail().textContent, /gpt-5\.1/, "目录详情照常展示");
  assert.ok(h.detail().querySelector(".mm-model"), "parseError 下目录模型仍可编辑");
  assert.doesNotMatch(root.textContent, /保存失败/);

  const failed = h.manager.load();
  await h.settle();
  const get = h.lastPending("models.config.get");
  get.settled = true;
  get.reject(new Error("连接已断开"));
  await h.settle();
  await failed; // load 不向上抛
  root = h.root();
  assert.match(root.textContent, /无法加载模型配置：连接已断开/);
  const retry = [...root.querySelectorAll(".mm-alert button")].find((node) => node.textContent === "重试");
  retry.click();
  await h.settle();
  h.flushGet();
  await h.settle();
  assert.match(h.root().textContent, /模型与供应商/);
  h.window.close();
});

test("已保存未应用保留新指纹；重试只回读应用，不重复保存或删除", async () => {
  const h = harness();
  try {
    const loaded = h.manager.load();
    h.flushGet({ providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions" }] });
    await loaded;
    await h.selectProvider("p1");
    h.button("保存供应商").click();
    await h.settle();
    const save = h.lastPending("models.provider.save");
    save.settled = true;
    save.resolve({ fingerprint: "fp-new", applied: false, applyError: "运行时尚未刷新" });
    await h.settle();
    h.flushGet({ fingerprint: "fp-new", applied: false, applyError: "运行时尚未刷新" });
    await h.settle();
    const root = h.window.document.getElementById("root");
    assert.match(root.textContent, /配置已保存，但尚未应用/);
    assert.doesNotMatch(root.textContent, /保存失败/);
    h.button("重试应用").click();
    await h.settle();
    assert.equal(h.calls.filter(c => c.type === "models.provider.save").length, 1);
    h.flushGet({ applied: true, applyError: null });
    await h.settle();
    assert.doesNotMatch(root.textContent, /尚未应用/);
    assert.equal(h.saved.length, 2, "应用恢复后同步刷新主界面目录");
    h.button("保存供应商").click();
    await h.settle();
    assert.equal(h.lastPending("models.provider.save").args.baseFingerprint, "fp-new");
  } finally { h.window.close(); }
});

test("渲染只产出文本节点，绝无注入路径", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    catalog: [
      { provider: "<img src=x onerror=alert(1)>", id: "</span>", key: "<img src=x onerror=alert(1)>/</span>", levels: [], input: ["text"] },
    ],
  });
  await h.settle();
  await loaded;
  const root = h.root();
  assert.equal(root.querySelector("img"), null);
  assert.ok(root.textContent.includes("<img src=x onerror=alert(1)>"));
  await h.selectProvider("<img src=x onerror=alert(1)>", { models: true });
  assert.ok(h.detail().textContent.includes("</span>"));
  const managerSource = await readFile(new URL("../public/model-manager.js", import.meta.url), "utf8");
  assert.equal(/\.innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(managerSource), false);
  h.window.close();
});

// ── 拉取模型列表（只读发现 → 勾选加入）专项 ──────────────────────────────
const discoverPanelEl = (h) => h.detail().querySelector(".mm-discover");
const discoverRows = (h) => [...h.detail().querySelectorAll(".mm-discover-row")];
const rowBox = (row) => row.querySelector("input[type='checkbox']");
const addSelectedButton = (h) => h.detail().querySelector(".mm-discover-foot button");
const fetchButton = (h) => h.button("拉取模型列表…");
const checkRow = (h, row) => {
  rowBox(row).checked = true;
  rowBox(row).dispatchEvent(new h.window.Event("change", { bubbles: true }));
};

test("拉取只读不写配置：仅发 discover 且只带 providerId，已添加模型禁勾选", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [{ id: "m1" }] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  fetchButton(h).click();
  await h.settle();
  const discover = h.lastPending("models.provider.discover");
  assert.ok(discover, "发出发现请求");
  assert.deepEqual(j(discover.args), { providerId: "p1" }, "发现请求只带 providerId，不含任何密钥/草稿字段");
  assert.equal(h.calls.length, 2, "拉取本身不触发配置回读或写入");
  discover.settled = true;
  discover.resolve({ models: [
    { id: "m1" },
    { id: "m2", name: "M2", reasoning: true, input: ["text", "image"], contextWindow: 1000, maxTokens: 100 },
  ] });
  await h.settle();
  assert.equal(h.calls.length, 2, "结果渲染不再发任何请求");
  const rows = discoverRows(h);
  assert.equal(rows.length, 2);
  assert.equal(rowBox(rows[0]).disabled, true, "已添加模型禁勾选");
  assert.equal(rowBox(rows[1]).disabled, false);
  assert.match(discoverPanelEl(h).textContent, /已添加/);
  assert.match(discoverPanelEl(h).textContent, /推理/);
  assert.match(discoverPanelEl(h).textContent, /图片/);
  assert.equal(addSelectedButton(h).disabled, true, "未勾选时添加按钮禁用");
  checkRow(h, rows[1]);
  assert.equal(addSelectedButton(h).disabled, false, "勾选后添加按钮启用");
  h.window.close();
});

test("添加选中模型：逐条串行保存勾选项，载荷不含未返回能力，每成功更新指纹", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  fetchButton(h).click();
  await h.settle();
  const discover = h.lastPending("models.provider.discover");
  discover.settled = true;
  discover.resolve({ models: [
    { id: "m-full", name: "Full", reasoning: true, input: ["text", "image"], contextWindow: 1000, maxTokens: 100 },
    { id: "m-bare" },
    { id: "m-skip", reasoning: true },
  ], truncated: true });
  await h.settle();
  assert.match(discoverPanelEl(h).textContent, /截断/, "truncated 提示结果不完整");
  const rows = discoverRows(h);
  checkRow(h, rows[0]);
  checkRow(h, rows[1]);
  addSelectedButton(h).click();
  await h.settle();
  const first = h.lastPending("models.model.save");
  assert.deepEqual(j(first.args), { providerId: "p1", baseFingerprint: "fp-1",
    model: { id: "m-full", name: "Full", reasoning: true, input: ["text", "image"], contextWindow: 1000, maxTokens: 100 } },
    "载荷只含返回字段，未返回的能力不猜不补");
  first.settled = true;
  first.resolve({ fingerprint: "fp-2" });
  await h.settle();
  const second = h.lastPending("models.model.save");
  assert.equal(second.args.model.id, "m-bare", "逐条串行保存");
  assert.deepEqual(j(second.args.model), { id: "m-bare" }, "只有 id 的模型不加任何默认能力");
  assert.equal(second.args.baseFingerprint, "fp-2", "每成功一条即更新指纹");
  second.settled = true;
  second.resolve({ fingerprint: "fp-3" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-3", providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [{ id: "m-full" }, { id: "m-bare" }] }] });
  await h.settle();
  assert.match(h.root().textContent, /已添加 2 个模型/);
  assert.equal(h.saved.length, 1, "批量结束后通知主入口刷新一次");
  assert.ok(!h.calls.some((call) => call.type === "models.model.save" && call.args.model.id === "m-skip"),
    "未勾选的模型绝不自动保存");
  const after = discoverRows(h);
  assert.equal(rowBox(after[0]).disabled && rowBox(after[1]).disabled, true, "保存成功后标记已添加并禁勾选");
  h.window.close();
});

test("部分保存失败保留勾选可重试，成功几个失败几个明确提示", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  fetchButton(h).click();
  await h.settle();
  const discover = h.lastPending("models.provider.discover");
  discover.settled = true;
  discover.resolve({ models: [{ id: "ok-m" }, { id: "bad-m" }] });
  await h.settle();
  for (const row of discoverRows(h)) checkRow(h, row);
  addSelectedButton(h).click();
  await h.settle();
  const first = h.lastPending("models.model.save");
  assert.equal(first.args.model.id, "ok-m");
  first.settled = true;
  first.resolve({ fingerprint: "fp-2" });
  await h.settle();
  const second = h.lastPending("models.model.save");
  assert.equal(second.args.model.id, "bad-m");
  second.settled = true;
  second.reject(new Error("上游拒绝"));
  await h.settle();
  h.flushGet({ fingerprint: "fp-2", providers: [{ id: "p1", api: "openai-completions", models: [{ id: "ok-m" }] }] });
  await h.settle();
  assert.match(h.root().textContent, /已添加 1 个模型，1 个失败/);
  assert.match(h.root().textContent, /bad-m：上游拒绝/);
  const failedRow = discoverRows(h).find((row) => row.textContent.includes("bad-m"));
  assert.equal(rowBox(failedRow).checked, true, "失败项保留勾选");
  assert.match(addSelectedButton(h).textContent, /（1）/, "仅剩失败项待添加");
  addSelectedButton(h).click();
  await h.settle();
  const retry = h.lastPending("models.model.save");
  assert.deepEqual(j(retry.args.model), { id: "bad-m" });
  assert.equal(retry.args.baseFingerprint, "fp-2", "重试携带最新指纹");
  retry.settled = true;
  retry.resolve({ fingerprint: "fp-4" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-4", providers: [{ id: "p1", api: "openai-completions", models: [{ id: "ok-m" }, { id: "bad-m" }] }] });
  await h.settle();
  assert.match(h.root().textContent, /已添加 1 个模型。/);
  assert.ok(discoverRows(h).every((row) => rowBox(row).disabled), "全部成功后均已添加禁用");
  h.window.close();
});

test("空结果与失败都内联展示且可重试；连接字段未保存先拒绝拉取", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  fetchButton(h).click();
  await h.settle();
  let discover = h.lastPending("models.provider.discover");
  discover.settled = true;
  discover.resolve({ models: [] });
  await h.settle();
  assert.match(discoverPanelEl(h).textContent, /未返回任何模型/);

  fetchButton(h).click();
  await h.settle();
  discover = h.lastPending("models.provider.discover");
  discover.settled = true;
  discover.reject(new Error("上游 401"));
  await h.settle();
  assert.match(discoverPanelEl(h).textContent, /上游 401/, "错误内联在拉取面板");
  assert.equal(h.root().querySelector(".mm-alert").textContent, "", "发现失败不占用顶部提示条");
  const retry = [...discoverPanelEl(h).querySelectorAll("button")].find((node) => node.textContent === "重试");
  assert.ok(retry, "内联重试按钮");
  retry.click();
  await h.settle();
  const retried = h.lastPending("models.provider.discover");
  assert.ok(retried, "重试重新发起发现请求");
  retried.settled = true;
  retried.resolve({ models: [{ id: "m1" }] });
  await h.settle();
  assert.equal(discoverRows(h).length, 1);

  // 连接字段有未保存修改 → 明确要求先保存，不发起发现请求（草稿密钥不外发）。
  await h.openConnection();
  const baseUrl = [...h.detail().querySelectorAll(".mm-form input[type='text']")]
    .find((input) => input.value.startsWith("https://"));
  h.setInput(baseUrl, "https://draft.example.com/v1");
  await h.openModels();
  fetchButton(h).click();
  await h.settle();
  assert.match(discoverPanelEl(h).textContent, /请先「保存供应商」再拉取/);
  assert.equal(h.calls.filter((call) => call.type === "models.provider.discover").length, 3, "脏表单不发发现请求");
  h.window.close();
});

test("过期发现响应被丢弃：并发拉取后者胜出，跨供应商响应不串面板", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [
    { id: "p1", api: "openai-completions", models: [] },
    { id: "p2", api: "openai-completions", models: [] },
  ] });
  await h.settle();
  await loaded;

  // 同供应商并发拉取：旧响应必须被丢弃，只有最新请求的结果生效。
  await h.selectProvider("p1", { models: true });
  fetchButton(h).click();
  await h.settle();
  const stale = h.lastPending("models.provider.discover");
  fetchButton(h).click();
  await h.settle();
  const fresh = h.lastPending("models.provider.discover");
  assert.notEqual(stale, fresh);
  stale.settled = true;
  stale.resolve({ models: [{ id: "stale-model" }] });
  await h.settle();
  assert.ok(!discoverPanelEl(h).textContent.includes("stale-model"), "过期响应不渲染");
  assert.match(discoverPanelEl(h).textContent, /正在拉取/, "仍处于加载态");
  fresh.settled = true;
  fresh.resolve({ models: [{ id: "fresh-model" }] });
  await h.settle();
  assert.ok(discoverRows(h).some((row) => row.textContent.includes("fresh-model")));

  // p1 拉取未返回时切到 p2 再拉取：响应只写回各自供应商，互不污染。
  await h.selectProvider("p2", { models: true });
  assert.equal(discoverPanelEl(h), null, "p2 未拉取过没有发现面板");
  fetchButton(h).click();
  await h.settle();
  const p2call = h.lastPending("models.provider.discover");
  assert.equal(p2call.args.providerId, "p2");
  await h.selectProvider("p1", { models: true });
  assert.ok(discoverPanelEl(h).textContent.includes("fresh-model"), "切回 p1 保留自己的结果");
  fetchButton(h).click();
  await h.settle();
  const p1call = h.lastPending("models.provider.discover");
  assert.equal(p1call.args.providerId, "p1");
  p2call.settled = true;
  p2call.resolve({ models: [{ id: "p2-model" }] });
  await h.settle();
  assert.ok(!h.detail().textContent.includes("p2-model"), "p2 的响应不渲染进 p1 详情");
  p1call.settled = true;
  p1call.resolve({ models: [{ id: "p1-model" }] });
  await h.settle();
  assert.ok(discoverRows(h).some((row) => row.textContent.includes("p1-model")));
  await h.selectProvider("p2", { models: true });
  assert.ok(discoverRows(h).some((row) => row.textContent.includes("p2-model")), "p2 面板保留自己的结果");
  h.window.close();
});

// ── 内置目录覆盖（models.model.override）与隐藏（models.hidden.set）─────────
const sonnetCatalog = {
  provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5",
  key: "anthropic/claude-sonnet-4-5", reasoning: true, levels: ["off", "high"], input: ["text", "image"],
};
// 加载后无自定义供应商 → 自动选中首个目录项，返回该模型行。
const openSonnet = async (h) => {
  const loaded = h.manager.load();
  h.flushGet({ catalog: [sonnetCatalog] });
  await h.settle();
  await loaded;
  await h.openModels();
  return h.detail().querySelector(".mm-model");
};
const checkLevel = (h, row, level, checked) => {
  const box = [...row.querySelectorAll(".mm-thinking-levels input")]
    .find((input) => input.parentElement.textContent === level);
  box.checked = checked;
  box.dispatchEvent(new h.window.Event("change", { bubbles: true }));
};

test("目录模型 thinking 覆盖：等级勾选写入 thinkingLevelMap 并同步高级 JSON，载荷符合严格 schema", async () => {
  const h = harness();
  const row = await openSonnet(h);
  const checked = () => [...row.querySelectorAll(".mm-thinking-levels input:checked")]
    .map((box) => box.parentElement.textContent).sort();
  assert.deepEqual(checked(), ["high", "off"], "目录 levels 渲染为等级勾选");
  const extras = row.querySelector(".mm-extras");
  // 目录投影自带的派生字段（provider/key/levels）不再泄漏进高级 JSON，否则会被严格 schema 拒绝。
  assert.equal(extras.value, "", "无额外字段时高级 JSON 为空，不含 provider/key/levels");
  assert.match(row.querySelector(".mm-thinking-summary").textContent, /^有效等级：off · high$/);

  // 勾选 low（目录 levels 里没有 → 必须显式写入）：thinkingLevelMap.low = "low" 同步进高级 textarea。
  checkLevel(h, row, "low", true);
  assert.match(extras.value, /"low": "low"/);
  assert.match(row.querySelector(".mm-thinking-summary").textContent, /off · low · high/, "摘要实时反映新等级");
  const saveButton = row.querySelector(".mm-model-actions button");
  assert.equal(saveButton.disabled, false);
  saveButton.click();
  await h.settle();
  const override = h.lastPending("models.model.override");
  assert.ok(override, "目录模型保存走 models.model.override");
  assert.deepEqual(j(override.args), {
    providerId: "anthropic",
    modelId: "claude-sonnet-4-5",
    baseFingerprint: "fp-1",
    override: { thinkingLevelMap: { low: "low" } },
  }, "只发改动字段；目录原文 key/provider/levels 被剔除，不触严格 schema");
  const parsed = modelOverrideIn.safeParse(j(override.args.override));
  assert.equal(parsed.success, true, `载荷必须通过服务端严格 schema：${JSON.stringify(parsed.error?.issues ?? [])}`);
  override.settled = true;
  override.resolve({ fingerprint: "fp-2" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-2" });
  await h.settle();
  assert.match(h.root().textContent, /已保存模型「claude-sonnet-4-5」/);
  h.window.close();
});

test("目录模型覆盖空值语义：取消等级写 null、清空名称转 null 恢复目录默认", async () => {
  const h = harness();
  const row = await openSonnet(h);
  checkLevel(h, row, "high", false);
  const nameInput = [...row.querySelectorAll(".mm-model-grid input[type='text']")]
    .find((input) => input.value === "Claude Sonnet 4.5");
  h.setInput(nameInput, "");
  row.querySelector(".mm-model-actions button").click();
  await h.settle();
  const override = h.lastPending("models.model.override");
  // reasoning 与目录一致（true）→ 不进载荷；只发真正改动的字段。
  assert.deepEqual(j(override.args.override), {
    name: null,
    thinkingLevelMap: { high: null },
  }, "null=恢复目录默认/禁用该等级；未改动的 reasoning 不重复下发");
  assert.match(row.querySelector(".mm-thinking-summary").textContent, /^有效等级：off$/, "禁用 high 后只剩 off");
  override.settled = true;
  override.resolve({ fingerprint: "fp-2" });
  await h.settle();
  h.window.close();
});

test("关闭「支持推理」：等级勾选锁定为 off，载荷显式写 reasoning false", async () => {
  const h = harness();
  const row = await openSonnet(h);
  const reasoningBox = [...row.querySelectorAll(".mm-model-checks input[type='checkbox']")][0];
  reasoningBox.checked = false;
  reasoningBox.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  await h.settle();
  const levelBoxes = [...row.querySelectorAll(".mm-thinking-levels input")];
  assert.deepEqual(levelBoxes.filter((box) => box.checked).map((box) => box.parentElement.textContent), ["off"],
    "未开推理时只勾 off");
  assert.deepEqual(levelBoxes.filter((box) => !box.disabled).map((box) => box.parentElement.textContent), ["off"],
    "其余等级禁用，避免勾了也不生效");
  assert.match(row.querySelector(".mm-thinking-summary").textContent, /^有效等级：off$/);
  row.querySelector(".mm-model-actions button").click();
  await h.settle();
  const override = h.lastPending("models.model.override");
  assert.deepEqual(j(override.args.override), { reasoning: false }, "只有 reasoning 真正变化时才下发");
  const parsed = modelOverrideIn.safeParse(j(override.args.override));
  assert.equal(parsed.success, true, `载荷必须通过服务端严格 schema：${JSON.stringify(parsed.error?.issues ?? [])}`);
  override.settled = true;
  override.resolve({ fingerprint: "fp-2" });
  await h.settle();
  h.window.close();
});

test("隐藏内置供应商与单个模型：hidden.set 请求、导航收敛、「已隐藏」页可恢复", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    catalog: [
      sonnetCatalog,
      { provider: "openai", id: "gpt-5.1", name: "GPT-5.1", key: "openai/gpt-5.1", levels: [], input: ["text"] },
    ],
  });
  await h.settle();
  await loaded;
  const dialog = () => h.window.document.querySelector(".mm-dialog");
  const confirmDialog = (label) => [...dialog().querySelectorAll(".dialog-actions button")]
    .find((b) => b.textContent === label).click();

  // 单个模型：目录详情行内删除图标 → 确认弹窗 → hidden.set(key = "openai/gpt-5.1")。
  await h.selectProvider("openai", { models: true });
  h.detail().querySelector(".mm-model-row-actions .mm-icon-delete").click();
  await h.settle();
  assert.match(dialog().textContent, /隐藏模型「openai\/gpt-5\.1」/);
  confirmDialog("隐藏");
  await h.settle();
  let hiddenCall = h.lastPending("models.hidden.set");
  assert.deepEqual(j(hiddenCall.args), { key: "openai/gpt-5.1", hidden: true });
  hiddenCall.settled = true;
  hiddenCall.resolve({});
  await h.settle();
  h.flushGet({ fingerprint: "fp-2", hidden: ["openai/gpt-5.1"] });
  await h.settle();
  assert.match(h.root().textContent, /已隐藏「openai\/gpt-5\.1」/);
  assert.ok(!h.navItem("openai"), "模型全隐藏后供应商从导航消失");
  assert.match(h.root().textContent, /已隐藏（1）/, "「已隐藏」分组出现");
  assert.equal(h.saved.length, 1, "隐藏写入后通知主入口刷新");

  // 恢复：「已隐藏」页 → 恢复按钮 → hidden.set(hidden: false)。
  h.navItem("已隐藏").click();
  await h.settle();
  [...h.detail().querySelectorAll("button")].find((b) => b.textContent === "恢复").click();
  await h.settle();
  hiddenCall = h.lastPending("models.hidden.set");
  assert.deepEqual(j(hiddenCall.args), { key: "openai/gpt-5.1", hidden: false });
  hiddenCall.settled = true;
  hiddenCall.resolve({});
  await h.settle();
  h.flushGet({ fingerprint: "fp-3", hidden: [] });
  await h.settle();
  assert.ok(h.navItem("openai"), "恢复后重新可选");

  // 整个供应商：导航行内删除图标 → hidden.set(key = "anthropic")。
  h.navItem("anthropic").parentElement.querySelector(".mm-icon-delete").click();
  await h.settle();
  assert.match(dialog().textContent, /隐藏供应商「anthropic」及其 1 个模型/);
  confirmDialog("隐藏");
  await h.settle();
  hiddenCall = h.lastPending("models.hidden.set");
  assert.deepEqual(j(hiddenCall.args), { key: "anthropic", hidden: true });
  hiddenCall.settled = true;
  hiddenCall.resolve({});
  await h.settle();
  h.flushGet({ fingerprint: "fp-4", hidden: ["anthropic"] });
  await h.settle();
  assert.ok(!h.navItem("anthropic"), "整供应商隐藏后从导航消失");
  h.navItem("已隐藏").click();
  await h.settle();
  assert.match(h.detail().textContent, /整个供应商 · 1 个模型/, "供应商级条目标注整体隐藏");
  h.window.close();
});

// ── 两级流程（供应商 / 模型分区）与复制按钮 ────────────────────────────────
test("两级分区：连接与模型互不同屏，内置目录页同样分区且不提供拉取入口", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [{ id: "m1" }, { id: "m2" }] }],
    catalog: [{ provider: "anthropic", id: "claude-sonnet-4-5", key: "anthropic/claude-sonnet-4-5", reasoning: true, levels: ["off", "high"], input: ["text"] }],
  });
  await h.settle();
  await loaded;

  // 默认停在「供应商」：只有连接表单，没有任何模型行。
  await h.selectProvider("p1");
  assert.equal(h.tab("供应商").getAttribute("aria-selected"), "true", "默认进连接分区");
  assert.equal(h.tab("模型").textContent, "模型（2）", "分区标签带模型条数");
  assert.ok(h.detail().querySelector(".mm-form"), "连接分区渲染连接表单");
  assert.equal(h.detail().querySelector(".mm-model"), null, "连接分区不渲染模型行");
  assert.equal(h.button("添加模型"), undefined, "连接分区没有模型操作入口");

  // 切「模型」：只有模型行，没有连接表单与密钥输入。
  await h.openModels();
  assert.equal(h.detail().querySelectorAll(".mm-model").length, 2);
  assert.equal(h.detail().querySelector(".mm-form"), null, "模型分区不渲染连接表单");
  assert.equal(h.detail().querySelector("input[type='password']"), null, "模型分区不出现密钥输入");
  assert.ok(h.button("添加模型"), "模型分区提供添加模型");
  assert.ok(h.button("拉取模型列表…"), "自定义供应商可拉取");

  // 内置目录页：连接分区给内置说明 + 自定义连接入口；模型分区不给拉取（没有自己的连接）。
  await h.selectProvider("anthropic");
  assert.match(h.detail().textContent, /内置供应商/);
  await h.openModels();
  assert.equal(h.button("拉取模型列表…"), undefined, "内置目录页不提供拉取入口");
  h.window.close();
});

test("复制供应商：新 id 带 -copy，连接字段照搬、密钥与请求头值清空并提示，模型迁为草稿待写入", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{
      id: "p1", baseUrl: "https://p.example.com/v1", api: "anthropic-messages",
      apiKey: masked("literal"),
      headers: { "x-tenant": masked("env") },
      timeoutMs: 30000,
      models: [{ id: "m1", name: "M1", reasoning: true }],
    }],
  });
  await h.settle();
  await loaded;
  await h.selectProvider("p1");
  h.button("复制为新供应商").click();
  await h.settle();

  // 进入草稿：id 自动加 -copy，连接字段照搬，API Key 留空，请求头只留名称。
  const draft = h.detail();
  const textInputs = [...draft.querySelectorAll(".mm-form input[type='text']")];
  assert.equal(textInputs[0].value, "p1-copy", "新 id 自动避让");
  assert.ok(textInputs.some((input) => input.value === "https://p.example.com/v1"), "Base URL 照搬");
  assert.equal(draft.querySelector("input[type='password']").value, "", "API Key 不复制");
  assert.match(h.root().textContent, /API Key 与已存请求头值没有复制/, "明确提示需要重填密钥");
  assert.match(draft.querySelector(".mm-extras").value, /"timeoutMs": 30000/, "高级 JSON 照搬且剔掉掩码占位");
  assert.equal(h.root().textContent.includes("masked"), false, "掩码占位不进复制件");
  assert.equal(h.detail().querySelector(".mm-header-row input[type='text']").value, "x-tenant", "请求头名称保留");
  assert.equal([...h.detail().querySelectorAll(".mm-header-row input[type='password']")].every((input) => input.value === ""), true, "请求头值不复制");
  assert.ok(h.navItem("＋ p1-copy"), "草稿进导航并标注来源");
  assert.match(h.navItem("＋ p1-copy").parentElement.textContent, /复制自 p1/);

  // 草稿阶段模型分区禁用，但已把源模型排入待写入队列。
  assert.equal(h.tab("模型").disabled, true);
  assert.match(draft.textContent, /已准备 1 条待写入的模型/);

  // 请求头值空着直接保存 → 明确报错，不会把空字符串写成密钥。
  h.button("保存供应商").click();
  await h.settle();
  assert.equal(h.lastPending("models.provider.save"), undefined, "校验不过不发请求");
  assert.match(h.root().querySelector(".mm-alert").textContent, /请求头「x-tenant」缺少值/);

  // 填上请求头值后保存：只写连接字段，绝不带 models / modelOverrides。
  h.setInput(h.detail().querySelector(".mm-header-row input[type='password']"), "acme-token");
  h.button("保存供应商").click();
  await h.settle();
  const save = h.lastPending("models.provider.save");
  assert.equal(save.args.providerId, "p1-copy");
  assert.deepEqual(j(save.args.provider), {
    timeoutMs: 30000, baseUrl: "https://p.example.com/v1", api: "anthropic-messages",
    headers: { "x-tenant": "acme-token" },
  }, "复制的载荷用重填的请求头值，不含 keep 占位、不含 models/modelOverrides");
  save.settled = true;
  save.resolve({ fingerprint: "fp-2" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-2", providers: [
    { id: "p1", baseUrl: "https://p.example.com/v1", api: "anthropic-messages", models: [{ id: "m1", name: "M1", reasoning: true }] },
    { id: "p1-copy", baseUrl: "https://p.example.com/v1", api: "anthropic-messages", models: [] },
  ] });
  await h.settle();
  // 落盘后自动停在新供应商的模型分区，源模型成为待保存新行（id 不变，provider 换了不冲突）。
  assert.equal(h.tab("模型").getAttribute("aria-selected"), "true");
  const rowIds = [...h.detail().querySelectorAll(".mm-model input[type='text']")].map((input) => input.value);
  assert.ok(rowIds.includes("m1"), "源模型迁为新供应商的待保存行");
  h.window.close();
});

test("复制供应商时已有草稿需确认覆盖；取消则保留原草稿", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [] }] });
  await h.settle();
  await loaded;
  h.button("添加供应商").click();
  await h.settle();
  h.setInput(h.detail().querySelector(".mm-form input[type='text']"), "hand-written");
  await h.selectProvider("p1");
  h.button("复制为新供应商").click();
  await h.settle();
  const dialog = () => h.window.document.querySelector(".mm-dialog");
  assert.match(dialog().textContent, /已经有一份未保存的新供应商草稿「hand-written」/);
  [...dialog().querySelectorAll("button")].find((b) => b.textContent === "取消").click();
  await h.settle();
  assert.ok(h.navItem("＋ hand-written"), "取消后原草稿保留");
  await h.selectProvider("p1");
  h.button("复制为新供应商").click();
  await h.settle();
  [...dialog().querySelectorAll("button")].find((b) => b.textContent === "覆盖草稿").click();
  await h.settle();
  assert.ok(!h.navItem("＋ hand-written"), "确认后草稿被复制件替换");
  assert.ok(h.navItem("＋ p1-copy"));
  h.window.close();
});

test("复制模型：取表单实时值生成待保存新行，id 自动避让且不触发保存请求", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions",
    models: [{ id: "m1", name: "M1", contextWindow: 1000, note: "keepme" }, { id: "m1-copy" }] }] });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  const row = h.detail().querySelector(".mm-model");
  // 先改名称：复制必须带上未保存的实时值，而不是快照。
  const nameInput = [...row.querySelectorAll("input[type='text']")].find((input) => input.value === "M1");
  h.setInput(nameInput, "M1 改过");
  const before = h.calls.length;
  row.querySelector(".mm-model-row-actions .mm-icon-duplicate").click();
  await h.settle();
  assert.equal(h.calls.length, before, "复制只是加一行草稿，不发任何请求");
  const newRow = [...h.detail().querySelectorAll(".mm-model")].at(-1);
  const idInput = newRow.querySelector("input[type='text']");
  assert.equal(idInput.value, "m1-copy-2", "m1-copy 已被占用 → 继续避让");
  assert.equal(idInput.disabled, false, "新行 id 可编辑");
  assert.ok([...newRow.querySelectorAll("input[type='text']")].some((input) => input.value === "M1 改过"),
    "复制取表单实时值");
  assert.match(h.root().textContent, /已复制为新模型「m1-copy-2」/);

  // 保存这条复制行：未知字段（note）照样保留，id 用新行输入值。
  [...newRow.querySelectorAll("button")].find((b) => b.textContent === "保存模型").click();
  await h.settle();
  const save = h.lastPending("models.model.save");
  const payload = j(save.args.model);
  assert.equal(payload.id, "m1-copy-2");
  assert.equal(payload.name, "M1 改过");
  assert.equal(payload.contextWindow, 1000);
  assert.equal(payload.note, "keepme", "未知字段原样带走");
  save.settled = true;
  save.resolve({ fingerprint: "fp-2" });
  await h.settle();
  h.window.close();
});

// ── 思考等级写值语义（修保存 bug 的回归护栏）──────────────────────────────
test("思考等级勾选按基准差异写：取消写 null、重新勾上清回默认、opt-in 等级显式写入", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{ id: "p1", api: "openai-completions", models: [{ id: "m1", reasoning: true }] }],
  });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  const row = h.detail().querySelector(".mm-model");
  const extras = row.querySelector(".mm-extras");
  const box = (level) => [...row.querySelectorAll(".mm-thinking-levels input")]
    .find((input) => input.parentElement.textContent.trim() === level);
  const toggle = (level, checked) => {
    box(level).checked = checked;
    box(level).dispatchEvent(new h.window.Event("change", { bubbles: true }));
  };
  const mapOf = () => {
    const text = extras.value.trim();
    return text ? (JSON.parse(text).thinkingLevelMap ?? null) : null;
  };

  // 起始：标准等级默认全支持；xhigh/max 是 opt-in，默认不在内。
  assert.equal(box("high").checked, true);
  assert.equal(box("xhigh").checked, false);
  assert.equal(extras.value.trim(), "", "无自定义映射时不写 thinkingLevelMap");

  // 取消 medium → 必须显式写 null（浅合并下删键清不掉已落盘条目）。
  toggle("medium", false);
  assert.deepEqual(j(mapOf()), { medium: null });

  // 重新勾上 medium → 回到默认（整个 map 清空，而不是留 "medium"）。
  toggle("medium", true);
  assert.equal(extras.value.trim(), "", "恢复默认后整个 thinkingLevelMap 清掉");

  // 勾 xhigh（opt-in，不在基准里）→ 写字面量才会生效。
  toggle("xhigh", true);
  assert.deepEqual(j(mapOf()), { xhigh: "xhigh" });

  // 保存后回读：勾选状态与保存前一致（保存 bug 的回归点）。
  [...row.querySelectorAll("button")].find((b) => b.textContent === "保存修改").click();
  await h.settle();
  const save = h.lastPending("models.model.save");
  assert.deepEqual(j(save.args.model).thinkingLevelMap, { xhigh: "xhigh" });
  save.settled = true;
  save.resolve({ fingerprint: "fp-2" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-2", providers: [{ id: "p1", api: "openai-completions",
    models: [{ id: "m1", reasoning: true, thinkingLevelMap: { xhigh: "xhigh" } }] }] });
  await h.settle();
  await h.openModels();
  const reread = h.detail().querySelector(".mm-model");
  const checkedAfter = [...reread.querySelectorAll(".mm-thinking-levels input")]
    .filter((input) => input.checked).map((input) => input.parentElement.textContent.trim());
  assert.ok(checkedAfter.includes("xhigh"), "回读后 xhigh 仍勾上");
  assert.ok(checkedAfter.includes("high") && checkedAfter.includes("medium"),
    "未映射的标准等级不会被画成未勾（保存 bug 回归点）");
  h.window.close();
});

test("自定义 API 入参的映射值算启用，取消再勾回恢复原入参", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{ id: "p1", api: "openai-completions",
      models: [{ id: "m1", reasoning: true, thinkingLevelMap: { high: "ultra" } }] }],
  });
  await h.settle();
  await loaded;
  await h.selectProvider("p1", { models: true });
  const row = h.detail().querySelector(".mm-model");
  const extras = row.querySelector(".mm-extras");
  const box = (level) => [...row.querySelectorAll(".mm-thinking-levels input")]
    .find((input) => input.parentElement.textContent.trim() === level);
  const toggle = (level, checked) => {
    box(level).checked = checked;
    box(level).dispatchEvent(new h.window.Event("change", { bubbles: true }));
  };
  const mapOf = () => JSON.parse(extras.value).thinkingLevelMap;
  assert.equal(box("high").checked, true, "字符串映射=启用");
  toggle("high", false);
  assert.deepEqual(j(mapOf()), { high: null }, "取消先写 null");
  toggle("high", true);
  assert.deepEqual(j(mapOf()), { high: "ultra" }, "勾回来恢复已落盘的自定义入参，不悄悄换成默认");
  h.window.close();
});
