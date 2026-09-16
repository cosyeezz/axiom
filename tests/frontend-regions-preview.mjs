// 隔离假数据预览：node tests/frontend-regions-preview.mjs（无凭据、无用户数据、不发真实模型请求）。
// 前端分区浏览器验收（tests/frontend-regions-ui.py）专用：
//   - 内置目录 24 个 openai 模型，菜单足够高，能真实滚动到中间；
//   - 保留真实 models.hidden.set / models.favorites.set 语义，验收脚本用真实 WS 协议触发
//     「目录真变化」「收藏真变化」，而不是靠改 DOM 或注入全局对象。
// 页面仍是真实 index.html + app.js + model-picker.js。
import { createServerApp } from "../src/server.js";
import { Sessions } from "../src/sessions.js";
import { createModelsService } from "../src/model-config.js";
import { mkdtemp, rm } from "node:fs/promises";
import { Database } from "../src/database.js";
import { createPiModelStorage } from "../src/pi-model-storage.js";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = await mkdtemp(join(tmpdir(), "axiom-regions-ui-"));
const catalog = [];
for (let i = 0; i < 24; i++) {
  const id = `gpt-5.${i}`;
  catalog.push({ provider: "openai", id, key: `openai/${id}`, name: `GPT-5.${i}`,
    levels: ["off", "low", "medium", "high"], input: ["text", "image"] });
}
catalog.push({ provider: "anthropic", id: "claude-sonnet-4-6", key: "anthropic/claude-sonnet-4-6",
  name: "Claude Sonnet 4.6", levels: ["off", "high"], input: ["text"] });

const factory = async (_tools, selection = {}) => {
  // SDK 回调不可序列化，预览侧统一深拷贝，避免泄漏进 config。
  selection = JSON.parse(JSON.stringify(selection));
  let value = { ...selection, model: selection.model || catalog[0].key, thinking: selection.thinking || "medium",
    levels: catalog[0].levels, skills: [], capabilities: { skills: [], mcp: [], plugins: [] } };
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
const database = new Database(join(home, "models-test.db"));
const storage = createPiModelStorage({ database, home, piDir: join(home, "pi") });
storage.writeConfig({ providers: { preview: { api: "openai-completions", baseUrl: "http://localhost:9/v1", apiKey: "preview", models: [] } } });
const models = createModelsService({ factory, storage, discoverFetch: async () => new Response("{}") });
// 预置一条收藏：验证「收藏置顶」与「无变化同步不重建」都有真实数据可对照。
await models.setFavorite({ kind: "model", key: "openai/gpt-5.4", favorite: true });

const app = createServerApp(sessions, { models });
const port = Number(process.env.PREVIEW_PORT || 4347);
app.server.listen(port, "127.0.0.1", () => console.log(`前端分区预览: http://127.0.0.1:${port}`));

async function close() {
  await app.close();
  await sessions.close();
  database.close();
  await rm(home, { recursive: true, force: true });
}
process.on("SIGINT", () => { void close().then(() => process.exit()); });
process.on("SIGTERM", () => { void close().then(() => process.exit()); });
