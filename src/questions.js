import { z } from "zod";
import { randomUUID } from 'node:crypto';
import { makeTodoApprovalQuestion, todoApprovalAcceptLabel } from './todo-prompts.js';

const text = (max) => z.string().trim().min(1).max(max);
const option = z.object({ label: text(120), description: text(1000).optional() }).strict();
const input = z.object({
  questions: z.array(z.object({
    header: text(30), question: text(500), description: text(3000),
    options: z.array(option).min(1).max(20).refine((items) => new Set(items.map((o) => o.label)).size === items.length, "选项名称不能重复"),
    multiple: z.boolean().optional(),
  }).strict()).min(1).max(10),
}).strict();
export const questionAnswers = z.array(z.array(text(4000)).min(1).max(21)).min(1).max(10);
const string = (description, maxLength) => ({ type: "string", description, minLength: 1, maxLength });

// ponytail: 等待态仅保留在本进程；重启取消，不模拟恢复已消失的工具执行。
export function createQuestions(emit) {
  const pending = new Map();
  const tool = {
    name: "question",
    label: "Question",
    description: "需要用户澄清或决策时使用此工具；互不依赖的问题合并提问，收到答案后继续执行。",
    parameters: {
      type: "object", additionalProperties: false, required: ["questions"],
      properties: {
        questions: {
          type: "array", description: "一起确认的问题，界面自动提供自定义回答。", minItems: 1, maxItems: 10,
          items: {
            type: "object", additionalProperties: false, required: ["header", "question", "description", "options"],
            properties: {
              header: string("选项卡短标题。", 30),
              question: string("直接说明需要用户决定什么。", 500),
              description: string("解释为什么需要确认，以及选择会影响什么。", 3000),
              options: {
                type: "array", description: "可选答案，名称不能重复，无需添加其他选项。", minItems: 1, maxItems: 20,
                items: {
                  type: "object", additionalProperties: false, required: ["label"],
                  properties: {
                    label: string("简短选项名称。", 120),
                    description: string("必要时解释该选项的含义、取舍或影响。", 1000),
                  },
                },
              },
              multiple: { type: "boolean", description: "是否允许多选，默认 false。" },
            },
          },
        },
      },
    },
    async execute(toolCallId, params, signal) {
      const { questions } = input.parse(params);
      signal?.throwIfAborted();
      if (pending.has(toolCallId)) throw new Error("此问题已在等待回答");
      return new Promise((resolve, reject) => {
        const finish = (answers, error) => {
          if (!pending.delete(toolCallId)) return;
          signal?.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve({ content: [{ type: "text", text: JSON.stringify({ answers }) }] });
          emit({ type: "question.closed", agentId: "main", data: { toolCallId } });
        };
        const abort = () => finish(null, new Error("提问已取消"));
        pending.set(toolCallId, { info: { toolCallId, questions }, finish, abort });
        signal?.addEventListener("abort", abort, { once: true });
        emit({ type: "question.asked", agentId: "main", data: { toolCallId, questions } });
      });
    },
  };
  return {
    tool,
    async confirmTodo({ kind, reason, proposal }, signal) {
      const toolCallId = `todo-approval-${randomUUID()}`;
      const questions = [makeTodoApprovalQuestion(kind, reason)];
      const frozen = structuredClone(proposal);
      if (signal?.aborted) return { approved: false, decision: 'cancelled' };
      return new Promise(resolve => {
        const finish = answers => {
          if (!pending.delete(toolCallId)) return;
          signal?.removeEventListener('abort', abort);
          const value = answers?.[0]?.[0];
          resolve({ approved: value === todoApprovalAcceptLabel(kind), decision: !answers ? 'cancelled' : value === todoApprovalAcceptLabel(kind) ? 'approved' : value === questions[0].options[1].label ? 'rejected' : 'feedback', feedback: value ?? '' });
          emit({ type: 'question.closed', agentId: 'main', data: { toolCallId } });
        };
        const abort = () => finish(null);
        const info = { toolCallId, questions, proposal: frozen };
        pending.set(toolCallId, { info, finish, abort });
        signal?.addEventListener('abort', abort, { once: true });
        emit({ type: 'question.asked', agentId: 'main', data: info });
      });
    },
    snapshot: () => [...pending.values()].map(({ info }) => info),
    reply(toolCallId, value) {
      const entry = pending.get(toolCallId);
      if (!entry) throw new Error("问题已回答或已取消，请刷新会话");
      const answers = questionAnswers.parse(value);
      if (answers.length !== entry.info.questions.length) throw new Error("请回答全部问题");
      answers.forEach((answer, i) => {
        if (!entry.info.questions[i].multiple && answer.length !== 1) throw new Error("单选问题只能选择一个答案");
        if (new Set(answer).size !== answer.length) throw new Error("答案不能重复");
      });
      entry.finish(answers);
      return { toolCallId };
    },
    cancel() { for (const entry of [...pending.values()]) entry.abort(); },
  };
}
