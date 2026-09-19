import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

test("扩展可从实际SDK依赖树加载并注册生命周期", async () => {
  const jiti = createJiti(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const extension = await jiti.import(fileURLToPath(new URL("../extensions/usage-gate.ts", import.meta.url)));
  const handlers = new Map();
  extension.default({ on(name, handler) { handlers.set(name, handler); } });
  assert.deepEqual([...handlers.keys()], ["session_start", "session_shutdown"]);
  handlers.get("session_shutdown")();
});
