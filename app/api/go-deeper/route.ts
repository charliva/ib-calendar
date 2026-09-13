import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import { authenticatedUser } from "@/lib/supabase/api-auth";

export const runtime = "edge";

const requestSchema = z.object({
  source: z.object({
    type: z.enum(["calendar_item", "subject", "assignment", "assessment", "intention", "topic", "question", "note"]),
    title: z.string().trim().min(1).max(300),
    subjectName: z.string().trim().max(120).nullable().optional(),
    context: z.string().trim().max(4000).optional(),
  }),
  challengeLevel: z.enum(["too_easy", "good_challenge", "difficult", "not_understood"]).nullable(),
  challengeSummary: z.object({
    tooEasy: z.number().int().min(0).max(100),
    goodChallenge: z.number().int().min(0).max(100),
    difficult: z.number().int().min(0).max(100),
    notUnderstood: z.number().int().min(0).max(100),
  }),
});

const directionSchema = z.object({
  kind: z.enum(["why", "connection", "harder_problem", "application", "edge_case", "teacher_question", "understanding_check", "further_reading"]),
  title: z.string().min(1).max(90),
  prompt: z.string().min(1).max(500),
  whyUseful: z.string().min(1).max(220),
});

const outputSchema = z.object({
  framing: z.string().min(1).max(600),
  directions: z.array(directionSchema).min(4).max(6),
});

export async function POST(request: Request) {
  if (!(await authenticatedUser(request))) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json({ error: "AI Gateway is not configured" }, { status: 503 });
  }
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid exploration request" }, { status: 400 });

  const model = process.env.AI_GATEWAY_DEEPER_MODEL ?? process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-mini";
  const { output } = await generateText({
    model: gateway(model),
    maxRetries: 1,
    maxOutputTokens: 1_500,
    timeout: { totalMs: 12_000 },
    providerOptions: {
      gateway: { sort: "quality" },
      ...(model.startsWith("openai/") ? { openai: { reasoningEffort: "low" } } : {}),
    },
    output: Output.object({ schema: outputSchema, name: "go_deeper_directions", description: "Specific, intellectually useful directions for exploring an academic item more deeply." }),
    instructions: `You are an intellectually serious IB study partner. Generate directions that make the student think harder, not generic study advice and not additional compulsory homework.
Be specific to the supplied item. Prefer causal explanations, cross-subject connections, counterexamples, edge cases, applications, harder problems, teacher questions, and understanding checks.
Adapt to challenge feedback: too_easy should increase depth and difficulty; difficult should build a conceptual bridge; not_understood should diagnose the missing prerequisite without condescension; good_challenge should extend carefully.
Do not invent a syllabus fact, citation, book, paper, URL, or assessment requirement. Further-reading directions should name a search question or source type unless a canonical primary source is certain.
Each direction must be meaningfully different. Avoid filler such as “research more,” “review your notes,” or “watch a video.”`,
    prompt: JSON.stringify(parsed.data),
  });
  return Response.json(output);
}
