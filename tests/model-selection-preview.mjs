// Isolated browser fixture: no credentials, user history, or model requests.
import { createServerApp } from "../src/server.js";
import { Sessions } from "../src/sessions.js";
import { createModelsService } from "../src/model-config.js";
import { mkdtemp, rm } from "node:fs/promises";
import { Database } from "../src/database.js";
import { createPiModelStorage } from "../src/pi-model-storage.js";
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
// Opt-in auth fixture exercises the real WS bridge, never a provider login or network model call.
if (process.env.PREVIEW_MODEL_AUTH === "1") {
  const configured = new Set();
  factory.authProviders = () => [
    { id: "openai-codex", name: "OpenAI Codex", methods: [{ type: "oauth", name: "ChatGPT" }] },
    { id: "openai", name: "OpenAI", methods: [{ type: "api_key", name: "API Key" }] },
    { id: "environment-only", name: "Environment only", methods: [] },
  ].map((p) => ({ ...p, configured: configured.has(p.id) }));
  factory.login = async (id, type, interaction) => {
    if (type === "oauth") {
      await interaction.prompt({ type: "select", message: "登录方式", options: [
        { id: "browser", label: "Browser" }, { id: "device", label: "Device code" },
      ] });
      interaction.notify({ type: "device_code", verificationUri: "https://example.invalid/device", userCode: "TEST-CODE" });
      await interaction.prompt({ type: "text", message: "测试夹具：输入 ok 完成（不联网）" });
    } else await interaction.prompt({ type: "secret", message: "API Key（仅测试夹具）" });
    configured.add(id);
  };
  factory.logout = async (id) => { configured.delete(id); };
  factory.refreshModels = async () => catalog;
}
factory.capabilities = async () => ({ skills: [], plugins: [], mcp: [], warnings: [], needsTrust: false });
const sessions = new Sessions(factory, join(home, "defaults.json"), join(home, "sessions"));
await sessions.create(home);
const database = new Database(join(home, "models-test.db"));
const storage = createPiModelStorage({ database, home, piDir: join(home, "pi") });
storage.writeConfig({ providers: { preview: { api: "openai-completions", baseUrl: "http://localhost:9/v1", apiKey: "preview", models: [] } } });
const models = createModelsService({ factory, storage,
  discoverFetch: async () => new Response(JSON.stringify({ data: [{ id: "chosen-model", name: "Chosen model" }, { id: "untouched-model" }] })),
});
const app = createServerApp(sessions, { models });
const port = Number(process.env.PREVIEW_PORT || 4337);
app.server.listen(port, "127.0.0.1", () => console.log(`Model UI preview: http://127.0.0.1:${port}`));
async function close() {
  await app.close();
  await sessions.close();
  database.close();
  await rm(home, { recursive: true, force: true });
}
process.on("SIGINT", () => { void close().then(() => process.exit()); });
process.on("SIGTERM", () => { void close().then(() => process.exit()); });
