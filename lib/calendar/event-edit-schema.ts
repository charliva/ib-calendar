import { z } from "zod";
export const eventEditSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  room: z.string().max(80).optional(),
  taskContext: z
    .enum(["school", "home", "city", "library", "anywhere"])
    .optional(),
  energyUsage: z.number().int().min(1).max(5).optional(),
  kind: z.enum(["event", "task", "intention"]).optional(),
  status: z.enum(["scheduled", "completed"]).optional(),
  isClass: z.boolean().optional(),
  repeat: z.enum(["once", "every", "a", "b"]).optional(),
  scope: z.enum(["occurrence", "future"]).optional(),
});
