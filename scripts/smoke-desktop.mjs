import { fork } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { createBackendLifecycle } from "../desktop/backend-lifecycle.mjs";

const root = resolve(process.argv[2] || "dist/win-unpacked/resources");
const temp = await mkdtemp(join(tmpdir(), "axiom-desktop-smoke-"));
const probe = createServer();
await new Promise((done) => probe.listen(0, "127.0.0.1", done));
const port = probe.address().port;
// 保持配置端口被占用，桌面应使用操作系统分配的独立端口。
let child, exited;
const { bundleVersion } = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const backend = createBackendLifecycle({ bundleRoot: root, bundleVersion, dataRoot: join(temp, "data"),
  cwd: temp, nodePath: join(root, "runtime", process.platform === "win32" ? "node.exe" : "node"), timeout: 20_000,
  spawn: (file, args, options) => {
    child = fork(file, args, { ...options, env: { ...options.env, AXIOM_PORT: String(port),
      PI_CODING_AGENT_DIR: join(temp, "pi"), PATH: "", AXIOM_MODEL: "" } });
    exited = new Promise((done) => child.once("exit", done));
    return child;
  } });
try {
  const ready = await backend.startBackend();
  if (new URL(ready.url).port === String(port)) throw new Error("桌面错误复用了已占用端口");
  const health = await fetch(ready.url + "/health", { signal: AbortSignal.timeout(5000) }).then(r => r.json());
  if (health.instanceId !== ready.instanceId) throw new Error("健康检查身份不一致");
  await backend.requestStop({ mode: "cancel" });
  console.log("随包独立 Node + 空 PATH + 隔离数据启动/健康检查/保存退出通过");
} finally {
  if (child && child.exitCode === null) {
    // 仅清理本测试亲自创建的隔离进程；强制清理绝不记为安全退出通过。
    child.kill();
    await Promise.race([exited, new Promise(done => setTimeout(done, 3000))]);
  }
  await new Promise((done) => probe.close(done));
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
