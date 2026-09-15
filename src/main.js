import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { stat, mkdir, copyFile } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import { createPiFactory } from "./pi.js";
import { Database } from "./database.js";
import { createPiModelStorage } from "./pi-model-storage.js";
import { Sessions } from "./sessions.js";
import { createModelsService } from "./model-config.js";
import { createServerApp } from "./server.js";
import { createRemoteAccess, createTailscale } from "./remote.js";
import { checkUpdate, validateCommit } from "./update.js";
import { randomUUID } from "node:crypto";

const port = Number(process.env.AXIOM_PORT || 4319);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid AXIOM_PORT");
const cwd = resolve(process.env.AXIOM_CWD || process.cwd());
if (!(await stat(cwd)).isDirectory())
  throw new Error("AXIOM_CWD must be a directory");
// home 解析必须早于 factory：模型配置/凭据的 SQLite 权威存储要先完成首次幂等导入、
// 重建派生兼容文件，SDK 首次读模型目录（factory 内 ModelRuntime.create）时数据已就绪。
const home = resolve(process.env.AXIOM_HOME || join(homedir(), ".axiom"));
await mkdir(home, { recursive: true });
try {
  await copyFile(join(getAgentDir(), "axiom", "defaults.json"), join(home, "defaults.json"), constants.COPYFILE_EXCL);
} catch (error) {
  if (!["ENOENT", "EEXIST"].includes(error.code)) throw error;
}
// 共享 SQLite 单例：会话/预设/默认配置、模型配置与凭据、远程访问配置共用一个库；
// 关闭时机在 app.close 完全之后（stop 内），保证退出前的最后一次保存不会撞上已关闭的库。
const database = new Database(join(home, "axiom.db"));
const modelStorage = createPiModelStorage({ database, home });
await modelStorage.init();
const factory = await createPiFactory({
  cwd,
  model: process.env.AXIOM_MODEL,
  modelRuntimeOptions: modelStorage.runtimeOptions(),
});
const sessions = new Sessions(factory, join(home, "defaults.json"), join(home, "workspaces"), database);
// 模型配置服务：权威在 modelStorage（SQLite），此处只提供协议语义。
const models = createModelsService({ factory, storage: modelStorage });
await sessions.loadDefaults();
await sessions.load();
const service = {
  supervisorPid: process.ppid,
  instanceId: process.env.AXIOM_INSTANCE_ID,
  stop: process.send ? () => process.send({ type: "service.shutdown" }) : undefined,
  error: process.env.AXIOM_SERVICE_ERROR,
  dev: process.env.AXIOM_DEV === "1",
  maintenance: process.env.AXIOM_MAINTENANCE_URL && process.env.AXIOM_MAINTENANCE_TOKEN
    ? { url: process.env.AXIOM_MAINTENANCE_URL, token: process.env.AXIOM_MAINTENANCE_TOKEN } : undefined,
  checkUpdate,
  // pi 的会话目录：网页「导入 pi 会话」的默认浏览位置。
  importDir: join(getAgentDir(), "sessions"),
  models,
  version: JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version,
  restart: process.send ? (mode, sha) => new Promise((resolve, reject) => {
    if (mode === "update") {
      if (process.env.AXIOM_DEV === "1") return reject(new Error("开发环境不执行安装版更新"));
      try { sha = validateCommit(sha); } catch (error) { reject(error); return; }
    }
    const requestId = randomUUID();
    const finish = () => { clearTimeout(timer); process.off("message", onMessage); };
    const onMessage = (message) => {
      if (message?.requestId !== requestId) return;
      if (message.type === "service.accepted") { finish(); resolve({ operationId: message.operationId }); }
      if (message.type === "service.rejected") { finish(); reject(new Error(message.error)); }
    };
    // 回执超时不等于拒绝：保留维护锁，由守护进程状态给出最终结论。
    const timer = setTimeout(() => { finish(); resolve({ unconfirmed: true }); }, 5000);
    process.on("message", onMessage);
    process.send({ type: "service.restart", mode, sha, requestId }, (error) => {
      if (error) { finish(); reject(error); }
    });
  }) : undefined,
};
const app = createServerApp(sessions, service);
// 远程访问初始化必须等端口绑定（remote 要读 app.server.address().port），所以只能放在 listen 回调里；
// 但它首次运行会往库里写 remote/config，必须让 stop() 能等到它落定再关库，
// 否则启动即收 SIGTERM 时这笔写入会撞上已关闭的库，并被 .catch 吞掉（service.remoteShutdown
// 也可能尚未赋值，app.close 里的可选调用被跳过）。
let remoteReady = Promise.resolve();
app.server.listen(port, "127.0.0.1", () => {
  console.log(`Axiom listening on http://127.0.0.1:${port}; workspace: ${cwd}`);
  process.send?.({ type: "service.ready", instanceId: process.env.AXIOM_INSTANCE_ID, version: service.version });
  // 已进入关闭流程就不再开远程访问：否则这笔初始化会排在关库之后。
  if (closing) return;
  remoteReady = initRemote().catch((error) => console.error("远程访问初始化失败：", error));
});
async function initRemote() {
  const remote = await createRemoteAccess({ home, app, database, tailscale: createTailscale() });
  service.remoteStatus = remote.status;
  service.remoteConfigure = remote.configure;
  service.remoteLogin = remote.login;
  service.remoteShutdown = remote.shutdown;
  const status = await remote.status();
  if (status.enabled && !status.active)
    console.error(`Tailscale 远程访问未启动：${status.error || "原因未知"}`);
}
let closing;
function stop() {
  closing ||= remoteReady
    // 远程初始化的首次配置写入必须先落定，否则它会写到已关闭的库上（异常还会被吞）。
    .then(() => app.close())
    // 关库必须排在 app.close 完全之后：会话/任务的最后一笔保存发生在关闭路径内。
    .then(() => database.close())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
process.on("message", (message) => {
  if (message?.type === "service.stop") stop();
  if (message?.type === "service.resume" && !closing) app.resume();
});
if (process.send) process.once("disconnect", stop);
