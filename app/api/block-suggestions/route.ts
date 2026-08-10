import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import { authenticatedUser } from "@/lib/supabase/api-auth";

export const runtime = "edge";

const categorySchema = z.enum(["recovery", "responsibility", "meaningful"]);
const suggestionSchema = z.object({
  id: z.string().min(1).max(500),
  category: categorySchema,
  title: z.string().min(1).max(90),
  description: z.string().min(1).max(300),
  estimatedDuration: z.number().int().min(5).max(360),
  reason: z.string().max(240).nullable(),
});
const requestSchema = z.object({
  block: z.object({
    label: z.string().min(1).max(80),
    startsAt: z.string(),
    endsAt: z.string(),
    location: z.enum(["home", "school", "library", "commute"]),
    energy: z.enum(["low", "medium", "high"]),
  }),
  suggestions: z.array(suggestionSchema).length(3),
});
const outputSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string().min(1).max(500),
      category: categorySchema,
      title: z.string().min(1).max(90),
      description: z.string().min(1).max(300),
      reason: z.string().max(240).nullable(),
    }),
  ).length(3),
});

export async function POST(request: Request) {
  if (!(await authenticatedUser(request))) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json({ error: "AI Gateway is not configured" }, { status: 503 });
  }
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid block choices" }, { status: 400 });
  }

  const model = process.env.AI_GATEWAY_BLOCK_MODEL ?? process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-nano";
  const { output } = await generateText({
    model: gateway(model),
    maxRetries: 0,
    maxOutputTokens: 700,
    timeout: { totalMs: 6_000 },
    providerOptions: {
      gateway: { sort: "ttft" },
      ...(model.startsWith("openai/")
        ? { openai: { reasoningEffort: "none" } }
        : {}),
    },
    output: Output.object({
      schema: outputSchema,
      name: "block_choice_wording",
      description: "Exactly three calm, actionable paths for a student time block.",
    }),
    instructions: `Polish an already validated set of exactly three choices for an IB student's current time block.
Preserve every id and category exactly and return them in the original order: recovery, responsibility, meaningful.
Do not add tasks, change durations, invent deadlines, locations, people, plans, or facts. Do not make rest sound inferior.
Make each title concrete and compact. Make each description a single actionable sentence. Reasons should explain context without guilt.
Avoid productivity clichés, therapy language, points, rewards, game mechanics, and commands that sound compulsory.
The three options are alternatives; choosing one is enough.`,
    prompt: JSON.stringify(parsed.data),
  });

  const expected = parsed.data.suggestions;
  const valid = output.suggestions.every(
    (suggestion, index) =>
      suggestion.id === expected[index].id &&
      suggestion.category === expected[index].category,
  );
  if (!valid) {
    return Response.json({ error: "AI changed validated choices" }, { status: 422 });
  }
  return Response.json(output);
}
