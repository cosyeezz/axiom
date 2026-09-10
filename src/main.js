import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { stat, mkdir, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createPiFactory } from "./pi.js";
import { Sessions } from "./sessions.js";
import { createServerApp } from "./server.js";

const port = Number(process.env.AXIOM_PORT || 4319);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid AXIOM_PORT");
const cwd = resolve(process.env.AXIOM_CWD || process.cwd());
if (!(await stat(cwd)).isDirectory())
  throw new Error("AXIOM_CWD must be a directory");
const factory = await createPiFactory({ cwd, model: process.env.AXIOM_MODEL });
const home = join(homedir(), ".axiom");
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
  error: process.env.AXIOM_SERVICE_ERROR,
  restart: process.send ? (mode) => new Promise((resolve, reject) => {
    process.send({ type: "service.restart", mode }, (error) => error ? reject(error) : resolve());
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
