import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";
import { createMaintState } from "../scripts/maint-state.mjs";
import { startMaintServer } from "../scripts/maint-server.mjs";

const source = (await readFile(new URL("../public/service-settings.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

async function setup({ ready = true, grace = 5000, respond } = {}) {
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  const calls = [];
  window.request = (type, args) => new Promise((resolve, reject) => calls.push({ type, args, resolve, reject }));
  const fetches = [];
  window.fetch = async (url, opts = {}) => {
    fetches.push({ url, opts });
    return respond ? respond(url, opts) : { ok: true, json: async () => ({}) };
  };
  const ui = window.eval(
    `${source.replace("SUBMIT_GRACE = 5000", `SUBMIT_GRACE = ${grace}`)}\ninitServiceSettings({ request, isReady: () => ${ready} })`,
  );
  const $ = (id) => window.document.getElementById(id);
  const tick = () => new Promise(setImmediate);
  const settle = () => new Promise((r) => setTimeout(r, 30));
  return { dom, window, ui, $, calls, fetches, tick, settle };
}

test("服务与更新面板：顶部三要素不动源码路径，DEV 隐藏更新，未接管全部禁用", async () => {
  const { dom, ui, $ } = await setup();
  try {
    ui.apply({ managed: true, version: "1.2.3", dev: true });
    assert.equal($("service-update-section").hidden, true, "DEV 隐藏更新分组");
    assert.equal($("service-dev").hidden, false);
    assert.equal($("service-version").textContent, "v1.2.3");
    assert.match($("service-feedback").textContent, /重启前请停止/);
    ui.apply({ managed: true, version: "1.2.3" });
    assert.equal($("service-update-section").hidden, false);
    ui.apply({ managed: false, version: "1.2.3" });
    assert.match($("service-feedback").textContent, /npm start/);
    assert.doesNotMatch($("service-feedback").textContent, /src|scripts/, "不暴露源码路径");
    assert.equal($("restart-quick").disabled, true, "未接管时禁用");
    ui.apply({ managed: true, version: "1.2.3" });
    assert.equal($("restart-quick").disabled, false);
    assert.equal($("service-recover").hidden, true, "在线时不显示恢复按钮");
    assert.equal($("maintenance-state").hidden, true);
  } finally { dom.window.close(); }
});

test("检查更新与安装分离：结果确认后才出现安装，提交携带 sha", async () => {
  const { dom, ui, $, calls, tick } = await setup();
  try {
    ui.apply({ managed: true });
    $("update-check").click();
    await tick();
    assert.equal(calls[0].type, "service.update.check");
    calls[0].resolve({ available: true, sha: "b".repeat(40), local: "1.2.3", remote: "2.0.0" });
    await tick();
    assert.match($("update-result").textContent, /发现新版本 2\.0\.0/);
    assert.equal($("update-install").hidden, false);
    $("update-install").click();
    assert.equal($("restart-dialog").dataset.mode, "install");
    $("restart-form").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await tick();
    assert.equal(calls[1].type, "service.restart");
    assert.equal(calls[1].args.mode, "update");
    assert.equal(calls[1].args.sha, "b".repeat(40));
  } finally { dom.window.close(); }
});

test("重启对话框：quick/rebuild 不带 sha，拒绝时反馈且解锁，取消不发送", async () => {
  const { dom, ui, $, calls, tick } = await setup();
  try {
    ui.apply({ managed: true });
    $("restart-quick").click();
    assert.match($("restart-description").textContent, /不修复依赖/);
    $("restart-cancel").click();
    assert.equal($("restart-dialog").open, false);
    assert.equal(calls.length, 0, "取消不发送请求");
    $("restart-quick").click();
    $("restart-form").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await tick();
    assert.equal(calls[0].type, "service.restart");
    assert.equal(calls[0].args.mode, "quick");
    assert.equal(calls[0].args.sha, undefined, "quick/rebuild 不携带 sha");
    assert.equal($("restart-quick").disabled, true, "提交后锁定，等待权威结果");
    calls[0].reject(new Error("请先停止正在运行的会话"));
    await tick();
    assert.match($("service-feedback").textContent, /请先停止/);
    assert.equal($("restart-quick").disabled, false, "失败后解锁");
    $("restart-rebuild").click();
    $("restart-cancel").click();
    assert.equal(calls.filter((c) => c.type === "service.restart").length, 1);
  } finally { dom.window.close(); }
});

test("持久化操作记录：扁平契约渲染，status 不带 operation 时保留历史", async () => {
  const { dom, ui, $ } = await setup();
  try {
    const t = Date.now();
    ui.apply({ managed: true, operation: {
      operation: "update", status: "failed", error: "下载中断", startedAt: t,
      phases: [{ phase: "boot", at: t - 1000 }, { phase: "download", at: t }], log: "下载中断于 37%",
    } });
    const history = $("service-history").textContent;
    assert.match(history, /安装更新：失败：下载中断/);
    assert.doesNotMatch(history, /启动/, "只展示本次操作的阶段时间线");
    assert.match(history, /下载更新/);
    assert.match(history, /下载中断于 37%/);
    ui.apply({ managed: true, operation: { operation: "quick", status: "succeeded" } });
    assert.match($("service-history").textContent, /重启服务：成功/);
    ui.apply({ managed: true }); // service.status 不带 operation：保留上次记录
    assert.match($("service-history").textContent, /重启服务：成功/);
    ui.apply({ managed: true, operation: { operation: "rebuild", status: "running", phase: "weird", startedAt: t } });
    assert.match($("service-history").textContent, /修复依赖并重启：进行中（weird）/);
    ui.apply({ managed: true, operation: { operation: null, status: "idle" } });
    assert.match($("service-history").textContent, /尚未执行任何操作/);
  } finally { dom.window.close(); }
});

test("维护通道：凭证校验缓存、断线轮询、手动恢复按钮、不承诺离线刷新", async () => {
  const holder = {
    state: { ready: false, operation: null, status: "idle" },
    response: async (url) => url.endsWith("/recover")
      ? { ok: true, status: 202, json: async () => ({ accepted: true, mode: "quick", operationId: "op-1" }) }
      : { ok: true, json: async () => holder.state },
  };
  const { dom, window, ui, $, fetches, tick } = await setup({ ready: false, respond: (...a) => holder.response(...a) });
  const setStatus = (state) => { holder.state = state; };
  try {
    // url 不符/无 token 一律不缓存
    ui.apply({ managed: true, maintenance: { url: "https://127.0.0.1:4567", token: "t" } });
    assert.equal(window.sessionStorage.getItem("axiom.maintenance"), null, "非 loopback http 不缓存");
    assert.equal(fetches.length, 0);
    // 合法凭证：缓存并自动轮询
    ui.apply({ managed: true, maintenance: { url: "http://127.0.0.1:4567", token: "t2" } });
    assert.deepEqual(JSON.parse(window.sessionStorage.getItem("axiom.maintenance")), { url: "http://127.0.0.1:4567", token: "t2" });
    assert.equal(fetches.at(-1).url, "http://127.0.0.1:4567/status");
    assert.equal(fetches.at(-1).opts.headers.authorization, "Bearer t2");
    await tick();
    ui.apply({ managed: true }); // 无维护字段 → 清缓存停止轮询
    assert.equal(window.sessionStorage.getItem("axiom.maintenance"), null);
    const before = fetches.length;
    ui.watch();
    await tick();
    assert.equal(fetches.length, before, "无缓存不轮询");
    assert.equal($("maintenance-state").hidden, true);
    // 轮询各状态文案
    ui.apply({ managed: true, maintenance: { url: "http://127.0.0.1:4567", token: "t3" } });
    await tick(); // 先让首拍完成，再切换响应状态
    setStatus({ ready: false, operation: "update", status: "running", phase: "build" });
    ui.stop(); ui.watch(); await tick();
    assert.match($("maintenance-state").textContent, /安装更新进行中（构建）/);
    assert.doesNotMatch($("maintenance-state").textContent, /刷新/, "不声称刷新离线仍可用");
    setStatus({ ready: false, operation: "quick", status: "failed", error: "端口被占用" });
    ui.stop(); ui.watch(); await tick();
    assert.match($("maintenance-state").textContent, /失败：端口被占用/);
    assert.match($("maintenance-state").textContent, /npm start/, "失败时展示终端启动命令");
    assert.equal($("service-recover").hidden, false, "离线且有凭证时显示恢复按钮");
    assert.equal($("service-recover").disabled, false, "worker 已退出时可恢复");
    // 手动恢复：202 接受
    setStatus({ ready: false, operation: null, status: "idle" });
    ui.stop(); ui.watch(); await tick();
    $("service-recover").click();
    await tick();
    const post = fetches.filter((f) => f.opts.method === "POST").at(-1);
    assert.equal(post.url, "http://127.0.0.1:4567/recover");
    assert.deepEqual(JSON.parse(post.opts.body), { mode: "quick" });
    assert.match($("maintenance-state").textContent, /已请求恢复服务/);
    // 恢复被拒：409 error
    holder.response = async (url) => url.endsWith("/recover")
      ? { ok: false, status: 409, json: async () => ({ error: "worker 未退出" }) }
      : { ok: true, json: async () => ({ ready: false, operation: null, status: "idle" }) };
    ui.stop(); ui.watch(); await tick();
    $("service-recover").click();
    await tick();
    assert.match($("maintenance-state").textContent, /未接受：worker 未退出/);
    // 端点不可达：npm start 兜底
    holder.response = async () => { throw new Error("down"); };
    ui.stop(); ui.watch(); await tick();
    assert.match($("maintenance-state").textContent, /维护端点不可达/);
    assert.match($("maintenance-state").textContent, /npm start/);
    assert.equal($("service-recover").disabled, true, "不可达时禁止恢复");
    ui.stop();
    assert.equal($("maintenance-state").hidden, true);
  } finally { dom.window.close(); }
});

test("恢复请求防重叠：上一请求未返回不发新请求", async () => {
  const holder = { response: async () => ({ ok: true, json: async () => ({ ready: false, operation: null, status: "idle" }) }) };
  const { dom, ui, $, fetches, tick } = await setup({ ready: false, respond: (...a) => holder.response(...a) });
  try {
    ui.apply({ managed: true, maintenance: { url: "http://127.0.0.1:4567", token: "t" } });
    await tick();
    assert.equal(fetches.length, 1, "首拍完成，恢复按钮可用");
    assert.equal($("service-recover").disabled, false);
    holder.response = () => new Promise(() => {}); // 永不返回
    ui.stop(); ui.watch(); // 上一轮询挂起中：新一拍直接跳过
    ui.stop();
    ui.watch(); // 同理：不重叠发起
    assert.equal(fetches.length, 2, "挂起中的一拍在飞，后续不重叠");
    $("service-recover").click(); // 恢复请求挂起期间再点也只发一次
    $("service-recover").click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(fetches.filter((f) => f.opts.method === "POST").length, 1);
  } finally { dom.window.close(); }
});

test("在线轮询权威更新重启锁：准备失败/完成后无需重连即解锁", async () => {
  let state = { ready: true, operation: null, status: "idle" };
  const { dom, ui, $, calls, tick, settle } = await setup({ ready: true, grace: 20, respond: () => ({ ok: true, json: async () => state }) });
  try {
    ui.apply({ managed: true, maintenance: { url: "http://127.0.0.1:4567", token: "t" } });
    $("restart-quick").click();
    $("restart-form").dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await tick();
    calls[0].resolve({}); // 请求被接受
    await tick();
    assert.equal($("restart-quick").disabled, true, "提交后锁定");
    await settle(); // 超过 20ms 宽限：守护未记账（准备阶段即失败）
    ui.stop(); ui.watch(); await tick();
    assert.equal($("restart-quick").disabled, false, "权威 idle 且宽限已过 → 解锁");
    state = { ready: true, operation: "quick", status: "running", phase: "stop", startedAt: Date.now() };
    ui.stop(); ui.watch(); await tick();
    assert.equal($("restart-quick").disabled, true, "权威 running → 锁定");
    state = { ready: true, operation: "quick", status: "succeeded", startedAt: Date.now() };
    ui.stop(); ui.watch(); await tick();
    assert.equal($("restart-quick").disabled, false, "权威 succeeded → 解锁");
    assert.match($("service-history").textContent, /重启服务：成功/);
  } finally { dom.window.close(); }
});

test("维护通道真实 HTTP 契约：/status 扁平记录、Bearer 404、/recover 202/409/400，前端实测", { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-maint-"));
  const state = await createMaintState({ file: join(dir, "state.json"), redactions: [["hunter2", "***"]] });
  let workerGone = true;
  const server = await startMaintServer({
    state, token: "hunter2",
    recover: (mode) => (workerGone ? { operationId: "op-9" } : { error: "worker 未退出" }),
  });
  const auth = { authorization: "Bearer hunter2", "content-type": "application/json" };
  try {
    // —— 纯 HTTP 契约 ——
    assert.equal((await fetch(`${server.url}/status`)).status, 404, "无凭证 404");
    assert.equal((await fetch(`${server.url}/status`, { headers: { authorization: "Bearer wrong" } })).status, 404);
    const ok = await fetch(`${server.url}/status`, { headers: { authorization: "Bearer hunter2" } });
    assert.equal(ok.status, 200);
    const data = await ok.json();
    for (const key of ["pid", "instanceId", "version", "ready", "operation", "operationId", "status", "phase", "phases", "startedAt", "updatedAt", "error", "log"])
      assert.ok(key in data, `扁平记录含 ${key}`);
    assert.equal(data.status, "idle");
    const bad = await fetch(`${server.url}/recover`, { method: "POST", headers: auth, body: JSON.stringify({ mode: "hard" }) });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /"mode":"quick"/);
    workerGone = false;
    const denied = await fetch(`${server.url}/recover`, { method: "POST", headers: auth, body: JSON.stringify({ mode: "quick" }) });
    assert.equal(denied.status, 409, "worker 未退出时拒绝");
    assert.match((await denied.json()).error, /worker 未退出/);
    workerGone = true;
    const accepted = await fetch(`${server.url}/recover`, { method: "POST", headers: auth, body: JSON.stringify({ mode: "quick" }) });
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), { accepted: true, mode: "quick", operationId: "op-9" });

    // —— 前端逻辑吃真实记录（真实 fetch，剥跨环境 signal）——
    const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
    const { window } = dom;
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.fetch = (url, opts = {}) => { const { signal, ...rest } = opts; void signal; return fetch(url, rest); };
    const $ = (id) => window.document.getElementById(id);
    const settle = () => new Promise((r) => setTimeout(r, 60));
    const ui = window.eval(`${source}\ninitServiceSettings({ request: async () => ({}), isReady: () => false })`);
    try {
      ui.apply({ managed: true, maintenance: { url: server.url, token: "hunter2" } });
      await settle();
      assert.match($("maintenance-state").textContent, /业务进程未运行/);
      assert.equal($("service-recover").hidden, false);
      await state.begin("op-9", "quick");
      await state.phase("stop");
      state.setWorker("w1");
      state.appendLog("停止进程\n");
      ui.stop(); ui.watch(); await settle();
      assert.match($("maintenance-state").textContent, /重启服务进行中（停止服务）/);
      assert.match($("service-history").textContent, /重启服务：进行中（停止服务）/);
      assert.match($("service-history").textContent, /停止进程/);
      assert.equal($("service-recover").disabled, true, "running 时禁止恢复，不误点");
      state.appendLog("hunter2 不得出现在日志\n");
      ui.stop(); ui.watch(); await settle();
      assert.doesNotMatch($("service-history").textContent, /hunter2/, "日志脱敏");
      state.succeed();
      ui.stop(); ui.watch(); await settle();
      assert.match($("maintenance-state").textContent, /已完成/);
      assert.equal($("service-recover").disabled, false, "完成后可手动恢复");
      $("service-recover").click();
      await settle();
      assert.match($("maintenance-state").textContent, /已请求恢复服务/);
      state.fail("构建失败");
      ui.stop(); ui.watch(); await settle();
      assert.match($("maintenance-state").textContent, /失败：构建失败/);
      const again = await ui.recover("rebuild");
      assert.equal(again.mode, "rebuild");
      assert.equal(again.accepted, true);
    } finally { window.close(); }
  } finally {
    await server.close();
    await state.flush();
    await rm(dir, { recursive: true, force: true });
  }
});
