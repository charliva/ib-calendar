import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { FormEvent } from "react";
import {
  applyProposal,
  validateProposal,
  type CalendarItem,
} from "@/lib/calendar-engine";
import {
  isAttentionQuestion,
  intentionFromCommand,
  proposalFromCommandResponse,
  simpleFallbackProposal,
} from "@/lib/calendar/commands";
import { relevantCommandItems } from "@/lib/calendar/scheduling";
import {
  isClarificationResponse,
  isCommandResponse,
  type ClarificationResponse,
} from "@/lib/ai/study-planner";
import {
  looksLikeHomeworkCommand,
  parseHomework,
  parseReviewSession,
} from "@/lib/homework-parser";
import type { Intention } from "@/lib/intentions";
import type { SchoolClass, Subject } from "@/lib/school";
import { commandItem } from "@/app/calendar/command-payload";
import {
  transitionState,
  type CommandTurn,
  type PaletteMode,
  type Zoom,
} from "@/app/calendar/view-types";

type CommandConsoleParams = {
  supabase: SupabaseClient;
  user: User | null;
  items: CalendarItem[];
  subjects: Subject[];
  classes: SchoolClass[];
  paletteMode: PaletteMode;
  commandText: string;
  commandBusy: boolean;
  commandTargetId: string | null;
  commandConversation: CommandTurn[];
  setItems: (items: CalendarItem[]) => void;
  setFilterText: (text: string) => void;
  setPaletteOpen: (open: boolean) => void;
  setPaletteMode: (mode: PaletteMode) => void;
  setCommandText: (text: string) => void;
  setCommandBusy: (busy: boolean) => void;
  setCommandError: (message: string) => void;
  setCommandTargetId: (id: string | null) => void;
  setCommandConversation: React.Dispatch<React.SetStateAction<CommandTurn[]>>;
  setCommandQuestions: (
    questions: ClarificationResponse["questions"],
  ) => void;
  setIntentionSeed: (intention: Partial<Intention> | null) => void;
  setIntentionsOpen: (open: boolean) => void;
  setZoom: (zoom: Zoom) => void;
  setNotice: (notice: string) => void;
  createWorkItemFromText: (rawText: string) => void;
  recordHistory: (label: string) => void;
  syncSnapshotDiff: (before: CalendarItem[], after: CalendarItem[]) => void;
};

/**
 * The command palette's submit path.
 *
 * Cheap local interpretations are tried first — a filter, a homework or review
 * capture, an attention question, an intention — so the common cases stay
 * instant and keep working signed out. Only what is left reaches the model,
 * and anything it returns is validated against the deterministic scheduler
 * before it can touch the calendar. If the call fails, a plain "add ..."
 * degrades to an unscheduled item rather than an error.
 */
export function useCommandConsole({
  supabase,
  user,
  items,
  subjects,
  classes,
  paletteMode,
  commandText,
  commandBusy,
  commandTargetId,
  commandConversation,
  setItems,
  setFilterText,
  setPaletteOpen,
  setPaletteMode,
  setCommandText,
  setCommandBusy,
  setCommandError,
  setCommandTargetId,
  setCommandConversation,
  setCommandQuestions,
  setIntentionSeed,
  setIntentionsOpen,
  setZoom,
  setNotice,
  createWorkItemFromText,
  recordHistory,
  syncSnapshotDiff,
}: CommandConsoleParams) {
  async function submitCommand(
    event: FormEvent | null,
    mode: PaletteMode = paletteMode,
    instruction?: string,
    targetId?: string,
  ) {
    event?.preventDefault();
    const clean = (instruction ?? commandText).trim();
    if (!clean || commandBusy) return;
    const target = targetId ?? commandTargetId;
    const scopedCommand = target
      ? `For calendar item id ${target}, ${clean}`
      : clean;
    setCommandError("");
    if (mode === "filter") {
      setFilterText(clean);
      setPaletteOpen(false);
      return;
    }
    const continuingConversation = commandConversation.length > 0;
    const reviewSession = parseReviewSession(clean, subjects, new Date());
    const homework = parseHomework(clean, subjects, new Date());
    if (
      !target &&
      !continuingConversation &&
      (reviewSession || looksLikeHomeworkCommand(clean, homework))
    ) {
      createWorkItemFromText(clean);
      setPaletteOpen(false);
      setCommandText("");
      return;
    }
    if (!continuingConversation && isAttentionQuestion(clean)) {
      setZoom("upcoming");
      setPaletteOpen(false);
      setCommandText("");
      setNotice(
        "Your attention home has been refreshed for the time and energy you have now.",
      );
      return;
    }
    const intentionDraft =
      continuingConversation || target ? null : intentionFromCommand(clean);
    if (intentionDraft) {
      setIntentionSeed(intentionDraft);
      setIntentionsOpen(true);
      setPaletteOpen(false);
      setCommandText("");
      return;
    }
    setCommandBusy(true);
    let keepConversationOpen = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7_500);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        throw new Error("Sign in to use AI commands");
      }
      const response = await fetch("/api/command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          command: scopedCommand,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          items: relevantCommandItems(
            [
              ...commandConversation.map((turn) => turn.text),
              scopedCommand,
            ].join(" "),
            items,
          ).map(commandItem),
          subjects: subjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
            shortName: subject.shortName,
            teacher: subject.teacher,
            room: subject.room,
          })),
          classes: classes.map((lesson) => ({
            subjectId: lesson.subjectId,
            weekday: lesson.weekday,
            startTime: lesson.startTime,
            endTime: lesson.endTime,
            teacher: lesson.teacher,
            room: lesson.room,
          })),
          conversation: commandConversation,
        }),
      });
      if (!response.ok) throw new Error("AI command unavailable");
      const raw: unknown = await response.json();
      if (isClarificationResponse(raw)) {
        keepConversationOpen = true;
        setCommandConversation(
          (current) =>
            [
              ...current,
              { role: "user", text: clean },
              { role: "assistant", text: raw.message },
            ].slice(-8) as CommandTurn[],
        );
        setCommandQuestions(raw.questions);
        setCommandText("");
        setPaletteMode("command");
        setPaletteOpen(true);
        return;
      }
      if (!isCommandResponse(raw)) {
        throw new Error("AI returned an invalid calendar proposal");
      }
      const commandProposal = proposalFromCommandResponse(raw, items);
      const validation = validateProposal(commandProposal, items);
      if (!validation.valid) {
        setNotice(
          "That change conflicts with your schedule. Try another time or edit the event manually.",
        );
      } else {
        recordHistory(commandProposal.title);
        const next = applyProposal(commandProposal, items).map((item) => ({
          ...item,
          syncStatus: "pending" as const,
        }));
        transitionState(() => setItems(next));
        syncSnapshotDiff(items, next);
        setNotice(`Applied: ${commandProposal.title}. Undo is available.`);
      }
      setCommandConversation([]);
      setCommandQuestions([]);
    } catch {
      if (
        !target &&
        /^(?:add|create|schedule|new)\b/i.test(clean) &&
        !/(?:move|delete|remove|cancel)\b/i.test(clean)
      ) {
        const fallback = simpleFallbackProposal(clean);
        recordHistory(fallback.title);
        const next = applyProposal(fallback, items).map((item) => ({
          ...item,
          syncStatus: "pending" as const,
        }));
        setItems(next);
        syncSnapshotDiff(items, next);
        setNotice(
          "Saved to Flexible work. AI is unavailable, so no time was assigned. Undo is available.",
        );
      } else {
        keepConversationOpen = true;
        setPaletteOpen(true);
        setCommandError(
          user
            ? "I couldn't interpret that safely. Try a more specific command."
            : "Sign in to use AI schedule changes. Local captures and intentions still work.",
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setCommandBusy(false);
      if (!keepConversationOpen) {
        setPaletteOpen(false);
        setCommandText("");
        setCommandTargetId(null);
      }
    }
  }

  return { submitCommand };
}
