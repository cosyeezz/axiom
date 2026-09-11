// Manual visual check: node tests/conversation-preview.mjs (no model, no user data).
import { createServerApp } from "../src/server.js";

const markdown = `## 会话展示，回到内容本身

**重点结论更清晰**，普通正文保持柔和，*补充说明用轻微冷色区分*。路径与参数使用 \`public/app.js\`，不用重复的图标抢走注意力。

- 工具记录：动作、对象、状态各自对齐
- 思考过程：只保留一条入口，展开后支持 **Markdown**
- 长内容：随会话阅读，宽表格和代码仅横向滚动

> 执行过程可以收起，重要结论应当一眼能找到。

| 内容 | 展示方式 | 状态 |
| --- | --- | --- |
| 思考 | 单行入口 · 按需展开 | 已调整 |
| 工具 | 语义图标 · 路径摘要 | 已调整 |
| 正文 | 标题、**重点**、*说明*、\`代码\` | 已调整 |

\`\`\`js
const message = { role: "assistant", content: "清晰比装饰更重要" };
console.log(message.content);
\`\`\`

[查看设计依据](https://linear.app) · ~~重复状态~~ 不再占据两行。`;
const thinking = `### 先看信息层级

当前问题是 **相同状态出现两次**，而不是图标数量不够。*保留动作身份，弱化重复状态。*

1. 用 \`thinking...\` 标记进行中的思考，完成后保留 \`thinking\`。
2. 工具名称使用 12px 常规字重，配 16px 线条图标。

> 思考与正文使用同一安全 Markdown 渲染器。

\`\`\`text
内容 → 层级 → 留白 → 状态
\`\`\``;
const state = {
  sessionId: "ui-review", title: "会话阅读体验 · UI 验收", cwd: "F:/worktrees/MyWorkbench-conversation-ui/axiom", status: "idle",
  config: { model: "preview/axiom", thinking: "high", levels: ["off", "high"], skills: [] },
  runtime: { model: "preview/axiom", thinking: "high" },
  messages: [], live: {}, tools: {},
  tasks: [{ id: "review", task: "检查移动端布局、长路径与思考内容的阅读体验", status: "completed" }],
};
let sequence = 0;
const add = (message, agentId = "main") => state.messages.push({ message, agentId, entryId: `preview-${++sequence}` });
const assistant = (content) => ({ role: "assistant", content, provider: "preview", model: "axiom", usage: { input: 4200, output: 860 } });
add({ role: "user", content: '<skill name="codebase-map" location="/skills/codebase-map/SKILL.md">\n## 代码导航\n\n先定位，再修改；按需读取，不展开无关内容。\n</skill>\n\n把会话做得清晰、易读。工具行紧凑，模块清晰分隔，不要挤在一起。' });
add(assistant([{ type: "thinking", thinking }]));
for (const [name, args, isError, output] of [
  ["read", { path: `${state.cwd}/public/app.js`, offset: 289, limit: 80 }, false, "const tools = new Map();\n// 读取文件内容"],
  ["bash", { command: "npm test" }, false, "示例输出：Tests passed（静态预览，不代表真实执行）"],
  ["web_search", { queries: ["Linear typography", "Accessible disclosure patterns"] }, false, "Design references found."],
  ["edit", { path: "public/style.css", edits: [{ oldText: "font-size: 16px;", newText: "font-size: 14px;" }] }, false, "Updated public/style.css"],
  ["bash", { command: "npm run lint" }, true, 'Missing script: "lint". Run npm test instead.'],
  ["powershell", { command: "Get-Date" }, false, "2026-09-10（静态预览）"],
]) {
  const id = `tool-${sequence}`;
  add(assistant([{ type: "toolCall", id, name, arguments: args }]));
  add({ role: "toolResult", toolCallId: id, toolName: name, isError, content: [{ type: "text", text: output }] });
}
add(assistant([{ type: "text", text: markdown }]));
add(assistant([{ type: "thinking", thinking }, { type: "text", text: markdown }]), "review");
const states = [state,
  { ...state, sessionId: "ui-agents", title: "状态验收 · 子代理运行中", status: "running", messages: state.messages,
    tasks: [{ id: "review", task: "检查会话配色、思考 Markdown 和移动端长路径的阅读体验", status: "running" }, { id: "queued", task: "复核动态状态与减少动态效果设置", status: "starting" }],
    live: { main: assistant([{ type: "thinking", thinking }]), review: assistant([{ type: "thinking", thinking }]) },
  },
  { ...state, sessionId: "ui-thinking", title: "状态验收 · 思考中", status: "running", messages: state.messages.slice(0, 1), tasks: [], live: { main: assistant([{ type: "thinking", thinking }]) } },
  { ...state, sessionId: "ui-waiting", title: "状态验收 · 连接中", status: "running", messages: state.messages.slice(0, 1), tasks: [] },
  { ...state, sessionId: "ui-tools", title: "状态验收 · 执行中", status: "running", messages: state.messages.slice(0, 1), tasks: [], tools: {
    live: { agentId: "main", phase: "start", toolCallId: "long", toolName: "read", args: { path: `${state.cwd}/a-very-long-directory-name/another-directory/一个很长的目录名称/这是为了验证省略和窄屏布局的文件名称.test.js` } },
  } },
];
const longState = structuredClone(state);
longState.sessionId = "ui-long";
longState.title = "阅读验收 · 长内容与随手收起";
longState.tasks[0].runtime = { systemPrompt: "系统提示词：只读检查，不执行更改。\n".repeat(150) };
for (const { message } of longState.messages) {
  for (const block of Array.isArray(message.content) ? message.content : []) {
    if (block.type === "thinking") block.thinking = (thinking + "\n\n").repeat(40);
    if (block.type === "text" && message.role === "toolResult") block.text = (block.text + "\n").repeat(150);
    if (block.type === "toolCall" && block.name === "edit") {
      block.arguments.edits[0].oldText = "font-size: 16px;\n".repeat(150);
      block.arguments.edits[0].newText = "font-size: 14px;\n".repeat(150);
    }
  }
}
states.push(longState);
const sessions = {
  createAgent: { catalog: () => [{ provider: "preview", id: "axiom", key: "preview/axiom", name: "Axiom Preview", levels: ["off", "high"] }] },
  list: () => states.map((s) => ({ id: s.sessionId, cwd: s.cwd, title: s.title, status: s.status, updatedAt: Date.now() })),
  get: (id) => states.find((s) => s.sessionId === id) || state,
  snapshot: (id) => sessions.get(id),
  subscribe: () => () => {},
};
const app = createServerApp(sessions);
app.server.listen(4321, "127.0.0.1", () => console.log("UI preview: http://127.0.0.1:4321 (Ctrl+C to stop)"));
