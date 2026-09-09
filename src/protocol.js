import { z } from "zod";

const id = z.string().min(1);
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
  z
    .object({
      id,
      type: z.literal("session.configure"),
      sessionId: id,
      model: id,
      thinking: z
        .enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"])
        .optional(),
    })
    .strict(),
  z.object({ id, type: z.literal("sessions.list") }).strict(),
  z
    .object({
      id,
      type: z.literal("session.create"),
      cwd: z.string().trim().min(1).optional(),
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
