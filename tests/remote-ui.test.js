import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import createPurify from "dompurify";
import { createStreamRenderer } from "../public/stream-renderer.js";
import { publicSource } from "./helpers/public-source.js";

// 与 compaction-ui.test.js 相同的页面脚手架：跑真实 index.html + app.js，无服务器。
async function page(extra = "") {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const source = await publicSource("markdown-scan", "memory-tags", "goal-markers", "question", "service-settings", "app");
  const picker = (await readFile(new URL("../public/file-picker.js", import.meta.url), "utf8")).replace(/^export /gm, "");
// master 模型模块脚手架（同 tests/app.test.js）：app.js 顶层调用 initModelManager，缺它会 ReferenceError
const modelSources = await Promise.all(["model-picker", "model-auth", "model-manager"].map(async (name) => {
  const source = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
  const exports = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  return `Object.assign(window, (() => { ${source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "")}\nreturn {${exports.join(",")}}; })());`;
})).then((parts) => parts.join("\n"));
  const dom = new JSDOM(html, { url: "http://localhost", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const frames = new Map();
  let nextFrame = 0;
  w.requestAnimationFrame = (fn) => { frames.set(++nextFrame, fn); return nextFrame; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  const markdown = (await readFile(new URL("../public/markdown.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  w.renderMarkdown = new Function("marked", "DOMPurify", `${markdown}; return renderMarkdown;`)(marked, createPurify(w));
  w.createStreamRenderer = (render, after) => createStreamRenderer(render, after, w.requestAnimationFrame, w.cancelAnimationFrame);
  w.WebSocket = class { static OPEN = 1; readyState = 1; send(data) { (this.sent ||= []).push(data); } };
  w.eval(`${modelSources}\n${picker}\n${source}\nconnected = true;\n${extra}`);
  const state = { sessionId: "remote", title: "Remote", cwd: "C:/work", status: "idle", config: { model: "test/model", thinking: "off", levels: ["off"], skills: [] }, messages: [], tasks: [], live: {}, tools: {} };
  w.snapshot(state);
  return { w, $: (id) => w.document.getElementById(id) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
function stubRequest(w) {
  const calls = [];
  let respond = {};
  w.request = async (type, data) => {
    calls.push([type, data]);
    if (respond.throw) throw respond.throw;
    return respond.data ?? {};
  };
  return { calls, respond };
}
const submit = (w) => w.document.getElementById("remote-form")
  .dispatchEvent(new w.Event("submit", { cancelable: true }));

test("远程控制：打开才请求、渲染状态、协议白名单、默认邮箱、下载与预留登录按钮", async () => {
  const { w, $ } = await page();
  try {
    const { calls, respond } = stubRequest(w);
    // 未打开远程面板时不请求
    w.remoteOnReconnect();
    assert.equal(calls.length, 0);
    // 打开远程面板 → remote.get
    $("settings-remote-tab").click();
    await flush();
    assert.equal(calls.at(-1)[0], "remote.get");
    assert.equal($("remote-panel").hidden, false);
    assert.equal($("defaults-panel").hidden, true);
    assert.equal($("settings-remote-tab").getAttribute("aria-current"), "page");
    assert.equal($("settings-defaults-tab").getAttribute("aria-current"), null, "三页签互斥高亮");
    // 已登录：状态、本机邮箱、存储邮箱优先、https 链接
    respond.data = { enabled: true, email: "team@example.com", url: "https://axiom.example.com", installed: true, online: true, loginEmail: "me@example.com", local: true };
    $("remote-refresh").click();
    await flush();
    assert.match($("remote-status").textContent, /远程访问已开启/);
    assert.match($("remote-login").textContent, /me@example.com/);
    assert.equal($("remote-email").value, "me@example.com", "切换账号后自动使用当前本机登录邮箱，不能锁死旧许可");
    assert.equal($("remote-email").readOnly, true, "邮箱自动带入，不可手填");
    const link = $("remote-url").querySelector("a");
    assert.equal(link.getAttribute("href"), "https://axiom.example.com");
    // 未保存邮箱时自动带入本机登录邮箱
    respond.data = { enabled: false, installed: true, online: true, loginEmail: "me@example.com", local: true };
    $("remote-refresh").click();
    await flush();
    assert.equal($("remote-email").value, "me@example.com");
    assert.equal($("remote-enabled").value, "off");
    assert.match($("remote-status").textContent, /远程访问未开启/, "关闭时不断言 Tailscale 状态");
    // 非安全协议不生成链接
    respond.data = { enabled: false, url: "javascript:alert(1)", installed: true, online: true, loginEmail: "me@example.com", local: true };
    $("remote-refresh").click();
    await flush();
    assert.equal($("remote-url").querySelector("a"), null);
    assert.match($("remote-url").textContent, /javascript:alert\(1\)/);
    // 未安装：官方下载链接，不出现登录按钮
    respond.data = { installed: false, online: false, local: true };
    $("remote-refresh").click();
    await flush();
    assert.equal($("remote-status").querySelector("a")?.getAttribute("href"), "https://tailscale.com/download");
    assert.equal($("remote-login").querySelector("button"), null);
    // 已安装未登录：登录按钮可点，点击走 remote.login 生成授权链接
    respond.data = { installed: true, online: false, loginEmail: "", local: true };
    $("remote-refresh").click();
    await flush();
    assert.equal($("remote-login").querySelector("button")?.disabled, false);
    assert.equal($("remote-login").querySelector("a"), null);
    assert.match($("remote-login-button").title, /管理台网页登录不等于本机登录/);
    respond.data = { installed: true, authUrl: "https://login.tailscale.com/a/abc123", local: true };
    $("remote-login-button").click();
    await flush();
    assert.equal(calls.at(-1)[0], "remote.login");
    assert.equal($("remote-auth").querySelector("a")?.getAttribute("href"), "https://login.tailscale.com/a/abc123");
    // 授权链接白名单：仅 https://login.tailscale.com/a/…（默认 443、无凭据），非法不替换、不新增
    for (const bad of [
      "http://login.tailscale.com/a/x",
      "https://evil.com/a/x",
      "https://login.tailscale.com:8443/a/x",
      "https://user:pass@login.tailscale.com/a/x",
      "https://login.tailscale.com/start",
      "javascript:alert(1)",
    ]) {
      respond.data = { installed: true, authUrl: bad, local: true };
      $("remote-login-button").click();
      await flush();
      assert.equal($("remote-auth").querySelector("a")?.getAttribute("href"), "https://login.tailscale.com/a/abc123", `非法 authUrl 未生效：${bad}`);
    }
    // 已登录：授权链接区清空
    respond.data = { installed: true, online: true, loginEmail: "me@example.com", local: true };
    $("remote-refresh").click();
    await flush();
    assert.equal($("remote-auth").querySelector("a"), null);
  } finally { w.close(); }
});

test("远程控制：断线反馈、保存成功与失败、local false 表单禁用、重连刷新", async () => {
  const { w, $ } = await page();
  try {
    const { calls, respond } = stubRequest(w);
    // 测试真实打开的设置弹窗；关闭后重连/focus 不应读取隐藏面板。
    $("settings").showModal();
    // 断线：读取失败反馈
    respond.throw = new Error("连接已断开，请重新连接");
    $("settings-remote-tab").click();
    await flush();
    assert.match($("remote-feedback").textContent, /读取失败：连接已断开/);
    // 重连后已加载过 → 自动刷新
    calls.length = 0;
    respond.throw = undefined;
    respond.data = { enabled: true, installed: true, online: true, loginEmail: "me@example.com", local: true };
    w.remoteOnReconnect();
    await flush();
    assert.deepEqual(calls.map(([type]) => type), ["remote.get"]);
    // 回到页面 focus 同样刷新（无轮询）
    calls.length = 0;
    w.dispatchEvent(new w.Event("focus"));
    await flush();
    assert.deepEqual(calls.map(([type]) => type), ["remote.get"]);
    // 保存：显式提交 remote.configure（邮箱来自自动带入）
    submit(w);
    await flush();
    const [configureType, configurePayload] = calls.at(-1);
    assert.equal(configureType, "remote.configure");
    assert.deepEqual({ ...configurePayload }, { enabled: true, email: "me@example.com" });
    assert.match($("remote-feedback").textContent, /已保存远程访问配置/);
    // 未登录（无邮箱）时开启：客户端拦截，不发请求
    respond.data = { enabled: false, installed: true, online: true, local: true };
    $("remote-refresh").click();
    await flush();
    calls.length = 0; // 刷新产生的 remote.get 已记入，清空后再验证保存不发请求
    $("remote-enabled").value = "on";
    submit(w);
    await flush();
    assert.equal(calls.length, 0);
    assert.match($("remote-feedback").textContent, /请先在本机登录 Tailscale/);
    // 保存失败反馈（重新刷新恢复邮箱）
    respond.data = { enabled: true, email: "me@example.com", installed: true, online: true, loginEmail: "me@example.com", local: true };
    $("remote-refresh").click();
    await flush();
    $("remote-enabled").value = "on";
    respond.throw = new Error("邮箱未通过 Tailscale 验证");
    submit(w);
    await flush();
    assert.match($("remote-feedback").textContent, /保存失败：邮箱未通过 Tailscale 验证/);
    respond.throw = undefined;
    // 远程查看者：表单禁用、保存不发请求
    respond.data = { enabled: true, email: "me@example.com", installed: true, online: true, loginEmail: "me@example.com", local: false };
    $("remote-refresh").click();
    await flush();
    assert.equal($("remote-note").hidden, false);
    for (const id of ["remote-enabled", "remote-email", "remote-save"])
      assert.equal($(id).disabled, true, `${id} 应禁用`);
    calls.length = 0;
    submit(w);
    await flush();
    assert.equal(calls.length, 0);
  } finally { w.close(); }
});

// 模拟 Tailscale 直连的 http://100.x 非安全上下文：crypto.randomUUID 不可用时请求仍可用。
test("非安全上下文：请求 id 用自增序号，乱序回执按 id 匹配", async () => {
  // 同一 eval 程序内才能读写 app.js 的 let ws/connected；probe 随页面源码一起注入。
  const { w } = await page(`
    Object.defineProperty(window.crypto, "randomUUID", { value: undefined, configurable: true });
    window.__probe = async () => {
      if (typeof crypto.randomUUID === "function") throw new Error("randomUUID 应不可用");
      // 走真实重连流程，拿到真实绑定的 ws.onmessage 回执分发
      connected = false; connecting = false;
      document.getElementById("login").dispatchEvent(new Event("submit", { cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      ws.onopen();
      await new Promise((r) => setTimeout(r, 0)); // onsubmit 继续，发出 service.status 并挂起
      const p1 = request("remote.get");
      const p2 = request("session.attach", { sessionId: "x" });
      const m1 = JSON.parse(ws.sent.at(-2)), m2 = JSON.parse(ws.sent.at(-1));
      // 回执乱序到达，仍按 id 匹配
      ws.onmessage({ data: JSON.stringify({ type: "response", id: m2.id, ok: true, data: { n: 2 } }) });
      ws.onmessage({ data: JSON.stringify({ type: "response", id: m1.id, ok: true, data: { n: 1 } }) });
      return [await p1, await p2, m1.id, m2.id];
    };
  `);
  try {
    const [r1, r2, id1, id2] = await w.__probe();
    assert.deepEqual({ ...r1 }, { n: 1 });
    assert.deepEqual({ ...r2 }, { n: 2 });
    assert.equal(typeof id1, "string", "协议要求非空字符串 id");
    assert.equal(id2, String(Number(id1) + 1), "同一页面内自增序号");
  } finally { w.close(); }
});
