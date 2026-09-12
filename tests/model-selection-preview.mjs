// Isolated browser fixture: no credentials, user history, or model requests.
import { createServerApp } from "../src/server.js";
import { Sessions } from "../src/sessions.js";
import { createModelsService } from "../src/model-config.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = await mkdtemp(join(tmpdir(), "axiom-model-ui-"));
const catalog = [
  { provider: "minimax-cn", id: "MiniMax-M2.5", name: "MiniMax M2.5" },
  { provider: "openai", id: "gpt-5.4", name: "GPT-5.4" },
  { provider: "anthropic", id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { provider: "openai", id: "gpt-5-mini", name: "GPT-5 mini" },
].map((m) => ({ ...m, key: `${m.provider}/${m.id}`, levels: ["off", "low", "medium", "high"], input: ["text", "image"] }));
const factory = async (_tools, selection = {}) => {
  // SDK consumes runtime callbacks; the fixture must not leak them into serializable config.
  selection = JSON.parse(JSON.stringify(selection));
  let value = { ...selection, model: selection.model || catalog[0].key, thinking: selection.thinking || "medium", levels: catalog[0].levels, skills: [], capabilities: { skills: [], mcp: [], plugins: [] } };
  return {
    config: () => value,
    configure: async (next) => (value = { ...value, ...next }),
    runtime: () => ({ model: value.model, thinking: value.thinking }),
    subscribe: () => () => {}, dispose: async () => {}, abort: async () => {},
    prompt: async () => {}, result: () => "Preview only", queue: () => ({ steering: [], followUp: [] }),
  };
};
factory.cwd = home;
factory.catalog = () => catalog;
factory.capabilities = async () => ({ skills: [], plugins: [], mcp: [], warnings: [], needsTrust: false });
const sessions = new Sessions(factory, join(home, "defaults.json"), join(home, "sessions"));
await sessions.create(home);
await writeFile(join(home, "models.json"), JSON.stringify({ providers: { preview: { api: "openai-completions", baseUrl: "http://localhost:9/v1", apiKey: "preview", models: [] } } }));
const models = createModelsService({ factory, modelsPath: join(home, "models.json"), favoritesPath: join(home, "models-favorites.json"),
  discoverFetch: async () => new Response(JSON.stringify({ data: [{ id: "chosen-model", name: "Chosen model" }, { id: "untouched-model" }] })),
});
const app = createServerApp(sessions, { models });
const port = Number(process.env.PREVIEW_PORT || 4337);
app.server.listen(port, "127.0.0.1", () => console.log(`Model UI preview: http://127.0.0.1:${port}`));
async function close() {
  await app.close();
  await sessions.close();
  await rm(home, { recursive: true, force: true });
}
process.on("SIGINT", () => { void close().then(() => process.exit()); });
process.on("SIGTERM", () => { void close().then(() => process.exit()); });
