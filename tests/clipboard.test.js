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

test("copyText reports failures from both paths", async () => {
  const d = dom("<body></body>");
  try {
    const { window } = d;
    const copyText = await loadCopyText(window);
    // jsdom 未实现 execCommand（undefined）：按复制失败处理，而不是 TypeError。
    await assert.rejects(() => copyText("no api"), /拒绝了复制请求/);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("denied"); } },
    });
    // API 存在但被拒绝：保持原有错误透传语义（调用方 catch 后提示）。
    await assert.rejects(() => copyText("denied"), /denied/);
    assert.equal(window.document.querySelector("textarea"), null, "失败后同样清理");
  } finally { d.window.close(); }
});
