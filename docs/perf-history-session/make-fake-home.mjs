// 纯假源长会话夹具：生成一个隔离 AXIOM_HOME，内含 1831 条消息的假会话 JSONL + 一条 sessions 记录。
//
// 目的：给长对话分页/虚拟化改造提供**不含任何用户数据**、可重复生成的固定基线样本。
// 口径对齐 docs/perf-long-conversation（真实样本 1831 消息行：user 18 / assistant 803 /
// toolResult 1010），但正文全部由确定性伪随机生成，逐次运行字节级一致。
//
// 用法：
//   node make-fake-home.mjs --home <目录> [--force]
// 产出目录结构：
//   <home>/axiom.db                      # 用产品自身的 Database/SessionStore 建表并写入会话记录
//   <home>/workspaces/fake/<id>.jsonl    # 假会话历史（Pi SessionManager 格式，version 3）
//   <home>/workspace/                    # 假 cwd（会话工作空间，空目录）
//   <home>/fake-agent/models.json        # 合成供应商定义（本地假模型，无真实供应商）
//   <home>/fake-agent/auth.json          # 合成凭据（dummy key，只用于让页面跳过首次配置引导，绝不发请求）
//
// PI_CODING_AGENT_DIR 指向 <home>/fake-agent：页面启动时会把它当作「用户已配置过模型」
// 导入到库内，否则空目录会停在「尚无可用模型」引导页、根本不 attach 会话（无首屏可测）。
// 假模型只写配置，不连网、不调用模型：采集只读历史渲染路径。
//
// 不读写 ~/.axiom*、不连网、不调用模型。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "../../src/database.js";
import { SessionStore } from "../../src/session-store.js";

export const LONG_ID = "fake1ong00000000000000000000000001";
export const SHORT_ID = "fake5hort0000000000000000000000001";
export const LONG_MESSAGES = 1831;
// 合成供应商/模型：只用于让页面跳过首次配置引导，不发起任何请求（key 是占位串，指向 127.0.0.1:9 丢弃端口）。
export const FAKE_PROVIDER = "fake-local";
export const FAKE_MODEL = "fake-model";
export const DEFAULT_MODEL = `${FAKE_PROVIDER}/${FAKE_MODEL}`;

// mulberry32：确定性伪随机，保证同参数生成的夹具完全相同。
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const WORDS = "渲染 长会话 分页 虚拟化 快照 增量 布局 回滚 索引 事件 队列 序列化 折叠 内存 长任务 帧率 缓存 定界 阈值 分片 补丁 校验 归并 拓扑 中断 恢复 采样 剖析 代理 工作空间 历史 消息 节点 骨架 占位".split(" ");

function makeText(rand, length, { code = false } = {}) {
  const parts = [];
  let n = 0;
  while (n < length) {
    const line = Array.from({ length: 6 + Math.floor(rand() * 10) }, () => WORDS[Math.floor(rand() * WORDS.length)]).join("");
    parts.push(rand() < 0.15 ? `- ${line}` : line);
    n += line.length + 1;
  }
  if (code) {
    const body = Array.from({ length: 8 + Math.floor(rand() * 8) }, (_, i) => `  const value${i} = compute(${i}, ${Math.floor(rand() * 1000)});`);
    parts.push(["```js", ...body, "```"].join("\n"));
  }
  return parts.join("\n");
}

// 消息序列：复刻真实样本的 18 / 803 / 1010 配比。
// 207 条 assistant 带 2 个 toolCall（a%4==0，以及 a=1..21 的奇数），其余 596 条带 1 个，
// 合计 1010 个 toolCall → 1010 条 toolResult。
const TOOL_NAMES = ["bash", "read", "edit", "grep", "write"];
export function planMessages(full = true) {
  const plan = [{ role: "user" }];
  const callsFor = (a) => (a % 4 === 0 || (a % 4 === 1 && a < 24) ? 2 : 1);
  let users = 1;
  for (let a = 0; a < 803; a++) {
    const calls = callsFor(a);
    plan.push({ role: "assistant", calls });
    for (let c = 0; c < calls; c++) plan.push({ role: "toolResult", toolCallId: `c${a}-${c}` });
    // 每 47 条 assistant 后插一条 user：18 条 user 均匀铺开（首条已计入）。
    if (full && a % 47 === 46 && users < 18) { plan.push({ role: "user" }); users++; }
  }
  return plan;
}

export function buildFakeJsonl({ messages = LONG_MESSAGES, seed = 20260916, sessionCwd, sessionId }) {
  const rand = rng(seed);
  const lines = [JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp: "2026-01-01T00:00:00.000Z", cwd: sessionCwd })];
  let previousId = null;
  let index = 0;
  let codeBlocks = 0;
  let assistantOrdinal = -1;
  const plan = planMessages(true).slice(0, messages);
  for (const item of plan) {
    const id = `e${String(++index).padStart(5, "0")}`;
    const entry = { type: "message", id, parentId: previousId, timestamp: "2026-01-01T00:00:00.000Z" };
    if (item.role === "user") {
      entry.message = { role: "user", content: [{ type: "text", text: makeText(rand, 280) }] };
    } else if (item.role === "assistant") {
      assistantOrdinal++;
      const code = codeBlocks < 145; // 真实样本 145 个代码块
      if (code) codeBlocks++;
      const content = [{ type: "thinking", thinking: makeText(rand, 1700) }, { type: "text", text: makeText(rand, 1200, { code }) }];
      for (let c = 0; c < item.calls; c++) content.push({
        type: "toolCall",
        id: `c${assistantOrdinal}-${c}`,
        name: TOOL_NAMES[Math.floor(rand() * TOOL_NAMES.length)],
        arguments: { path: `src/module-${index}-${c}.js`, command: `node tools/check-${index}.mjs` },
      });
      entry.message = { role: "assistant", content };
    } else {
      entry.message = { role: "toolResult", toolCallId: item.toolCallId, toolName: "bash", content: [{ type: "text", text: makeText(rand, 800) }] };
    }
    lines.push(JSON.stringify(entry));
    previousId = id;
  }
  return `${lines.join("\n")}\n`;
}

export function buildFakeHome({ home, force = false }) {
  if (fs.existsSync(home) && fs.readdirSync(home).length) {
    if (!force) throw new Error(`目标目录非空，需 --force 覆盖：${home}`);
    fs.rmSync(home, { recursive: true, force: true });
  }
  const workspace = path.join(home, "workspace");
  const agentDir = path.join(home, "fake-agent");
  const historyDir = path.join(home, "workspaces", "fake");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(historyDir, { recursive: true });

  // 合成 Pi 配置/凭据（形状与 SDK 的 models.json / auth.json 一致，供启动时幂等导入）。
  fs.writeFileSync(path.join(agentDir, "models.json"), `${JSON.stringify({
    providers: {
      [FAKE_PROVIDER]: {
        baseUrl: "http://127.0.0.1:9/v1",
        api: "openai-completions",
        models: [{ id: FAKE_MODEL, name: "Fake Local Model", reasoning: true, input: ["text"], contextWindow: 200000, maxTokens: 8192 }],
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(agentDir, "auth.json"), `${JSON.stringify({ [FAKE_PROVIDER]: { type: "api_key", key: "fake-local-no-network" } }, null, 2)}\n`, { mode: 0o600 });

  const sessions = [
    { id: LONG_ID, title: "假源长会话 · 1831 条", file: path.join(historyDir, `${LONG_ID}.jsonl`), messages: LONG_MESSAGES },
    { id: SHORT_ID, title: "假源短会话 · 20 条", file: path.join(historyDir, `${SHORT_ID}.jsonl`), messages: 20 },
  ];
  for (const session of sessions) {
    fs.writeFileSync(session.file, buildFakeJsonl({ messages: session.messages, sessionCwd: workspace, sessionId: session.id }), { mode: 0o600 });
  }

  const database = new Database(path.join(home, "axiom.db"));
  try {
    const store = new SessionStore(database);
    for (const session of sessions) {
      store.insertSession({
        id: session.id,
        cwd: workspace,
        title: session.title,
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
        sessionFile: session.file,
        selection: { model: DEFAULT_MODEL },
      });
    }
  } finally {
    database.close();
  }
  return { home, workspace, agentDir, sessions };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const home = path.resolve(arg("home", path.join(process.cwd(), "docs", "perf-history-session", "fake-home")));
  const result = buildFakeHome({ home, force: argv.includes("--force") });
  const sizes = result.sessions.map((s) => `${path.basename(s.file)} ${fs.statSync(s.file).size}B`);
  console.log(`fake home ready: ${home}\n  ${sizes.join("\n  ")}`);
}
