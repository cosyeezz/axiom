import { z } from "zod";

const id = z.string().min(1);
const capabilities = z.object({
  skills: z.array(id), mcp: z.array(id), plugins: z.array(id),
}).strict().nullable();
const workspace = z.string().trim().min(1).optional();
const thinking = z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]).optional();
const selection = z.object({
  model: id.nullable().optional(),
  subagentModel: id.nullable().optional(),
  capabilities: capabilities.optional(),
  subagentCapabilities: capabilities.optional(),
});
export const command = z.discriminatedUnion("type", [
  z
    .object({
      id,
      type: z.literal("session.rename"),
      sessionId: id,
      title: z.string().trim().min(1).max(120),
    })
    .strict(),
  z.object({ id, type: z.literal("models.list") }).strict(),
  z.object({
    id, type: z.literal("capabilities.list"),
    cwd: workspace, trustProject: z.boolean().optional(),
  }).strict(),
  z.object({ id, type: z.literal("session.defaults.get") }).strict(),
  selection.extend({ id, type: z.literal("session.defaults.configure"), cwd: workspace }).strict(),
  z
    .object({
      id,
      type: z.literal("session.configure"),
      sessionId: id,
      model: id,
      subagentModel: id.nullable().optional(),
      thinking,
    })
    .strict(),
  z.object({ id, type: z.literal("sessions.list") }).strict(),
  selection
    .extend({
      id,
      type: z.literal("session.create"),
      cwd: workspace,
      thinking,
      useDefaults: z.boolean().optional(),
      trustProject: z.boolean().optional(),
    })
    .strict(),
  z.object({ id, type: z.literal("session.attach"), sessionId: id }).strict(),
  z.object({ id, type: z.literal("session.close"), sessionId: id }).strict(),
  z
    .object({
      id,
      type: z.literal("prompt"),
      sessionId: id,
      text: z.string().trim().min(1),
    })
    .strict(),
  z.object({ id, type: z.literal("cancel"), sessionId: id }).strict(),
  z
    .object({
      id,
      type: z.literal("tasks.read"),
      sessionId: id,
      taskIds: z.array(id).min(1),
      wait: z.boolean().default(false),
    })
    .strict(),
]);
