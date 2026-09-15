import { z } from "zod";

const delegateInput = z
  .object({
    context: z.string().trim().min(1),
    tasks: z
      .array(z.object({ task: z.string().trim().min(1) }).strict())
      .min(1),
  })
  .strict();
const readInput = z
  .object({ taskId: z.string().trim().min(1), resultId: z.string().uuid() })
  .strict();
const appendInput = z
  .object({
    taskId: z.string().trim().min(1),
    text: z.string().trim().min(1),
    mode: z.enum(["steer", "followUp"]).default("steer"),
  })
  .strict();
const result = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});
const cancelInput = z
  .object({ taskId: z.string().trim().min(1) })
  .strict();

export function delegationTools(tasks) {
  return [
    {
      name: "delegate",
      label: "Delegate",
      description:
        "Start independent subagent tasks in the background and return task IDs immediately. Subagents start with no knowledge of this conversation: context is the only background they get. Split work into small tasks, each one concrete goal finishable in a handful of turns. Results are not available here: when a task finishes, a proactive notification reports its taskId and resultId; use read_result with those IDs then.",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            minLength: 1,
            description:
              "Shared background for every task in this call: what is being built, conclusions already established, constraints and what not to touch. Write it for a reader who has seen none of this conversation.",
          },
          tasks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                task: {
                  type: "string",
                  minLength: 1,
                  description:
                    "One concrete, independently verifiable goal. If it needs more than a handful of turns, split it into several tasks.",
                },
              },
              required: ["task"],
              additionalProperties: false,
            },
          },
        },
        required: ["context", "tasks"],
        additionalProperties: false,
      },
      async execute(_id, input) {
        const { context, tasks: requested } = delegateInput.parse(input);
        return result({
          taskIds: tasks.start(requested.map(({ task }) => task), context),
        });
      },
    },
    {
      name: "read_result",
      label: "Read result",
      description:
        "Read one finished task's result. Requires the taskId and the resultId from its completion notification; fails if the notification has not arrived yet. Never poll.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", minLength: 1 },
          resultId: { type: "string", format: "uuid" },
        },
        required: ["taskId", "resultId"],
        additionalProperties: false,
      },
      async execute(_id, input) {
        const { taskId, resultId } = readInput.parse(input);
        return result(await tasks.read(taskId, resultId));
      },
    },
    {
      name: "append",
      label: "Append",
      description:
        "Append an instruction to a running subtask. mode=steer (default) redirects its current activity; mode=followUp queues the text to run after it.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", minLength: 1 },
          text: { type: "string", minLength: 1 },
          mode: { type: "string", enum: ["steer", "followUp"], default: "steer" },
        },
        required: ["taskId", "text"],
        additionalProperties: false,
      },
      async execute(_id, input) {
        const { taskId, text, mode } = appendInput.parse(input);
        return result(await tasks.append(taskId, text, mode));
      },
    },
    {
      name: "cancel_task",
      label: "Cancel task",
      description:
        "Cancel one subtask by taskId. Only that subtask stops; sibling tasks keep running. Side effects it already produced are not rolled back. Its usual completion notification still arrives and its result stays readable with read_result then; if cleanup fails the final status is failed, so report the status you get back. Cancelling an already ended task is a no-op that returns its final state.",
      parameters: {
        type: "object",
        properties: { taskId: { type: "string", minLength: 1 } },
        required: ["taskId"],
        additionalProperties: false,
      },
      async execute(_id, input) {
        const { taskId } = cancelInput.parse(input);
        const { id, status } = await tasks.cancelTask(taskId);
        // 只回执状态：完整结果与 text 必须经完成通知的 resultId 走 read_result。
        return result({ taskId: id, status });
      },
    },
  ];
}
