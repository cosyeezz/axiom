import { resolve, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { stat } from "node:fs/promises";
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
const sessions = new Sessions(factory, join(getAgentDir(), "axiom", "defaults.json"));
await sessions.loadDefaults();
const app = createServerApp(sessions);
app.server.listen(port, "127.0.0.1", () =>
  console.log(`Axiom listening on http://127.0.0.1:${port}; workspace: ${cwd}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
