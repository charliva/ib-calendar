import type { BlockSuggestion } from "../block-choices.ts";
import type { CalendarItem } from "../calendar-engine.ts";
import type { Exploration } from "../study-intelligence.ts";

export type AICommandChange = {
  type: "create" | "update" | "delete";
  itemId: string | null;
  reason: string;
  after: Partial<CalendarItem> | null;
};

export type AICommandResponse = {
  title: string;
  summary: string;
  changes: AICommandChange[];
};

export type ClarificationResponse = {
  kind: "clarification";
  message: string;
  questions: Array<{
    field: "subject" | "date" | "time" | "location" | "other";
    label: string;
  }>;
};

export function isCommandResponse(
  value: unknown,
): value is AICommandResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.changes) &&
    candidate.changes.every((change) => {
      if (!change || typeof change !== "object") return false;
      const entry = change as Record<string, unknown>;
      return (
        ["create", "update", "delete"].includes(String(entry.type)) &&
        (entry.itemId === null || typeof entry.itemId === "string") &&
        typeof entry.reason === "string" &&
        (entry.after === null ||
          (typeof entry.after === "object" && entry.after !== null))
      );
    })
  );
}

export function isClarificationResponse(
  value: unknown,
): value is ClarificationResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === "clarification" &&
    typeof candidate.message === "string" &&
    Array.isArray(candidate.questions) &&
    candidate.questions.length > 0 &&
    candidate.questions.every((question) => {
      if (!question || typeof question !== "object") return false;
      const entry = question as Record<string, unknown>;
      return (
        ["subject", "date", "time", "location", "other"].includes(
          String(entry.field),
        ) && typeof entry.label === "string"
      );
    })
  );
}

export function isDeeperResponse(
  value: unknown,
): value is Pick<Exploration, "framing" | "directions"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.framing === "string" &&
    Array.isArray(candidate.directions) &&
    candidate.directions.length >= 4 &&
    candidate.directions.every((direction) => {
      if (!direction || typeof direction !== "object") return false;
      const entry = direction as Record<string, unknown>;
      return (
        [
          "why",
          "connection",
          "harder_problem",
          "application",
          "edge_case",
          "teacher_question",
          "understanding_check",
          "further_reading",
        ].includes(String(entry.kind)) &&
        typeof entry.title === "string" &&
        typeof entry.prompt === "string" &&
        typeof entry.whyUseful === "string"
      );
    })
  );
}

export function isBlockPolishResponse(
  value: unknown,
): value is {
  suggestions: Array<
    Pick<
      BlockSuggestion,
      "id" | "category" | "title" | "description" | "reason"
    >
  >;
} {
  if (!value || typeof value !== "object") return false;
  const suggestions = (value as Record<string, unknown>).suggestions;
  return (
    Array.isArray(suggestions) &&
    suggestions.length === 3 &&
    suggestions.every((suggestion) => {
      if (!suggestion || typeof suggestion !== "object") return false;
      const entry = suggestion as Record<string, unknown>;
      return (
        typeof entry.id === "string" &&
        ["recovery", "responsibility", "meaningful"].includes(
          String(entry.category),
        ) &&
        typeof entry.title === "string" &&
        typeof entry.description === "string" &&
        (entry.reason === null || typeof entry.reason === "string")
      );
    })
  );
}
