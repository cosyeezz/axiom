import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { stat, mkdir, copyFile } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import { createPiFactory } from "./pi.js";
import { Sessions } from "./sessions.js";
import { createServerApp } from "./server.js";
import { checkUpdate } from "./update.js";

const port = Number(process.env.AXIOM_PORT || 4319);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid AXIOM_PORT");
const cwd = resolve(process.env.AXIOM_CWD || process.cwd());
if (!(await stat(cwd)).isDirectory())
  throw new Error("AXIOM_CWD must be a directory");
const factory = await createPiFactory({ cwd, model: process.env.AXIOM_MODEL });
const home = resolve(process.env.AXIOM_HOME || join(homedir(), ".axiom"));
await mkdir(home, { recursive: true });
try {
  await copyFile(join(getAgentDir(), "axiom", "defaults.json"), join(home, "defaults.json"), constants.COPYFILE_EXCL);
} catch (error) {
  if (!["ENOENT", "EEXIST"].includes(error.code)) throw error;
}
const sessions = new Sessions(factory, join(home, "defaults.json"), join(home, "workspaces"));
await sessions.loadDefaults();
await sessions.load();
const app = createServerApp(sessions, {
  supervisorPid: process.ppid,
  stop: process.send ? () => process.send({ type: "service.shutdown" }) : undefined,
  error: process.env.AXIOM_SERVICE_ERROR,
  dev: process.env.AXIOM_DEV === "1",
  sourceDir: fileURLToPath(new URL("..", import.meta.url)),
  // pi 的会话目录：网页「导入 pi 会话」的默认浏览位置。
  importDir: join(getAgentDir(), "sessions"),
  version: JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version,
  restart: process.send ? (mode) => new Promise((resolve, reject) => {
    (async () => {
      let sha;
      if (mode === "update") {
        const status = await checkUpdate();
        if (!status.available) throw new Error("已是最新版本，无需更新");
        sha = status.sha;
        // ponytail: 开发目录（非 npm 全局安装）不自动覆盖工作区代码，由 git 工作流负责更新
        if (!fileURLToPath(new URL("..", import.meta.url)).includes("node_modules"))
          throw new Error(`发现新版本 ${status.remote}（本地 ${status.local}）：开发目录请 git 拉取更新后重建重启`);
      }
      process.send({ type: "service.restart", mode, sha }, (error) => error ? reject(error) : resolve());
    })().catch(reject);
  }) : undefined,
});
app.server.listen(port, "127.0.0.1", () =>
  console.log(`Axiom listening on http://127.0.0.1:${port}; workspace: ${cwd}`),
);
let closing;
function stop() {
  closing ||= app.close().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
process.on("message", (message) => {
  if (message?.type === "service.stop") stop();
});
if (process.send) process.once("disconnect", stop);
