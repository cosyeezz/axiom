import { z } from "zod";

const delegateInput = z
  .object({
    tasks: z
      .array(z.object({ task: z.string().trim().min(1) }).strict())
      .min(1),
  })
  .strict();
const readInput = z
  .object({
    taskIds: z.array(z.string()).min(1),
    wait: z.boolean().default(true),
  })
  .strict();
const result = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

export function delegationTools(tasks) {
  return [
    {
      name: "delegate",
      label: "Delegate",
      description:
        "Start independent subagent tasks in parallel and return task IDs immediately. Each task needs its own context. Use read_result to collect results.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: { task: { type: "string", minLength: 1 } },
              required: ["task"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
      async execute(_id, input) {
        return result({
          taskIds: tasks.start(
            delegateInput.parse(input).tasks.map(({ task }) => task),
          ),
        });
      },
    },
    {
      name: "read_result",
      label: "Read result",
      description:
        "Read task results by ID. By default waits for completion. Set wait=false for current status. Repeated reads preserve results.",
      parameters: {
        type: "object",
        properties: {
          taskIds: { type: "array", minItems: 1, items: { type: "string" } },
          wait: { type: "boolean", default: true },
        },
        required: ["taskIds"],
        additionalProperties: false,
      },
      async execute(_id, input, signal) {
        const { taskIds, wait } = readInput.parse(input);
        return result(await tasks.read(taskIds, wait, signal));
      },
    },
  ];
}
