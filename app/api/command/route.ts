import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import { authenticatedUser } from "@/lib/supabase/api-auth";
import {
  clarificationFor,
  missingAssessmentDetails,
} from "@/lib/command-clarification";

export const runtime = "edge";

const currentItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["event", "task", "intention"]),
  title: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  durationMin: z.number(),
  durationMax: z.number(),
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
  constraints: z.array(z.string()),
  description: z.string().optional(),
  room: z.string().optional(),
  subjectId: z.string().nullable().optional(),
  status: z.enum(["inbox", "scheduled", "completed", "archived"]),
});

const subjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  teacher: z.string(),
  room: z.string(),
});

const classSchema = z.object({
  subjectId: z.string(),
  weekday: z.number().int().min(1).max(7),
  startTime: z.string(),
  endTime: z.string(),
  teacher: z.string(),
  room: z.string(),
});

const conversationSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(500),
});

const requestSchema = z.object({
  command: z.string().trim().min(2).max(600),
  timezone: z.string().trim().min(1).max(80),
  items: z.array(currentItemSchema).max(200),
  subjects: z.array(subjectSchema).max(50).default([]),
  classes: z.array(classSchema).max(100).default([]),
  conversation: z.array(conversationSchema).max(8).default([]),
});

const proposedItemSchema = currentItemSchema
  .partial()
  .extend({
    id: z.string().nullable().optional(),
    description: z.string().max(1000).optional(),
  });

const proposalSchema = z.object({
  kind: z.literal("proposal").optional(),
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(280),
  changes: z
    .array(
      z.object({
        type: z.enum(["create", "update", "delete"]),
        itemId: z.string().nullable(),
        reason: z.string().min(1).max(240),
        after: proposedItemSchema.nullable(),
      }),
    )
    .min(1)
    .max(30),
});

const clarificationSchema = z.object({
  kind: z.literal("clarification"),
  message: z.string().min(1).max(280),
  questions: z
    .array(
      z.object({
        field: z.enum(["subject", "date", "time", "location", "other"]),
        label: z.string().min(1).max(80),
      }),
    )
    .min(1)
    .max(4),
});

const assistantResponseSchema = z.union([proposalSchema, clarificationSchema]);

export async function POST(request: Request) {
  if (!(await authenticatedUser())) {
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
    return Response.json({ error: "Invalid calendar command" }, { status: 400 });
  }

  const { command, timezone, items, subjects, classes, conversation } =
    parsed.data;
  const accumulatedUserContext = [
    ...conversation
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.text),
    command,
  ].join(" ");
  const missingDetails = missingAssessmentDetails(
    accumulatedUserContext,
    subjects,
  );
  if (missingDetails.length > 0) {
    return Response.json(clarificationFor(missingDetails));
  }
  const model = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-nano";
  const { output } = await generateText({
    model: gateway(model),
    maxRetries: 0,
    maxOutputTokens: 1_200,
    timeout: { totalMs: 7_000 },
    providerOptions: {
      gateway: { sort: "ttft" },
      ...(model.startsWith("openai/")
        ? { openai: { reasoningEffort: "none" } }
        : {}),
    },
    output: Output.json({
      name: "calendar_change_proposal",
      description:
        "A proposed calendar transformation that must be validated and approved before application.",
    }),
    instructions: `You are the calm, concise command assistant inside a personal IB study calendar.
You either ask for missing material information or translate the conversation into a calendar proposal.
Never create a vague school assessment. Before proposing a test, quiz, exam, assessment, oral, mock, or presentation, establish the subject, exact date, time, and location. If any is genuinely unavailable, ask one short combined follow-up and return kind clarification with 1-4 question objects. Do not include changes in a clarification.
Use prior conversation turns as context. The user's newest message may only answer your previous question.
Known subjects and timetable classes are authoritative hints. Do not silently pick a subject, room, date, or time when several are possible.
The system has calendar items (events, tasks, intentions), subjects, recurring classes, homework, assignments, and assessments. This endpoint may propose calendar items only. A school test becomes a flexible calendar event linked to a known subject when possible; it must never masquerade as an imported fixed class.
Never claim a proposal has already been applied.
Events with fixed flexibility cannot be moved, resized, or deleted.
For newly created events, always set flexibility to flexible. Normal calendar events are movable; only school classes imported through the timetable flow are fixed.
Treat task placements as temporary solutions, not task identity.
Use ISO 8601 date-times with an explicit offset.
For multi-day ranges such as exam weeks, holidays, and intentions, keep one item spanning the full range rather than creating daily duplicates. Treat endsAt as exclusive when the range ends at midnight.
For fuzzy requests, preserve a window and leave startsAt/endsAt null unless the user explicitly asks to schedule.
For updates, return only the fields that change inside after. The application merges the patch with the existing item.
For creates, use null for id; the application assigns identifiers.
For deletes, after must be null.
Do not invent unrelated calendar items.
Be terse and conversational. Ask no more than one combined follow-up at a time.
For clarification return:
{"kind":"clarification","message":"one short question","questions":[{"field":"subject|date|time|location|other","label":"short prompt"}]}
For a proposal return:
{"kind":"proposal","title":"short title","summary":"short summary","changes":[{"type":"create|update|delete","itemId":"existing id or null","reason":"short reason","after":{"only":"fields that are new or changed"} or null}]}
For a create, after must include at least title and kind. For an update, omit unchanged fields from after.`,
    prompt: JSON.stringify({
      now: new Date().toISOString(),
      timezone,
      command,
      conversation,
      currentItems: items,
      knownSubjects: subjects,
      timetableClasses: classes,
      systemConstraints: {
        newEventsAreFlexible: true,
        importedClassesAreFixed: true,
        flexibleIntentionsDoNotBecomeBulkCalendarEvents: true,
        changesRequireUserApproval: true,
        freeTimeMayRemainFree: true,
      },
    }),
  });

  const validated = assistantResponseSchema.safeParse(output);
  if (!validated.success) {
    return Response.json({ error: "AI returned an invalid proposal" }, { status: 502 });
  }
  return Response.json(validated.data);
}
