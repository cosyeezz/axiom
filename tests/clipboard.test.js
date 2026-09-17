import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { publicSource } from "./helpers/public-source.js";

// 远程 HTTP 等非安全上下文里 navigator.clipboard 为 undefined；
// copyText 必须回退 execCommand，而不是抛 “Cannot read properties of undefined”。
const loadCopyText = async (window) => {
  window.eval(await publicSource("clipboard"));
  return window.eval("copyText");
};

const dom = (html) => new JSDOM(html, { runScripts: "outside-only" });

test("copyText prefers the async Clipboard API when available", async () => {
  const d = dom("<body></body>");
  try {
    const { window } = d;
    const copied = [];
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { copied.push(text); } },
    });
    const copyText = await loadCopyText(window);
    await copyText("hello");
    assert.deepEqual(copied, ["hello"]);
    assert.equal(window.document.querySelector("textarea"), null, "API 路径不创建临时元素");
  } finally { d.window.close(); }
});

test("copyText falls back to execCommand without a Clipboard API", async () => {
  const d = dom("<body></body>");
  try {
    const { window } = d;
    const commands = [];
    window.document.execCommand = (command) => {
      commands.push(command);
      window.commandValue = window.document.querySelector("textarea")?.value;
      return true;
    };
    const copyText = await loadCopyText(window);
    await copyText("fallback text");
    assert.deepEqual(commands, ["copy"]);
    assert.equal(window.commandValue, "fallback text");
    assert.equal(window.document.querySelector("textarea"), null, "回退后清理临时输入框");
  } finally { d.window.close(); }
});

test("copyText copies into the view that owns the element", async () => {
  const host = dom("<body></body>");
  const target = dom("<body></body>");
  try {
    const copyText = await loadCopyText(host.window);
    let captured;
    target.window.document.execCommand = () => {
      captured = target.window.document.querySelector("textarea")?.value;
      return true;
    };
    await copyText("cross-view", target.window);
    assert.equal(captured, "cross-view", "在目标文档里建临时输入框并选中复制");
    assert.equal(host.window.document.querySelector("textarea"), null);
  } finally { host.window.close(); target.window.close(); }
});

test("copyText falls back when writeText is denied, and reports actionable errors", async () => {
  const d = dom("<body></body>");
  try {
    const { window } = d;
    const copyText = await loadCopyText(window);
    // API 存在但被拒绝（如 Firefox 权限门控）：仍在用户手势窗口内，继续走 execCommand。
    let captured;
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("denied"); } },
    });
    window.document.execCommand = () => { captured = window.document.querySelector("textarea")?.value; return true; };
    await copyText("rejected but copied");
    assert.equal(captured, "rejected but copied", "writeText 拒绝后 execCommand 仍能复制");
    // 两条路径都失败：给可操作指引，不暴露内部错误。
    delete window.document.execCommand; // jsdom 本就未实现：恢复未实现状态。
    await assert.rejects(() => copyText("both fail"), /拒绝.*改用系统复制菜单/);
    assert.equal(window.document.querySelector("textarea"), null, "失败后同样清理");
  } finally { d.window.close(); }
});
