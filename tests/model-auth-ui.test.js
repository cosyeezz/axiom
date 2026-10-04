import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const source = (await readFile(new URL("../public/model-auth.js", import.meta.url), "utf8")).replace(/^export /gm, "");
const tick = () => new Promise(setImmediate);
function harness(respond) {
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
  const calls = []; let changed = 0;
  dom.window.request = async (type, args) => { calls.push({ type, args }); return respond(type, args); };
  dom.window.changed = () => { changed++; };
  dom.window.eval(`${source}\nwindow.auth = createModelAuth({ request, onChanged: changed });`);
  const provider = { id: "openai-codex", name: "OpenAI Codex", methods: [{ type: "oauth", name: "ChatGPT" }] };
  dom.window.document.body.append(dom.window.auth.section(provider));
  return { window: dom.window, calls, changed: () => changed, doc: dom.window.document };
}

test("Codex 登录入口 → SDK 登录方式选项 → 授权 URL/设备码 → 成功但不声称实连", async () => {
  let sent = false;
  const h = harness((type) => {
    if (type === "models.auth.start" || type === "models.auth.status" && !sent) return {
      flowId: "flow", status: "running", prompt: { id: "method", type: "select", message: "登录方式",
        options: [{ id: "browser", label: "Browser" }, { id: "device", label: "Device code" }] }, events: [],
    };
    if (type === "models.auth.respond") { sent = true; return {}; }
    return { status: "success", credentialsSaved: true, applied: true, events: [
      { type: "device_code", verificationUri: "https://auth.example/device", userCode: "ABCD-EFGH" },
      { type: "auth_url", url: "javascript:alert(1)", instructions: "unsafe" },
    ] };
  });
  try {
    h.doc.querySelector("button").click(); await tick();
    assert.equal(h.calls[0].args.providerId, "openai-codex");
    assert.equal(h.calls[0].args.authType, "oauth");
    const select = h.doc.querySelector("dialog select"); select.value = "device";
    h.doc.querySelector("dialog form").dispatchEvent(new h.window.Event("submit", { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 850));
    assert.equal(h.calls.find((c) => c.type === "models.auth.respond").args.value, "device");
    assert.match(h.doc.querySelector("dialog").textContent, /连接尚未验证/);
    assert.match(h.doc.querySelector("dialog code").textContent, /ABCD-EFGH/);
    assert.equal(h.doc.querySelectorAll("dialog a").length, 1);
    assert.equal(h.doc.querySelector("dialog a").rel, "noopener noreferrer");
    assert.equal(h.changed(), 1);
    h.doc.querySelector("dialog .dialog-actions button").click();
    assert.equal(h.doc.querySelector("dialog"), null);
    assert.equal(h.calls.some((c) => c.type === "models.auth.cancel"), false);
  } finally { h.window.close(); }
});

test("登录错误/取消/部分应用的终态文案和关闭清理", async () => {
  for (const [status, credentialsSaved, pattern] of [["error", false, /登录未完成/], ["error", true, /目录未应用/], ["cancelled", false, /取消或超时/], ["cancelled", true, /无需重复授权/]]) {
    const h = harness(() => ({ flowId: "flow", status, credentialsSaved, error: status === "error" ? "请重试" : undefined }));
    try {
      h.doc.querySelector("button").click(); await tick();
      assert.match(h.doc.querySelector("dialog [role=status]").textContent, pattern);
      assert.equal(h.changed(), Number(credentialsSaved));
      h.doc.querySelector("dialog .dialog-actions button").click();
      assert.equal(h.doc.querySelector("dialog"), null);
    } finally { h.window.close(); }
  }
});

test("原生空 text 可提交，短暂状态失败恢复且不重启授权", async () => {
  let polls = 0, answered = false;
  const h = harness((type, args) => {
    if (type === "models.auth.respond") { assert.equal(args.value, ""); answered = true; return {}; }
    if (type === "models.auth.status" && ++polls === 1) throw new Error("temporary timeout");
    if (answered) return { status: "success", credentialsSaved: true, applied: true };
    return { flowId: "flow", status: "running", prompt: { id: "domain", type: "text", message: "blank for github.com" } };
  });
  try {
    h.doc.querySelector("button").click(); await tick();
    assert.equal(h.doc.querySelector("dialog input").required, false);
    h.doc.querySelector("dialog form").requestSubmit(); await tick();
    assert.equal(answered, true);
    await new Promise((resolve) => setTimeout(resolve, 850));
    assert.match(h.doc.querySelector("dialog [role=status]").textContent, /目录已更新/);
    assert.equal(h.doc.querySelector("dialog [role=alert]").textContent, "");
    assert.equal(h.calls.filter((c) => c.type === "models.auth.start").length, 1);
  } finally { h.window.close(); }
});

test("授权未结束关闭弹窗取消流程，不保存或触发刷新", async () => {
  const h = harness(() => ({ flowId: "flow", status: "running", events: [] }));
  try {
    h.doc.querySelector("button").click(); await tick();
    h.doc.querySelector("dialog .dialog-actions button").click(); await tick();
    assert.equal(h.calls.filter((c) => c.type === "models.auth.cancel").length, 1);
    assert.equal(h.changed(), 0);
  } finally { h.window.close(); }
});
