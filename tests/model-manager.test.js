import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

// 被测模块与 file-picker.test.js 同一装载方式：剥掉 export 后在 JSDOM 窗口内求值。
const source = (await readFile(new URL("../public/model-manager.js", import.meta.url), "utf8")).replace(/^export /gm, "");
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
  window.eval(`${source}\nwindow.init = initModelManager; window.templates = PROVIDER_TEMPLATES;`);
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
  const button = (text) => [...window.document.querySelectorAll("button")].find((node) => node.textContent === text);
  const setInput = (input, value) => {
    input.value = value;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  return { window, calls, saved, manager, settle, pending, lastPending, flushGet, button, setInput };
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

test("加载后渲染目录与来源徽标，空配置说明内置模型不受影响", async () => {
  const h = harness();
  const loaded = h.manager.load();
  await h.settle();
  assert.equal(h.calls[0].type, "models.config.get");
  assert.equal(Object.keys(h.calls[0].args).length, 0);
  h.flushGet({
    catalog: [
      { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", key: "anthropic/claude-sonnet-4-5", levels: ["off", "high"], input: ["text", "image"] },
      { provider: "openai", id: "gpt-5.1", name: "GPT-5.1", key: "openai/gpt-5.1", levels: [], input: ["text"] },
    ],
  });
  await h.settle();
  await loaded;
  const root = h.window.document.getElementById("root");
  assert.match(root.textContent, /当前可用模型目录/);
  assert.match(root.textContent, /内置 \/ 扩展/);
  assert.match(root.textContent, /anthropic\/claude-sonnet-4-5/);
  assert.match(root.textContent, /尚无自定义供应商/);
  assert.match(root.textContent, /内置与扩展发现的模型不受影响/);
  const badges = [...root.querySelectorAll(".mm-badge")].map((node) => node.textContent);
  assert.equal(badges.filter((text) => text === "推理").length, 1);
  assert.equal(badges.filter((text) => text === "图片").length, 1);
  assert.equal(h.saved.length, 0, "初次加载不触发 onSaved");
  h.window.close();
});

test("目录按来源标注自定义供应商，掩码密钥与恶意 id 不泄露、不注入", async () => {
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
  const root = h.window.document.getElementById("root");
  const groups = [...root.querySelectorAll(".mm-catalog-group")];
  const badgesOf = (name) => [...groups.find((group) => group.textContent.includes(name)).querySelectorAll(".mm-badge")].map((node) => node.textContent);
  assert.ok(badgesOf("my-proxy").includes("自定义"));
  assert.ok(badgesOf("anthropic").includes("内置 / 扩展"));

  // 展开编辑：密钥是空密码框，掩码不回显。
  h.button("编辑").click();
  await h.settle();
  const form = root.querySelector(".mm-provider-open");
  const keyInput = form.querySelector("input[type='password']");
  assert.equal(keyInput.value, "", "已配置的密钥不下发明文");
  assert.match(keyInput.placeholder, /留空保留/);
  const headerValue = form.querySelector(".mm-header-row input[type='password']");
  assert.equal(headerValue.value, "");
  assert.equal(root.textContent.includes("masked"), false, "掩码对象不出现在界面文本中");
  h.window.close();
});

test("模板新增供应商：载荷含模板预填且不带 models，成功后刷新目录并回调 onSaved", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet();
  await h.settle();
  await loaded;
  h.button("添加供应商").click();
  await h.settle();
  const draft = h.window.document.querySelector(".mm-draft");
  const select = draft.querySelector("select");
  select.value = "anthropic";
  select.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  await h.settle();
  const draftAfter = h.window.document.querySelector(".mm-draft");
  setInput_on(draftAfter.querySelector("input[type='text']"), "my-anthropic", h);
  assert.ok([...draftAfter.querySelectorAll(".mm-model input[type='text']")].some((input) => input.value === "claude-sonnet-4-5"),
    "模板示例模型被列出");
  h.button("创建供应商").click();
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
  const root = h.window.document.getElementById("root");
  assert.match(root.textContent, /已保存供应商「my-anthropic」/);
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
  h.button("编辑").click();
  await h.settle();
  // 保存成功后表单保持展开（已用回读数据重建），无需再点「编辑」。
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
  const keyOf = () => h.window.document.querySelector(".mm-provider-open input[type='password']");

  let save = await saveAndSettle();
  assert.deepEqual(j(save.args.provider.apiKey), { keep: true }, "掩码+空输入=keep");
  assert.deepEqual(j(save.args.provider.headers), { "x-a": { keep: true } });

  h.setInput(keyOf(), "sk-new");
  save = await saveAndSettle();
  assert.equal(save.args.provider.apiKey, "sk-new");

  const clear = h.window.document.querySelector(".mm-provider-open input[aria-label='清除已保存的 API Key']");
  clear.checked = true;
  clear.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  save = await saveAndSettle();
  assert.equal(save.args.provider.apiKey, null);

  const before = h.calls.length;
  h.setInput(keyOf(), "!secret-factory");
  h.button("保存供应商").click();
  await h.settle();
  assert.equal(h.calls.length, before, "非法密钥不发请求");
  assert.match(h.window.document.getElementById("root").textContent, /不能新增命令执行型/);
  h.window.close();
});

test("供应商与模型删除都是两段式确认，第二次点击才发请求", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [{ id: "m1", contextWindow: 1000 }] }],
  });
  await h.settle();
  await loaded;
  const root = h.window.document.getElementById("root");
  h.button("编辑").click();
  await h.settle();
  const modelDelete = [...h.window.document.querySelectorAll(".mm-model-actions button")]
    .find((node) => node.textContent === "删除");
  modelDelete.click();
  await h.settle();
  assert.equal(modelDelete.textContent, "确认删除模型？");
  assert.equal(h.calls.length, 1, "第一次点击不发请求");
  modelDelete.click();
  await h.settle();
  const modelDel = h.lastPending("models.model.delete");
  assert.ok(modelDel);
  assert.deepEqual(j(modelDel.args), { providerId: "p1", modelId: "m1", baseFingerprint: "fp-1" });
  modelDel.settled = true;
  modelDel.resolve({ fingerprint: "fp-7" });
  await h.settle();
  h.flushGet({ fingerprint: "fp-7", providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions", models: [] }] });
  await h.settle();
  assert.match(root.textContent, /已删除模型「m1」/);
  assert.equal(root.querySelectorAll(".mm-model").length, 0, "模型行已移除");

  // 供应商：收起后两段式
  h.button("取消").click();
  await h.settle();
  const deleteButton = h.button("删除");
  const beforeProviderDelete = h.calls.length;
  deleteButton.click();
  await h.settle();
  assert.equal(deleteButton.textContent, "确认删除？");
  assert.equal(h.calls.length, beforeProviderDelete, "第一次点击不发请求");
  deleteButton.click();
  await h.settle();
  const del = h.lastPending("models.provider.delete");
  assert.deepEqual(j(del.args), { providerId: "p1", baseFingerprint: "fp-7" });
  del.settled = true;
  del.resolve({ fingerprint: "fp-8" });
  await h.settle();
  h.flushGet({ providers: [] });
  await h.settle();
  assert.match(root.textContent, /已删除供应商「p1」/);
  assert.equal(root.querySelector(".mm-provider"), null, "供应商卡片已移除");
  h.window.close();
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
  h.button("编辑").click();
  await h.settle();
  const saveButton = [...h.window.document.querySelectorAll(".mm-model-actions button")]
    .find((node) => node.textContent === "保存修改");
  assert.equal(saveButton.disabled, true, "未更改的模型不可保存");
  const model = h.window.document.querySelector(".mm-model");
  h.setInput(model.querySelector("input[type='number']"), "2000");
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

test("添加模型走 upsert，只发改动字段", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", api: "openai-completions", models: [] }] });
  await h.settle();
  await loaded;
  h.button("编辑").click();
  await h.settle();
  h.button("添加模型").click();
  await h.settle();
  const model = [...h.window.document.querySelectorAll(".mm-model")].at(-1);
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
  assert.match(h.window.document.getElementById("root").textContent, /已保存模型「new-model」/);
  h.window.close();
});

test("保存失败与外部修改冲突都在面板内展示，冲突可重新加载并携带新指纹", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions" }] });
  await h.settle();
  await loaded;
  h.button("编辑").click();
  await h.settle();
  h.button("保存供应商").click();
  await h.settle();
  const save = h.lastPending("models.provider.save");
  save.settled = true;
  save.reject(new Error("校验失败：api 缺失"));
  await h.settle();
  const root = h.window.document.getElementById("root");
  assert.match(root.textContent, /保存失败：校验失败/);
  assert.equal(save.args.baseFingerprint, "fp-1");

  // 冲突：错误消息带「已被外部修改」，重新加载后再保存使用新指纹。
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
  // 重载后表单仍展开（已用新数据重建），直接再次保存。
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

test("parseError 时提示且不丢目录；加载失败不抛出并提供重试", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({ parseError: "Unexpected token } in JSON", catalog: [
    { provider: "openai", id: "gpt-5.1", name: "GPT-5.1", key: "openai/gpt-5.1", levels: [], input: ["text"] },
  ] });
  await h.settle();
  await loaded;
  let root = h.window.document.getElementById("root");
  assert.match(root.textContent, /旧模型配置导入失败/);
  assert.match(root.textContent, /openai\/gpt-5.1/, "目录照常展示");
  assert.match(root.textContent, /尚无自定义供应商/);
  assert.doesNotMatch(root.textContent, /保存失败/);

  const failed = h.manager.load();
  await h.settle();
  const get = h.lastPending("models.config.get");
  get.settled = true;
  get.reject(new Error("连接已断开"));
  await h.settle();
  await failed; // load 不向上抛
  root = h.window.document.getElementById("root");
  assert.match(root.textContent, /无法加载模型配置：连接已断开/);
  const retry = [...root.querySelectorAll(".mm-alert button")].find((node) => node.textContent === "重试");
  retry.click();
  await h.settle();
  h.flushGet();
  await h.settle();
  assert.match(h.window.document.getElementById("root").textContent, /模型与供应商/);
  h.window.close();
});

test("已保存未应用保留新指纹；重试只回读应用，不重复保存或删除", async () => {
  const h = harness();
  try {
    const loaded = h.manager.load();
    h.flushGet({ providers: [{ id: "p1", baseUrl: "https://p.example.com", api: "openai-completions" }] });
    await loaded;
    h.button("编辑").click();
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

test("目录渲染只产出文本节点，绝无注入路径", async () => {
  const h = harness();
  const loaded = h.manager.load();
  h.flushGet({
    catalog: [
      { provider: "<img src=x onerror=alert(1)>", id: "</span>", key: "<img src=x onerror=alert(1)>/</span>", levels: [], input: ["text"] },
    ],
  });
  await h.settle();
  await loaded;
  const root = h.window.document.getElementById("root");
  assert.equal(root.querySelector("img"), null);
  assert.ok(root.textContent.includes("<img src=x onerror=alert(1)>/</span>"));
  assert.equal(/\.innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(source), false);
  h.window.close();
});
