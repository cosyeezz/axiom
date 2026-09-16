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
        "Asynchronously start research and analysis subagents. Each subtask has an independent context and does not inherit the current conversation. Provide shared background through context and task-specific instructions through tasks[].task.\n\nBefore delegating, identify the question to resolve, how the findings will be used, and the deliverable requirements. Provide the information the subagent needs to work independently, and check that the task instructions are sufficient for a subagent that has not participated in the current conversation to understand and carry out the task. Each subtask must have one concrete, independently verifiable goal that can be completed in a handful of turns; split larger work into smaller tasks.\n\nOn success, immediately returns a taskId for each subtask, not its results. When a subtask finishes, a proactive notification provides its taskId and resultId. Only after receiving that notification, call read_result with those fields to read the result once. You may choose when to read it; do not poll.",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            minLength: 1,
            description:
              "Background shared by all subtasks, including why the work is being delegated, current progress, relevant known information, and common constraints. Include what is needed to understand the overall work; omit unrelated details. Put information specific to one subtask in its tasks[].task.",
          },
          tasks: {
            type: "array",
            minItems: 1,
            description:
              "A non-empty array of subtasks, each defining a specific research or analysis task.",
            items: {
              type: "object",
              properties: {
                task: {
                  type: "string",
                  minLength: 1,
                  description:
                    "Task-specific instructions covering the question to resolve, scope, necessary task-specific information, and deliverable requirements. When key conclusions need verification, specify the evidence needed. Do not repeat background already provided in context.",
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
        "Read the result of a finished subtask started by delegate. Call only after receiving that subtask's completion notification. The taskId and resultId must come from the same notification. Calls made before the notification arrives fail. This tool retrieves results, not task progress. Do not poll.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            minLength: 1,
            description: "The taskId from the subtask's completion notification.",
          },
          resultId: {
            type: "string",
            format: "uuid",
            description: "The resultId from the same completion notification.",
          },
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
        "Send additional instructions to a running subtask started by delegate. Use steer to adjust the direction or requirements of its current work. Use followUp to queue instructions for execution after its current work finishes. Defaults to steer.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            minLength: 1,
            description: "The taskId of the subtask that should receive the instructions.",
          },
          text: {
            type: "string",
            minLength: 1,
            description:
              "Additional instructions and any new information needed to understand them. Specify the requirements to change or the work to add; do not repeat background the subtask already has.",
          },
          mode: {
            type: "string",
            enum: ["steer", "followUp"],
            default: "steer",
            description:
              "How to handle the instructions: steer adjusts the current work; followUp queues them for execution after the current work finishes. Defaults to steer when omitted.",
          },
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
