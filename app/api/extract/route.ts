import { gateway, generateText, Output, type UserContent } from "ai";
import { z } from "zod";
import { authenticatedUser } from "@/lib/supabase/api-auth";

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
  mode: z.enum(["calendar_document", "school_timetable"]).default("calendar_document"),
  weekStart: z.string().date().optional(),
  subjects: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        shortName: z.string().trim().max(30),
        teacher: z.string().trim().max(120),
        room: z.string().trim().max(80),
      }),
    )
    .max(50)
    .default([]),
}).superRefine((value, context) => {
  if (value.mode === "school_timetable" && !value.weekStart) {
    context.addIssue({
      code: "custom",
      path: ["weekStart"],
      message: "A target week is required for timetable screenshots",
    });
  }
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
  rawLabel: z.string().max(160).nullable(),
  itemType: z.enum(["academic_subject", "assembly", "other"]).nullable(),
  subjectConfidence: z.enum(["high", "medium", "low"]).nullable(),
  subjectName: z.string().max(120).nullable(),
  subjectShortName: z.string().max(30).nullable(),
  teacher: z.string().max(120).nullable(),
  room: z.string().max(80).nullable(),
  evidence: z.string().min(1).max(240),
});

const extractionSchema = z.object({
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(280),
  items: z.array(extractedItemSchema).max(70),
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
    return Response.json({ error: "Invalid or oversized document" }, { status: 400 });
  }

  const { filename, mediaType, data, timezone, mode, weekStart, subjects } =
    parsed.data;
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
        mode,
        targetWeekStart: weekStart ?? null,
        knownSubjects: subjects,
        task:
          mode === "school_timetable"
            ? "Extract every visible lesson in this one specific school week as its own fixed event. Do not create recurrence."
            : "Extract only calendar-relevant events, tasks, intentions, deadlines, windows, and constraints. Do not apply anything.",
      }),
    },
    { type: "file", data, mediaType, filename },
  ];

  const { output } = await generateText({
    model: gateway(model),
    maxRetries: 0,
    maxOutputTokens: mode === "school_timetable" ? 7_000 : 3_200,
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
    instructions:
      mode === "school_timetable"
        ? `Read this as a school timetable screenshot for the week beginning ${weekStart} in ${timezone}.
Return one separate scheduled event for every visible lesson block, including simultaneous or unusually placed lessons.
Map weekday columns to exact dates inside that selected Monday-to-Sunday week. Use visible dates when present.
Each lesson must have exact startsAt and endsAt values with the correct explicit UTC offset for ${timezone}.
Copy the main bold text from each timetable cell exactly into rawLabel before interpreting it. Never replace rawLabel with a known subject.
Classify each block as academic_subject, assembly, or other. “Cohort” is an assembly block: title it Assembly, set itemType to assembly, and set subjectName and subjectShortName to null.
For academic blocks, use the canonical school subject as title and subjectName, its visible abbreviation in subjectShortName, and report subjectConfidence. Examples: GP = Global Politics, TOK = Theory of Knowledge, Dan ab = Danish ab initio, Eng A LL = English A Language and Literature, and Chem = Chemistry.
If an academic abbreviation is unfamiliar or confidence is low, preserve the cleaned raw label as subjectName and mark confidence low. Do not map it to the closest known subject. The user will create or correct it in a review screen.
Put class code, campus, and other useful visible details in description. Use one consistent subjectName for genuinely equivalent labels such as Chemistry, Chem, and Chemistry HL.
Known subjects are hints for exact matches and spelling only, never a reason to relabel an unfamiliar cell.
Set every lesson to kind event, flexibility fixed, status scheduled, splittable false, and equal durationMin/durationMax.
Do not return breaks, lunch, free periods, empty cells, cancelled lessons, homework, navigation labels, or duplicate blocks.
Do not infer recurrence: this screenshot represents only this unique week.
Every item needs short evidence naming the visible day, time, and cell text.
The application will validate the week and show a full replacement preview before applying.`
        : `Extract calendar information conservatively.
Fixed tickets, appointments, and timetable entries are events.
Set non-class events to flexibility flexible. Only actual school classes or timetable entries may be fixed.
Work to complete is a task. Aspirational activities are intentions.
Never invent a year, date, time, deadline, or duration that the document does not support.
When timing is fuzzy, use windowStart/windowEnd and leave startsAt/endsAt null.
Return ISO 8601 date-times with explicit offsets when a time is known.
Every item needs a short evidence explanation.
Set rawLabel, itemType, subjectConfidence, subjectName, subjectShortName, teacher, and room to null unless the document clearly describes a school class.
The application will show a diff and require approval.`,
    messages: [{ role: "user", content }],
  });

  return Response.json(output);
}
