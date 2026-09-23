import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("扩展可从实际SDK依赖树加载并注册生命周期", async () => {
  const jiti = createJiti(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const extension = await jiti.import(fileURLToPath(new URL("../extensions/usage-gate.ts", import.meta.url)));
  const handlers = new Map();
  extension.default({ on(name, handler) { handlers.set(name, handler); } });
  assert.deepEqual([...handlers.keys()], ["session_start", "session_shutdown"]);
  handlers.get("session_shutdown")();
});

test("外部扩展按显式 AXIOM_HOME 连接目标闸门，省略时使用默认根", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-extension-home-"));
  try {
    await mkdir(join(dir, "custom"));
    await mkdir(join(dir, ".axiom"));
    // 子进程隔离 homedir、环境变量和真实 IPC 端点，不碰用户现有服务。
    const script = `
      import assert from "node:assert/strict";
      import { join } from "node:path";
      import { createJiti } from ${JSON.stringify(import.meta.resolve("jiti"))};
      import { gateLayout } from ${JSON.stringify(new URL("../src/shared-gate.js", import.meta.url).href)};
      import { serveGate } from ${JSON.stringify(new URL("../src/gate-ipc.js", import.meta.url).href)};
      const jiti = createJiti(${JSON.stringify(import.meta.resolve("@earendil-works/pi-coding-agent"))});
      const extension = await jiti.import(${JSON.stringify(fileURLToPath(new URL("../extensions/usage-gate.ts", import.meta.url)))});
      const roots = [join(process.cwd(), ".axiom"), join(process.cwd(), "custom")];
      const servers = [];
      try {
        for (const [index, root] of roots.entries()) {
          const provider = index ? "custom" : "default";
          const layout = await gateLayout(root);
          servers.push(await serveGate({ ...layout, service: { gate: { limits: { [provider]: { rpm: 1 } } } } }));
        }
        const handlers = new Map(), registered = [];
        extension.default({ on(name, handler) { handlers.set(name, handler); }, registerProvider(provider) { registered.push(provider); } });
        const ctx = { modelRegistry: {
          getAll() { return ["custom", "default"].map(provider => ({ provider, api: "openai-completions" })); },
          getRegisteredNativeProvider() { return null; },
        }, sessionManager: { getSessionId() { return "test"; } }, ui: { notify(message) { throw new Error(message); } } };
        process.env.AXIOM_HOME = "custom";
        await handlers.get("session_start")({}, ctx);
        assert.deepEqual(registered, ["custom"]);
        delete process.env.AXIOM_HOME;
        await handlers.get("session_start")({}, ctx);
        assert.deepEqual(registered, ["custom", "default"]);
        handlers.get("session_shutdown")();
      } finally { await Promise.all(servers.map(server => server.close())); }
    `;
    await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
      cwd: dir, env: { ...process.env, HOME: dir, USERPROFILE: dir }, timeout: 30000,
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
