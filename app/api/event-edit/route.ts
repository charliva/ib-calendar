import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import { authenticatedUser } from "@/lib/supabase/api-auth";

import { eventEditSchema as patchSchema } from "@/lib/calendar/event-edit-schema";
export async function POST(request: Request) {
  if (!(await authenticatedUser(request)))
    return Response.json(
      { error: "Sign in to use AI editing." },
      { status: 401 },
    );
  const input = z
    .object({
      instruction: z.string().trim().min(1).max(600),
      timezone: z.string().max(100),
      item: z.object({
        title: z.string(),
        startsAt: z.string().nullable(),
        endsAt: z.string().nullable(),
        room: z.string(),
        energyUsage: z.number().optional(),
        taskContext: z.string(),
      }),
      options: z.object({
        isClass: z.boolean(),
        repeat: z.string(),
        scope: z.string(),
      }),
    })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return Response.json({ error: "Invalid edit." }, { status: 400 });
  try {
    const { output } = await generateText({
      model: gateway(process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-nano"),
      output: Output.object({ schema: patchSchema }),
      maxRetries: 0,
      timeout: { totalMs: 7000 },
      system:
        "Edit only the provided calendar event. Return only explicitly changed fields. Energy usage is 1 (very light) through 5 (very demanding). Preserve duration when moving. Interpret dates in the supplied timezone. Class recurrence: once, every (weekly), a, b. Default edits apply to this occurrence. Do not delete; deletion requires the dedicated confirmation control. Do not invent changes when the instruction is unclear.",
      prompt: JSON.stringify({ ...input.data, now: new Date().toISOString() }),
    });
    return Response.json(patchSchema.parse(output));
  } catch {
    return Response.json(
      {
        error: "AI editing is unavailable. Try again or use the fields below.",
      },
      { status: 503 },
    );
  }
}
