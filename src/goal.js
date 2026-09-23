import { z } from "zod";
import { stripMemoryTags } from "../public/memory-tags.js";
import { splitAnswer } from "../public/answer-tags.js";
// 完成标记的解析与剥离前后端共用 public/goal-markers.js：后端在这里判轮次、生成小结，前端 app.js
// 用它做展示剥离（同一份实现，避免两侧正则漂移——第 5 轮 X2 的教训）。
import { ROUND_MARKER, GOAL_MARKER, parseGoalMarkers, stripGoalMarkers } from "../public/goal-markers.js";

export { ROUND_MARKER, GOAL_MARKER, parseGoalMarkers, stripGoalMarkers };

// Goal 模式：在外层封装现有对话，普通会话零影响（无目标时 snapshot/context 为 null）。
// 本文件自成一体，只依赖 Database 暴露的 prepare/exec（src/database.js）；无 DB（测试会话）退化为内存态。
// 不执行任何命令：证据门只引用外层喂进来的真实 toolResult 记录。
//
// —— 主代理接线契约（详见 goal-contract.txt）——
//   const store = createGoalStore(database ?? null);      // 启动一次，共享
//   const goal = new Goal({ sessionId, store, emit, messageCount });
//     emit(event)    ：{ type: "goal", goal }（goal 为 null = 已退出目标模式）
//     messageCount() ：会话消息条数，用于 rounds[].startMessage/endMessage 下标
//   goal.snapshot() / goal.context()
//   goal.planTool() / goal.verificationTool({ evidence: () => array })
//     evidence() 返回「当前轮」真实 toolResult 记录数组（每项含 id/toolName/isError），服务端核验用；
//     普通会话也注册工具，但调用即拒绝（未进入目标模式）。
//   goal.onReply({ message, index })   仅由外层在「最终回复」时调用一次（不要每条 assistant 都调）
//   goal.action(name, text?)           enter|confirm|adjust|pause|resume|restart|exit
//   goal.pauseAtSafePoint({ tasks?, summary? })  无完成标记也能在安全点暂停并挂起动作
//   goal.fail(reason)                  预算/失败：持久暂停并记录原因
//   goal.exit() / goal.whenSettled() / goal.freeze() / goal.remove()
//   parseGoalMarkers(text) / stripGoalMarkers(text)
//
// 完成标记（严格）：独占一行、无闭合标签、无内文，只有
//   <axiom_round_finished>   本轮结束 -> 进入验证（不直接开始下一轮）
//   <axiom_goal_finished>    声明整体完成 -> 进入验证（不直接完成）
// 是否真正完成由服务端证据门（verificationTool + 当前轮真实 toolResult 引用）决定。
//
// 语义边界：
//   pause   —— 安全操作，在安全点（pauseAtSafePoint）落定；重启后持久暂停优先。
//   adjust  —— 修改总体 Goal 后重新规划（phase -> clarifying），历史轮次保留为存档。
//   restart —— 同样进入 clarifying 重新规划，历史轮次保留为存档。
//   exit    —— 退出目标模式，清掉目标记录回到普通会话（历史与产物原样保留）。
//              在飞阶段（running/verifying/pausing/adjusting 或有排队动作）一律拒绝：
//              外层须先 pause 并在安全点落定再 exit，避免打断工具或丢轮次进度。
//   本轮纠正（输入框）不走 goal，由外层当作普通指令处理。
//   segments —— 自动执行段计数，超过 GOAL_MAX_SEGMENTS 直接 fail（外层也可自行计数后调 fail）。

export const GOAL_PHASES = [
  "clarifying", "ready", "running", "pausing", "paused", "adjusting", "verifying", "completed",
];
export const GOAL_ACTIONS = ["enter", "confirm", "adjust", "pause", "resume", "restart", "exit"];
// pending=计划中未开始；running=进行中；done=已完成；skipped=被重启/调整取代（存档保留）。
export const ROUND_STATUSES = ["pending", "running", "done", "skipped"];
// 自动执行段上限：到顶即持久暂停（fail），由主控计数触发。
export const GOAL_MAX_SEGMENTS = 64;

const SUMMARY_MAX = 500;
// 目标工具/提问工具的结果不能作为验收证据（否则模型用自报工具自证）。
const NON_EVIDENCE_TOOLS = new Set(["goal_plan", "goal_evidence", "goal_block", "goal_progress", "question", "delegate", "append", "cancel_task"]);
const ACTIVE_TASKS = new Set(["starting", "running", "wrapping", "stopping", "summarizing"]);

const messageText = (message) =>
  (message?.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("\n");

// 验收标准按「折叠空白 + trim」比对，避免模型抄写时空格差异。
const normCriterion = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
// 展示口径的正文：先去完成标记、取 <axiom_display> 里的正式答复，再去记忆标签，
// 避免块前的过程说明挡住答复首行的 <title>。落库始终存模型原文，这里只用于生成轮次小结。
const bodyText = (text) => stripMemoryTags(splitAnswer(stripGoalMarkers(String(text ?? ""))).answer);
const firstLine = (text) => bodyText(text).split("\n").map((line) => line.trim()).find(Boolean) ?? "";

const normalizeToolResult = (record) => {
  const id = record?.toolCallId ?? record?.id;
  if (id == null || id === "") return null;
  return {
    id: String(id),
    tool: String(record.toolName ?? record.tool ?? record.name ?? ""),
    ok: !(record.isError ?? record.error ?? false),
    at: Number(record.at ?? 0),
  };
};

// —— 持久化：独立 goals 表（session_id 主键 + 单列 JSON） ——

const TABLE = `CREATE TABLE IF NOT EXISTS goals (
  session_id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export function createGoalStore(database = null) {
  return new GoalStore(database);
}

class GoalStore {
  #database;
  #statements = new Map();
  #memory = new Map();

  constructor(database = null) {
    this.#database = database ?? null;
    if (this.#database) this.#database.exec(TABLE);
  }

  #sql(text) {
    let statement = this.#statements.get(text);
    if (!statement) this.#statements.set(text, (statement = this.#database.prepare(text)));
    return statement;
  }

  load(sessionId) {
    if (!this.#database) return this.#memory.get(sessionId) ?? null;
    const row = this.#sql("SELECT goal FROM goals WHERE session_id = ?").get(sessionId);
    if (!row) return null;
    try {
      return JSON.parse(row.goal);
    } catch {
      throw new Error(`goals：会话 ${sessionId} 的目标记录不是合法 JSON，读取中止`);
    }
  }

  save(sessionId, goal) {
    if (!this.#database) {
      this.#memory.set(sessionId, structuredClone(goal));
      return;
    }
    this.#sql(
      "INSERT INTO goals (session_id, goal, updated_at) VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET goal = excluded.goal, updated_at = excluded.updated_at",
    ).run(sessionId, JSON.stringify(goal), Date.now());
  }

  remove(sessionId) {
    if (!this.#database) {
      this.#memory.delete(sessionId);
      return;
    }
    this.#sql("DELETE FROM goals WHERE session_id = ?").run(sessionId);
  }

  // 启动恢复用：全部持久化的目标会话（内存态下为当前进程内的目标）。
  list() {
    if (!this.#database) return [...this.#memory].map(([sessionId, goal]) => ({ sessionId, goal }));
    return this.#sql("SELECT session_id, goal FROM goals ORDER BY rowid").all().map(({ session_id: sessionId, goal }) => {
      try {
        return { sessionId, goal: JSON.parse(goal) };
      } catch {
        console.warn(`goals：会话 ${sessionId} 的目标记录不是合法 JSON，已跳过该行`);
        return null;
      }
    }).filter(Boolean);
  }
}

// —— 工具 schema（Type 风格参考 tools.js；执行层 zod 二次校验） ——

const planText = (max) => z.string().trim().min(1).max(max);
const planRound = z.object({
  title: planText(60),
  objective: planText(2000),
  acceptance: z.array(planText(1000)).max(20).optional(),
}).strict();
const planSchema = z.object({
  objective: planText(4000),
  constraints: z.array(planText(1000)).max(20),
  acceptance: z.array(planText(1000)).min(1).max(20),
  rounds: z.array(planRound).min(1).max(50),
}).strict();

const evidenceItem = z.object({
  criterion: planText(1000),
  toolCallId: planText(200),
  tool: planText(100).optional(),
  note: z.string().trim().max(1000).optional(),
}).strict();
const evidenceSchema = z.object({
  final: z.boolean().optional(),
  criteria: z.array(evidenceItem).min(1).max(50),
}).strict();

const field = (description, maxLength) => ({ type: "string", description, minLength: 1, maxLength });
const list = (description, bounds) => ({ type: "array", description, items: { type: "string", minLength: 1, maxLength: 1000 }, ...bounds });
const result = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const bullets = (items) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "（无）");

// —— 状态机 ——

export class Goal {
  #store;
  #emit;
  #messageCount;
  #toolResults = new Map();
  #state;
  #waiters = [];
  #settling = false;

  constructor({ sessionId, store = null, database = null, emit = () => {}, messageCount = () => 0 } = {}) {
    if (typeof sessionId !== "string" || !sessionId) throw new Error("Goal 需要 sessionId");
    this.sessionId = sessionId;
    this.#store = store ?? createGoalStore(database);
    this.#emit = emit;
    this.#messageCount = messageCount;
    this.#state = this.#store.load(sessionId);
    // 重启归一化：进程内没有在飞的轮次，停机时没到安全点的操作在这里落定（暂停优先）。
    this.#restore();
  }

  get active() {
    return this.#state !== null;
  }

  // 契约 goal 对象（只含约定字段；evidence/claimed 等内部字段不进 snapshot）。
  snapshot() {
    const s = this.#state;
    if (!s) return null;
    return {
      phase: s.phase,
      objective: s.objective,
      constraints: [...s.constraints],
      acceptance: [...s.acceptance],
      rounds: s.rounds.map((round) => ({
        title: round.title,
        objective: round.objective,
        acceptance: [...round.acceptance],
        status: round.status,
        summary: round.summary,
        startMessage: round.startMessage,
        endMessage: round.endMessage,
      })),
      currentRound: s.currentRound,
      progress: s.progress,
      failure: s.failure ? { ...s.failure } : null,
      execution: s.execution ?? null,
      pendingAction: s.pendingAction ? { ...s.pendingAction } : null,
    };
  }

  // 验收证据（内部态的只读投影）与失败原因，供外层展示。
  evidence() {
    const s = this.#state;
    return s ? Object.values(s.evidence).map((entry) => ({ ...entry })) : [];
  }

  failure() {
    return this.#state?.failure ? { ...this.#state.failure } : null;
  }

  // 每次模型请求前注入；无目标/已完成返回 null（普通模式零影响）。
  context() {
    const s = this.#state;
    if (!s || s.phase === "completed") return null;
    const parts = [];
    const round = s.rounds[s.currentRound];
    const total = s.rounds.length;
    switch (s.phase) {
      case "clarifying":
        parts.push("[目标模式 · 澄清] 围绕目标继续澄清关键信息（用 question 工具合并提问）；信息足够后调用 goal_plan 提交计划（目标、约束、验收标准、分轮计划），等用户确认后再执行。此阶段不要开始实施。");
        if (s.objective) parts.push(`用户目标：${s.objective}`);
        if (s.replanning) parts.push("用户已要求重新规划：历史轮次记录保留，新计划会追加在后面。");
        break;
      case "ready":
        parts.push("[目标模式 · 待确认] 计划已提交，等待用户确认。不要提前开始实施。");
        break;
      case "paused":
        parts.push(`[目标模式 · 已暂停] 目标已暂停${s.failure ? `（${s.failure.reason}）` : ""}，不要继续推进，等待用户恢复。`);
        break;
      case "pausing":
        parts.push("[目标模式 · 暂停请求] 用户已请求暂停：把手上的工作收尾（不要开新工作），外层会在安全收尾后停止。");
        break;
      case "adjusting":
        parts.push(`[目标模式 · 调整/重启请求] ${s.pendingAction?.type === "restart" ? "用户要求重启 Goal" : `用户要求调整总体目标：${s.pendingAction?.text || "见最新指令"}`}。先安全收尾手上的工作，外层收尾后会重新规划（历史轮次保留）。`);
        break;
      case "verifying":
        parts.push(this.#verifyingPrompt());
        break;
      default: {
        parts.push(`[目标模式 · 执行中] 第 ${s.currentRound + 1}/${total} 轮`);
        if (round) parts.push(`轮次目标：${round.objective}\n轮次验收：\n${bullets(round.acceptance)}`);
        if (s.objective) parts.push(`整体目标：${s.objective}`);
        if (s.acceptance.length) parts.push(`整体验收：\n${bullets(s.acceptance)}`);
        if (s.constraints.length) parts.push(`约束：\n${bullets(s.constraints)}`);
        parts.push(`本轮结束时，在回复最后单独一行输出 ${ROUND_MARKER}（整行只有这个标记，不要闭合标签、不要内文，且位于代码块外）。缺少该标记会被视为本轮未结束并收到催促。`);
      }
    }
    if (s.nudge && ["running", "pausing", "adjusting"].includes(s.phase))
      parts.push(`上一次回复没有检测到 ${ROUND_MARKER}：若本轮已完成，请在回复最后补上该标记（独占一行）；否则继续推进，结束时再输出该标记。`);
    parts.push(`最新 Goal 状态（目标与验收为已确认基准，进度为可变记录）：\n${JSON.stringify(this.snapshot())}`);
    if (s.failure) parts.push(`暂停原因：${s.failure.reason}`);
    parts.push("执行中定期调用 goal_progress 保存已完成、待办、检查、阻塞、下一步与产物位置；这些记录会随下一轮与压缩后的请求显式带入。完成标记仅是状态信号，不代替验收证据；不得用‘证明没有任何漏洞’等不可判定条件作为验收。缺权限、凭据或必须由用户决定时，调用 goal_block 保存阻塞原因并暂停。");
    return parts.join("\n\n");
  }

  #verifyingPrompt() {
    const s = this.#state;
    const round = s.rounds[s.currentRound];
    const gate = this.#gate();
    const lines = [
      `[目标模式 · 验证] 第 ${s.currentRound + 1} 轮已完成${round?.summary ? `（小结：${round.summary}）` : ""}。`,
      "验证不接受正文自报：必须调用 goal_evidence，为每条验收标准提交证据；证据用 toolCallId 引用本轮真实工具结果（服务端核验）。",
      `本轮待补验收：\n${bullets(gate.roundMissing)}`,
    ];
    if (s.claimed || gate.goalMissing.length) lines.push(`整体待补验收：\n${bullets(gate.goalMissing)}`);
    // 与 #gate() 同一口径：轮次没收尾就不能要求整体标记，否则模型照提示发标记却过不了证据门，白挨催促。
    if (gate.settled)
      lines.push(`证据已齐：在回复最后单独一行输出 ${GOAL_MARKER} 完成整体目标。`);
    else if (gate.roundMissing.length === 0 && s.currentRound < s.rounds.length - 1)
      lines.push(`本轮证据已齐：在回复最后单独一行输出 ${ROUND_MARKER} 进入下一轮${gate.goalMissing.length ? "；整体还差上面缺失的标准" : ""}。`);
    else if (gate.roundMissing.length === 0)
      lines.push(`本轮证据已齐：整体还差上面缺失的标准，补齐后在回复最后单独一行输出 ${GOAL_MARKER} 完成整体目标。`);
    else
      lines.push(`补齐证据后，在回复最后单独一行输出 ${ROUND_MARKER}（进入下一轮）或 ${GOAL_MARKER}（整体完成）。两个标记都必须独立成行、无闭合标签、无内文；goal_evidence 只记录证据，不推进状态。`);
    return lines.join("\n");
  }

  // 模型提交计划（澄清/重新规划阶段）。phase ready；确认（confirm）后才开始执行。
  submitPlan(plan) {
    const s = this.#require("提交计划");
    if (!["clarifying", "ready"].includes(s.phase)) throw new Error("当前阶段不能提交计划");
    const parsed = planSchema.parse(plan);
    const fresh = parsed.rounds.map((round) => ({
      title: round.title,
      objective: round.objective,
      acceptance: [...(round.acceptance ?? [])],
      status: "pending",
      summary: "",
      startMessage: null,
      endMessage: null,
    }));
    s.objective = parsed.objective;
    s.constraints = [...parsed.constraints];
    s.acceptance = [...parsed.acceptance];
    s.claimed = false;
    s.pendingAction = null;
    s.nudge = false;
    if (s.replanning) {
      // 重新规划：历史轮次原样保留，新计划追加在后面。
      s.rounds.push(...fresh);
      s.currentRound = s.rounds.length - fresh.length;
      s.replanning = false;
    } else {
      s.rounds = fresh;
      s.currentRound = 0;
    }
    s.phase = "ready";
    this.#commit();
    return { phase: s.phase, rounds: fresh.length, totalRounds: s.rounds.length };
  }

  planTool() {
    const submit = (plan) => this.submitPlan(plan);
    return {
      name: "goal_plan",
      label: "Goal plan",
      description:
        "目标模式澄清阶段专用：提交实施计划（整体目标、约束、验收标准、分轮计划）。提交后进入等待用户确认，确认前不要开始实施。普通会话未启用目标模式，调用会被拒绝。",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["objective", "constraints", "acceptance", "rounds"],
        properties: {
          objective: field("一句话说清整体目标。", 4000),
          constraints: list("必须遵守的用户约束、禁区与偏好。", { maxItems: 20 }),
          acceptance: list("整体验收标准，可逐条核对。", { minItems: 1, maxItems: 20 }),
          rounds: {
            type: "array",
            description: "分轮计划，每轮是一个可独立验收的小目标。",
            minItems: 1,
            maxItems: 50,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "objective"],
              properties: {
                title: field("轮次短标题。", 60),
                objective: field("本轮要达成的具体结果。", 2000),
                acceptance: list("本轮验收标准，可省略。", { maxItems: 20 }),
              },
            },
          },
        },
      },
      async execute(_id, input) {
        return result(submit(input));
      },
    };
  }

  blockTool() {
    return { name: "goal_block", label: "Goal blocked", description: "仅 Goal：缺权限、凭据、必须决策或持续失败时保存原因并暂停，不标记完成。",
      parameters: { type: "object", additionalProperties: false, required: ["reason"], properties: { reason: { type: "string", minLength: 1, maxLength: 4000 } } },
      execute: async (_id, input) => {
        this.#require("登记阻塞");
        const reason = z.string().trim().min(1).max(4000).parse(input.reason);
        this.fail(reason);
        return result({ paused: true, reason });
      } };
  }

  progressTool() {
    return { name: "goal_progress", label: "Goal progress", description: "Goal 执行中保存进度：已完成、待办、检查、阻塞、下一步与产物位置。定期更新，暂停前必须保存；不修改目标与验收。",
      parameters: { type: "object", additionalProperties: false, required: ["completed", "remaining", "checks", "blockers", "next", "artifacts"], properties: Object.fromEntries(["completed", "remaining", "checks", "blockers", "next", "artifacts"].map((key) => [key, { type: "string", maxLength: 6000 }])) },
      execute: async (_id, input) => {
        const s = this.#require("保存进度");
        const schema = z.object(Object.fromEntries(["completed", "remaining", "checks", "blockers", "next", "artifacts"].map((key) => [key, z.string().max(6000)]))).strict();
        s.execution = { ...schema.parse(input), at: Date.now(), round: s.currentRound };
        this.#commit();
        return result({ saved: true });
      } };
  }

  // 验收工具：evidence() 由外层提供「当前轮」真实 toolResult 记录数组，服务端按 id 核验。
  verificationTool({ evidence } = {}) {
    const provider = typeof evidence === "function" ? evidence : null;
    const submit = (input) => this.submitEvidence(input, provider);
    return {
      name: "goal_evidence",
      label: "Goal evidence",
      description:
        "目标模式验证阶段专用：为每条验收标准提交证据。证据必须用 toolCallId 引用本轮真实工具结果（服务端核验，正文自报无效）。本工具只记录证据并返回证据门状态，不推进轮次也不宣布完成；是否进下一轮/完成由最终回复里的完成标记决定。普通会话未启用目标模式，调用会被拒绝。",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["criteria"],
        properties: {
          final: { type: "boolean", description: "仅表示你认为整体标准已齐（提示性，不推进状态，也不会直接完成）。" },
          criteria: {
            type: "array",
            description: "每条验收标准对应的证据，引用真实工具结果。",
            minItems: 1,
            maxItems: 50,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["criterion", "toolCallId"],
              properties: {
                criterion: field("验收标准原文（需与计划中的文字一致）。", 1000),
                toolCallId: field("提供该证据的真实工具调用 id。", 200),
                tool: field("工具名；填了就必须与服务端记录一致。", 100),
                note: { type: "string", description: "这条证据说明了什么。", maxLength: 1000 },
              },
            },
          },
        },
      },
      async execute(_id, input) {
        return result(submit(input));
      },
    };
  }

  // 模型提交验收证据（验证阶段）。只存证据并返回证据门，不推进任何状态：
  // 进下一轮 / 完成一律由外层的最终回复标记（onReply）决定，保证轮次边界与 checkpoint 不错位。
  submitEvidence(input, evidenceProvider = null) {
    const s = this.#require("提交验收证据");
    if (s.phase !== "verifying") throw new Error("goal_evidence 只在验证阶段可用");
    const parsed = evidenceSchema.parse(input);
    const round = s.rounds[s.currentRound];
    const allowed = new Set([...(round?.acceptance ?? []), ...s.acceptance].map(normCriterion));
    const invalid = [];
    const accepted = [];
    for (const item of parsed.criteria) {
      const record = this.#lookupTool(item.toolCallId, evidenceProvider);
      if (!record) {
        invalid.push({ toolCallId: item.toolCallId, reason: evidenceProvider ? "不在本轮真实工具结果里，不能用正文自报代替" : "服务端没有这条工具结果记录，不能用正文自报代替" });
        continue;
      }
      if (NON_EVIDENCE_TOOLS.has(record.tool)) {
        invalid.push({ toolCallId: item.toolCallId, reason: `工具 ${record.tool} 自身的结果不能作为验收证据` });
        continue;
      }
      if (!record.ok) {
        invalid.push({ toolCallId: item.toolCallId, reason: "该工具调用失败，不能作为验收证据" });
        continue;
      }
      if (item.tool && item.tool !== record.tool) {
        invalid.push({ toolCallId: item.toolCallId, reason: `工具名不符，服务端记录为 ${record.tool || "未知"}` });
        continue;
      }
      const criterion = normCriterion(item.criterion);
      if (!allowed.has(criterion)) {
        invalid.push({ toolCallId: item.toolCallId, reason: "该标准不在本轮或整体验收标准里" });
        continue;
      }
      accepted.push({ criterion, tool: record.tool, toolCallId: record.id, note: item.note ?? "", round: s.currentRound });
    }
    if (invalid.length) return { accepted: false, invalid, stored: 0, missing: this.#gate().roundMissing, message: "证据未通过服务端核验，请修正后重新提交。" };
    for (const entry of accepted) s.evidence[entry.criterion] = entry;
    s.nudge = false;
    this.#commit();

    // 工具只回报证据门状态；模型据此决定在最终回复里发哪个标记。
    const gate = this.#gate();
    const ready = gate.roundMissing.length === 0;
    const completable = gate.complete;
    return {
      accepted: true,
      stored: accepted.length,
      missing: gate.roundMissing,
      missingGoal: gate.goalMissing,
      ready,
      completable,
      claimed: s.claimed,
      message: gate.settled
        ? `证据门已全部通过：在最终回复最后单独一行输出 ${GOAL_MARKER} 完成整体目标。`
        : ready
          ? `本轮证据已齐：在最终回复最后单独一行输出 ${ROUND_MARKER} 进入下一轮。`
          : parsed.final
            ? "仍未达到整体完成条件（缺证据或轮次未收尾），请补齐后再以最终标记收尾。"
            : "证据已记录，请继续补齐缺失的验收标准。",
    };
  }

  // 外层在 tool.state phase=end 时喂真实工具结果（无 evidence provider 时的证据来源）。
  noteToolResult(record = {}) {
    if (record.phase && record.phase !== "end") return;
    const normalized = normalizeToolResult(record);
    if (normalized) this.#toolResults.set(normalized.id, normalized);
  }

  // 用户/主代理操作入口；返回最新 snapshot；非法转换抛错由调用方转为用户提示。
  // adjust/restart 都进入 clarifying 重新规划，历史轮次保留为存档。
  action(name, text) {
    if (!GOAL_ACTIONS.includes(name)) throw new Error(`未知的目标操作：${name}`);
    const value = typeof text === "string" ? text.trim() : "";
    switch (name) {
      case "enter": return this.#enter(value);
      case "confirm": return this.#confirm(value);
      case "adjust": return this.#adjust(value);
      case "pause": return this.#pause();
      case "resume": return this.#resume();
      case "exit": return this.exit();
      default: return this.#restart(value);
    }
  }

  // 仅最终回复调用一次：标记是唯一的状态推进入口。
  //   轮次标记 + 本轮证据已齐 -> 进下一轮；否则 -> verifying（等证据）。
  //   整体标记 + 证据门全过 -> completed；否则 -> verifying。
  //   无标记 -> 只催促，不推进。
  onReply({ message, index } = {}) {
    const s = this.#state;
    if (!s) return null;
    if (!["running", "verifying", "pausing", "adjusting"].includes(s.phase)) return this.snapshot();
    if (message?.role !== "assistant" || s.pendingAction) return this.snapshot();
    // 失败/中断的残文可能带半截标记，不采信、不催促。
    if (["error", "aborted", "length"].includes(message.stopReason)) return this.snapshot();
    const at = Number.isInteger(index) ? index : Math.max(0, this.#messageCount() - 1);
    const text = messageText(message);
    const { roundFinished, goalFinished } = parseGoalMarkers(text);

    if (!roundFinished && !goalFinished) {
      s.nudge = true;
      this.#commit();
      return this.snapshot();
    }
    if (goalFinished) s.claimed = true;
    if (s.rounds[s.currentRound]?.status === "running") this.#closeRound(firstLine(text), at);
    s.nudge = false;
    const gate = this.#gate();
    if (goalFinished && gate.complete) {
      s.phase = "completed";
      s.pendingAction = null;
      s.resumePhase = null;
      this.#settling = true;
      this.#commit();
      return this.snapshot();
    }
    // 无证据（或整体未齐）就停在验证阶段，等下一轮证据门。
    // 是否可进下一轮只看「本轮回复」的整体声明：更早回复里提前发出的整体标记已被证伪，
    // 不能永久堵死轮次推进（整体完成仍受 roundsSettled + 证据门约束，不会因此提前放行）。
    if (roundFinished && !goalFinished && gate.roundMissing.length === 0 && s.currentRound < s.rounds.length - 1) {
      s.claimed = false;
      if (this.#beginNextRound() === false) return this.snapshot();
      this.#commit();
      return this.snapshot();
    }
    s.phase = "verifying";
    this.#commit();
    return this.snapshot();
  }

  // 无完成标记也能暂停：登记暂停并在安全点落定；若已有排队中的 adjust/restart 则保留它，只落定不覆盖。
  pauseAtSafePoint({ tasks, summary } = {}) {
    const s = this.#state;
    if (!s) return null;
    const body = typeof summary === "string" ? bodyText(summary).trim() : "";
    if (body) {
      const round = s.rounds[s.currentRound];
      if (round) round.summary = body.slice(0, SUMMARY_MAX);
    }
    if (!s.pendingAction && !["paused", "pausing"].includes(s.phase)) this.action("pause");
    return this.#settlePending(tasks);
  }

  // 预算/失败：持久暂停并记录原因。
  fail(reason) {
    const s = this.#state;
    if (!s) return null;
    this.#fail(typeof reason === "string" && reason.trim() ? reason.trim() : "目标执行失败");
    return this.snapshot();
  }

  // 外层在实际执行停稳、子任务收尾后调用；无标记也会落定暂停/调整/重启。
  settle({ message, index, tasks } = {}) {
    if (message) this.onReply({ message, index });
    return this.#settlePending(tasks);
  }

  // 暂停/调整落到安全收尾点（pendingAction 清空）后 resolve。
  whenSettled() {
    if (!this.#state?.pendingAction) return Promise.resolve(this.snapshot());
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  // 停机落盘：待处理操作在此落定；暂停优先（pausing -> paused，重启后停在暂停态）。
  freeze() {
    if (!this.#state) return null;
    this.#settlePending(null);
    // 停机后不再有状态转换，未落定的等待者在此收尾，避免调用方死等。
    this.#settle();
    return this.snapshot();
  }

  // 退出目标模式：清掉目标记录回到普通会话，会话历史与产物原样保留。
  // 在飞阶段（running/verifying/pausing/adjusting）或有排队动作时拒绝：先安全暂停落定再退。
  exit() {
    const s = this.#state;
    if (!s) return null;
    if (s.pendingAction || ["running", "verifying", "pausing", "adjusting"].includes(s.phase))
      throw new Error("Goal 仍在执行：请先暂停并在安全点落定后再退出");
    return this.remove();
  }

  // 会话删除时清理目标记录。
  remove() {
    this.#store.remove(this.sessionId);
    this.#state = null;
    this.#settle();
    this.#emit({ type: "goal", goal: null });
    return null;
  }

  // —— 内部：状态转换 ——

  #require(what) {
    if (!this.#state) throw new Error(`普通会话未启用目标模式：${what}需要先进入目标模式（/goal）`);
    return this.#state;
  }

  #enter(text) {
    if (this.#state && this.#state.phase !== "completed") throw new Error("已存在进行中的目标");
    this.#state = {
      phase: "clarifying",
      objective: text,
      constraints: [],
      acceptance: [],
      rounds: [],
      currentRound: 0,
      progress: "",
      pendingAction: null,
      // 内部字段：不进 snapshot。
      evidence: {},
      adjustments: [],
      claimed: false,
      replanning: false,
      segments: 0,
      failure: null,
      resumePhase: null,
      nudge: false,
    };
    this.#commit();
    return this.snapshot();
  }

  supplyObjective(text) {
    const s = this.#require("填写目标");
    if (s.phase !== "clarifying" || s.objective || s.rounds.length) throw new Error("当前不在等待填写目标");
    s.objective = z.string().trim().min(1).max(30000).parse(text);
    this.#commit();
    return this.snapshot();
  }

  #confirm(text) {
    const s = this.#require("确认计划");
    if (s.phase !== "ready") throw new Error("只有已提交计划的目标可以确认");
    if (text) s.objective = text;
    s.pendingAction = null;
    s.resumePhase = null;
    s.failure = null;
    if (!s.rounds.length) throw new Error("计划里没有轮次，请重新提交计划");
    s.currentRound = s.rounds.findIndex((round) => round.status === "pending");
    if (s.currentRound < 0) s.currentRound = s.rounds.length - 1;
    if (this.#startRound() === false) return this.snapshot();
    this.#commit();
    return this.snapshot();
  }

  #adjust(text) {
    const s = this.#require("调整总体目标");
    if (!text) throw new Error("请填写要调整的目标内容");
    if (s.phase === "completed") throw new Error("目标已完成，请重新进入目标模式");
    if (["clarifying", "ready", "paused"].includes(s.phase)) {
      // 没有在飞的轮次：立即改目标并进入重新规划。
      this.#applyAdjust(text);
      this.#commit();
      return this.snapshot();
    }
    // 有在飞轮次：登记为安全操作，由外层在安全点落定后重新规划。
    s.pendingAction = { type: "adjust", text };
    s.phase = "adjusting";
    s.nudge = false;
    this.#commit();
    return this.snapshot();
  }

  #pause() {
    const s = this.#require("暂停目标");
    if (s.phase === "paused" || s.phase === "pausing") return this.snapshot();
    // 已排队的安全动作（adjust/restart）不能被暂停覆盖。
    if (s.pendingAction) return this.snapshot();
    if (s.phase === "completed") throw new Error("目标已完成，不能暂停");
    if (s.phase === "clarifying" || s.phase === "ready") {
      // 没有在飞的轮次，无需等待安全收尾。
      s.resumePhase = s.phase;
      s.phase = "paused";
      s.pendingAction = null;
      this.#commit();
      return this.snapshot();
    }
    s.pendingAction = { type: "pause" };
    s.resumePhase = null; // 落定瞬间按当时轮次状态决定恢复点
    s.phase = "pausing";
    s.nudge = false;
    this.#commit();
    return this.snapshot();
  }

  #resume() {
    const s = this.#require("恢复目标");
    s.failure = null;
    if (!["paused", "pausing"].includes(s.phase)) {
      // 暂停请求期间恢复 = 取消暂停请求。
      if (!s.pendingAction) throw new Error("目标未暂停");
      s.pendingAction = null;
      s.phase = s.rounds[s.currentRound]?.status === "running" ? "running" : "verifying";
      s.resumePhase = null;
      this.#commit();
      return this.snapshot();
    }
    const target = s.resumePhase ?? "running";
    s.pendingAction = null;
    s.resumePhase = null;
    if (target === "clarifying" || target === "ready") {
      s.phase = target;
      s.nudge = false;
    } else if (target === "verifying" && s.rounds[s.currentRound]?.status === "done") {
      s.phase = "verifying";
      s.nudge = false;
    } else if (s.rounds.length) {
      if (s.rounds[s.currentRound]?.status !== "running" && this.#beginNextRound() === false) return this.snapshot();
      s.phase = "running";
      s.nudge = true;
    } else {
      s.phase = s.objective ? "ready" : "clarifying";
      s.nudge = false;
    }
    this.#commit();
    return this.snapshot();
  }

  #restart(text) {
    const s = this.#require("重启 Goal");
    if (!s.rounds.length) throw new Error("还没有可重启的轮次");
    if (["paused", "ready", "clarifying", "completed"].includes(s.phase)) {
      // 没有在飞的轮次：立即进入重新规划（历史轮次保留为存档）。
      this.#applyRestart(text);
      this.#commit();
      return this.snapshot();
    }
    if (!["running", "verifying", "adjusting"].includes(s.phase)) throw new Error("当前阶段不能重启本轮");
    s.pendingAction = { type: "restart", ...(text ? { text } : {}) };
    s.phase = "adjusting";
    s.nudge = false;
    this.#commit();
    return this.snapshot();
  }

  #restore() {
    const s = this.#state;
    if (!s) return;
    // 旧记录兜底：补齐内部字段，避免读到历史版本时崩溃。
    s.evidence ??= {};
    s.adjustments ??= [];
    s.claimed = !!s.claimed;
    s.replanning = !!s.replanning;
    s.segments = Number.isInteger(s.segments) ? s.segments : 0;
    s.failure ??= null;
    s.nudge = !!s.nudge;
    if (s.phase === "pausing") {
      s.resumePhase = this.#resumePhaseNow();
      s.phase = "paused";
      s.pendingAction = null;
      s.nudge = false;
      this.#store.save(this.sessionId, s);
      return;
    }
    if (["running", "verifying"].includes(s.phase) && !s.pendingAction) {
      s.resumePhase = s.phase;
      s.phase = "paused";
      s.failure = { reason: "服务已重启，请恢复后先核对实际产物与已保存进度。", at: Date.now() };
      this.#store.save(this.sessionId, s);
      return;
    }
    if (s.phase !== "adjusting" && !s.pendingAction) return;
    const pending = s.pendingAction;
    s.pendingAction = null;
    if (pending?.type === "adjust") this.#applyAdjust(pending.text);
    else if (pending?.type === "restart") this.#applyRestart(pending.text);
    else s.phase = s.rounds[s.currentRound]?.status === "running" ? "running" : "verifying";
    this.#refreshProgress();
    this.#store.save(this.sessionId, s);
  }

  // 待处理的安全操作在安全收尾点落定；tasks 有在跑子任务时暂停不落定。
  #settlePending(tasks) {
    const s = this.#state;
    if (!s?.pendingAction) return this.snapshot();
    const pending = s.pendingAction;
    if ((tasks ?? []).some((task) => ACTIVE_TASKS.has(task?.status)))
      return this.snapshot();
    s.pendingAction = null;
    s.resumePhase = null;
    if (pending.type === "pause") {
      s.resumePhase = this.#resumePhaseNow();
      s.phase = "paused";
      s.nudge = false;
    } else if (pending.type === "adjust") {
      this.#applyAdjust(pending.text);
    } else if (pending.type === "restart") {
      this.#applyRestart(pending.text);
    }
    this.#settling = true;
    this.#commit();
    return this.snapshot();
  }

  // 修改总体 Goal 后重新规划：历史轮次保留为存档，phase 回 clarifying。
  #applyAdjust(text) {
    const s = this.#state;
    if (s.rounds[s.currentRound]?.status === "running") this.#skipCurrentRound();
    s.adjustments.push({ kind: "adjust", text, at: Date.now() });
    s.objective = s.objective ? `${s.objective}\n调整：${text}` : text;
    s.replanning = true;
    s.claimed = false;
    s.failure = null;
    s.phase = "clarifying";
    s.nudge = false;
  }

  // 重启：同样进入 clarifying 重新规划，历史轮次保留为存档。
  #applyRestart(text) {
    const s = this.#state;
    if (s.rounds[s.currentRound]?.status === "running") this.#skipCurrentRound();
    s.adjustments.push({ kind: "restart", text: text ?? "", at: Date.now() });
    s.replanning = true;
    s.claimed = false;
    s.failure = null;
    s.phase = "clarifying";
    s.nudge = false;
  }

  #skipCurrentRound() {
    const s = this.#state;
    const round = s.rounds[s.currentRound];
    if (!round || round.status !== "running") return;
    round.status = "skipped";
    round.endMessage = Math.max(0, this.#messageCount() - 1);
  }

  // 开始一轮；返回 false 表示触发段数上限并已 fail。
  #startRound(index) {
    const s = this.#require("开始轮次");
    s.segments += 1;
    if (s.segments > GOAL_MAX_SEGMENTS) {
      this.#fail(`自动执行段数达到上限 ${GOAL_MAX_SEGMENTS}`);
      return false;
    }
    let round = s.rounds[s.currentRound];
    if (!round) {
      round = { title: `第 ${s.currentRound + 1} 轮`, objective: s.objective || "完成既定目标", acceptance: [...s.acceptance], status: "pending", summary: "", startMessage: null, endMessage: null };
      s.rounds[s.currentRound] = round;
    }
    round.status = "running";
    round.summary = "";
    round.startMessage = Number.isInteger(index) ? index : this.#messageCount();
    round.endMessage = null;
    s.phase = "running";
    s.nudge = false;
    return true;
  }

  #beginNextRound(index) {
    this.#state.currentRound += 1;
    return this.#startRound(index);
  }

  #closeRound(summary, index) {
    const round = this.#state.rounds[this.#state.currentRound];
    if (!round || round.status !== "running") return false;
    round.status = "done";
    round.summary = String(summary ?? "").slice(0, SUMMARY_MAX);
    round.endMessage = Number.isInteger(index) ? index : Math.max(0, this.#messageCount() - 1);
    return true;
  }

  #fail(reason) {
    const s = this.#state;
    s.failure = { reason, at: Date.now() };
    s.resumePhase = this.#resumePhaseNow();
    s.phase = "paused";
    s.pendingAction = null;
    s.nudge = false;
    this.#settling = true;
    this.#commit();
  }

  // 服务端证据门：正文自报不算，必须命中真实工具结果。
  #gate() {
    const s = this.#state;
    const round = s.rounds[s.currentRound];
    const roundRequired = round?.acceptance?.length ? round.acceptance : s.acceptance;
    // 证据必须是「本轮的」：#lookupTool 只认本轮真实工具结果，陈旧轮次的证据同样不算整体已齐，
    // 否则第 1 轮交过的整体证据能永久满足整体验收，后面几轮改了代码也不用复验。
    const stale = (criteria) => criteria.filter((criterion) => s.evidence[normCriterion(criterion)]?.round !== s.currentRound);
    const roundMissing = stale(roundRequired);
    const goalMissing = stale(s.acceptance);
    const roundsSettled = s.rounds.length > 0 && s.rounds.every((item) => item.status === "done" || item.status === "skipped");
    // settled = 证据门本身已满足（与 claimed 无关）；complete 还要模型在最终回复里发出整体标记。
    const settled = roundsSettled && roundMissing.length === 0 && goalMissing.length === 0;
    return { roundMissing, goalMissing, roundsSettled, settled, complete: s.claimed && settled };
  }

  #lookupTool(toolCallId, evidenceProvider) {
    const id = String(toolCallId ?? "");
    if (!id) return null;
    // 有 provider（外层给的「当前轮」真实结果）时只认它，避免引用历史轮次。
    if (evidenceProvider) {
      for (const record of evidenceProvider() ?? []) {
        const normalized = normalizeToolResult(record);
        if (normalized?.id === id) return normalized;
      }
      return null;
    }
    return this.#toolResults.get(id) ?? null;
  }

  #resumePhaseNow() {
    const s = this.#state;
    const round = s.rounds[s.currentRound];
    if (round?.status === "running") return "running";
    if (s.rounds.some((item) => item.status === "done")) return "verifying";
    return s.rounds.length ? "running" : (s.objective ? "ready" : "clarifying");
  }

  #settle() {
    const waiters = this.#waiters;
    this.#waiters = [];
    const snapshot = this.snapshot();
    for (const resolve of waiters) resolve(snapshot);
  }

  #refreshProgress() {
    const s = this.#state;
    if (!s) return;
    const done = s.rounds.filter((round) => round.status === "done").length;
    s.progress = s.rounds.length
      ? `${done}/${s.rounds.length} 轮${s.phase === "completed" ? "（已完成）" : s.failure ? `（已暂停：${s.failure.reason}）` : ""}`
      : s.objective ? "已澄清，等待计划" : "澄清中";
  }

  #commit() {
    this.#refreshProgress();
    this.#store.save(this.sessionId, this.#state);
    this.#emit({ type: "goal", goal: this.snapshot() });
    // 安全收尾落定后再唤醒等待者，保证它们看到的是已提交状态。
    if (this.#settling) {
      this.#settling = false;
      this.#settle();
    }
  }
}
