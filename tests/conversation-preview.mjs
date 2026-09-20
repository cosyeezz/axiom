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
  sessionId: "ui-review", title: "会话阅读体验 · UI 验收", cwd: process.cwd(), status: "idle",
  config: { model: "preview/axiom", thinking: "high", levels: ["off", "high"], skills: [] },
  runtime: { model: "preview/axiom", thinking: "high",
    systemPrompt: "你是主代理。安全读取文件并给出清晰答复。",
    tools: [{ name: "read", description: "读取文件内容", parameters: { type: "object", properties: { path: { type: "string" }, limit: { type: "number" } }, required: ["path"] } }],
    usage: { input: 1000, output: 200, cacheRead: 4000, cacheWrite: 0 },
    context: { tokens: 5000, contextWindow: 128000, percent: 3.90625 },
    billing: { records: 2, unpriced: 0, cost: { input: .003, output: .005, cacheRead: .004, cacheWrite: 0, total: .012 }, groups: [{ model: "preview/axiom", tokens: { input: 1000, output: 200, cacheRead: 4000, cacheWrite: 0 }, cost: { input: .003, output: .005, cacheRead: .004, cacheWrite: 0, total: .012 } }] },
  },
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
// 压缩验收：两轮摘要、各自的委托任务，以及仍保留的近期对话。
const compactState = structuredClone(state);
compactState.sessionId = "ui-compaction";
compactState.title = "压缩验收 · 摘要分层与后台进度";
const compactRunStart = Date.now() - 12000;
compactState.compactionStatus = {
  status: "summarizing",
  startedAt: compactRunStart,
  runId: "run-preview-2",
  // 两条 run：一条已失败可回看，一条在途可取消，足以覆盖弹窗里全部分支。
  runs: [
    {
      id: "run-preview-1", status: "failed", startedAt: compactRunStart - 90000, endedAt: compactRunStart - 60000,
      model: "anthropic/claude-haiku", thinking: "off",
      trigger: { tokens: 118000, contextWindow: 200000, tokenThreshold: 100000, percentThreshold: 50, keepRecentTokens: 5000, estimated: true },
      steps: [
        { step: "trigger", text: "触发后台压缩 · 上下文 118,000 / 200,000 tokens（估算）", at: compactRunStart - 90000 },
        { step: "session", text: "摘要会话就绪 · anthropic/claude-haiku · thinking=off", at: compactRunStart - 89000 },
        { step: "failed", text: "后台摘要失败（429 Too Many Requests）；30 秒后可在后续回合重试", at: compactRunStart - 60000 },
      ],
      stream: { chars: 0, preview: "", thinkingChars: 0 },
      usage: null, error: "429 Too Many Requests", result: null,
    },
    {
      id: "run-preview-2", status: "summarizing", startedAt: compactRunStart, endedAt: null,
      model: "anthropic/claude-haiku", thinking: "off",
      trigger: { tokens: 121500, contextWindow: 200000, tokenThreshold: 100000, percentThreshold: 50, keepRecentTokens: 5000, estimated: false },
      steps: [
        { step: "trigger", text: "触发后台压缩 · 上下文 121,500 / 200,000 tokens", at: compactRunStart },
        { step: "plan", text: "已固定快照 · 待摘要 24 条消息，保留近期 6 条", at: compactRunStart + 200 },
        { step: "session", text: "摘要会话就绪 · anthropic/claude-haiku · thinking=off", at: compactRunStart + 900 },
        { step: "request", text: "发出摘要请求 · 约 96,400 字符原文", at: compactRunStart + 1000 },
        { step: "stream_start", text: "模型开始回写摘要", at: compactRunStart + 3400 },
      ],
      stream: { chars: 420, preview: "## Goal\n把压缩过程做成可观察的进程视图。\n\n## Progress\n后端已记录步骤时间线，前端", thinkingChars: 0 },
      usage: { input: 24100, output: 120 }, error: null, result: null,
    },
  ],
};
compactState.tasks = [
  { id: "compact-a", task: "第一阶段：检查约束与路径", status: "completed" },
  { id: "compact-b", task: "第二阶段：验证连续压缩", status: "completed" },
];
compactState.messages = [];
compactState.compactions = [];
for (const [index, task] of compactState.tasks.entries()) {
  const prefix = `compact-${index}`;
  compactState.messages.push(
    { agentId: "main", entryId: `${prefix}-u`, message: { role: "user", content: task.task } },
    { agentId: "main", entryId: `${prefix}-a`, message: assistant([{ type: "toolCall", id: prefix, name: "delegate", arguments: { tasks: [{ task: task.task }] } }]) },
    { agentId: "main", entryId: `${prefix}-r`, message: { role: "toolResult", toolCallId: prefix, toolName: "delegate", content: [{ type: "text", text: JSON.stringify({ taskIds: [task.id] }) }] } },
    { agentId: task.id, message: assistant([{ type: "text", text: `已完成：${task.task}。这里是仍可查看的子代理原始结果。` }]) },
  );
  compactState.compactions.push({ id: prefix, summary: `## 第 ${index + 1} 次摘要\n\n保留用户约束、关键决策与下一步。`, compactedMessageIds: [`${prefix}-u`, `${prefix}-a`, `${prefix}-r`], tokensBefore: 100000, estimatedTokensAfter: 22000 });
}
compactState.messages.push({ agentId: "main", entryId: "compact-recent", message: { role: "user", content: "继续下一阶段，之前的摘要和子代理结果都要能查看。" } });
states.push(compactState);
const childBill = (input, output, cacheRead, total) => {
  const cost = { input, output, cacheRead, cacheWrite: 0, total };
  return { records: 1, unpriced: 0, cost, groups: [{ model: "preview/axiom", tokens: { input: 400, output: 150, cacheRead: 1600, cacheWrite: 0 }, cost }] };
};
const billedTasks = [
  { id: "review", task: "检查移动端布局与阅读体验", status: "completed", runtime: { model: "preview/axiom", billing: childBill(.001, .003, .002, .006) } },
  { id: "audit", task: "核对主代理与子代理费用", status: "completed", runtime: { model: "preview/axiom", billing: childBill(.001, .002, .002, .005) } },
];
const mainBill = state.runtime.billing;
const totalCost = { input: .005, output: .010, cacheRead: .008, cacheWrite: 0, total: .023 };
states.push({ ...state, sessionId: "ui-billing", title: "账单验收 · 主代理与子代理", tasks: billedTasks,
  billing: { records: 4, unpriced: 0, incomplete: false, cost: totalCost,
    groups: [{ model: "preview/axiom", tokens: { input: 1800, output: 500, cacheRead: 7200, cacheWrite: 0 }, cost: totalCost }],
    agents: [{ id: "main", billing: mainBill }, ...billedTasks.map(t => ({ id: t.id, task: t.task, billing: t.runtime.billing }))] } });
if (process.env.PREVIEW_EMPTY === "1") {
  for (const s of states) Object.assign(s, { status: "idle", messages: [], tasks: [], live: {}, tools: {}, config: { ...s.config, canReconfigure: true } });
}
const sessions = {
  createAgent: {
    catalog: () => [{ provider: "preview", id: "axiom", key: "preview/axiom", name: "Axiom Preview", levels: ["off", "high"] }],
    capabilities: async () => ({ skills: [], mcp: [], plugins: [], warnings: [] }),
  },
  workspaceDefaults: async () => sessions.getDefaults(),
  getDefaults: () => ({ model: null, subagentModel: null, thinking: null, subagentThinking: null, compaction: null, retry: null, capabilities: null, subagentCapabilities: "inherit" }),
  getTaskBudget: () => ({ maxTurns: 20, wrapUpWindow: 2 }),
  list: () => states.map((s) => ({ id: s.sessionId, cwd: s.cwd, title: s.title, status: s.status, updatedAt: Date.now(), sessionFile: `preview-${s.sessionId}.jsonl` })),
  get: (id) => states.find((s) => s.sessionId === id) || state,
  ensureLoaded: async (id) => sessions.get(id),
  // 展开摘要卡取回原文：按 compactedMessageIds 回放该段主消息与子代理消息，没有这个桩验收时会报错。
  compactionMessages: async (id, compactionId) => {
    const item = sessions.get(id);
    const record = (item.compactions || []).find((entry) => entry.id === compactionId);
    if (!record) throw new Error("找不到该压缩摘要");
    const hidden = new Set(record.compactedMessageIds || []);
    const picked = [];
    let inside = false;
    for (const entry of item.messages) {
      if ((entry.agentId ?? "main") === "main") inside = !!entry.entryId && hidden.has(entry.entryId);
      if (inside) picked.push(entry);
    }
    return structuredClone({ sessionId: id, compactionId, messages: picked, tools: {}, retries: [] });
  },
  snapshot: (id) => sessions.get(id),
  configure: async (id, selection) => {
    const s = sessions.get(id);
    s.config = { ...s.config, ...selection, capabilitySelection: selection.capabilities ?? s.config.capabilitySelection };
    return s.config;
  },
  // 复制会话预览：新 id + 标题原词接序号（与后端一致），内容原样，方便浏览器验收点击验证。
  duplicate: async (id) => {
    const source = sessions.get(id);
    const copy = structuredClone(source);
    copy.sessionId = `${id}-copy-${++sequence}`;
    const stem = String(source.title).replace(/\s+\d+$/, "").trim();
    let n = 1;
    while (states.some((s) => s.title === `${stem} ${n}`)) n++;
    copy.title = `${stem} ${n}`;
    copy.status = "idle";
    states.push(copy);
    return copy.sessionId;
  },
  subscribe: () => () => {},
};
const app = createServerApp(sessions);
const port = Number(process.env.PREVIEW_PORT || 4321);
app.server.listen(port, "127.0.0.1", () => console.log(`UI preview: http://127.0.0.1:${port} (Ctrl+C to stop)`));
