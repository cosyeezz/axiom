// 目标模式隔离预览：node tests/goal-preview.mjs（无模型、无用户数据、不落盘）。
// 与 conversation-preview.mjs 同一套路：只 mock sessions 层，页面仍是真实 index.html + app.js + goal.js。
// 目标快照不手写，而是用真实 src/goal.js 的状态机按真实顺序跑出来，保证字段形状与后端契约一致。
import { createServerApp } from "../src/server.js";
import { Goal } from "../src/goal.js";

const cwd = process.cwd();
let seq = 0;
const text = (value) => [{ type: "text", text: value }];
const makeState = (sessionId, title) => ({
  sessionId, title, cwd, status: "idle",
  config: { model: "preview/axiom", thinking: "high", levels: ["off", "high"], skills: [] },
  runtime: { model: "preview/axiom", thinking: "high" },
  messages: [], live: {}, tools: {}, tasks: [], goal: undefined,
});
const add = (state, message, agentId = "main") =>
  state.messages.push({ agentId, entryId: `${state.sessionId}-${++seq}`, message });
const result = (state, toolCallId, toolName, value, isError = false) =>
  add(state, { role: "toolResult", toolCallId, toolName, isError, content: text(value) });
const call = (id, name, args) => [{ type: "toolCall", id, name, arguments: args }];
const goalFor = (state) => new Goal({
  sessionId: state.sessionId,
  messageCount: () => state.messages.length,
  emit: ({ goal }) => { state.goal = goal; },
});

const plan = {
  objective: "把导出流程重构为两轮可验收的改造，历史行为完全不变",
  constraints: ["不改公共 API", "不新增运行时依赖", "现有测试保持全绿"],
  acceptance: ["导出结果与旧实现逐字节一致", "构建产物体积不增", "新增代码有覆盖用例"],
  rounds: [
    { title: "梳理调用点与回归基线", objective: "列出全部调用点，并固定可复现的回归基线",
      acceptance: ["调用点清单齐全", "基线快照可复现"] },
    { title: "落地改造与兼容层", objective: "替换实现并保留兼容层，跑通新旧对比",
      acceptance: ["新旧输出一致", "兼容层有测试"] },
    { title: "清理与收尾", objective: "删除临时开关、调试代码和一次性脚本", acceptance: ["无残留开关"] },
  ],
};
const ROUND0 = [
  "本轮小结：调用点共 14 处，其中 3 处通过 re-export 间接引用；回归基线已用只读脚本固定，未改动任何源文件。",
  "",
  "- 调用点全部标记：src/export/*.js（9 处）、src/api/*.js（5 处）",
  "- 基线产物：out/baseline.json（只读，未入库）",
  "- 未做任何实现改动，等确认后再动第一行代码",
  "",
  "<axiom_round_finished>",
].join("\n");

// —— 执行中：计划消息先入列，startRound 以当时的 messageCount 作为轮次起点 ——
const running = makeState("goal-running", "状态验收 · 执行中");
add(running, { role: "user", content: "<skill name=\"codebase-map\" location=\"/skills/codebase-map/SKILL.md\">\n## 代码导航\n\n先定位，再修改。\n</skill>\n\n重构导出流程，历史行为不许变。" });
const runningGoal = goalFor(running);
runningGoal.action("enter", plan.objective);
runningGoal.submitPlan(plan);
add(running, { role: "assistant", content: call("call-plan", "goal_plan", plan) });
result(running, "call-plan", "goal_plan", JSON.stringify({ phase: "ready", rounds: 3, totalRounds: 3 }));
runningGoal.action("confirm"); // 第 1 轮开始，startMessage = 3
add(running, { role: "user", content: "先只做梳理，不要改实现。" });
add(running, { role: "assistant", content: call("call-r0-a", "bash", { command: "rg -n \"from .*export\" src" }) });
result(running, "call-r0-a", "bash", "src/export/index.js:12\nsrc/api/export.js:4\n… 共 14 处引用");
add(running, { role: "assistant", content: call("call-r0-b", "write", { path: `${cwd}/out/baseline.json`, content: "…基线字段" }) });
result(running, "call-r0-b", "write", "Wrote out/baseline.json（只读基线，未入库）");
add(running, { role: "assistant", content: text(ROUND0) });
runningGoal.noteToolResult({ toolCallId: "call-r0-a", toolName: "bash", phase: "end" });
runningGoal.noteToolResult({ toolCallId: "call-r0-b", toolName: "write", phase: "end" });
runningGoal.onReply({ message: { role: "assistant", content: text(ROUND0) }, index: running.messages.length - 1 });
runningGoal.submitEvidence({ criteria: [
  { criterion: "调用点清单齐全", toolCallId: "call-r0-a", tool: "bash", note: "rg 输出 14 处引用" },
  { criterion: "基线快照可复现", toolCallId: "call-r0-b", tool: "write", note: "只读脚本生成的基线" },
] });
const EVIDENCE = "本轮验收已补齐证据。\n<axiom_round_finished>";
add(running, { role: "assistant", content: text(EVIDENCE) });
runningGoal.onReply({ message: { role: "assistant", content: text(EVIDENCE) },
  index: running.messages.length - 1 }); // 第 2 轮开始，startMessage = 10
add(running, { role: "user", content: "继续，落地改造并保留兼容层。" });
add(running, { role: "assistant", content: call("call-r1-a", "edit", { path: `${cwd}/src/export/index.js`, edits: [{ oldText: "legacy()", newText: "compat(legacy)" }] }) });
result(running, "call-r1-a", "edit", "Updated src/export/index.js");
add(running, { role: "assistant", content: text("本轮小结：兼容层已落地，新旧输出对比通过 128/128 组样本。") });

// —— 已暂停：真实失败路径（预算耗尽）留下的暂停原因 ——
const paused = makeState("goal-paused", "状态验收 · 已暂停");
add(paused, { role: "user", content: "把批量导出改成流式，内存占用不要涨。" });
const pausedGoal = goalFor(paused);
pausedGoal.action("enter", "把批量导出改成流式，内存占用不涨，历史行为不变");
pausedGoal.submitPlan({ ...plan, rounds: plan.rounds.slice(0, 2) });
add(paused, { role: "assistant", content: call("call-p", "goal_plan", { rounds: 2 }) });
result(paused, "call-p", "goal_plan", JSON.stringify({ phase: "ready", rounds: 2, totalRounds: 2 }));
pausedGoal.action("confirm");
add(paused, { role: "user", content: "开始吧。" });
add(paused, { role: "assistant", content: call("call-p1", "read", { path: `${cwd}/src/sessions.js` }) });
result(paused, "call-p1", "read", "…（文件内容）");
pausedGoal.noteToolResult({ toolCallId: "call-p1", toolName: "read", phase: "end" });
pausedGoal.fail("已达到本次自动执行的 64 段预算，进度已保存；请检查结果后手动恢复。");

// —— 待确认：计划已提交，等用户确认 ——
const ready = makeState("goal-ready", "状态验收 · 待确认");
add(ready, { role: "user", content: "导出流程要能事后核对，验收标准写清楚。" });
const readyGoal = goalFor(ready);
readyGoal.action("enter", "导出流程可核对：先给出计划，确认后分轮执行");
readyGoal.submitPlan(plan);
add(ready, { role: "assistant", content: call("call-ready", "goal_plan", plan) });
result(ready, "call-ready", "goal_plan", JSON.stringify({ phase: "ready", rounds: 3, totalRounds: 3 }));

// —— 普通会话：不应出现任何目标面板 ——
const chat = makeState("chat-plain", "普通会话 · 无目标");
add(chat, { role: "user", content: "解释一下这个函数做什么。" });
add(chat, { role: "assistant", content: text("它读取会话快照并返回首条可用消息。\n\n```js\nconst first = messages[0];\n```") });

// —— 新会话：空历史，不应出现任何目标面板 ——
const fresh = makeState("chat-new", "新会话");

const states = [chat, fresh, ready, running, paused];
const goals = { "goal-running": runningGoal, "goal-paused": pausedGoal, "goal-ready": readyGoal };
const sessions = {
  createAgent: { catalog: () => [{ provider: "preview", id: "axiom", key: "preview/axiom", name: "Axiom Preview", levels: ["off", "high"] }] },
  list: () => states.map((s) => ({ id: s.sessionId, cwd: s.cwd, title: s.title, status: s.status, updatedAt: Date.now() })),
  get: (id) => states.find((s) => s.sessionId === id) || chat,
  ensureLoaded: async (id) => sessions.get(id),
  snapshot: (id) => sessions.get(id),
  subscribe: () => () => {},
  // 只做 Goal 状态转换与快照回执；真实服务里的 prompt 调度不在预览范围。
  goalAction: async (id, action, value) => {
    const target = goals[id];
    if (!target) throw new Error("预览会话没有目标");
    target.action(action, value);
    return { goal: target.snapshot(), runId: null };
  },
  prompt: async () => ({ runId: "preview-run" }),
};
const app = createServerApp(sessions);

const preferred = Number(process.env.PREVIEW_PORT || 4397);
await new Promise((resolve, reject) => {
  const listen = (port) => {
    app.server.once("error", (error) => {
      if (error.code === "EADDRINUSE" && port < preferred + 10) listen(port + 1);
      else reject(error);
    });
    app.server.listen(port, "127.0.0.1", () => {
      console.log(`Goal UI preview: http://127.0.0.1:${port} (Ctrl+C to stop)`);
      for (const state of states)
        console.log(`${state.sessionId}: ${state.title}${state.goal ? ` [${state.goal.phase}]` : ""} messages=${state.messages.length}`);
      resolve();
    });
  };
  listen(preferred);
});
