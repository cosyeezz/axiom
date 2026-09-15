// Isolated browser preview: no model calls or user history.
import { createServerApp } from "../src/server.js";
const state = {
  sessionId: "memory-preview", cwd: process.cwd(), title: "摘要机制", status: "idle", seq: 1,
  config: { model: "preview/model", thinking: "off", levels: ["off"], skills: [] },
  runtime: { model: "preview/model", thinking: "off" },
  messages: [
    { agentId: "main", message: { role: "user", content: "给会话起个标题，保留 <summary> 示例文字。" } },
    { agentId: "main", message: { role: "assistant", content: [{ type: "text", text: "已命名会话。<summary>隐藏的旧摘要</summary><title>摘要机制</title>" }] } },
  ], tasks: [], live: {}, tools: {},
};
const sessions = {
  createAgent: { cwd: process.cwd(), catalog: () => [{ key: "preview/model", provider: "preview", id: "model", name: "Preview", levels: ["off"] }] },
  list: () => [{ id: state.sessionId, title: state.title, cwd: state.cwd, status: "idle", updatedAt: Date.now() }],
  snapshot: () => structuredClone(state), subscribe: () => () => {},
  get: () => state, getDefaults: () => ({}), workspaceDefaults: async () => ({}), listDefaults: () => ({ workspaces: [] }),
  refreshSkills: async () => [], close: async () => {},
};
const app = createServerApp(sessions);
app.server.listen(Number(process.env.PREVIEW_PORT || 4337), "127.0.0.1", () => console.log(`memory-preview http://127.0.0.1:${app.server.address().port}`));
process.on("SIGTERM", async () => { await app.close(); process.exit(0); });
