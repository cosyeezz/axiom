import { fork, spawn } from "node:child_process";
import { mkdirSync, openSync, existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
let output = "inherit";
export function run(command, args, cwd = root) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: output, windowsHide: true });
    child.once("error", fail);
    child.once("exit", (code) => code === 0 ? done() : fail(new Error(`${command} exited ${code}`)));
  });
}
export async function rebuild(cwd = root, execute = run) {
  const modules = join(cwd, "node_modules"), backup = join(cwd, ".node_modules-backup");
  if (existsSync(backup)) throw new Error(`备份目录已存在，请检查后手动恢复：${backup}`);
  const saved = existsSync(modules);
  if (saved) await rename(modules, backup);
  const npm = (args) => process.platform === "win32"
    ? execute(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], cwd)
    : execute("npm", args, cwd);
  try {
    await npm(["ci"]);
    await npm(["run", "build", "--if-present"]);
  } catch (error) {
    await rm(modules, { recursive: true, force: true });
    if (saved) await rename(backup, modules);
    throw error;
  }
  if (saved) await rm(backup, { recursive: true, force: true });
}

export function supervise() {
  if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
  process.env.PATH = `${dirname(process.execPath)}${delimiter}${process.env.PATH || ""}`;
  const logDir = join(homedir(), ".axiom");
  mkdirSync(logDir, { recursive: true });
  const log = openSync(join(logDir, "service.log"), "a");
  output = ["ignore", log, log];
  let child, restarting = false, stopping = false;
  const start = (error = "") => {
    child = fork(join(root, "src/main.js"), [], {
      cwd: root, env: { ...process.env, AXIOM_SERVICE_ERROR: error },
      stdio: ["ignore", log, log, "ipc"], windowsHide: true,
    });
    child.on("error", (error) => { console.error(error); process.exitCode = 1; });
    child.on("exit", (code) => {
      if (!restarting) process.exit(code || 0);
    });
    child.on("message", (message) => {
      if (message?.type !== "service.restart" || !["quick", "rebuild"].includes(message.mode) || restarting || stopping) return;
      restarting = true;
      // Allow the WebSocket acknowledgment to flush before closing the worker.
      setTimeout(async () => {
        try {
          await stopChild();
          let error = "";
          if (message.mode === "rebuild") {
            try { await rebuild(); }
            catch (cause) { error = `重建失败：${cause.message}`; console.error(error); }
          }
          if (!stopping) start(error);
        } catch (error) { console.error(error); process.exitCode = 1; }
        finally { restarting = false; }
      }, 150);
    });
  };
  function stopChild() {
    return new Promise((done, fail) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      // Do not force-kill: session persistence must finish before dependencies change.
      const timer = setTimeout(() => fail(new Error("服务停止超时；未执行安装，请检查 service.log")), 60000);
      child.once("exit", () => { clearTimeout(timer); done(); });
      child.send({ type: "service.stop" }, (error) => {
        if (error) { clearTimeout(timer); fail(error); }
      });
    });
  }
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    stopping = true;
    void stopChild().catch((error) => { console.error(error); process.exitCode = 1; });
  });
  start();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) supervise();
