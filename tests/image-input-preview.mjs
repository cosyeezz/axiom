// Isolated real HTTP/CSP/WS fixture; no credentials, user data or model requests.
import { createServerApp } from "../src/server.js";
import { Sessions } from "../src/sessions.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const home = await mkdtemp(join(tmpdir(), "axiom-image-ui-"));
const catalog = [{ key: "test/vision", provider: "test", id: "vision", name: "Vision fixture", levels: ["off"], input: ["text", "image"] }];
const factory = async () => ({
  config: () => ({ model: "test/vision", thinking: "off", levels: ["off"], skills: [], capabilities: { skills: [], mcp: [], plugins: [] } }),
  subscribe: () => () => {}, prompt: async () => {}, result: () => "fixture",
  queue: () => ({ steering: [], followUp: [] }), abort: async () => {}, dispose: async () => {},
});
factory.cwd = home;
factory.catalog = () => catalog;
factory.capabilities = async () => ({ skills: [], plugins: [], mcp: [], warnings: [], needsTrust: false });
const sessions = new Sessions(factory, join(home, "defaults.json"), join(home, "sessions"));
await sessions.create(home);
const app = createServerApp(sessions);
// Simulate the Android gateway's stricter policy without browser interception or CSP bypass.
app.server.prependListener("request", (req, res) => {
  if (req.headers["x-fixture-block-worker"] !== "true") return;
  const writeHead = res.writeHead;
  res.writeHead = function (status, headers) {
    if (headers?.["Content-Security-Policy"])
      headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace(/worker-src[^;]*/, "worker-src 'none'");
    return writeHead.call(this, status, headers);
  };
});
app.server.listen(0, "127.0.0.1", () => console.log(`http://127.0.0.1:${app.server.address().port}`));
let closing;
function close() {
  return closing ||= (async () => {
    await app.close(); await sessions.close();
    await rm(home, { recursive: true, force: true });
  })();
}
process.stdin.resume();
process.stdin.once("end", () => void close().then(() => process.exit()));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void close().then(() => process.exit()));
