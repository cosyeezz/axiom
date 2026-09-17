import { readFile } from "node:fs/promises";

// 页面测试用 window.eval 跑 public 下的真实 ESM 源码：按依赖顺序拼接并去掉模块语法。
// 顶层 import/export 都要剥，否则新增跨模块 import 会让整段 eval 报 SyntaxError。
export const publicSource = async (...names) =>
  (await Promise.all(names.flatMap(name => name === "app" ? ["transport", "session-cache", "session-details", "clipboard", "app"] : [name]).map(async (name) =>
    (await readFile(new URL(`../../public/${name}.js`, import.meta.url), "utf8"))
      .replace(/^import .*;\r?\n/gm, "")
      .replace(/^export /gm, "")))).join("\n") + (names.includes("app") ? `
// Test-only accessors for the migrated transport; no legacy state in app.js.
function event(message) { return transport.receive(message); }
const appliedSeq = { get: transport.getWatermark };
` : "");
