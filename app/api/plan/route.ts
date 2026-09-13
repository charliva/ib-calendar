import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import { authenticatedUser } from "@/lib/supabase/api-auth";

export const runtime = "edge";

const requestSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(300),
  timezone: z.string().trim().min(1).max(80),
  existingEvents: z
    .array(
      z.object({
        start: z.string(),
        end: z.string(),
        title: z.string(),
      }),
    )
    .max(100)
    .optional(),
});

const planSchema = z.object({
  urgency: z.enum(["low", "medium", "high"]),
  estimatedMinutes: z.number().int().min(10).max(240),
  reason: z.string().min(1).max(240),
  suggestedStart: z.string().describe("An ISO 8601 local date-time string"),
  studySteps: z.array(z.string().min(1).max(80)).min(2).max(5),
});

export async function POST(request: Request) {
  if (!(await authenticatedUser(request))) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json(
      { error: "Vercel AI Gateway authentication is not configured" },
      { status: 503 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid homework details" }, { status: 400 });
  }

  const { subject, title, timezone, existingEvents = [] } = parsed.data;
  const model = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-nano";
  const { output } = await generateText({
    model: gateway(model),
    maxRetries: 0,
    maxOutputTokens: 600,
    timeout: { totalMs: 6_000 },
    providerOptions: {
      gateway: { sort: "ttft" },
      ...(model.startsWith("openai/")
        ? { openai: { reasoningEffort: "none" } }
        : {}),
    },
    output: Output.object({
      schema: planSchema,
      name: "homework_plan",
      description: "A safe, realistic study plan for a secondary-school student.",
    }),
    instructions:
      "You schedule homework for a student. Prefer realistic, short focus blocks. Never invent a due date. Explain the urgency plainly. Avoid conflicts in the supplied calendar. Return only the requested structured output.",
    prompt: JSON.stringify({
      now: new Date().toISOString(),
      timezone,
      subject,
      title,
      existingEvents,
    }),
  });

  return Response.json(output);
}
