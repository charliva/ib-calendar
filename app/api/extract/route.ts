import { gateway, generateText, Output, type UserContent } from "ai";
import { z } from "zod";

export const runtime = "edge";

const requestSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  mediaType: z
    .string()
    .refine(
      (value) =>
        value.startsWith("image/") ||
        value === "application/pdf" ||
        value.startsWith("text/"),
      "Unsupported file type",
    ),
  data: z.string().min(1).max(8_000_000),
  timezone: z.string().trim().min(1).max(80),
});

const extractedItemSchema = z.object({
  kind: z.enum(["event", "task", "intention"]),
  title: z.string().min(1).max(300),
  description: z.string().max(1000),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  durationMin: z.number().int().min(5).max(720),
  durationMax: z.number().int().min(5).max(720),
  deadline: z.string().nullable(),
  windowStart: z.string().nullable(),
  windowEnd: z.string().nullable(),
  energyType: z.enum([
    "deep_focus",
    "light_work",
    "social",
    "movement",
    "recovery",
    "transit",
  ]),
  priority: z.enum(["low", "medium", "high"]),
  splittable: z.boolean(),
  flexibility: z.enum(["fixed", "flexible", "elastic"]),
  constraints: z.array(z.string()).max(10),
  status: z.enum(["inbox", "scheduled"]),
  evidence: z.string().min(1).max(240),
});

const extractionSchema = z.object({
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(280),
  items: z.array(extractedItemSchema).max(40),
});

export async function POST(request: Request) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json(
      { error: "Vercel AI Gateway authentication is not configured" },
      { status: 503 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid or oversized document" }, { status: 400 });
  }

  const { filename, mediaType, data, timezone } = parsed.data;
  const model =
    process.env.AI_GATEWAY_VISION_MODEL ??
    process.env.AI_GATEWAY_MODEL ??
    "google/gemini-3-flash";
  const content: UserContent = [
    {
      type: "text",
      text: JSON.stringify({
        now: new Date().toISOString(),
        timezone,
        task:
          "Extract only calendar-relevant fixed events, tasks, intentions, deadlines, windows, and constraints. Do not apply anything.",
      }),
    },
    mediaType.startsWith("image/")
      ? { type: "image", image: data, mediaType }
      : { type: "file", data, mediaType, filename },
  ];

  const { output } = await generateText({
    model: gateway(model),
    maxRetries: 0,
    maxOutputTokens: 3_200,
    timeout: { totalMs: 20_000 },
    providerOptions: {
      gateway: { sort: "ttft" },
      ...(model.startsWith("openai/")
        ? { openai: { reasoningEffort: "none" } }
        : {}),
    },
    output: Output.object({
      schema: extractionSchema,
      name: "calendar_document_extraction",
      description:
        "Calendar items proposed from a document, with source evidence.",
    }),
    instructions: `Extract calendar information conservatively.
Fixed tickets, appointments, and timetable entries are events.
Work to complete is a task. Aspirational activities are intentions.
Never invent a year, date, time, deadline, or duration that the document does not support.
When timing is fuzzy, use windowStart/windowEnd and leave startsAt/endsAt null.
Return ISO 8601 date-times with explicit offsets when a time is known.
Every item needs a short evidence explanation.
The application will show a diff and require approval.`,
    messages: [{ role: "user", content }],
  });

  return Response.json(output);
}
