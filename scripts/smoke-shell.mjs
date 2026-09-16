import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
const temp = await mkdtemp(join(tmpdir(), "axiom-shell-"));
const probe = createServer();
await new Promise(done => probe.listen(0, "127.0.0.1", done));
const port = probe.address().port;
await new Promise(done => probe.close(done));
const env = { ...process.env, AXIOM_HOME: join(temp, "data"), AXIOM_CWD: temp,
  PI_CODING_AGENT_DIR: join(temp, "pi"), AXIOM_DESKTOP_SMOKE: "1", AXIOM_PORT: String(port) };
delete env.ELECTRON_RUN_AS_NODE;
const executable = resolve(process.argv[2] || "node_modules/electron/dist/electron.exe");
const child = spawn(executable, process.argv[2] ? [] : ["."], { env, stdio: "inherit" });
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  // 仅本次隔离测试进程树；超时一律失败，不冒充安全退出。
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
  else child.kill();
}, 30_000);
try {
  const code = await new Promise((done, reject) => { child.once("exit", done); child.once("error", reject); });
  if (timedOut || code !== 0) throw new Error(`Electron冒烟失败：timeout=${timedOut}, exit=${code}`);
  console.log("Electron窗口加载与后端安全退出通过（隔离数据）");
} finally {
  clearTimeout(timer);
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
