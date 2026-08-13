"use client";

import type { User } from "@supabase/supabase-js";
import { assignmentProgress, planAssignment } from "@/lib/assignment-planner";
import { planRevisionRunway, planSpacedReviews } from "@/lib/revision-planner";
import {
  energyTypeForWorkType,
  type FreePeriod,
} from "@/lib/school-day-engine";
import {
  Activity,
  ArrowDownToLine,
  BookOpen,
  CalendarPlus,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Command,
  FileUp,
  Focus,
  GraduationCap,
  GripVertical,
  History,
  Inbox,
  Layers3,
  List,
  Lock,
  Laptop,
  Move,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import {
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HomeworkInbox } from "@/app/homework-inbox";
import { SchoolWorkspace } from "@/app/school-workspace";
import { AttentionHome } from "@/app/attention-home";
import { IntentionsPanel } from "@/app/intentions-panel";
import { GoDeeperPanel } from "@/app/go-deeper-panel";
import { LearningControls } from "@/app/learning-controls";
import { TemporalField } from "@/app/ui/temporal-field";
import {
  buildAttentionSnapshot,
  type AttentionCard,
} from "@/lib/attention-engine";
import {
  blockChoiceToRow,
  buildBlockChoice,
  rowToBlockChoice,
  updateBlockChoice,
  type BlockChoice,
  type BlockChoiceStatus,
  type BlockSuggestion,
} from "@/lib/block-choices";
import {
  intentionToRow,
  makeIntention,
  rowToIntention,
  type Intention,
} from "@/lib/intentions";
import {
  explorationToRow,
  latestSignalFor,
  learningSignalToRow,
  makeLearningSignal,
  rowToExploration,
  rowToLearningSignal,
  subjectChallengeSummary,
  type ChallengeLevel,
  type Exploration,
  type ExplorationDirection,
  type LearningSignal,
  type LearningSource,
} from "@/lib/study-intelligence";
import {
  addDays,
  applyProposal,
  capacityForDay,
  dateFromKey,
  dateKey,
  durationMinutes,
  energyLabels,
  flexibilityForNewItem,
  itemToRow,
  itemOverlapsDay,
  isAllDayItem,
  isCalendarSpanItem,
  kindLabels,
  makeItem,
  scheduleInsights,
  startOfWeek,
  validatePlacement,
  validateProposal,
  withResizedDuration,
  type CalendarItem,
  type CalendarProposal,
  type EnergyRequirement,
  type EnergyType,
  type Flexibility,
  type HistoryEntry,
  type ItemKind,
  type Priority,
  type ProposalChange,
  type SchoolWorkType,
  type TaskContext,
} from "@/lib/calendar-engine";
import {
  looksLikeHomeworkCommand,
  parseHomework,
  recentSubjects,
} from "@/lib/homework-parser";
import {
  recommendNow,
  type CurrentStudyLocation,
  type NowRecommendation,
  type NowRecommendationResult,
} from "@/lib/now-recommender";
import {
  isImportedTimetableItem,
  isItemInWeek,
  reconcileTimetableImport,
  timetableRoomForItem,
  subjectsAreSimilar,
  type TimetableExtractionCandidate,
} from "@/lib/timetable-import";
import {
  getOfflineState,
  getPendingMutations,
  queueMutation,
  removePendingMutation,
  saveOfflineState,
  updatePendingMutation,
  type PendingMutation,
} from "@/lib/offline";
import { calendarSwipeDirection, type SwipePoint } from "@/lib/week-swipe";
import {
  assessmentToRow,
  assignmentToRow,
  classExceptionToRow,
  classToRow,
  homeworkCaptureToRow,
  DEFAULT_SCHOOL_DAY_SETTINGS,
  normalizeAssignment,
  normalizeAssessment,
  normalizeSchoolDaySettings,
  rowToAssessment,
  rowToAssignment,
  rowToClass,
  rowToClassException,
  rowToHomeworkCapture,
  rowToSchoolDaySettings,
  rowToSubject,
  subjectToRow,
  schoolDaySettingsToRow,
  type Assessment,
  type Assignment,
  type ClassException,
  type HomeworkCapture,
  type SchoolClass,
  type SchoolDaySettings,
  type Subject,
  WORK_TYPE_LABELS,
} from "@/lib/school";
import { createClient } from "@/lib/supabase/client";
import {
  compactPendingMutations,
  prepareMutation,
} from "@/lib/sync";

type Zoom = "school" | "upcoming" | "day" | "week" | "month" | "semester";
type PaletteMode = "command" | "filter" | "upload";
type CommandResponse = Parameters<typeof proposalFromCommandResponse>[0];
type ExtractionCandidate = TimetableExtractionCandidate;
type ExtractionResponse = {
  title: string;
  summary: string;
  items: ExtractionCandidate[];
};

const ACTIVE_START = 6;
const ACTIVE_END = 23;
const DAY_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function classColorStyle(
  item: CalendarItem,
  subjects: Subject[],
): CSSProperties | undefined {
  if (!isImportedTimetableItem(item)) return undefined;
  const subject = subjects.find(
    (candidate) =>
      candidate.id === item.subjectId ||
      subjectsAreSimilar(
        item.title,
        candidate.name,
        item.title,
        candidate.shortName,
      ),
  );
  const color = subject?.color;
  return color?.startsWith("#")
    ? ({ "--energy": color } as CSSProperties)
    : undefined;
}
const energyTypes = Object.keys(energyLabels) as EnergyType[];
const priorities: Priority[] = ["low", "medium", "high"];
const flexibilities: Flexibility[] = ["fixed", "flexible", "elastic"];
const kinds: ItemKind[] = ["event", "task", "intention"];
const schoolWorkTypes = Object.keys(WORK_TYPE_LABELS) as SchoolWorkType[];
const energyRequirements: EnergyRequirement[] = ["low", "medium", "high"];

function isInactiveHour(hour: number) {
  return hour < ACTIVE_START || hour >= ACTIVE_END;
}

function hourHeight(hour: number, rowHeight: number) {
  return isInactiveHour(hour) ? Math.max(18, rowHeight * 0.34) : rowHeight;
}

function timeOffset(hour: number, minute: number, rowHeight: number) {
  const wholeHours = DAY_HOURS.slice(0, Math.min(24, hour)).reduce(
    (total, value) => total + hourHeight(value, rowHeight),
    0,
  );
  if (hour >= 24) return wholeHours;
  return wholeHours + (minute / 60) * hourHeight(hour, rowHeight);
}

function timeAtOffset(offset: number, rowHeight: number) {
  let remaining = Math.max(0, offset);
  for (const hour of DAY_HOURS) {
    const height = hourHeight(hour, rowHeight);
    if (remaining <= height) {
      return {
        hour,
        minute: Math.min(45, Math.round((remaining / height) * 4) * 15),
      };
    }
    remaining -= height;
  }
  return { hour: 23, minute: 45 };
}

function itemGeometry(item: CalendarItem, rowHeight: number) {
  const start = new Date(item.startsAt!);
  const end = new Date(item.endsAt!);
  const startTop = timeOffset(start.getHours(), start.getMinutes(), rowHeight);
  const endTop =
    dateKey(start) === dateKey(end)
      ? timeOffset(end.getHours(), end.getMinutes(), rowHeight)
      : timeOffset(24, 0, rowHeight);
  return {
    top: startTop,
    height: Math.max(28, endTop - startTop),
  };
}

function overlapLayout(items: CalendarItem[]) {
  const result = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
  );
  let group: CalendarItem[] = [];
  let groupEnd = -Infinity;

  const placeGroup = () => {
    const laneEnds: number[] = [];
    const placements = group.map((item) => {
      const start = new Date(item.startsAt!).getTime();
      const end = new Date(item.endsAt!).getTime();
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = end;
      return { item, lane };
    });
    const lanes = Math.max(1, laneEnds.length);
    placements.forEach(({ item, lane }) =>
      result.set(item.id, { lane, lanes }),
    );
  };

  sorted.forEach((item) => {
    const start = new Date(item.startsAt!).getTime();
    const end = new Date(item.endsAt!).getTime();
    if (group.length && start >= groupEnd) {
      placeGroup();
      group = [];
      groupEnd = -Infinity;
    }
    group.push(item);
    groupEnd = Math.max(groupEnd, end);
  });
  if (group.length) placeGroup();
  return result;
}

function relevantCommandItems(command: string, items: CalendarItem[]) {
  const terms = command
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
  const now = Date.now();
  const horizon = now + 45 * 24 * 60 * 60_000;
  return [...items]
    .map((item) => {
      const haystack =
        `${item.title} ${item.kind} ${item.energyType}`.toLowerCase();
      const matchScore = terms.reduce(
        (score, term) => score + (haystack.includes(term) ? 20 : 0),
        0,
      );
      const time = item.startsAt
        ? new Date(item.startsAt).getTime()
        : item.deadline
          ? new Date(item.deadline).getTime()
          : Number.POSITIVE_INFINITY;
      const nearScore =
        time >= now - 24 * 60 * 60_000 && time <= horizon ? 8 : 0;
      return { item, score: matchScore + nearScore, time };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.time - b.time)
    .slice(0, 60)
    .map(({ item }) => item);
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

function formatTime(value: string | null) {
  if (!value) return "Unscheduled";
  return formatDate(new Date(value), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRange(item: CalendarItem) {
  if (!item.startsAt || !item.endsAt) {
    if (item.windowStart && item.windowEnd) {
      return `${formatTime(item.windowStart)}–${formatTime(item.windowEnd)} window`;
    }
    return `${item.durationMin}–${item.durationMax} min`;
  }
  return `${formatTime(item.startsAt)}–${formatTime(item.endsAt)}`;
}

function formatSpan(item: CalendarItem) {
  if (!item.startsAt || !item.endsAt) return "";
  const start = new Date(item.startsAt);
  const end = new Date(new Date(item.endsAt).getTime() - 1);
  if (dateKey(start) === dateKey(end)) {
    return formatDate(start, { month: "short", day: "numeric" });
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatDate(start, { month: "short", day: "numeric" })} – ${formatDate(end, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  })}`;
}

function formatDurationLabel(item: CalendarItem) {
  const minutes = durationMinutes(item);
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} min`;
}

function itemWithDuration(item: CalendarItem, minutes: number) {
  if (!item.startsAt) return item;
  const safeMinutes = Math.max(5, minutes);
  return {
    ...item,
    endsAt: new Date(
      new Date(item.startsAt).getTime() + safeMinutes * 60_000,
    ).toISOString(),
    durationMin: safeMinutes,
    durationMax: safeMinutes,
  };
}

function toggleAllDayItem(item: CalendarItem) {
  const start = item.startsAt ? new Date(item.startsAt) : new Date();
  if (isAllDayItem(item)) {
    start.setHours(9, 0, 0, 0);
    return {
      ...item,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 60 * 60_000).toISOString(),
      durationMin: 60,
      durationMax: 60,
    };
  }
  const days = Math.max(1, Math.ceil(durationMinutes(item) / (24 * 60)));
  start.setHours(0, 0, 0, 0);
  return {
    ...item,
    startsAt: start.toISOString(),
    endsAt: addDays(start, days).toISOString(),
    durationMin: days * 24 * 60,
    durationMax: days * 24 * 60,
    status: "scheduled" as const,
  };
}

function formatProposalTiming(item: CalendarItem) {
  if (!item.startsAt) return formatRange(item);
  return `${formatDate(new Date(item.startsAt), {
    weekday: "short",
    day: "numeric",
    month: "short",
  })} · ${formatRange(item)}`;
}

function urgencyClass(item: CalendarItem) {
  if (!item.deadline || item.status === "completed") return "";
  const remaining = new Date(item.deadline).getTime() - Date.now();
  if (remaining <= 24 * 60 * 60_000) return "deadline-imminent";
  if (remaining <= 72 * 60 * 60_000) return "deadline-near";
  return "";
}

function parsedCommand(command: string) {
  const clean = command.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const action = lower.startsWith("move")
    ? "Move"
    : lower.startsWith("block")
      ? "Block"
      : lower.startsWith("filter")
        ? "Filter"
        : /delete|remove/.test(lower)
          ? "Remove"
          : "Create";
  const timing =
    clean.match(
      /\b(today|tomorrow|tonight|this (?:morning|afternoon|evening)|next \w+|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b[^,]*/i,
    )?.[0] ?? null;
  const shift =
    clean.match(
      /\b(?:one|\d+)\s+(?:hour|hours|minute|minutes)\s+later\b/i,
    )?.[0] ??
    clean.match(/\b\d+\s*(?:–|-|to)\s*\d+\s*min\b/i)?.[0] ??
    clean.match(/\b~?\d+\s*(?:min|minutes|hour|hours)\b/i)?.[0] ??
    null;
  const subject = clean
    .replace(/^(move|block|create|add|schedule|filter|delete|remove)\s+/i, "")
    .replace(timing ?? "", "")
    .replace(shift ?? "", "")
    .replace(/\b(?:at|for|sometime|after|before|on|by)\b\s*$/i, "")
    .trim()
    .replace(/[,.]+$/, "");
  return {
    action,
    subject: subject || "calendar item",
    timing,
    shift,
  };
}

function transitionState(update: () => void) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    document.startViewTransition(update);
    return;
  }
  update();
}

function isCommandResponse(value: unknown): value is CommandResponse {
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

function isExtractionResponse(value: unknown): value is ExtractionResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.items) &&
    candidate.items.every((item) => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Record<string, unknown>;
      return (
        typeof entry.title === "string" &&
        ["event", "task", "intention"].includes(String(entry.kind)) &&
        typeof entry.evidence === "string"
      );
    })
  );
}

function documentMediaType(file: File) {
  if (file.type) return file.type;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "heic" || extension === "heif") return "image/heic";
  if (extension === "pdf") return "application/pdf";
  if (extension === "csv") return "text/csv";
  if (extension === "txt") return "text/plain";
  return "application/octet-stream";
}

function isDeeperResponse(
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
        ["why", "connection", "harder_problem", "application", "edge_case", "teacher_question", "understanding_check", "further_reading"].includes(String(entry.kind)) &&
        typeof entry.title === "string" &&
        typeof entry.prompt === "string" &&
        typeof entry.whyUseful === "string"
      );
    })
  );
}

function isBlockPolishResponse(
  value: unknown,
): value is { suggestions: Array<Pick<BlockSuggestion, "id" | "category" | "title" | "description" | "reason">> } {
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
        ["recovery", "responsibility", "meaningful"].includes(String(entry.category)) &&
        typeof entry.title === "string" &&
        typeof entry.description === "string" &&
        (entry.reason === null || typeof entry.reason === "string")
      );
    })
  );
}

function commandItem(item: CalendarItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    durationMin: item.durationMin,
    durationMax: item.durationMax,
    deadline: item.deadline,
    windowStart: item.windowStart,
    windowEnd: item.windowEnd,
    energyType: item.energyType,
    priority: item.priority,
    splittable: item.splittable,
    flexibility: item.flexibility,
    constraints: item.constraints,
    assignmentId: item.assignmentId,
    homeworkCaptureId: item.homeworkCaptureId,
    taskContext: item.taskContext,
    computerRequired: item.computerRequired,
    status: item.status,
  };
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function initials(value?: string | null) {
  if (!value) return <UserRound size={16} />;
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function normalizeItemTiming(item: CalendarItem): CalendarItem {
  if (item.status !== "scheduled" || !item.startsAt) return item;
  const start = new Date(item.startsAt);
  if (!Number.isFinite(start.getTime())) return item;
  const end = item.endsAt ? new Date(item.endsAt) : null;
  if (end && Number.isFinite(end.getTime()) && end > start) return item;
  return {
    ...item,
    endsAt: new Date(
      start.getTime() + Math.max(5, item.durationMin) * 60_000,
    ).toISOString(),
  };
}

function syncErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    const message =
      typeof candidate.message === "string" ? candidate.message : "";
    const hint = typeof candidate.hint === "string" ? candidate.hint : "";
    const details =
      typeof candidate.details === "string" ? candidate.details : "";
    return [message, hint || details].filter(Boolean).join(" ") || "Sync failed";
  }
  return "Sync failed";
}

function safeMutationPayload(mutation: PendingMutation) {
  if (mutation.table !== "calendar_items" || !mutation.payload) {
    return mutation.payload;
  }
  const payload = { ...mutation.payload };
  const start =
    typeof payload.starts_at === "string" ? new Date(payload.starts_at) : null;
  const end =
    typeof payload.ends_at === "string" ? new Date(payload.ends_at) : null;
  const validStart = start && Number.isFinite(start.getTime());
  const validEnd = end && Number.isFinite(end.getTime());

  if (validStart && (!validEnd || end <= start)) {
    const minutes = Math.max(5, Number(payload.duration_min ?? 30));
    payload.ends_at = new Date(start.getTime() + minutes * 60_000).toISOString();
  } else if (!validStart && validEnd) {
    payload.starts_at = null;
    payload.ends_at = null;
    if (payload.status === "scheduled") payload.status = "inbox";
  } else if (!validStart && !validEnd && payload.status === "scheduled") {
    payload.status = "inbox";
  }

  const windowStart =
    typeof payload.window_start === "string"
      ? new Date(payload.window_start)
      : null;
  const windowEnd =
    typeof payload.window_end === "string" ? new Date(payload.window_end) : null;
  if (
    (windowStart && !Number.isFinite(windowStart.getTime())) ||
    (windowEnd && !Number.isFinite(windowEnd.getTime())) ||
    Boolean(windowStart) !== Boolean(windowEnd) ||
    (windowStart && windowEnd && windowEnd <= windowStart)
  ) {
    payload.window_start = null;
    payload.window_end = null;
  }
  return payload;
}

function rowToItem(row: Record<string, unknown>): CalendarItem {
  return normalizeItemTiming(
    makeItem({
      id: String(row.id),
      kind: row.kind as ItemKind,
      title: String(row.title),
      description: String(row.description ?? ""),
      room: String(row.room ?? ""),
      startsAt: (row.starts_at as string | null) ?? null,
      endsAt: (row.ends_at as string | null) ?? null,
      durationMin: Number(row.duration_min ?? 30),
      durationMax: Number(row.duration_max ?? 30),
      deadline: (row.deadline as string | null) ?? null,
      windowStart: (row.window_start as string | null) ?? null,
      windowEnd: (row.window_end as string | null) ?? null,
      energyType: row.energy_type as EnergyType,
      priority: row.priority as Priority,
      splittable: Boolean(row.splittable),
      flexibility: row.flexibility as Flexibility,
      constraints: Array.isArray(row.constraints)
        ? row.constraints.filter(
            (constraint): constraint is string =>
              typeof constraint === "string",
          )
        : [],
      assignmentId: (row.assignment_id as string | null) ?? null,
      assessmentId: (row.assessment_id as string | null) ?? null,
      intentionId: (row.intention_id as string | null) ?? null,
      subjectId: (row.subject_id as string | null) ?? null,
      revisionStage: (row.revision_stage as string | null) ?? null,
      reviewOffsetDays:
        row.review_offset_days === null || row.review_offset_days === undefined
          ? null
          : Number(row.review_offset_days),
      learnedAt: (row.learned_at as string | null) ?? null,
      homeworkCaptureId: (row.homework_capture_id as string | null) ?? null,
      taskContext: (row.task_context as TaskContext) ?? "anywhere",
      computerRequired: Boolean(row.computer_required),
      workType: (row.work_type as CalendarItem["workType"]) ?? null,
      requiredEnergy:
        (row.required_energy as CalendarItem["requiredEnergy"]) ?? "medium",
      status: row.status as CalendarItem["status"],
      source: row.source as CalendarItem["source"],
      createdAt: String(row.created_at),
      syncStatus: "synced",
    }),
  );
}

function simpleFallbackProposal(command: string): CalendarProposal {
  const lower = command.toLowerCase();
  const kind: ItemKind = lower.includes("event")
    ? "event"
    : lower.includes("intention") || lower.includes("want to")
      ? "intention"
      : "task";
  const durationMatch = lower.match(/(?:~|about\s*)?(\d+)\s*(?:min|minute)/);
  const duration = durationMatch ? Number(durationMatch[1]) : 30;
  const item = makeItem({
    kind,
    title: command.replace(/^(add|create|new)\s+/i, "").trim(),
    durationMin: Math.max(5, duration),
    durationMax: lower.includes("~") ? Math.max(10, duration + 15) : duration,
    flexibility: flexibilityForNewItem({ kind }),
    energyType: /study|essay|revision|exam|test/i.test(command)
      ? "deep_focus"
      : "light_work",
    source: "command",
  });
  return {
    id: crypto.randomUUID(),
    title: `Create ${kindLabels[kind].toLowerCase()}`,
    summary: "A local proposal was created because AI planning is unavailable.",
    source: "command",
    changes: [
      {
        id: crypto.randomUUID(),
        type: "create",
        itemId: null,
        reason: "Created from your command.",
        before: null,
        after: item,
      },
    ],
  };
}

function isAttentionQuestion(command: string) {
  return /(?:what should i|what do i|give me something useful|work on tonight|do (?:right )?now)/i.test(command);
}

function intentionFromCommand(command: string): Partial<Intention> | null {
  const repeated = /(?:every day|daily|every week|weekly|consistently|roughly .+ per day|(?:^|\bi\s+)(?:want to\s+)?(?:understand|get better|improve|read|work on|start studying|study consistently))/i.test(command);
  if (!repeated) return null;
  const duration = command.match(/(\d+)\s*(?:minutes?|mins?)/i);
  const hour = command.match(/(?:an?|one|1)\s*hours?/i);
  return {
    title: command.replace(/^i want to\s+/i, "").replace(/[.]$/, ""),
    cadence: /every day|daily|per day/i.test(command) ? "daily" : /every week|weekly/i.test(command) ? "weekly" : "flexible",
    targetSessions: /every day|daily|per day/i.test(command) ? 5 : 1,
    targetMinutes: duration ? Number(duration[1]) : hour ? 60 : 60,
    preferredSessionMinutes: duration ? Number(duration[1]) : hour ? 60 : 30,
  };
}

function proposalFromCommandResponse(
  raw: {
    title: string;
    summary: string;
    changes: Array<{
      type: "create" | "update" | "delete";
      itemId: string | null;
      reason: string;
      after: Partial<CalendarItem> | null;
    }>;
  },
  current: CalendarItem[],
): CalendarProposal {
  const changes: ProposalChange[] = raw.changes.map((change) => {
    const before = change.itemId
      ? (current.find((item) => item.id === change.itemId) ?? null)
      : null;
    let after: CalendarItem | null = null;
    if (change.type !== "delete" && change.after) {
      const merged = { ...(before ?? {}), ...change.after };
      const inferredDuration =
        !before && merged.startsAt && merged.endsAt
          ? Math.max(
              5,
              Math.round(
                (new Date(merged.endsAt).getTime() -
                  new Date(merged.startsAt).getTime()) /
                  60_000,
              ),
            )
          : undefined;
      const durationMin =
        change.after.durationMin ??
        before?.durationMin ??
        inferredDuration ??
        30;
      const kind = change.after.kind ?? before?.kind ?? "task";
      after = normalizeItemTiming(
        makeItem({
          ...merged,
          id: before?.id ?? crypto.randomUUID(),
          title: change.after.title ?? before?.title ?? "Untitled",
          kind,
          flexibility: before
            ? merged.flexibility
            : flexibilityForNewItem({
                kind,
                flexibility: merged.flexibility,
                constraints: merged.constraints,
              }),
          durationMin,
          durationMax:
            change.after.durationMax ?? before?.durationMax ?? durationMin,
          source: "command",
          syncStatus: "pending",
        }),
      );
    }
    return {
      id: crypto.randomUUID(),
      type: change.type,
      itemId: before?.id ?? null,
      reason: change.reason,
      before,
      after,
    };
  });
  return {
    id: crypto.randomUUID(),
    title: raw.title,
    summary: raw.summary,
    changes,
    source: "command",
  };
}

function restoreProposal(
  entry: HistoryEntry,
  current: CalendarItem[],
): CalendarProposal {
  const currentMap = new Map(current.map((item) => [item.id, item]));
  const historicalMap = new Map(entry.items.map((item) => [item.id, item]));
  const ids = new Set([...currentMap.keys(), ...historicalMap.keys()]);
  const changes: ProposalChange[] = [];
  ids.forEach((id) => {
    const before = currentMap.get(id) ?? null;
    const after = historicalMap.get(id) ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    changes.push({
      id: crypto.randomUUID(),
      type:
        before && !after ? "delete" : !before && after ? "create" : "update",
      itemId: before?.id ?? null,
      reason: `Restore the state from ${formatDate(new Date(entry.createdAt), {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}.`,
      before,
      after: after ? { ...after, syncStatus: "pending" } : null,
    });
  });
  return {
    id: crypto.randomUUID(),
    title: `Restore “${entry.label}”`,
    summary: `${changes.length} calendar change${
      changes.length === 1 ? "" : "s"
    } will be previewed before restoring.`,
    source: "command",
    changes,
  };
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classExceptions, setClassExceptions] = useState<ClassException[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [learningSignals, setLearningSignals] = useState<LearningSignal[]>([]);
  const [explorations, setExplorations] = useState<Exploration[]>([]);
  const [blockChoices, setBlockChoices] = useState<BlockChoice[]>([]);
  const [homeworkCaptures, setHomeworkCaptures] = useState<HomeworkCapture[]>(
    [],
  );
  const [schoolDaySettings, setSchoolDaySettings] = useState<SchoolDaySettings>(
    DEFAULT_SCHOOL_DAY_SETTINGS,
  );
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("upcoming");
  const [anchorDate, setAnchorDate] = useState(() => dateKey(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [commandText, setCommandText] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [timetableImportBusy, setTimetableImportBusy] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [proposal, setProposal] = useState<CalendarProposal | null>(null);
  const [timetableSubjectProposal, setTimetableSubjectProposal] = useState<{
    proposalId: string;
    subjects: Subject[];
    reviewed: boolean;
  } | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [draftItem, setDraftItem] = useState<CalendarItem | null>(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [homeworkOpen, setHomeworkOpen] = useState(false);
  const [intentionsOpen, setIntentionsOpen] = useState(false);
  const [intentionSeed, setIntentionSeed] = useState<Partial<Intention> | null>(null);
  const [deeperSource, setDeeperSource] = useState<LearningSource | null>(null);
  const [deeperExploration, setDeeperExploration] = useState<Exploration | null>(null);
  const [deeperBusy, setDeeperBusy] = useState(false);
  const [deeperError, setDeeperError] = useState("");
  const [hudOpen, setHudOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragSnap, setDragSnap] = useState<{
    day: string;
    hour: number;
    minute: number;
  } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [authSent, setAuthSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [nowOpen, setNowOpen] = useState(false);
  const [nowMoment, setNowMoment] = useState<string | null>(null);
  const [nowLocation, setNowLocation] = useState<CurrentStudyLocation>("home");
  const [nowEnergy, setNowEnergy] = useState<EnergyRequirement>("medium");
  const [nowComputerAvailable, setNowComputerAvailable] = useState(true);
  const [clockNow, setClockNow] = useState(() => new Date(0));
  const [resizing, setResizing] = useState<{
    id: string;
    minutes: number;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeGestureActive = useRef(false);
  const polishedBlocksRef = useRef(new Set<string>());
  const calendarSwipeStartRef = useRef<SwipePoint | null>(null);
  const calendarSwipeLastRef = useRef<SwipePoint | null>(null);
  const suppressSwipeClickUntilRef = useRef(0);
  const weekWheelRef = useRef({ totalX: 0, lastAt: 0, lockedUntil: 0 });
  const writeRevisionRef = useRef(0);

  const flushPending = useCallback(async (ownerKey: string) => {
    const queued = await getPendingMutations(ownerKey);
    const { mutations: pending, supersededIds } =
      compactPendingMutations(queued);
    await Promise.all(supersededIds.map(removePendingMutation));
    const failures: string[] = [];
    for (const mutation of pending) {
      try {
        let query;
        const prepared = prepareMutation(mutation, ownerKey);
        const payload = safeMutationPayload(prepared);
        if (mutation.action === "insert") query = supabase.from(mutation.table).insert(payload ?? {});
        else if (mutation.action === "upsert") query = supabase.from(mutation.table).upsert(payload ?? {}, { onConflict: prepared.onConflict });
        else if (mutation.action === "update") query = supabase.from(mutation.table).update(payload ?? {}).eq("id", mutation.recordId);
        else query = supabase.from(mutation.table).delete().eq("id", mutation.recordId);
        const { error } = await query;
        if (error) throw new Error(syncErrorMessage(error));
        if (mutation.id !== undefined) await removePendingMutation(mutation.id);
      } catch (error) {
        const message = syncErrorMessage(error);
        failures.push(message);
        await updatePendingMutation({
          ...mutation,
          ownerKey,
          failureCount: (mutation.failureCount ?? 0) + 1,
          lastError: message,
        });
      }
    }
    return failures;
  }, [supabase]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    const timeout = window.setTimeout(() => {
      setInviteToken(token);
      setAccountOpen(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const loadCloud = useCallback(
    async (activeUser: User) => {
      const writeRevisionAtStart = writeRevisionRef.current;
      setSyncing(true);
      const [
        itemResult,
        historyResult,
        subjectResult,
        classResult,
        exceptionResult,
        assignmentResult,
        assessmentResult,
        homeworkResult,
        intentionResult,
        signalResult,
        explorationResult,
        blockChoiceResult,
        profileResult,
      ] = await Promise.all([
        supabase
          .from("calendar_items")
          .select("*")
          .eq("user_id", activeUser.id)
          .neq("status", "archived")
          .order("created_at"),
        supabase
          .from("calendar_history")
          .select("id,label,snapshot,created_at")
          .eq("user_id", activeUser.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("subjects")
          .select("*")
          .eq("user_id", activeUser.id)
          .order("name"),
        supabase
          .from("classes")
          .select("*")
          .eq("user_id", activeUser.id)
          .order("weekday")
          .order("start_time"),
        supabase
          .from("class_exceptions")
          .select("*")
          .eq("user_id", activeUser.id)
          .order("occurrence_date"),
        supabase
          .from("assignments")
          .select("*")
          .eq("user_id", activeUser.id)
          .neq("status", "archived")
          .order("due_at"),
        supabase
          .from("assessments")
          .select("*")
          .eq("user_id", activeUser.id)
          .order("scheduled_at"),
        supabase
          .from("homework_captures")
          .select("*")
          .eq("user_id", activeUser.id)
          .neq("status", "archived")
          .order("created_at", { ascending: false }),
        supabase
          .from("intentions")
          .select("*")
          .eq("user_id", activeUser.id)
          .neq("status", "archived")
          .order("created_at"),
        supabase
          .from("learning_signals")
          .select("*")
          .eq("user_id", activeUser.id)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("explorations")
          .select("*")
          .eq("user_id", activeUser.id)
          .neq("status", "dismissed")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("time_block_choices")
          .select("*")
          .eq("user_id", activeUser.id)
          .gte("starts_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
          .order("starts_at", { ascending: false })
          .limit(150),
        supabase
          .from("profiles")
          .select("*")
          .eq("id", activeUser.id)
          .maybeSingle(),
      ]);
      const error =
        itemResult.error ??
        historyResult.error ??
        subjectResult.error ??
        classResult.error ??
        exceptionResult.error ??
        assignmentResult.error ??
        assessmentResult.error ??
        homeworkResult.error ??
        intentionResult.error ??
        signalResult.error ??
        explorationResult.error ??
        blockChoiceResult.error ??
        profileResult.error;
      if (error) {
        setSyncing(false);
        throw error;
      }
      // A local edit made while this snapshot was loading is newer than the
      // snapshot. Realtime (or the focus retry) will request a fresh one.
      if (writeRevisionAtStart !== writeRevisionRef.current) {
        setSyncing(false);
        return;
      }
      setItems(
        (itemResult.data ?? []).map((row) =>
          rowToItem(row as Record<string, unknown>),
        ),
      );
      setHistory(
        (historyResult.data ?? []).map((entry) => ({
          id: String(entry.id),
          label: entry.label,
          items: Array.isArray(entry.snapshot)
            ? (entry.snapshot as CalendarItem[])
            : [],
          createdAt: entry.created_at,
        })),
      );
      setSubjects(
        (subjectResult.data ?? []).map((row) =>
          rowToSubject(row as Record<string, unknown>),
        ),
      );
      setClasses(
        (classResult.data ?? []).map((row) =>
          rowToClass(row as Record<string, unknown>),
        ),
      );
      setClassExceptions(
        (exceptionResult.data ?? []).map((row) =>
          rowToClassException(row as Record<string, unknown>),
        ),
      );
      setAssignments(
        (assignmentResult.data ?? []).map((row) =>
          rowToAssignment(row as Record<string, unknown>),
        ),
      );
      setAssessments(
        (assessmentResult.data ?? []).map((row) =>
          rowToAssessment(row as Record<string, unknown>),
        ),
      );
      setHomeworkCaptures(
        (homeworkResult.data ?? []).map((row) =>
          rowToHomeworkCapture(row as Record<string, unknown>),
        ),
      );
      setIntentions(
        (intentionResult.data ?? []).map((row) =>
          rowToIntention(row as Record<string, unknown>),
        ),
      );
      setLearningSignals(
        (signalResult.data ?? []).map((row) =>
          rowToLearningSignal(row as Record<string, unknown>),
        ),
      );
      setExplorations(
        (explorationResult.data ?? []).map((row) =>
          rowToExploration(row as Record<string, unknown>),
        ),
      );
      setBlockChoices(
        (blockChoiceResult.data ?? []).map((row) =>
          rowToBlockChoice(row as Record<string, unknown>),
        ),
      );
      setSchoolDaySettings(
        rowToSchoolDaySettings(
          profileResult.data as Record<string, unknown> | null,
        ),
      );
      setSyncing(false);
    },
    [supabase],
  );

  useEffect(() => {
    const updateClock = () => setClockNow(new Date());
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateNetwork = () => setIsOnline(navigator.onLine);
    const compactQuery = window.matchMedia("(max-width: 780px)");
    const updateCompact = () => setIsCompact(compactQuery.matches);
    updateNetwork();
    updateCompact();
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    compactQuery.addEventListener("change", updateCompact);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
      compactQuery.removeEventListener("change", updateCompact);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getOfflineState()
      .then((stored) => {
        if (!alive || !stored) return;
        setItems(
          stored.items.map((item) => normalizeItemTiming(makeItem(item))),
        );
        setHistory(stored.history);
        setSubjects(stored.subjects ?? []);
        setClasses(stored.classes ?? []);
        setClassExceptions(stored.classExceptions ?? []);
        setAssignments((stored.assignments ?? []).map(normalizeAssignment));
        setAssessments((stored.assessments ?? []).map(normalizeAssessment));
        setIntentions(stored.intentions ?? []);
        setLearningSignals(stored.learningSignals ?? []);
        setExplorations(stored.explorations ?? []);
        setBlockChoices(stored.blockChoices ?? []);
        setHomeworkCaptures(stored.homeworkCaptures ?? []);
        setSchoolDaySettings(
          normalizeSchoolDaySettings(
            stored.schoolDaySettings ?? DEFAULT_SCHOOL_DAY_SETTINGS,
          ),
        );
      })
      .finally(() => {
        if (alive) setHydrated(true);
      });
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setUser(data.session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setAccountOpen(false);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!hydrated) return;
    saveOfflineState({
      items,
      history,
      subjects,
      classes,
      classExceptions,
      assignments,
      assessments,
      intentions,
      learningSignals,
      explorations,
      blockChoices,
      homeworkCaptures,
      schoolDaySettings,
      ownerKey: user?.id ?? "local",
    }).catch(() => undefined);
  }, [
    assessments,
    assignments,
    blockChoices,
    classExceptions,
    classes,
    history,
    homeworkCaptures,
    hydrated,
    intentions,
    learningSignals,
    explorations,
    items,
    schoolDaySettings,
    subjects,
    user,
  ]);

  useEffect(() => {
    if (!hydrated || !isOnline || !user) return;
    let cancelled = false;
    flushPending(user.id)
      .then((failures) => {
        if (cancelled) return;
        if (failures.length) {
          setNotice(`${failures.length} change${failures.length === 1 ? " is" : "s are"} waiting to sync. Retrying automatically.`);
          setSyncing(false);
          return;
        }
        return loadCloud(user);
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(
            `Cloud sync will retry automatically: ${syncErrorMessage(error)}`,
          );
          setSyncing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [flushPending, hydrated, isOnline, loadCloud, syncTick, user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    const requestSync = () => {
      if (navigator.onLine) setSyncTick((current) => current + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") requestSync();
    };
    const timer = window.setInterval(requestSync, 15_000);
    window.addEventListener("focus", requestSync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", requestSync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrated, user]);

  useEffect(() => {
    if (!hydrated || !isOnline || !user) return;
    let refreshTimer: number | undefined;
    const channel = supabase
      .channel(`device-sync:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => {
          window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(
            () => setSyncTick((current) => current + 1),
            250,
          );
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(
            () => setSyncTick((current) => current + 1),
            1_000,
          );
        }
      });
    return () => {
      window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [hydrated, isOnline, supabase, user]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        setPaletteMode("command");
        setHomeworkOpen(false);
        setIntentionsOpen(false);
        setIntentionSeed(null);
        setDeeperSource(null);
        setDeeperExploration(null);
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setPaletteOpen(false);
        setHomeworkOpen(true);
        setInboxOpen(false);
        setHudOpen(false);
      }
      if (
        modifier &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey &&
        !paletteOpen
      ) {
        event.preventDefault();
        undoLast();
      }
      if (event.key === "Escape") {
        setNowOpen(false);
        setPaletteOpen(false);
        setProposal(null);
        setTimetableSubjectProposal(null);
        setSelectedItem(null);
        setDraftItem(null);
        setIsCreatingItem(false);
        setHomeworkOpen(false);
        setIntentionsOpen(false);
        setIntentionSeed(null);
        setMobileMenuOpen(false);
        setMobileCreateOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const persistMutation = useCallback(async (mutation: PendingMutation) => {
    writeRevisionRef.current += 1;
    const scopedMutation = { ...mutation, ownerKey: user?.id ?? "local" };
    if (user && isOnline) {
      setSyncing(true);
      let query;
      const prepared = prepareMutation(scopedMutation, user.id);
      const payload = safeMutationPayload(prepared);
      if (prepared.action === "insert") {
        query = supabase.from(prepared.table).insert(payload ?? {});
      } else if (prepared.action === "upsert") {
        query = supabase
          .from(prepared.table)
          .upsert(payload ?? {}, { onConflict: prepared.onConflict });
      } else if (prepared.action === "update") {
        query = supabase
          .from(prepared.table)
          .update(payload ?? {})
          .eq("id", prepared.recordId);
      } else {
        query = supabase
          .from(prepared.table)
          .delete()
          .eq("id", prepared.recordId);
      }
      const { error } = await query;
      setSyncing(false);
      if (!error) return true;
    }
    await queueMutation(scopedMutation);
    setSyncing(false);
    return false;
  }, [isOnline, supabase, user]);

  function recordHistory(label: string, snapshot = items) {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      label,
      items: structuredClone(snapshot),
      createdAt: new Date().toISOString(),
    };
    setHistory((current) => [entry, ...current].slice(0, 50));
    setUndoStack((current) => [entry, ...current].slice(0, 50));
    persistMutation({
      table: "calendar_history",
      action: "insert",
      recordId: entry.id,
      payload: { label: entry.label, snapshot: entry.items },
    }).catch(() => undefined);
  }

  function undoLast() {
    const latest = undoStack[0];
    if (!latest) {
      setNotice("Nothing to undo yet.");
      return;
    }
    const current = items;
    transitionState(() =>
      setItems(
        latest.items.map((item) => ({ ...item, syncStatus: "pending" })),
      ),
    );
    setUndoStack((stack) => stack.slice(1));
    syncSnapshotDiff(current, latest.items);
    setNotice(`Undid: ${latest.label}`);
  }

  function syncSnapshotDiff(before: CalendarItem[], after: CalendarItem[]) {
    const beforeMap = new Map(before.map((item) => [item.id, item]));
    const afterMap = new Map(after.map((item) => [item.id, item]));
    beforeMap.forEach((_item, id) => {
      if (!afterMap.has(id)) {
        persistMutation({
          table: "calendar_items",
          action: "delete",
          recordId: id,
        }).catch(() => undefined);
      }
    });
    afterMap.forEach((item) => {
      persistMutation({
        table: "calendar_items",
        action: "upsert",
        recordId: item.id,
        payload: itemToRow(item),
      }).catch(() => undefined);
    });
  }

  function updateItem(item: CalendarItem, label: string) {
    recordHistory(label);
    const pending = { ...item, syncStatus: "pending" as const };
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === pending.id ? pending : candidate,
      ),
    );
    persistMutation({
      table: "calendar_items",
      action: "upsert",
      recordId: item.id,
      payload: itemToRow(item),
    })
      .then((synced) => {
        if (!synced) return;
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, syncStatus: "synced" }
              : candidate,
          ),
        );
      })
      .catch(() => undefined);
  }

  function createItem(item: CalendarItem) {
    recordHistory(`Create “${item.title}”`);
    const pending = { ...item, syncStatus: "pending" as const };
    setItems((current) => [...current, pending]);
    return persistMutation({
      table: "calendar_items",
      action: "upsert",
      recordId: item.id,
      payload: itemToRow(item),
    })
      .then((synced) => {
        if (!synced) return;
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, syncStatus: "synced" }
              : candidate,
          ),
        );
      })
      .catch(() => undefined);
  }

  function deleteItem(item: CalendarItem) {
    recordHistory(`Delete “${item.title}”`);
    setItems((current) =>
      current.filter((candidate) => candidate.id !== item.id),
    );
    setSelectedItem(null);
    setDraftItem(null);
    persistMutation({
      table: "calendar_items",
      action: "delete",
      recordId: item.id,
    }).catch(() => undefined);
    setNotice(`Deleted “${item.title}”. Cmd+Z to undo.`);
  }

  function scheduleAt(itemId: string, day: string, hour: number, minute = 0) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item || item.flexibility === "fixed") return;
    const start = dateFromKey(day);
    start.setHours(hour, minute, 0, 0);
    const minutes = Math.max(item.durationMin, durationMinutes(item));
    const end = new Date(start.getTime() + minutes * 60_000);
    const validation = validatePlacement(
      item,
      start.toISOString(),
      end.toISOString(),
      items,
    );
    if (!validation.valid) {
      setNotice(validation.errors[0]);
      return;
    }
    transitionState(() =>
      updateItem(
        {
          ...item,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          status: "scheduled",
        },
        `Schedule “${item.title}”`,
      ),
    );
    setSelectedDay(day);
    if (validation.warnings.length) setNotice(validation.warnings[0]);
  }

  function unscheduleItem(itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item || item.flexibility === "fixed") return;
    transitionState(() =>
      updateItem(
        { ...item, startsAt: null, endsAt: null, status: "inbox" },
        `Unschedule “${item.title}”`,
      ),
    );
  }

  function onDragStart(event: DragEvent, item: CalendarItem) {
    if (resizeGestureActive.current || item.flexibility === "fixed") {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/calendar-item", item.id);
    event.dataTransfer.setData("text/plain", item.id);
    const transparentDragImage = document.createElement("span");
    transparentDragImage.style.cssText =
      "position:fixed;top:-10px;left:-10px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(transparentDragImage);
    event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    window.setTimeout(() => transparentDragImage.remove(), 0);
    setDraggingItemId(item.id);
    if (item.startsAt) {
      const start = new Date(item.startsAt);
      setDragSnap({
        day: dateKey(start),
        hour: start.getHours(),
        minute: start.getMinutes(),
      });
    }
  }

  function onCalendarDragOver(
    event: DragEvent,
    day: string,
    hour: number,
    minute: number,
  ) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragSnap({ day, hour, minute });
  }

  function onCalendarDrop(
    event: DragEvent,
    day: string,
    hour: number,
    minute: number,
  ) {
    event.preventDefault();
    const homeworkId = event.dataTransfer.getData("text/homework-capture");
    if (homeworkId) {
      scheduleHomework(homeworkId, day, hour, minute);
      setDraggingItemId(null);
      setDragSnap(null);
      return;
    }
    const itemId =
      event.dataTransfer.getData("text/calendar-item") ||
      event.dataTransfer.getData("text/plain");
    if (itemId) scheduleAt(itemId, day, hour, minute);
    setDraggingItemId(null);
    setDragSnap(null);
  }

  function onInboxDrop(event: DragEvent) {
    event.preventDefault();
    const itemId =
      event.dataTransfer.getData("text/calendar-item") ||
      event.dataTransfer.getData("text/plain");
    if (itemId) unscheduleItem(itemId);
    setDraggingItemId(null);
    setDragSnap(null);
  }

  function endDrag() {
    setDraggingItemId(null);
    setDragSnap(null);
  }

  function beginResize(
    event: ReactPointerEvent,
    item: CalendarItem,
    rowHeight: number,
    edge: "start" | "end",
  ) {
    event.preventDefault();
    event.stopPropagation();

    if (!item.startsAt || !item.endsAt) return;

    const calendarBlock =
      event.currentTarget.closest<HTMLElement>(".calendar-block");

    const wasDraggable = calendarBlock?.draggable ?? false;

    if (calendarBlock) {
      calendarBlock.draggable = false;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startY = event.clientY;
    const originalStart = new Date(item.startsAt);
    const originalEnd = new Date(item.endsAt);
    const original = durationMinutes(item);

    let nextMinutes = original;
    let nextStart = originalStart;
    let nextEnd = originalEnd;

    // Manual resizing shouldn't be restricted by the
    // scheduler's preferred duration range.
    const minimum = 15;
    const maximum = 525_600;

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      const deltaMinutes = ((moveEvent.clientY - startY) / rowHeight) * 60;

      nextMinutes =
        edge === "end"
          ? Math.round((original + deltaMinutes) / 15) * 15
          : Math.round((original - deltaMinutes) / 15) * 15;

      nextMinutes = Math.max(minimum, Math.min(maximum, nextMinutes));

      nextStart =
        edge === "start"
          ? new Date(originalEnd.getTime() - nextMinutes * 60_000)
          : originalStart;

      nextEnd =
        edge === "end"
          ? new Date(originalStart.getTime() + nextMinutes * 60_000)
          : originalEnd;

      setResizing({
        id: item.id,
        minutes: nextMinutes,
        startsAt: nextStart.toISOString(),
        endsAt: nextEnd.toISOString(),
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);

      if (calendarBlock) {
        calendarBlock.draggable = wasDraggable;
      }

      setResizing(null);

      if (nextMinutes === original) return;

      const resizedItem = withResizedDuration(item, nextMinutes);
      const validation = validatePlacement(
        resizedItem,
        nextStart.toISOString(),
        nextEnd.toISOString(),
        items,
        { allowFixedChange: true },
      );

      if (!validation.valid) {
        setNotice(validation.errors[0]);
        return;
      }

      updateItem(
        {
          ...resizedItem,
          startsAt: nextStart.toISOString(),
          endsAt: nextEnd.toISOString(),
        },
        `Resize “${item.title}”`,
      );
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  async function submitCommand(
    event: FormEvent,
    mode: PaletteMode = paletteMode,
  ) {
    event.preventDefault();
    const clean = commandText.trim();
    if (!clean) return;
    if (mode === "filter") {
      setFilterText(clean);
      setPaletteOpen(false);
      return;
    }
    const homework = parseHomework(clean, subjects, new Date());
    if (looksLikeHomeworkCommand(clean, homework)) {
      captureHomework(clean);
      setPaletteOpen(false);
      setCommandText("");
      return;
    }
    if (isAttentionQuestion(clean)) {
      setZoom("upcoming");
      setPaletteOpen(false);
      setCommandText("");
      setNotice("Your attention home has been refreshed for the time and energy you have now.");
      return;
    }
    const intentionDraft = intentionFromCommand(clean);
    if (intentionDraft) {
      setIntentionSeed(intentionDraft);
      setIntentionsOpen(true);
      setPaletteOpen(false);
      setCommandText("");
      return;
    }
    setCommandBusy(true);
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
          command: clean,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          items: relevantCommandItems(clean, items).map(commandItem),
        }),
      });
      if (!response.ok) throw new Error("AI command unavailable");
      const raw: unknown = await response.json();
      if (!isCommandResponse(raw)) {
        throw new Error("AI returned an invalid calendar proposal");
      }
      setProposal(proposalFromCommandResponse(raw, items));
    } catch {
      if (/^(?:add|create|schedule|new)\b/i.test(clean) && !/(?:move|delete|remove|cancel)\b/i.test(clean)) {
        setProposal(simpleFallbackProposal(clean));
      } else {
        setNotice(user ? "I couldn't interpret that safely. Try a more specific command." : "Sign in to use AI schedule changes. Local captures and intentions still work.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setCommandBusy(false);
      setPaletteOpen(false);
      setCommandText("");
    }
  }

  async function onDocumentSelected(
    file: File | null,
    options: {
      mode?: "calendar_document" | "school_timetable";
      weekStart?: string;
    } = {},
  ) {
    if (!file) return;
    const timetableMode = options.mode === "school_timetable";
    const mediaType = documentMediaType(file);
    if (timetableMode && !mediaType.startsWith("image/")) {
      setNotice("Choose an image screenshot for the weekly timetable import.");
      return;
    }
    if (file.size > 5_000_000) {
      setNotice("Choose a document smaller than 5 MB.");
      return;
    }
    if (timetableMode) setTimetableImportBusy(true);
    else setCommandBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) throw new Error("Sign in to use document extraction");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result);
          resolve(
            result.startsWith("data:;base64,")
              ? result.replace("data:;base64,", `data:${mediaType};base64,`)
              : result,
          );
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          mediaType,
          data,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          mode: options.mode ?? "calendar_document",
          weekStart: options.weekStart,
          subjects: timetableMode
            ? subjects.map((subject) => ({
                name: subject.name ?? "",
                shortName: subject.shortName ?? "",
                teacher: subject.teacher ?? "",
                room: subject.room ?? "",
              }))
            : [],
        }),
      });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          raw && typeof raw === "object" && "error" in raw &&
          typeof raw.error === "string"
            ? raw.error
            : "Extraction failed";
        throw new Error(message);
      }
      if (!isExtractionResponse(raw)) {
        throw new Error("AI returned an invalid document proposal");
      }
      if (timetableMode && options.weekStart) {
        const { lessons, newSubjects } = reconcileTimetableImport(
          raw.items,
          options.weekStart,
          subjects,
        );
        if (!lessons.length) {
          throw new Error("No exact lessons found in the selected week");
        }
        const previousWeek = items.filter(
          (item) =>
            isImportedTimetableItem(item) &&
            isItemInWeek(item, options.weekStart!),
        );
        const changes: ProposalChange[] = [
          ...previousWeek.map((item) => ({
            id: crypto.randomUUID(),
            type: "delete" as const,
            itemId: item.id,
            reason: "Replace the previous screenshot import for this week.",
            before: item,
            after: null,
          })),
          ...lessons.map(({ item, evidence }) => ({
            id: crypto.randomUUID(),
            type: "create" as const,
            itemId: null,
            reason: evidence,
            before: null,
            after: item,
          })),
        ];
        const proposalId = crypto.randomUUID();
        setProposal({
          id: proposalId,
          title: `Import ${lessons.length} timetable lesson${lessons.length === 1 ? "" : "s"}`,
          summary: `${previousWeek.length ? `Replace ${previousWeek.length} earlier imported lesson${previousWeek.length === 1 ? "" : "s"}. ` : ""}${newSubjects.length ? `Add ${newSubjects.length} new subject${newSubjects.length === 1 ? "" : "s"}; similar labels were matched to subjects you already have. ` : ""}This applies only to the week of ${options.weekStart}. Review everything before applying.`,
          source: "document",
          changes,
        });
        setTimetableSubjectProposal(
          newSubjects.length
            ? { proposalId, subjects: newSubjects, reviewed: false }
            : null,
        );
        setAnchorDate(options.weekStart);
        setSelectedDay(options.weekStart);
        setPaletteOpen(false);
        return;
      }
      const changes: ProposalChange[] = raw.items.map((candidate) => ({
        id: crypto.randomUUID(),
        type: "create",
        itemId: null,
        reason: candidate.evidence,
        before: null,
        after: makeItem({
          ...candidate,
          id: crypto.randomUUID(),
          flexibility: flexibilityForNewItem({
            kind: candidate.kind,
            flexibility: candidate.flexibility,
            constraints: candidate.constraints,
          }),
          source: "document",
          syncStatus: "pending",
        }),
      }));
      setProposal({
        id: crypto.randomUUID(),
        title: raw.title,
        summary: raw.summary,
        source: "document",
        changes,
      });
      setTimetableSubjectProposal(null);
      setPaletteOpen(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setNotice(
        timetableMode
          ? reason ||
              "I couldn’t find exact lessons in that screenshot. Check the selected week and try a clearer full timetable image."
          : "I couldn’t read that file. Try a clear image, text file, or PDF.",
      );
    } finally {
      if (timetableMode) setTimetableImportBusy(false);
      else setCommandBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function approveProposal() {
    if (!proposal) return;
    if (
      timetableSubjectProposal?.proposalId === proposal.id &&
      !timetableSubjectProposal.reviewed
    ) {
      setNotice("Review the detected subjects before applying the timetable.");
      return;
    }
    const validation = validateProposal(proposal, items);
    if (!validation.valid) {
      setNotice("This proposal failed deterministic scheduling checks.");
      return;
    }
    recordHistory(proposal.title);
    const next = applyProposal(proposal, items).map((item) => ({
      ...item,
      syncStatus: "pending" as const,
    }));
    transitionState(() => setItems(next));
    syncSnapshotDiff(items, next);
    const importedSubjects =
      timetableSubjectProposal?.proposalId === proposal.id
        ? timetableSubjectProposal.subjects
        : [];
    if (importedSubjects.length) {
      setSubjects((current) => [
        ...current.filter(
          (subject) =>
            !importedSubjects.some((candidate) => candidate.id === subject.id),
        ),
        ...importedSubjects,
      ]);
      importedSubjects.forEach((subject) => {
        persistMutation({
          table: "subjects",
          action: "upsert",
          recordId: subject.id,
          payload: subjectToRow(subject),
        }).catch(() => undefined);
      });
    }
    setProposal(null);
    setTimetableSubjectProposal(null);
    setNotice(
      `Applied: ${proposal.title}.${
        importedSubjects.length
          ? ` Added ${importedSubjects.length} subject${importedSubjects.length === 1 ? "" : "s"}.`
          : ""
      } Cmd+Z to undo calendar changes.`,
    );
  }

  function closeProposal() {
    setProposal(null);
    setTimetableSubjectProposal(null);
  }

  function updateTimetableSubject(
    subjectId: string,
    patch: Partial<Pick<Subject, "name" | "shortName" | "teacher" | "room" | "color">>,
  ) {
    const currentSubject = timetableSubjectProposal?.subjects.find(
      (subject) => subject.id === subjectId,
    );
    if (!currentSubject) return;
    if (patch.name !== undefined && patch.name !== currentSubject.name) {
      setProposal((current) =>
        current
          ? {
              ...current,
              changes: current.changes.map((change) =>
                change.after?.title === currentSubject.name
                  ? {
                      ...change,
                      after: { ...change.after, title: patch.name || currentSubject.name },
                    }
                  : change,
              ),
            }
          : current,
      );
    }
    setTimetableSubjectProposal((current) =>
      current
        ? {
            ...current,
            subjects: current.subjects.map((subject) =>
              subject.id === subjectId ? { ...subject, ...patch } : subject,
            ),
          }
        : current,
    );
  }

  function addTimetableSubject() {
    const subject: Subject = {
      id: crypto.randomUUID(),
      name: "",
      shortName: "",
      teacher: "",
      room: "",
      color: "#7f70e8",
      icon: "",
      createdAt: new Date().toISOString(),
    };
    setTimetableSubjectProposal((current) =>
      current
        ? { ...current, subjects: [...current.subjects, subject] }
        : current,
    );
  }

  function removeTimetableSubject(subjectId: string) {
    setTimetableSubjectProposal((current) =>
      current
        ? {
            ...current,
            subjects: current.subjects.filter((subject) => subject.id !== subjectId),
          }
        : current,
    );
  }

  function finishTimetableSubjectReview() {
    const pending = timetableSubjectProposal?.subjects ?? [];
    if (pending.some((subject) => !subject.name.trim() || !subject.shortName.trim())) {
      setNotice("Give every new subject a name and short name, or remove it.");
      return;
    }
    setProposal((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) => {
              const subject = pending.find(
                (candidate) => candidate.name === change.after?.title,
              );
              return subject && change.after
                ? {
                    ...change,
                    after: { ...change.after, title: subject.name.trim() },
                  }
                : change;
            }),
          }
        : current,
    );
    setTimetableSubjectProposal((current) =>
      current
        ? {
            ...current,
            reviewed: true,
            subjects: current.subjects.map((subject) => ({
              ...subject,
              name: subject.name.trim(),
              shortName: subject.shortName.trim().toUpperCase(),
              teacher: subject.teacher.trim(),
              room: subject.room.trim(),
            })),
          }
        : current,
    );
  }

  function openItem(item: CalendarItem) {
    const editableItem = structuredClone(item);
    if (isImportedTimetableItem(editableItem) && !editableItem.room) {
      editableItem.room = timetableRoomForItem(editableItem);
    }
    setIsCreatingItem(false);
    setSelectedItem(item);
    setDraftItem(editableItem);
  }

  function renameItem(item: CalendarItem, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === item.title) return;
    updateItem(
      { ...item, title: nextTitle },
      `Rename “${item.title}” to “${nextTitle}”`,
    );
    setNotice(`Renamed to “${nextTitle}”.`);
  }

  function openNewEvent(
    day = selectedDay,
    hour?: number,
    minute?: number,
    duration = 60,
  ) {
    const start = dateFromKey(day);
    if (hour === undefined) {
      const now = new Date();
      if (day === dateKey(now)) {
        const roundedMinutes = Math.ceil(now.getMinutes() / 30) * 30;
        start.setHours(
          now.getHours() + (roundedMinutes === 60 ? 1 : 0),
          roundedMinutes % 60,
          0,
          0,
        );
      } else {
        start.setHours(9, 0, 0, 0);
      }
    } else {
      start.setHours(hour, minute ?? 0, 0, 0);
    }
    const minutes = Math.max(15, duration);
    const end = new Date(start.getTime() + minutes * 60_000);
    const item = makeItem({
      kind: "event",
      title: "",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      durationMin: minutes,
      durationMax: minutes,
      status: "scheduled",
      flexibility: "flexible",
      source: "manual",
    });
    setSelectedDay(day);
    setIsCreatingItem(true);
    setSelectedItem(item);
    setDraftItem(structuredClone(item));
  }

  function openNewSpan(startDay: string, endDay: string) {
    const first = dateFromKey(startDay);
    const last = dateFromKey(endDay);
    const rangeStart = first <= last ? first : last;
    const rangeLast = first <= last ? last : first;
    rangeStart.setHours(0, 0, 0, 0);
    rangeLast.setHours(0, 0, 0, 0);
    const rangeEnd = addDays(rangeLast, 1);
    rangeEnd.setHours(0, 0, 0, 0);
    const duration = Math.max(
      24 * 60,
      Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 60_000),
    );
    const item = makeItem({
      kind: "event",
      title: "",
      startsAt: rangeStart.toISOString(),
      endsAt: rangeEnd.toISOString(),
      durationMin: duration,
      durationMax: duration,
      status: "scheduled",
      flexibility: "flexible",
      source: "manual",
    });
    setSelectedDay(dateKey(rangeStart));
    setIsCreatingItem(true);
    setSelectedItem(item);
    setDraftItem(structuredClone(item));
  }

  function openNewTask() {
    const item = makeItem({
      kind: "task",
      title: "",
      startsAt: null,
      endsAt: null,
      durationMin: 30,
      durationMax: 60,
      status: "inbox",
      flexibility: "flexible",
      source: "manual",
    });
    setIsCreatingItem(true);
    setSelectedItem(item);
    setDraftItem(structuredClone(item));
  }

  function saveSubject(subject: Subject) {
    setSubjects((current) => [
      ...current.filter((entry) => entry.id !== subject.id),
      subject,
    ]);
    persistMutation({
      table: "subjects",
      action: "upsert",
      recordId: subject.id,
      payload: subjectToRow(subject),
    }).catch(() => undefined);
    setNotice(`Saved ${subject.name}.`);
  }

  function deleteSubject(subject: Subject) {
    if (
      !window.confirm(
        `Delete ${subject.name}? Its timetable lessons will also be removed. Assignments and assessments will be kept without a subject.`,
      )
    ) {
      return;
    }
    const classIds = new Set(
      classes
        .filter((entry) => entry.subjectId === subject.id)
        .map((entry) => entry.id),
    );
    setSubjects((current) =>
      current.filter((entry) => entry.id !== subject.id),
    );
    setClasses((current) =>
      current.filter((entry) => entry.subjectId !== subject.id),
    );
    setClassExceptions((current) =>
      current.filter((entry) => !classIds.has(entry.classId)),
    );
    setAssignments((current) =>
      current.map((entry) =>
        entry.subjectId === subject.id ? { ...entry, subjectId: null } : entry,
      ),
    );
    setAssessments((current) =>
      current.map((entry) =>
        entry.subjectId === subject.id ? { ...entry, subjectId: null } : entry,
      ),
    );
    persistMutation({
      table: "subjects",
      action: "delete",
      recordId: subject.id,
    }).catch(() => undefined);
    setNotice(`Deleted ${subject.name}.`);
  }

  function saveClass(schoolClass: SchoolClass) {
    setClasses((current) => [
      ...current.filter((entry) => entry.id !== schoolClass.id),
      schoolClass,
    ]);
    persistMutation({
      table: "classes",
      action: "upsert",
      recordId: schoolClass.id,
      payload: classToRow(schoolClass),
    }).catch(() => undefined);
    setNotice("Timetable lesson saved.");
  }

  function saveSchoolDaySettings(settings: SchoolDaySettings) {
    setSchoolDaySettings(settings);
    if (user) {
      persistMutation({
        table: "profiles",
        action: "upsert",
        recordId: user.id,
        payload: {
          id: user.id,
          ...schoolDaySettingsToRow(settings),
        },
      }).catch(() => undefined);
      setNotice("School-day rules saved and ready to sync.");
    } else {
      setNotice("School-day rules saved offline. Sign in to sync them.");
    }
  }

  function deleteClass(schoolClass: SchoolClass) {
    if (!window.confirm("Delete this recurring lesson?")) return;
    setClasses((current) =>
      current.filter((entry) => entry.id !== schoolClass.id),
    );
    setClassExceptions((current) =>
      current.filter((entry) => entry.classId !== schoolClass.id),
    );
    persistMutation({
      table: "classes",
      action: "delete",
      recordId: schoolClass.id,
    }).catch(() => undefined);
    setNotice("Lesson deleted.");
  }

  function saveClassException(exception: ClassException) {
    setClassExceptions((current) => [
      ...current.filter((entry) => entry.id !== exception.id),
      exception,
    ]);
    persistMutation({
      table: "class_exceptions",
      action: "upsert",
      recordId: exception.id,
      payload: classExceptionToRow(exception),
    }).catch(() => undefined);
    setNotice(
      exception.status === "cancelled"
        ? "Lesson marked cancelled."
        : "Lesson rescheduled.",
    );
  }

  function deleteClassException(exception: ClassException) {
    setClassExceptions((current) =>
      current.filter((entry) => entry.id !== exception.id),
    );
    persistMutation({
      table: "class_exceptions",
      action: "delete",
      recordId: exception.id,
    }).catch(() => undefined);
    setNotice("Lesson change removed.");
  }

  function saveAssignment(assignment: Assignment) {
    const normalized = normalizeAssignment(assignment);
    setAssignments((current) => [
      ...current.filter((entry) => entry.id !== normalized.id),
      normalized,
    ]);
    const persistence = persistMutation({
      table: "assignments",
      action: "upsert",
      recordId: normalized.id,
      payload: assignmentToRow(normalized),
    }).catch(() => undefined);
    setNotice(`Saved ${normalized.title}.`);
    return persistence;
  }

  function previewAssignmentPlan(assignment: Assignment) {
    const result = planAssignment(assignment, items, new Date(), {
      classes,
      classExceptions,
      settings: schoolDaySettings,
      calendarItems: items,
    });
    if (!result.proposal) {
      const progress = assignmentProgress(assignment, items);
      setNotice(
        progress.remainingMinutes === 0
          ? "This assignment is already fully planned."
          : "No free time fits the assignment’s planning rules before its deadline.",
      );
      return;
    }
    const first = result.proposal.changes[0]?.after?.startsAt;
    if (first) {
      const date = new Date(first);
      setAnchorDate(dateKey(date));
      setSelectedDay(dateKey(date));
    }
    setZoom("week");
    setProposal(result.proposal);
  }

  function addAssignmentSession(assignment: Assignment) {
    const progress = assignmentProgress(assignment, items);
    const minutes = Math.max(
      5,
      Math.min(
        assignment.maxSessionMinutes,
        progress.remainingMinutes || assignment.minSessionMinutes,
      ),
    );
    const session = makeItem({
      kind: "task",
      title: `${assignment.title} · work session`,
      description: `Manual work session for ${assignment.title}`,
      durationMin: Math.min(assignment.minSessionMinutes, minutes),
      durationMax: Math.max(assignment.maxSessionMinutes, minutes),
      deadline: assignment.dueAt,
      energyType: energyTypeForWorkType(assignment.workType),
      priority: assignment.priority,
      flexibility: "elastic",
      constraints: [
        `Linked to ${assignment.title}`,
        `${assignment.allowedWindowStart}–${assignment.allowedWindowEnd}`,
      ],
      assignmentId: assignment.id,
      taskContext: assignment.taskContext,
      computerRequired: assignment.computerRequired,
      workType: assignment.workType,
      requiredEnergy: assignment.requiredEnergy,
      status: "inbox",
      source: "manual",
    });
    createItem(session);
    setNotice(
      "Work session added to the flexible inbox. Drag it onto the calendar.",
    );
  }

  function previewFreePeriodSession(
    assignment: Assignment,
    period: FreePeriod,
  ) {
    const minutes = Math.min(
      period.durationMinutes,
      assignment.maxSessionMinutes,
      Math.max(assignment.minSessionMinutes, 25),
    );
    const item = makeItem({
      kind: "task",
      title: `${assignment.title} · free period`,
      description: `School free-period work for ${assignment.title}`,
      startsAt: period.start.toISOString(),
      endsAt: new Date(period.start.getTime() + minutes * 60_000).toISOString(),
      durationMin: Math.min(assignment.minSessionMinutes, minutes),
      durationMax: Math.max(minutes, assignment.maxSessionMinutes),
      deadline: assignment.dueAt,
      windowStart: period.start.toISOString(),
      windowEnd: period.end.toISOString(),
      energyType: energyTypeForWorkType(assignment.workType),
      priority: assignment.priority,
      flexibility: "elastic",
      constraints: ["Verified school free period", "Context compatible"],
      assignmentId: assignment.id,
      taskContext: assignment.taskContext,
      computerRequired: assignment.computerRequired,
      workType: assignment.workType,
      requiredEnergy: assignment.requiredEnergy,
      status: "scheduled",
      source: "command",
    });
    setAnchorDate(dateKey(period.start));
    setSelectedDay(dateKey(period.start));
    setZoom("week");
    setProposal({
      id: crypto.randomUUID(),
      title: `Use free period for ${assignment.title}`,
      summary: `${minutes} minutes at school. Nothing changes until you apply this preview.`,
      source: "command",
      changes: [
        {
          id: crypto.randomUUID(),
          type: "create",
          itemId: null,
          reason: "Fits the verified gap and matches the task context.",
          before: null,
          after: item,
        },
      ],
    });
  }

  function toggleAssignmentSession(session: CalendarItem) {
    updateItem(
      {
        ...session,
        status:
          session.status === "completed"
            ? session.startsAt
              ? "scheduled"
              : "inbox"
            : "completed",
      },
      `${session.status === "completed" ? "Reopen" : "Complete"} “${session.title}”`,
    );
    setNotice(
      session.status === "completed"
        ? "Work session reopened."
        : session.intentionId
          ? "Work session completed. Intention progress updated."
          : "Work session completed. Assignment progress updated.",
    );
  }

  function deleteAssignment(assignment: Assignment) {
    if (!window.confirm(`Delete “${assignment.title}”?`)) return;
    setAssignments((current) =>
      current.filter((entry) => entry.id !== assignment.id),
    );
    persistMutation({
      table: "assignments",
      action: "delete",
      recordId: assignment.id,
    }).catch(() => undefined);
    setNotice(`Deleted ${assignment.title}.`);
  }

  function saveAssessment(assessment: Assessment) {
    const normalized = normalizeAssessment(assessment);
    setAssessments((current) => [
      ...current.filter((entry) => entry.id !== normalized.id),
      normalized,
    ]);
    persistMutation({
      table: "assessments",
      action: "upsert",
      recordId: normalized.id,
      payload: assessmentToRow(normalized),
    }).catch(() => undefined);
    setNotice(`Saved ${normalized.title}.`);
  }

  function previewRevisionRunway(assessment: Assessment) {
    const result = planRevisionRunway(assessment, items, new Date(), {
      classes,
      classExceptions,
      settings: schoolDaySettings,
      calendarItems: items,
    });
    if (!result.proposal) {
      setNotice(
        result.unscheduledMinutes === 0
          ? "This exam’s revision requirement is already fully planned."
          : "No free time fits the revision rules before this exam.",
      );
      return;
    }
    const first = result.proposal.changes[0]?.after?.startsAt;
    if (first) {
      const date = new Date(first);
      setAnchorDate(dateKey(date));
      setSelectedDay(dateKey(date));
    }
    setZoom("week");
    setProposal(result.proposal);
  }

  function markRevisionLearned(session: CalendarItem, assessment: Assessment) {
    const learnedAt = new Date();
    updateItem(
      {
        ...session,
        learnedAt: learnedAt.toISOString(),
        status: "completed",
      },
      `Learn “${session.revisionStage ?? session.title}”`,
    );
    const reviewProposal = planSpacedReviews(
      session,
      assessment,
      items.filter((item) => item.id !== session.id),
      learnedAt,
      {
        classes,
        classExceptions,
        settings: schoolDaySettings,
        calendarItems: items,
      },
    );
    if (reviewProposal) {
      setProposal(reviewProposal);
      setNotice("Material learned. Review sessions are ready to preview.");
    } else {
      setNotice(
        assessment.spacedRepetitionEnabled
          ? "Material learned. No review interval fits before the exam."
          : "Material learned. Enable spaced repetition on the exam to suggest reviews.",
      );
    }
  }

  function deleteAssessment(assessment: Assessment) {
    if (!window.confirm(`Delete “${assessment.title}”?`)) return;
    setAssessments((current) =>
      current.filter((entry) => entry.id !== assessment.id),
    );
    persistMutation({
      table: "assessments",
      action: "delete",
      recordId: assessment.id,
    }).catch(() => undefined);
    setNotice(`Deleted ${assessment.title}.`);
  }

  function saveHomeworkCapture(capture: HomeworkCapture) {
    setHomeworkCaptures((current) => [
      capture,
      ...current.filter((entry) => entry.id !== capture.id),
    ]);
    return persistMutation({
      table: "homework_captures",
      action: "upsert",
      recordId: capture.id,
      payload: homeworkCaptureToRow(capture),
    }).catch(() => undefined);
  }

  function captureHomework(
    rawText: string,
    overrides: {
      subjectId?: string | null;
      deadline?: string | null;
      estimatedMinutes?: number | null;
    } = {},
  ) {
    const parsed = parseHomework(
      rawText,
      subjects,
      new Date(),
      overrides.subjectId,
    );
    const capture: HomeworkCapture = {
      id: crypto.randomUUID(),
      rawText: parsed.rawText,
      title: parsed.title,
      subjectId: overrides.subjectId ?? parsed.subjectId,
      deadline: overrides.deadline ?? parsed.deadline,
      taskType: parsed.taskType,
      estimatedMinutes:
        overrides.estimatedMinutes ?? parsed.estimatedMinutes,
      status: "captured",
      convertedAssignmentId: null,
      scheduledCalendarItemId: null,
      parsedMeta: {
        confidence: parsed.confidence,
        matched: parsed.matched,
        parser: "local-v1",
      },
      createdAt: new Date().toISOString(),
    };
    saveHomeworkCapture(capture);
    setNotice(`Captured “${capture.title}”.`);
  }

  async function convertHomeworkToAssignment(capture: HomeworkCapture) {
    const remaining = capture.deadline
      ? new Date(capture.deadline).getTime() - Date.now()
      : Number.POSITIVE_INFINITY;
    const assignment: Assignment = {
      id: crypto.randomUUID(),
      subjectId: capture.subjectId,
      title: capture.title,
      dueAt: capture.deadline,
      estimatedMinutes: capture.estimatedMinutes,
      priority:
        remaining <= 24 * 60 * 60_000
          ? "high"
          : remaining <= 72 * 60 * 60_000
            ? "medium"
            : "low",
      status: "inbox",
      submissionMethod: "",
      notes: `Captured from: ${capture.rawText}`,
      gradeWeight: null,
      taskContext: "anywhere",
      computerRequired: false,
      workType:
        capture.taskType === "reading"
          ? "reading"
          : capture.taskType === "vocabulary"
            ? "memorization"
            : capture.taskType === "practice"
              ? "problem_solving"
              : capture.taskType === "writing" || capture.taskType === "project"
                ? "creative_project"
                : capture.taskType === "revision"
                  ? "deep_focus"
                  : null,
      requiredEnergy:
        capture.taskType === "practice" ||
        capture.taskType === "writing" ||
        capture.taskType === "project"
          ? "high"
          : capture.taskType === "reading" || capture.taskType === "vocabulary"
            ? "low"
            : "medium",
      allowedWeekdays: [1, 2, 3, 4, 5, 6, 7],
      allowedWindowStart: "15:00",
      allowedWindowEnd: "21:00",
      minSessionMinutes: 30,
      maxSessionMinutes: 90,
      splittable: true,
      createdAt: new Date().toISOString(),
    };
    await saveAssignment(assignment);
    const converted = {
      ...capture,
      status: "converted" as const,
      convertedAssignmentId: assignment.id,
    };
    await saveHomeworkCapture(converted);
    if (capture.scheduledCalendarItemId) {
      const scheduled = items.find(
        (item) => item.id === capture.scheduledCalendarItemId,
      );
      if (scheduled) {
        updateItem(
          { ...scheduled, assignmentId: assignment.id },
          `Link “${scheduled.title}” to assignment`,
        );
      }
    }
    setNotice(`Converted “${capture.title}” to an assignment.`);
  }

  async function completeHomeworkCapture(capture: HomeworkCapture) {
    if (capture.scheduledCalendarItemId) {
      const scheduled = items.find(
        (item) => item.id === capture.scheduledCalendarItemId,
      );
      if (scheduled && scheduled.status !== "completed") {
        updateItem(
          { ...scheduled, status: "completed" },
          `Complete homework “${capture.title}”`,
        );
      }
    }
    await saveHomeworkCapture({ ...capture, status: "completed" });
    setNotice(`Completed “${capture.title}”.`);
  }

  function deleteHomeworkCapture(capture: HomeworkCapture) {
    if (!window.confirm(`Delete “${capture.title}” from homework?`)) return;
    if (capture.scheduledCalendarItemId) {
      const scheduled = items.find(
        (item) => item.id === capture.scheduledCalendarItemId,
      );
      if (scheduled) {
        updateItem(
          { ...scheduled, homeworkCaptureId: null },
          `Detach homework capture from “${scheduled.title}”`,
        );
      }
    }
    setHomeworkCaptures((current) =>
      current.filter((entry) => entry.id !== capture.id),
    );
    persistMutation({
      table: "homework_captures",
      action: "delete",
      recordId: capture.id,
    }).catch(() => undefined);
    setNotice(`Deleted “${capture.title}”.`);
  }

  async function scheduleHomework(
    captureId: string,
    day: string,
    hour: number,
    minute: number,
  ) {
    const capture = homeworkCaptures.find((entry) => entry.id === captureId);
    if (!capture) return;
    if (capture.scheduledCalendarItemId) {
      const existing = items.find(
        (item) => item.id === capture.scheduledCalendarItemId,
      );
      if (existing) {
        scheduleAt(existing.id, day, hour, minute);
        return;
      }
    }
    const start = dateFromKey(day);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start.getTime() + capture.estimatedMinutes * 60_000);
    const item = makeItem({
      kind: "task",
      title: capture.title,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      durationMin: capture.estimatedMinutes,
      durationMax: Math.max(
        capture.estimatedMinutes,
        capture.estimatedMinutes + 15,
      ),
      deadline: capture.deadline,
      energyType:
        capture.taskType === "vocabulary" || capture.taskType === "reading"
          ? "light_work"
          : "deep_focus",
      priority: "medium",
      flexibility: "flexible",
      status: "scheduled",
      source: "manual",
      assignmentId: capture.convertedAssignmentId,
      homeworkCaptureId: capture.id,
      taskContext: "anywhere",
      workType:
        capture.taskType === "reading"
          ? "reading"
          : capture.taskType === "vocabulary"
            ? "memorization"
            : capture.taskType === "practice"
              ? "problem_solving"
              : capture.taskType === "writing" || capture.taskType === "project"
                ? "creative_project"
                : capture.taskType === "revision"
                  ? "deep_focus"
                  : null,
      requiredEnergy:
        capture.taskType === "practice" ||
        capture.taskType === "writing" ||
        capture.taskType === "project"
          ? "high"
          : capture.taskType === "reading" || capture.taskType === "vocabulary"
            ? "low"
            : "medium",
    });
    const validation = validatePlacement(
      item,
      item.startsAt!,
      item.endsAt!,
      items,
    );
    if (!validation.valid) {
      setNotice(validation.errors[0]);
      return;
    }
    await createItem(item);
    await saveHomeworkCapture({
      ...capture,
      status: "scheduled",
      scheduledCalendarItemId: item.id,
    });
    setSelectedDay(day);
    setNotice(`Scheduled “${capture.title}”.`);
  }

  function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!draftItem) return;
    let nextDraft =
      isCreatingItem && !isImportedTimetableItem(draftItem)
        ? {
            ...draftItem,
            flexibility: flexibilityForNewItem(draftItem),
          }
        : draftItem;
    if (
      nextDraft.flexibility === "fixed" &&
      nextDraft.startsAt &&
      nextDraft.endsAt
    ) {
      const minutes = Math.max(15, durationMinutes(nextDraft));
      nextDraft = {
        ...nextDraft,
        durationMin: minutes,
        durationMax: minutes,
      };
    }
    if (
      nextDraft.status === "scheduled" &&
      nextDraft.startsAt &&
      nextDraft.endsAt
    ) {
      const validation = validatePlacement(
        nextDraft.flexibility === "fixed"
          ? {
              ...(selectedItem ?? nextDraft),
              durationMin: nextDraft.durationMin,
              durationMax: nextDraft.durationMax,
            }
          : (selectedItem ?? nextDraft),
        nextDraft.startsAt,
        nextDraft.endsAt,
        items,
        { allowFixedChange: true },
      );
      if (!validation.valid) {
        setNotice(validation.errors[0]);
        return;
      }
    }
    if (isCreatingItem) {
      createItem(nextDraft);
      setNotice(`Created “${nextDraft.title}”.`);
    } else {
      updateItem(nextDraft, `Edit “${nextDraft.title}”`);
    }
    setSelectedItem(null);
    setDraftItem(null);
    setIsCreatingItem(false);
  }

  async function sendVerificationCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setAuthBusy(true);
    let errorMessage = "";
    if (inviteToken) {
      const response = await fetch("/api/invitations/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), token: inviteToken }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) errorMessage = result.error ?? "Could not accept invitation";
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      errorMessage = error?.message ?? "";
    }
    setAuthBusy(false);
    if (errorMessage) {
      setNotice(errorMessage);
      return;
    }
    setAuthSent(true);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !verificationCode.trim()) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: verificationCode.replace(/\s/g, ""),
      type: "email",
    });
    setAuthBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    if (inviteToken) {
      window.history.replaceState({}, "", window.location.pathname);
      setInviteToken("");
    }
    setVerificationCode("");
    setAuthSent(false);
    setNotice("Signed in. Your calendar is syncing now.");
  }

  async function createInvitation(sendCode: boolean) {
    setInviteBusy(true);
    setInviteUrl("");
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ email: sendCode ? inviteEmail : "" }),
    });
    const result = (await response.json()) as {
      error?: string;
      inviteUrl?: string;
    };
    setInviteBusy(false);
    if (!response.ok || !result.inviteUrl) {
      setNotice(result.error ?? "Could not create invitation");
      return;
    }
    if (sendCode) {
      setInviteUrl("");
      setNotice(`Account ready. A verification code was sent to ${inviteEmail.trim()}.`);
      setInviteEmail("");
    } else {
      setInviteUrl(result.inviteUrl);
      try {
        await navigator.clipboard.writeText(result.inviteUrl);
        setNotice("One-time invite link copied.");
      } catch {
        setNotice("Invite link created. Copy it below.");
      }
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setItems([]);
    setHistory([]);
    setSubjects([]);
    setClasses([]);
    setClassExceptions([]);
    setAssignments([]);
    setAssessments([]);
    setIntentions([]);
    setLearningSignals([]);
    setExplorations([]);
    setBlockChoices([]);
    setHomeworkCaptures([]);
    setSchoolDaySettings(DEFAULT_SCHOOL_DAY_SETTINGS);
    setUndoStack([]);
    await saveOfflineState({
      items: [],
      history: [],
      subjects: [],
      classes: [],
      classExceptions: [],
      assignments: [],
      assessments: [],
      intentions: [],
      learningSignals: [],
      explorations: [],
      blockChoices: [],
      homeworkCaptures: [],
      schoolDaySettings: DEFAULT_SCHOOL_DAY_SETTINGS,
      ownerKey: "local",
    });
    setNotice("Signed out. This device now has a fresh local calendar.");
  }

  function nowRecommendations(at: Date) {
    return recommendNow({
      now: at,
      items,
      assignments,
      assessments,
      subjects,
      classes,
      classExceptions,
      settings: schoolDaySettings,
      currentLocation: nowLocation,
      currentEnergy: nowEnergy,
      computerAvailable: nowComputerAvailable,
      learningSignals,
    });
  }

  function openNowRecommendations() {
    setNowMoment(new Date().toISOString());
    setNowOpen(true);
    setPaletteOpen(false);
    setInboxOpen(false);
    setHomeworkOpen(false);
    setHudOpen(false);
  }

  function startNow(recommendation: NowRecommendation) {
    if (recommendation.source === "exploration") {
      const subject = subjects.find((entry) => entry.id === recommendation.subjectId);
      if (subject) {
        openGoDeeper({
          type: "subject",
          id: subject.id,
          title: subject.name,
          subjectId: subject.id,
          subjectName: subject.name,
          context: "Suggested because recent work felt too easy.",
        });
      }
      setNowOpen(false);
      return;
    }
    const startedAt = new Date();
    const fresh = nowRecommendations(startedAt).recommendations.find(
      (candidate) => candidate.id === recommendation.id,
    );
    if (!fresh) {
      setNowMoment(startedAt.toISOString());
      setNotice(
        "That option no longer fits the current slot. Recommendations were refreshed.",
      );
      return;
    }
    const start = new Date(startedAt);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + fresh.durationMinutes * 60_000);
    const existing = fresh.calendarItemId
      ? items.find((item) => item.id === fresh.calendarItemId)
      : null;
    const sourceAssignment = fresh.assignmentId
      ? assignments.find((assignment) => assignment.id === fresh.assignmentId)
      : null;
    const sourceAssessment = fresh.assessmentId
      ? assessments.find((assessment) => assessment.id === fresh.assessmentId)
      : null;
    const template = fresh.workType
      ? schoolDaySettings.focusTemplates[fresh.workType]
      : null;
    const sourceDurationMin =
      sourceAssignment?.minSessionMinutes ??
      sourceAssessment?.minRevisionSessionMinutes ??
      template?.durationMin ??
      fresh.durationMinutes;
    const sourceDurationMax =
      sourceAssignment?.maxSessionMinutes ??
      sourceAssessment?.maxRevisionSessionMinutes ??
      template?.durationMax ??
      fresh.durationMinutes;
    const started = existing
      ? {
          ...existing,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          status: "scheduled" as const,
        }
      : makeItem({
          kind: "task",
          title: fresh.title,
          description:
            fresh.source === "assessment"
              ? `Revision session started for ${fresh.title}.`
              : `Focused work session started for ${fresh.title}.`,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          durationMin: Math.min(
            fresh.durationMinutes,
            sourceDurationMin,
          ),
          durationMax: Math.max(
            fresh.durationMinutes,
            sourceDurationMax,
          ),
          deadline: fresh.deadline,
          energyType: fresh.energyType,
          priority:
            fresh.source === "assessment"
              ? (assessments.find(
                  (assessment) => assessment.id === fresh.assessmentId,
                )?.importance ?? "medium")
              : (assignments.find(
                  (assignment) => assignment.id === fresh.assignmentId,
                )?.priority ?? "medium"),
          flexibility: "elastic",
          constraints: [
            "Started from What should I do now?",
            "Linked to its schoolwork source",
          ],
          assignmentId: fresh.assignmentId,
          assessmentId: fresh.assessmentId,
          subjectId: fresh.subjectId,
          revisionStage: fresh.revisionStage,
          taskContext: fresh.taskContext,
          computerRequired: fresh.computerRequired,
          workType: fresh.workType,
          requiredEnergy: fresh.requiredEnergy,
          status: "scheduled",
          source: "manual",
        });
    const validation = validatePlacement(
      started,
      start.toISOString(),
      end.toISOString(),
      existing ? items.filter((item) => item.id !== existing.id) : items,
    );
    if (!validation.valid) {
      setNotice(validation.errors[0] ?? "That session no longer fits.");
      setNowMoment(startedAt.toISOString());
      return;
    }
    if (existing) {
      updateItem(started, `Start “${fresh.title}” now`);
    } else {
      createItem(started);
    }
    setNowOpen(false);
    setNowMoment(null);
    setNotice(
      `Started “${fresh.title}” for ${fresh.durationMinutes} minutes.${
        validation.warnings[0] ? ` ${validation.warnings[0]}` : ""
      }`,
    );
  }

  function saveIntention(intention: Intention) {
    const normalized = makeIntention(intention);
    setIntentions((current) => [normalized, ...current.filter((entry) => entry.id !== normalized.id)]);
    persistMutation({ table: "intentions", action: "upsert", recordId: normalized.id, payload: intentionToRow(normalized) }).catch(() => undefined);
    setIntentionSeed(null);
    setNotice(`Saved intention “${normalized.title}”. No calendar time was created.`);
  }

  function deleteIntention(intention: Intention) {
    const archived = { ...intention, status: "archived" as const };
    setIntentions((current) => current.map((entry) => entry.id === archived.id ? archived : entry));
    persistMutation({ table: "intentions", action: "update", recordId: archived.id, payload: { status: "archived" } }).catch(() => undefined);
    setNotice(`Archived “${intention.title}”.`);
  }

  function startIntention(intention: Intention, requestedMinutes = intention.preferredSessionMinutes) {
    const start = new Date();
    start.setSeconds(0, 0);
    const minutes = Math.max(5, Math.min(240, requestedMinutes));
    const end = new Date(start.getTime() + minutes * 60_000);
    const task = makeItem({
      kind: "task",
      title: intention.title,
      description: intention.notes || "A small step toward this intention.",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      durationMin: minutes,
      durationMax: minutes,
      deadline: intention.horizonEnd ? `${intention.horizonEnd}T23:59:00` : null,
      energyType: intention.workType === "deep_focus" || intention.workType === "problem_solving" ? "deep_focus" : "light_work",
      priority: intention.priority,
      flexibility: "elastic",
      intentionId: intention.id,
      subjectId: intention.subjectId,
      taskContext: intention.taskContext,
      workType: intention.workType,
      requiredEnergy: intention.requiredEnergy,
      status: "scheduled",
      source: "manual",
    });
    const validation = validatePlacement(task, start.toISOString(), end.toISOString(), items);
    if (!validation.valid) {
      setNotice(validation.errors[0] ?? "That intention does not fit right now.");
      return;
    }
    createItem(task);
    setIntentionsOpen(false);
    setNotice(`Started “${intention.title}” for ${minutes} minutes.`);
  }

  function subjectName(subjectId: string | null) {
    return subjects.find((subject) => subject.id === subjectId)?.name ?? null;
  }

  function sourceForCalendarItem(item: CalendarItem): LearningSource {
    const assignment = item.assignmentId
      ? assignments.find((entry) => entry.id === item.assignmentId)
      : null;
    const assessment = item.assessmentId
      ? assessments.find((entry) => entry.id === item.assessmentId)
      : null;
    const subjectId = item.subjectId ?? assignment?.subjectId ?? assessment?.subjectId ?? null;
    return {
      type: "calendar_item",
      id: item.id,
      title: item.title,
      subjectId,
      subjectName: subjectName(subjectId),
      context: [item.description, item.revisionStage, item.workType].filter(Boolean).join(" · "),
    };
  }

  function recordChallenge(source: LearningSource, challengeLevel: ChallengeLevel) {
    const signal = makeLearningSignal(source, challengeLevel);
    setLearningSignals((current) => [signal, ...current]);
    persistMutation({
      table: "learning_signals",
      action: "insert",
      recordId: signal.id,
      payload: learningSignalToRow(signal),
    }).catch(() => undefined);
    setNotice(`Challenge noted: ${challengeLevel === "not_understood" ? "not understood yet" : challengeLevel.replace("_", " ")}.`);
  }

  async function generateDeeper(source: LearningSource, fresh = false) {
    if (!fresh) {
      const cached = explorations.find(
        (entry) =>
          entry.sourceType === source.type &&
          entry.sourceId === source.id &&
          entry.sourceTitle === source.title &&
          entry.status !== "dismissed",
      );
      if (cached) {
        setDeeperExploration(cached);
        return;
      }
    }
    setDeeperBusy(true);
    setDeeperError("");
    setDeeperExploration(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sign in to use Go Deeper. Challenge feedback still works locally.");
      const latest = latestSignalFor(source, learningSignals);
      const summary = subjectChallengeSummary(source.subjectId, learningSignals);
      const response = await fetch("/api/go-deeper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          source: {
            type: source.type,
            title: source.title,
            subjectName: source.subjectName ?? null,
            context: source.context ?? "",
          },
          challengeLevel: latest?.challengeLevel ?? null,
          challengeSummary: {
            tooEasy: summary.counts.too_easy,
            goodChallenge: summary.counts.good_challenge,
            difficult: summary.counts.difficult,
            notUnderstood: summary.counts.not_understood,
          },
        }),
      });
      const raw: unknown = await response.json();
      if (!response.ok || !isDeeperResponse(raw)) throw new Error("No useful exploration was returned. Try again in a moment.");
      const exploration: Exploration = {
        id: crypto.randomUUID(),
        sourceType: source.type,
        sourceId: source.id,
        sourceTitle: source.title,
        sourceContext: source.context ?? "",
        subjectId: source.subjectId,
        challengeLevel: latest?.challengeLevel ?? null,
        framing: raw.framing,
        directions: raw.directions,
        status: "generated",
        promptVersion: 1,
        createdAt: new Date().toISOString(),
      };
      setExplorations((current) => [exploration, ...current]);
      setDeeperExploration(exploration);
      persistMutation({ table: "explorations", action: "insert", recordId: exploration.id, payload: explorationToRow(exploration) }).catch(() => undefined);
    } catch (error) {
      setDeeperError(error instanceof Error ? error.message : "Go Deeper is unavailable right now.");
    } finally {
      setDeeperBusy(false);
    }
  }

  function openGoDeeper(source: LearningSource) {
    setDeeperSource(source);
    setDeeperExploration(null);
    setDeeperError("");
    generateDeeper(source).catch(() => undefined);
  }

  function saveExploration(exploration: Exploration) {
    const saved = { ...exploration, status: "saved" as const };
    setExplorations((current) => current.map((entry) => entry.id === saved.id ? saved : entry));
    setDeeperExploration(saved);
    persistMutation({ table: "explorations", action: "update", recordId: saved.id, payload: { status: "saved" } }).catch(() => undefined);
    setNotice("Exploration saved for later.");
  }

  function startExplorationDirection(direction: ExplorationDirection) {
    if (!deeperSource) return;
    const start = new Date();
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 15 * 60_000);
    const base = makeItem({
      kind: "task",
      title: `${direction.title} · explore`,
      description: `${direction.prompt}\n\nWhy it is useful: ${direction.whyUseful}`,
      durationMin: 15,
      durationMax: 15,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      energyType: "deep_focus",
      priority: "low",
      flexibility: "elastic",
      subjectId: deeperSource.subjectId,
      workType: "problem_solving",
      requiredEnergy: "high",
      status: "scheduled",
      source: "manual",
      constraints: ["Chosen from Go Deeper", `Source: ${deeperSource.title}`],
    });
    const validation = validatePlacement(base, base.startsAt!, base.endsAt!, items);
    if (validation.valid) {
      createItem(base);
      setNotice(`Started a 15-minute exploration: “${direction.title}”.`);
    } else {
      createItem({ ...base, startsAt: null, endsAt: null, status: "inbox" });
      setNotice(`Saved “${direction.title}” as a 15-minute possibility; your current fixed event stays protected.`);
    }
    setDeeperSource(null);
  }

  function openAttentionCard(card: AttentionCard) {
    if (card.source === "calendar_item" && card.sourceId) {
      const item = items.find((entry) => entry.id === card.sourceId);
      if (item) openItem(item);
      return;
    }
    if (card.source === "recommendation" && attentionSnapshot.recommendation) {
      openNowRecommendations();
      return;
    }
    if (card.source === "intention" && card.sourceId) {
      const intention = intentions.find((entry) => entry.id === card.sourceId);
      setIntentionSeed(intention ?? null);
      setIntentionsOpen(true);
      return;
    }
    if (card.source === "class") {
      setZoom("school");
      return;
    }
    setZoom("school");
    setNotice(`Opened school work for “${card.title}”.`);
  }

  const saveBlockChoice = useCallback((choice: BlockChoice) => {
    setBlockChoices((current) => [
      choice,
      ...current.filter((entry) => entry.id !== choice.id),
    ].slice(0, 150));
    persistMutation({
      table: "time_block_choices",
      action: "upsert",
      recordId: choice.id,
      payload: blockChoiceToRow(choice),
    }).catch(() => undefined);
  }, [persistMutation]);

  function selectBlockSuggestion(suggestion: BlockSuggestion) {
    if (!currentBlockChoice) return;
    const next = updateBlockChoice(
      currentBlockChoice,
      suggestion.id,
      "selected",
    );
    saveBlockChoice(next);
    setNotice(`This ${next.context.label.toLowerCase()}: “${suggestion.title}”. You can change your mind.`);
  }

  function setBlockChoiceStatus(status: BlockChoiceStatus) {
    if (!currentBlockChoice?.selectedSuggestionId) return;
    const next = updateBlockChoice(
      currentBlockChoice,
      currentBlockChoice.selectedSuggestionId,
      status,
    );
    saveBlockChoice(next);
  }

  function changeBlockSuggestion() {
    if (!currentBlockChoice) return;
    saveBlockChoice(
      updateBlockChoice(currentBlockChoice, null, "suggested"),
    );
  }

  function openBlockSuggestion(suggestion: BlockSuggestion) {
    if (suggestion.sourceType === "recommendation") {
      openNowRecommendations();
      return;
    }
    if (suggestion.sourceType === "calendar_item" && suggestion.sourceId) {
      const item = items.find((entry) => entry.id === suggestion.sourceId);
      if (item) openItem(item);
      return;
    }
    if (suggestion.sourceType === "intention" && suggestion.sourceId) {
      const intention = intentions.find((entry) => entry.id === suggestion.sourceId);
      setIntentionSeed(intention ?? null);
      setIntentionsOpen(true);
      return;
    }
    if (suggestion.sourceType === "exploration" && suggestion.sourceId) {
      const exploration = explorations.find((entry) => entry.id === suggestion.sourceId);
      if (!exploration) return;
      setDeeperSource({
        type: exploration.sourceType,
        id: exploration.sourceId,
        title: exploration.sourceTitle,
        subjectId: exploration.subjectId,
        subjectName: subjects.find((entry) => entry.id === exploration.subjectId)?.name,
        context: exploration.sourceContext,
      });
      setDeeperExploration(exploration);
    }
  }

  const filteredItems = items.filter((item) => {
    if (!filterText.trim()) return true;
    const query = filterText.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.kind.includes(query) ||
      energyLabels[item.energyType].toLowerCase().includes(query) ||
      item.priority.includes(query)
    );
  });
  const inboxItems = filteredItems.filter(
    (item) => item.status === "inbox" && item.kind !== "event",
  );
  const activeHomework = homeworkCaptures.filter(
    (capture) =>
      capture.status === "captured" || capture.status === "scheduled",
  );
  const prioritizedSubjects = recentSubjects(
    subjects,
    homeworkCaptures,
    assignments,
  );
  const scheduledItems = filteredItems.filter(
    (item) => item.status === "scheduled" && item.startsAt && item.endsAt,
  );
  const anchor = dateFromKey(anchorDate);
  const weekStart = startOfWeek(anchor);
  const visibleDays =
    zoom === "day"
      ? [dateFromKey(selectedDay)]
      : Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const dayCapacity = capacityForDay(items, selectedDay);
  const insights = scheduleInsights(items, selectedDay);
  const now = clockNow;
  const attentionSnapshot = buildAttentionSnapshot({
    now,
    items,
    assignments,
    assessments,
    intentions,
    subjects,
    classes,
    classExceptions,
    settings: schoolDaySettings,
    currentLocation: nowLocation,
    currentEnergy: nowEnergy,
    computerAvailable: nowComputerAvailable,
    learningSignals,
  });
  const blockMinute = Math.floor(now.getTime() / 60_000);
  const blockNow = useMemo(() => new Date(blockMinute * 60_000), [blockMinute]);
  const currentBlockChoice = useMemo(
    () =>
      hydrated ? buildBlockChoice({
        now: blockNow,
        items,
        assignments,
        assessments,
        intentions,
        explorations,
        subjects,
        classes,
        classExceptions,
        settings: schoolDaySettings,
        currentEnergy: nowEnergy,
        computerAvailable: nowComputerAvailable,
        learningSignals,
        recentChoices: blockChoices,
      }) : null,
    [
      blockNow,
      hydrated,
      items,
      assignments,
      assessments,
      intentions,
      explorations,
      subjects,
      classes,
      classExceptions,
      schoolDaySettings,
      nowEnergy,
      nowComputerAvailable,
      learningSignals,
      blockChoices,
    ],
  );
  useEffect(() => {
    if (
      !hydrated ||
      !currentBlockChoice ||
      blockChoices.some((choice) => choice.blockKey === currentBlockChoice.blockKey)
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setBlockChoices((current) => [currentBlockChoice, ...current].slice(0, 150));
      persistMutation({
        table: "time_block_choices",
        action: "upsert",
        recordId: currentBlockChoice.id,
        payload: blockChoiceToRow(currentBlockChoice),
      }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [blockChoices, currentBlockChoice, hydrated, persistMutation]);
  useEffect(() => {
    if (
      !currentBlockChoice ||
      currentBlockChoice.status !== "suggested" ||
      currentBlockChoice.context.aiPolished ||
      !user ||
      !isOnline ||
      polishedBlocksRef.current.has(currentBlockChoice.blockKey)
    ) {
      return;
    }
    polishedBlocksRef.current.add(currentBlockChoice.blockKey);
    let cancelled = false;
    const polish = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      const response = await fetch("/api/block-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          block: {
            label: currentBlockChoice.context.label,
            startsAt: currentBlockChoice.startsAt,
            endsAt: currentBlockChoice.endsAt,
            location: currentBlockChoice.context.location,
            energy: nowEnergy,
          },
          suggestions: currentBlockChoice.suggestions,
        }),
      });
      const raw: unknown = await response.json();
      if (cancelled || !response.ok || !isBlockPolishResponse(raw)) return;
      const wording = new Map(raw.suggestions.map((suggestion) => [suggestion.id, suggestion]));
      const polished: BlockChoice = {
        ...currentBlockChoice,
        context: { ...currentBlockChoice.context, aiPolished: true },
        suggestions: currentBlockChoice.suggestions.map((suggestion) => {
          const replacement = wording.get(suggestion.id);
          return replacement && replacement.category === suggestion.category
            ? { ...suggestion, ...replacement }
            : suggestion;
        }),
        updatedAt: new Date().toISOString(),
      };
      saveBlockChoice(polished);
    };
    polish().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    currentBlockChoice,
    isOnline,
    nowEnergy,
    saveBlockChoice,
    supabase,
    user,
  ]);
  const future = [...scheduledItems]
    .filter((item) => new Date(item.endsAt!).getTime() >= now.getTime())
    .sort(
      (a, b) =>
        new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
    );
  const nowItem = future.find(
    (item) =>
      new Date(item.startsAt!).getTime() <= now.getTime() &&
      new Date(item.endsAt!).getTime() > now.getTime(),
  );
  const nextItem = future.find(
    (item) => new Date(item.startsAt!).getTime() > now.getTime(),
  );
  const laterItems = future
    .filter((item) => item.id !== nowItem?.id && item.id !== nextItem?.id)
    .slice(0, 3);
  const proposalValidation = proposal
    ? validateProposal(proposal, items)
    : null;
  const commandPreview = parsedCommand(commandText);
  const homeworkCommandPreview = parseHomework(commandText, subjects, now);
  const commandIsHomework = looksLikeHomeworkCommand(
    commandText,
    homeworkCommandPreview,
  );
  const nowResult = nowMoment ? nowRecommendations(new Date(nowMoment)) : null;
  const draftTimingError =
    draftItem?.startsAt &&
    draftItem.endsAt &&
    new Date(draftItem.endsAt) <= new Date(draftItem.startsAt)
      ? "End must be after start."
      : null;
  const draftDurationOptions = draftItem
    ? Array.from(
        new Set([15, 30, 45, 60, 90, 120, durationMinutes(draftItem)]),
      ).sort((a, b) => a - b)
    : [];

  function moveAnchor(amount: number) {
    const next =
      zoom === "month" || zoom === "semester"
        ? new Date(
            anchor.getFullYear(),
            anchor.getMonth() + amount * (zoom === "semester" ? 6 : 1),
            1,
            12,
          )
        : addDays(anchor, amount * (zoom === "day" ? 1 : 7));
    setAnchorDate(dateKey(next));
    if (zoom === "day") {
      setSelectedDay(dateKey(next));
    } else if (zoom === "week") {
      setSelectedDay(dateKey(addDays(dateFromKey(selectedDay), amount * 7)));
    }
  }

  function canStartCalendarSwipe(target: EventTarget | null) {
    return !(
      target instanceof Element &&
      target.closest(
        "input, textarea, select, [contenteditable='true'], [draggable='true'], .resize-handle, .mobile-date-ribbon, .block-choice-carousel, .overview-grid.months-6, .multi-day-strip, [data-horizontal-scroll]",
      )
    );
  }

  function onCalendarPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (
      !isCompact ||
      !(["day", "week", "month"] as Zoom[]).includes(zoom) ||
      event.pointerType === "mouse" ||
      draggingItemId ||
      event.button !== 0 ||
      !canStartCalendarSwipe(event.target)
    ) {
      calendarSwipeStartRef.current = null;
      return;
    }
    const point = { x: event.clientX, y: event.clientY, at: performance.now() };
    calendarSwipeStartRef.current = point;
    calendarSwipeLastRef.current = point;
  }

  function onCalendarPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const start = calendarSwipeStartRef.current;
    if (!start) return;
    const point = { x: event.clientX, y: event.clientY, at: performance.now() };
    calendarSwipeLastRef.current = point;
    if (
      Math.abs(point.x - start.x) > 12 &&
      Math.abs(point.x - start.x) > Math.abs(point.y - start.y)
    ) {
      event.preventDefault();
    }
  }

  function finishCalendarPointerSwipe(event: ReactPointerEvent<HTMLElement>) {
    const start = calendarSwipeStartRef.current;
    const end = calendarSwipeLastRef.current;
    calendarSwipeStartRef.current = null;
    calendarSwipeLastRef.current = null;
    if (!start || !end || draggingItemId) return;
    const direction = calendarSwipeDirection(start, end);
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    suppressSwipeClickUntilRef.current = performance.now() + 450;
    moveAnchor(direction);
  }

  function onWeekWheel(event: ReactWheelEvent<HTMLElement>) {
    if (
      zoom !== "week" ||
      draggingItemId ||
      event.ctrlKey ||
      event.metaKey ||
      Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.15
    ) {
      return;
    }
    const gesture = weekWheelRef.current;
    const current = performance.now();
    event.preventDefault();
    if (current < gesture.lockedUntil) return;
    if (current - gesture.lastAt > 180) gesture.totalX = 0;
    gesture.totalX += event.deltaX;
    gesture.lastAt = current;
    if (Math.abs(gesture.totalX) < 80) return;
    const direction = gesture.totalX > 0 ? 1 : -1;
    gesture.totalX = 0;
    gesture.lockedUntil = current + 650;
    moveAnchor(direction);
  }

  return (
    <main className={`flex-shell ${draggingItemId ? "is-dragging" : ""}`}>
      <aside className="icon-rail">
        <button
          className="flux-mark"
          type="button"
          aria-label="Today"
          onClick={() => {
            const today = dateKey(new Date());
            setAnchorDate(today);
            setSelectedDay(today);
          }}
        >
          <Zap size={17} fill="currentColor" />
          <small className="rail-label">Today</small>
        </button>
        <nav aria-label="Calendar tools">
          <button
            className={
              !inboxOpen && !homeworkOpen && !hudOpen && zoom !== "school"
                ? "active"
                : ""
            }
            type="button"
            aria-label="Attention home"
            onClick={() => {
              setInboxOpen(false);
              setHomeworkOpen(false);
              setHudOpen(false);
              transitionState(() => setZoom("upcoming"));
            }}
          >
            <CalendarClock size={19} />
            <small className="rail-label">Home</small>
          </button>
          <button
            className={zoom === "school" ? "active" : ""}
            type="button"
            aria-label="School"
            onClick={() => {
              setInboxOpen(false);
              setHomeworkOpen(false);
              setHudOpen(false);
              transitionState(() => setZoom("school"));
            }}
          >
            <GraduationCap size={19} />
            <small className="rail-label">School</small>
          </button>
          <button
            className={homeworkOpen ? "active" : ""}
            type="button"
            aria-label="Homework inbox"
            onClick={() => {
              setHomeworkOpen((current) => !current);
              setInboxOpen(false);
              setHudOpen(false);
            }}
          >
            <BookOpen size={18} />
            {activeHomework.length > 0 && <span>{activeHomework.length}</span>}
            <small className="rail-label">Homework</small>
          </button>
          <button
            className={inboxOpen ? "active" : ""}
            type="button"
            aria-label="Flexible work"
            onClick={() => {
              setInboxOpen((current) => !current);
              setHomeworkOpen(false);
              setHudOpen(false);
            }}
          >
            <Inbox size={18} />
            {inboxItems.length > 0 && <span>{inboxItems.length}</span>}
            <small className="rail-label">Flexible work</small>
          </button>
          <button
            type="button"
            aria-label="Command palette"
            onClick={() => {
              setPaletteOpen(true);
              setInboxOpen(false);
              setHomeworkOpen(false);
              setHudOpen(false);
            }}
          >
            <Command size={19} />
            <small className="rail-label">Command menu</small>
          </button>
          <button
            className={hudOpen && !historyOpen ? "active" : ""}
            type="button"
            aria-label="Quick HUD"
            onClick={() => {
              setHudOpen((current) => !current || historyOpen);
              setHistoryOpen(false);
              setInboxOpen(false);
              setHomeworkOpen(false);
            }}
          >
            <Activity size={18} />
            <small className="rail-label">Now & next</small>
          </button>
          <button
            className={hudOpen && historyOpen ? "active" : ""}
            type="button"
            aria-label="History"
            onClick={() => {
              setHistoryOpen(true);
              setHudOpen(true);
              setInboxOpen(false);
              setHomeworkOpen(false);
            }}
          >
            <History size={19} />
            <small className="rail-label">History</small>
          </button>
        </nav>
        <button
          className="rail-account"
          type="button"
          aria-label="Account and sync"
          onClick={() => setAccountOpen((current) => !current)}
        >
          {initials(user?.email)}
          <small className="rail-label">Account & sync</small>
        </button>
      </aside>

      <nav className="mobile-tab-bar" aria-label="Mobile navigation">
        <button
          className={zoom === "upcoming" ? "active" : ""}
          type="button"
          onClick={() => {
            setInboxOpen(false);
            setHomeworkOpen(false);
            setHudOpen(false);
            setMobileMenuOpen(false);
            setMobileCreateOpen(false);
            transitionState(() => setZoom("upcoming"));
          }}
        >
          <CalendarClock size={20} />
          <span>Home</span>
        </button>
        <button
          className={!["upcoming", "school"].includes(zoom) ? "active" : ""}
          type="button"
          onClick={() => {
            setInboxOpen(false);
            setHomeworkOpen(false);
            setHudOpen(false);
            setMobileMenuOpen(false);
            setMobileCreateOpen(false);
            transitionState(() => setZoom("day"));
          }}
        >
          <CalendarPlus size={20} />
          <span>Calendar</span>
        </button>
        <button
          className="mobile-create-button"
          type="button"
          aria-label="Add something"
          aria-expanded={mobileCreateOpen}
          onClick={() => {
            setMobileMenuOpen(false);
            setMobileCreateOpen((current) => !current);
          }}
        >
          <Plus size={23} />
          <span>Add</span>
        </button>
        <button
          className={zoom === "school" ? "active" : ""}
          type="button"
          onClick={() => {
            setInboxOpen(false);
            setHomeworkOpen(false);
            setHudOpen(false);
            setMobileMenuOpen(false);
            setMobileCreateOpen(false);
            transitionState(() => setZoom("school"));
          }}
        >
          <GraduationCap size={20} />
          <span>School</span>
        </button>
        <button
          className={mobileMenuOpen ? "active" : ""}
          type="button"
          aria-expanded={mobileMenuOpen}
          onClick={() => {
            setMobileCreateOpen(false);
            setMobileMenuOpen((current) => !current);
          }}
        >
          <Layers3 size={20} />
          <span>More</span>
        </button>
      </nav>

      {(mobileCreateOpen || mobileMenuOpen) && (
        <button
          className="mobile-sheet-scrim"
          type="button"
          aria-label="Close mobile menu"
          onClick={() => {
            setMobileCreateOpen(false);
            setMobileMenuOpen(false);
          }}
        />
      )}

      {mobileCreateOpen && (
        <aside className="mobile-action-sheet mobile-create-sheet" aria-label="Add something">
          <header>
            <span className="micro-label">Quick capture</span>
            <h2>What are you adding?</h2>
          </header>
          <div>
            <button
              type="button"
              onClick={() => {
                setMobileCreateOpen(false);
                setPaletteMode("command");
                setPaletteOpen(true);
              }}
            >
              <Command size={19} />
              <span><strong>Describe it</strong><small>Use natural language for anything</small></span>
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileCreateOpen(false);
                openNewEvent();
              }}
            >
              <CalendarPlus size={19} />
              <span><strong>Calendar event</strong><small>Choose a date, time, or all day</small></span>
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileCreateOpen(false);
                openNewTask();
              }}
            >
              <Inbox size={19} />
              <span><strong>Flexible task</strong><small>Keep it unscheduled until it fits</small></span>
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileCreateOpen(false);
                setHomeworkOpen(true);
              }}
            >
              <BookOpen size={19} />
              <span><strong>Homework</strong><small>Capture it quickly during class</small></span>
              <ChevronRight size={17} />
            </button>
          </div>
        </aside>
      )}

      {mobileMenuOpen && (
        <aside className="mobile-action-sheet mobile-more-sheet" aria-label="More tools">
          <header>
            <span className="micro-label">Syllabi</span>
            <h2>More tools</h2>
          </header>
          <div>
            <button type="button" onClick={() => { setMobileMenuOpen(false); setHomeworkOpen(true); }}>
              <BookOpen size={19} /><span><strong>Homework</strong><small>{activeHomework.length} waiting</small></span><ChevronRight size={17} />
            </button>
            <button type="button" onClick={() => { setMobileMenuOpen(false); setInboxOpen(true); }}>
              <Inbox size={19} /><span><strong>Flexible work</strong><small>{inboxItems.length} unscheduled</small></span><ChevronRight size={17} />
            </button>
            <button type="button" onClick={() => { setMobileMenuOpen(false); setHudOpen(true); setHistoryOpen(false); }}>
              <Activity size={19} /><span><strong>Now & next</strong><small>See the shape of today</small></span><ChevronRight size={17} />
            </button>
            <button type="button" onClick={() => { setMobileMenuOpen(false); setHudOpen(true); setHistoryOpen(true); }}>
              <History size={19} /><span><strong>History</strong><small>Review recent calendar changes</small></span><ChevronRight size={17} />
            </button>
            <button type="button" disabled={undoStack.length === 0} onClick={() => { setMobileMenuOpen(false); undoLast(); }}>
              <Undo2 size={19} /><span><strong>Undo last change</strong><small>{undoStack.length ? "Restore the previous calendar state" : "Nothing to undo"}</small></span><ChevronRight size={17} />
            </button>
            <button type="button" onClick={() => { setMobileMenuOpen(false); setAccountOpen(true); }}>
              <UserRound size={19} /><span><strong>Account & sync</strong><small>{user ? "Calendar synced" : "Sign in on this device"}</small></span><ChevronRight size={17} />
            </button>
          </div>
        </aside>
      )}

      <aside
        className={`task-dock ${inboxOpen ? "is-open" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onInboxDrop}
      >
        <header>
          <div>
            <span className="micro-label">Flexible work</span>
            <h1>Syllabi</h1>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              aria-label="Create calendar item"
              onClick={() => {
                setPaletteMode("command");
                setPaletteOpen(true);
              }}
            >
              <Plus size={17} />
            </button>
            <button
              type="button"
              aria-label="Close flexible work"
              onClick={() => setInboxOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <button
          className="command-trigger"
          type="button"
          onClick={() => setPaletteOpen(true)}
        >
          <Search size={15} />
          <span>Create or transform…</span>
          <kbd>⌘K</kbd>
        </button>

        {filterText && (
          <div className="active-filter">
            <Search size={12} />
            <span>{filterText}</span>
            <button
              type="button"
              onClick={() => setFilterText("")}
              aria-label="Clear filter"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <section className="dock-section">
          <div className="dock-title">
            <span>
              <Inbox size={13} /> Unscheduled
            </span>
            <strong>{inboxItems.length}</strong>
          </div>
          <div className="inbox-list">
            {inboxItems.length === 0 ? (
              <div className="dock-empty">
                <GripVertical size={18} />
                <p>Tasks and intentions wait here until you give them time.</p>
              </div>
            ) : (
              inboxItems.map((item) => (
                <article
                  className={`inbox-item energy-${item.energyType} kind-${item.kind} flex-${item.flexibility} priority-${item.priority} ${urgencyClass(item)} ${
                    draggingItemId === item.id ? "is-dragging" : ""
                  }`}
                  key={item.id}
                  draggable={item.flexibility !== "fixed"}
                  onDragStart={(event) => onDragStart(event, item)}
                  onDragEnd={endDrag}
                  onClick={() => openItem(item)}
                  style={
                    {
                      viewTransitionName: `calendar-item-${item.id}`,
                    } as CSSProperties
                  }
                >
                  <GripVertical size={14} />
                  <div>
                    <span>
                      {kindLabels[item.kind]} · {item.durationMin}
                      {item.durationMax !== item.durationMin
                        ? `–${item.durationMax}`
                        : ""}{" "}
                      min
                    </span>
                    <h3>{item.title}</h3>
                    {item.windowStart && (
                      <small>
                        Window {formatTime(item.windowStart)}–
                        {formatTime(item.windowEnd)}
                      </small>
                    )}
                  </div>
                  {item.deadline && (
                    <time>
                      {formatDate(new Date(item.deadline), {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="dock-section intentions">
          <div className="dock-title">
            <span>
              <Sparkles size={13} /> Possibility ranges
            </span>
          </div>
          {items.filter(
            (item) =>
              item.status === "inbox" && item.windowStart && item.windowEnd,
          ).length === 0 ? (
            <p className="quiet-copy">
              Try “Study chemistry after school for ~45 min.”
            </p>
          ) : (
            <p className="quiet-copy">
              Dashed ranges on the calendar show where flexible work can fit.
            </p>
          )}
        </section>

        <footer className="dock-sync">
          {isOnline && user ? <Cloud size={14} /> : <CloudOff size={14} />}
          <span>
            <strong>
              {syncing
                ? "Syncing…"
                : user && isOnline
                  ? "Synced"
                  : "Local first"}
            </strong>
            <small>{user ? user.email : "Sign in for every device"}</small>
          </span>
        </footer>
      </aside>

      <HomeworkInbox
        open={homeworkOpen}
        captures={activeHomework}
        subjects={subjects}
        recentSubjects={prioritizedSubjects}
        onClose={() => setHomeworkOpen(false)}
        onCapture={captureHomework}
        onConvert={convertHomeworkToAssignment}
        onComplete={completeHomeworkCapture}
        onDelete={deleteHomeworkCapture}
        onDragState={(id) => setDraggingItemId(id ? `homework:${id}` : null)}
        onOpenWeek={() => {
          setHomeworkOpen(false);
          setInboxOpen(false);
          setHudOpen(false);
          transitionState(() => setZoom("week"));
        }}
      />

      <section
        className={`calendar-stage zoom-${zoom}`}
        onPointerDown={onCalendarPointerDown}
        onPointerMove={onCalendarPointerMove}
        onPointerUp={finishCalendarPointerSwipe}
        onPointerCancel={() => {
          calendarSwipeStartRef.current = null;
          calendarSwipeLastRef.current = null;
        }}
        onClickCapture={(event) => {
          if (performance.now() < suppressSwipeClickUntilRef.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onWheel={onWeekWheel}
      >
        <header className="calendar-toolbar">
          {zoom === "school" ? (
            <div className="school-toolbar-title">
              <GraduationCap size={15} />
              <strong>School foundation</strong>
            </div>
          ) : (
            <>
              <div className="date-navigation">
                <button
                  type="button"
                  aria-label="Previous period"
                  onClick={() => moveAnchor(-1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = dateKey(new Date());
                    setAnchorDate(today);
                    setSelectedDay(today);
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Next period"
                  onClick={() => moveAnchor(1)}
                >
                  <ChevronRight size={16} />
                </button>
                <TemporalField
                  className="toolbar-date-jump"
                  mode="date"
                  value={anchorDate}
                  onChange={(value) => {
                    if (!value) return;
                    setAnchorDate(value);
                    setSelectedDay(value);
                  }}
                  required
                  ariaLabel="Jump to a date"
                />
                <h2>
                  {zoom === "semester"
                    ? `${formatDate(anchor, { month: "long" })} – ${formatDate(
                        new Date(
                          anchor.getFullYear(),
                          anchor.getMonth() + 5,
                          1,
                          12,
                        ),
                        { month: "long", year: "numeric" },
                      )}`
                    : formatDate(anchor, {
                        month: "long",
                        year: "numeric",
                      })}
                </h2>
              </div>
              <div className="zoom-control" aria-label="Temporal zoom">
                {(
                  ["upcoming", "day", "week", "month", "semester"] as Zoom[]
                ).map((level) => (
                  <button
                    className={zoom === level ? "active" : ""}
                    type="button"
                    key={level}
                    onClick={() => transitionState(() => setZoom(level))}
                  >
                    {level === "upcoming" ? "home" : level}
                  </button>
                ))}
              </div>
              <button
                className="undo-button"
                type="button"
                onClick={undoLast}
                disabled={undoStack.length === 0}
              >
                <Undo2 size={14} /> Undo
              </button>
            </>
          )}
        </header>

        {notice && (
          <div className="toast" role="status">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notice"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {zoom === "school" ? (
          <SchoolWorkspace
            subjects={subjects}
            classes={classes}
            classExceptions={classExceptions}
            assignments={assignments}
            assessments={assessments}
            assignmentSessions={items}
            schoolDaySettings={schoolDaySettings}
            onSaveSubject={saveSubject}
            onDeleteSubject={deleteSubject}
            onSaveClass={saveClass}
            onDeleteClass={deleteClass}
            onSaveException={saveClassException}
            onDeleteException={deleteClassException}
            onSaveSchoolDaySettings={saveSchoolDaySettings}
            onSaveAssignment={saveAssignment}
            onDeleteAssignment={deleteAssignment}
            onPlanAssignment={previewAssignmentPlan}
            onAddAssignmentSession={addAssignmentSession}
            onOpenAssignmentSession={openItem}
            onToggleAssignmentSession={toggleAssignmentSession}
            onUseFreePeriod={previewFreePeriodSession}
            onSaveAssessment={saveAssessment}
            onDeleteAssessment={deleteAssessment}
            onPlanRevision={previewRevisionRunway}
            onMarkRevisionLearned={markRevisionLearned}
            onOpenRevisionSession={openItem}
            onOpenCalendarItem={openItem}
            onImportTimetable={(file, weekStart) =>
              onDocumentSelected(file, {
                mode: "school_timetable",
                weekStart,
              })
            }
            timetableImportBusy={timetableImportBusy}
            learningSignals={learningSignals}
            onChallenge={recordChallenge}
            onGoDeeper={openGoDeeper}
          />
        ) : zoom === "upcoming" ? (
          <AttentionHome
            snapshot={attentionSnapshot}
            commandText={commandText}
            commandBusy={commandBusy}
            intentionCount={intentions.filter((entry) => entry.status === "active").length}
            onCommandChange={setCommandText}
            onCommandSubmit={(event) => submitCommand(event, "command")}
            onOpenCommand={() => {
              setPaletteMode("command");
              setPaletteOpen(true);
            }}
            onOpenCard={openAttentionCard}
            onStartRecommendation={() => attentionSnapshot.recommendation && startNow(attentionSnapshot.recommendation)}
            onStartIntention={() => attentionSnapshot.intentionOpportunity && startIntention(attentionSnapshot.intentionOpportunity.intention, attentionSnapshot.intentionOpportunity.durationMinutes)}
            onOpenIntentions={() => { setIntentionSeed(null); setIntentionsOpen(true); }}
            onOpenCalendar={() => transitionState(() => setZoom("week"))}
            blockChoice={currentBlockChoice}
            onSelectBlockSuggestion={selectBlockSuggestion}
            onBlockStatus={setBlockChoiceStatus}
            onChangeBlockSuggestion={changeBlockSuggestion}
            onOpenBlockSuggestion={openBlockSuggestion}
          />
        ) : isCompact && zoom === "week" ? (
          <MobileAgenda
            mode={zoom}
            days={Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))}
            items={filteredItems}
            subjects={subjects}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onOpenItem={openItem}
            onQuickCapture={() => {
              setPaletteMode("command");
              setPaletteOpen(true);
            }}
          />
        ) : zoom === "month" || zoom === "semester" ? (
          <OverviewCalendar
            anchor={anchor}
            months={zoom === "month" ? 1 : 6}
            items={filteredItems}
            subjects={subjects}
            onSelectDay={(day) => {
              setSelectedDay(day);
              setAnchorDate(day);
              transitionState(() => setZoom(isCompact ? "day" : "week"));
            }}
          />
        ) : (
          <TimeCalendar
            days={visibleDays}
            items={filteredItems}
            subjects={subjects}
            proposal={proposal}
            rowHeight={zoom === "day" ? 72 : 52}
            selectedDay={selectedDay}
            resizing={resizing}
            dragSnap={dragSnap}
            draggingItem={
              draggingItemId
                ? filteredItems.find((item) => item.id === draggingItemId) ?? null
                : null
            }
            onSelectDay={setSelectedDay}
            onDrop={onCalendarDrop}
            onDragOver={onCalendarDragOver}
            onOpenItem={openItem}
            onRenameItem={renameItem}
            onResize={beginResize}
            onCreateAt={openNewEvent}
            onCreateSpan={openNewSpan}
            onMoveAt={(item, day, hour, minute) =>
              scheduleAt(item.id, day, hour, minute)
            }
            compact={isCompact && zoom === "day"}
          />
        )}
      </section>

      <aside
        className={`quick-hud ${hudOpen ? "is-open" : ""} ${
          historyOpen ? "show-history" : ""
        }`}
      >
        {historyOpen ? (
          <>
            <header className="hud-header">
              <div>
                <span className="micro-label">Schedule states</span>
                <h2>History</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHistoryOpen(false);
                  setHudOpen(false);
                }}
                aria-label="Close history"
              >
                <X size={15} />
              </button>
            </header>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="hud-empty">
                  <History size={21} />
                  <p>Edits, moves, and approved proposals will appear here.</p>
                </div>
              ) : (
                history.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    onClick={() => setProposal(restoreProposal(entry, items))}
                  >
                    <span>{entry.label}</span>
                    <time>
                      {formatDate(new Date(entry.createdAt), {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    <small>Preview restore</small>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <header className="hud-header">
              <div>
                <span className="micro-label">Quick HUD</span>
                <h2>
                  {formatDate(dateFromKey(selectedDay), {
                    weekday: "long",
                    day: "numeric",
                  })}
                </h2>
              </div>
              <Activity size={17} />
              <button
                type="button"
                aria-label="Close Quick HUD"
                onClick={() => setHudOpen(false)}
              >
                <X size={15} />
              </button>
            </header>

            <section className="temporal-hud">
              <HudRow label="Now" item={nowItem} empty="Open time" />
              <HudRow label="Next" item={nextItem} empty="Nothing queued" />
              <div className="hud-later">
                <span>Later</span>
                {laterItems.length ? (
                  laterItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => openItem(item)}
                    >
                      <time>{formatTime(item.startsAt)}</time>
                      <strong>{item.title}</strong>
                    </button>
                  ))
                ) : (
                  <small>Space remains flexible</small>
                )}
              </div>
            </section>

            <section className="capacity-card">
              <div className="capacity-title">
                <span>Daily capacity</span>
                <strong>{dayCapacity.load}%</strong>
              </div>
              <div className="capacity-track">
                <i style={{ width: `${dayCapacity.load}%` }} />
              </div>
              <dl>
                <div>
                  <dt>
                    <span className="capacity-dot deep" /> Total load
                  </dt>
                  <dd>{dayCapacity.total}m</dd>
                </div>
                <div>
                  <dt>
                    <span className="capacity-dot focus" /> Deep focus
                  </dt>
                  <dd>{dayCapacity.deep}m</dd>
                </div>
                <div>
                  <dt>
                    <span className="capacity-dot social" /> Social
                  </dt>
                  <dd>{dayCapacity.social}m</dd>
                </div>
                <div>
                  <dt>
                    <span className="capacity-dot recovery" /> Recovery
                  </dt>
                  <dd>{dayCapacity.recovery}m</dd>
                </div>
              </dl>
            </section>

            <section className="insight-card">
              <div className="dock-title">
                <span>
                  <Focus size={13} /> Schedule signals
                </span>
              </div>
              {insights.length ? (
                <ul>
                  {insights.map((insight) => (
                    <li key={insight}>{insight}</li>
                  ))}
                </ul>
              ) : (
                <p>Your day has room to breathe.</p>
              )}
            </section>
          </>
        )}
      </aside>

      {(inboxOpen || homeworkOpen || hudOpen) && (
        <button
          className="panel-scrim"
          type="button"
          aria-label="Close contextual panel"
          onClick={() => {
            setInboxOpen(false);
            setHomeworkOpen(false);
            setHudOpen(false);
          }}
        />
      )}

      {intentionsOpen && <IntentionsPanel
        key={intentionSeed?.id ?? intentionSeed?.title ?? "intentions"}
        open={intentionsOpen}
        intentions={intentions}
        subjects={subjects}
        items={items}
        learningSignals={learningSignals}
        seed={intentionSeed}
        onClose={() => { setIntentionsOpen(false); setIntentionSeed(null); }}
        onSave={saveIntention}
        onDelete={deleteIntention}
        onStart={startIntention}
        onChallenge={recordChallenge}
        onGoDeeper={openGoDeeper}
      />}

      {deeperSource && (
        <GoDeeperPanel
          source={deeperSource}
          exploration={deeperExploration}
          busy={deeperBusy}
          error={deeperError}
          onClose={() => { setDeeperSource(null); setDeeperExploration(null); setDeeperError(""); }}
          onGenerate={(fresh) => generateDeeper(deeperSource, fresh).catch(() => undefined)}
          onSave={saveExploration}
          onStart={startExplorationDirection}
        />
      )}

      {nowOpen && nowResult && (
        <NowPanel
          result={nowResult}
          location={nowLocation}
          energy={nowEnergy}
          computerAvailable={nowComputerAvailable}
          onLocationChange={setNowLocation}
          onEnergyChange={setNowEnergy}
          onComputerAvailableChange={setNowComputerAvailable}
          onRefresh={() => setNowMoment(new Date().toISOString())}
          onStart={startNow}
          onClose={() => {
            setNowOpen(false);
            setNowMoment(null);
          }}
        />
      )}

      {paletteOpen && (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPaletteOpen(false);
          }}
        >
          <section className="command-palette" aria-label="Command palette">
            <header>
              <Command size={17} />
              <span>Command</span>
              <kbd>esc</kbd>
            </header>
            <div className="palette-modes">
              <button
                className={paletteMode === "command" ? "active" : ""}
                type="button"
                onClick={() => setPaletteMode("command")}
              >
                <Sparkles size={13} /> Create / transform
              </button>
              <button
                className={paletteMode === "filter" ? "active" : ""}
                type="button"
                onClick={() => setPaletteMode("filter")}
              >
                <Search size={13} /> Filter
              </button>
              <button
                className={paletteMode === "upload" ? "active" : ""}
                type="button"
                onClick={() => setPaletteMode("upload")}
              >
                <FileUp size={13} /> Document
              </button>
            </div>
            {paletteMode === "upload" ? (
              <div className="upload-drop">
                <FileUp size={24} />
                <h3>Document → proposed calendar</h3>
                <p>
                  Timetable, ticket, syllabus, poster, image, text, or PDF.
                  Nothing is applied without a diff.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={commandBusy}
                >
                  {commandBusy ? "Reading…" : "Choose document"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,text/plain,text/csv"
                  onChange={(event) =>
                    onDocumentSelected(event.target.files?.[0] ?? null)
                  }
                  hidden
                />
              </div>
            ) : (
              <form onSubmit={submitCommand}>
                <div className="palette-input">
                  {paletteMode === "command" ? (
                    <Sparkles size={18} />
                  ) : (
                    <Search size={18} />
                  )}
                  <input
                    autoFocus
                    value={commandText}
                    onChange={(event) => setCommandText(event.target.value)}
                    placeholder={
                      paletteMode === "filter"
                        ? "deep focus, task, chemistry…"
                        : "Chemistry pages 52–57 Thursday"
                    }
                    aria-label="Calendar command"
                  />
                  <button
                    type="submit"
                    disabled={!commandText.trim() || commandBusy}
                  >
                    {commandBusy
                      ? "Thinking…"
                      : commandIsHomework
                        ? "Capture"
                        : "Preview"}
                  </button>
                </div>
                {paletteMode === "command" && commandIsHomework ? (
                  <div
                    className="parsed-intent homework-intent"
                    aria-label="Parsed homework"
                  >
                    <span>Instant capture · local</span>
                    <div>
                      <strong>
                        {homeworkCommandPreview.matched.subject ?? "Homework"}
                      </strong>
                      <i>{homeworkCommandPreview.title}</i>
                      {homeworkCommandPreview.deadline && (
                        <>
                          <Move size={12} />
                          <i>
                            {formatDate(
                              new Date(homeworkCommandPreview.deadline),
                              {
                                weekday: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </i>
                        </>
                      )}
                      <i className="intent-shift">
                        {homeworkCommandPreview.taskType}
                      </i>
                    </div>
                  </div>
                ) : paletteMode === "command" && commandPreview ? (
                  <div className="parsed-intent" aria-label="Parsed command">
                    <span>Parsed intent</span>
                    <div>
                      <strong>{commandPreview.action}</strong>
                      <i>{commandPreview.subject}</i>
                      {commandPreview.timing && (
                        <>
                          <Move size={12} />
                          <i>{commandPreview.timing}</i>
                        </>
                      )}
                      {commandPreview.shift && (
                        <i className="intent-shift">{commandPreview.shift}</i>
                      )}
                    </div>
                  </div>
                ) : null}
              </form>
            )}
            {paletteMode === "command" && (
              <div className="command-examples">
                {[
                  "Chemistry pages 52–57 Thursday",
                  "Biology essay Friday 18:00",
                  "French vocab tomorrow",
                  "Move everything tomorrow afternoon one hour later",
                ].map((example) => (
                  <button
                    type="button"
                    key={example}
                    onClick={() => setCommandText(example)}
                  >
                    <ArrowDownToLine size={12} />
                    {example}
                  </button>
                ))}
              </div>
            )}
            <footer>
              <span>Schoolwork parses locally</span>
              <span>AI handles complex changes</span>
              <span>Rules validate</span>
            </footer>
          </section>
        </div>
      )}

      {proposal && (
        <div className="overlay proposal-overlay">
          <section
            className={`proposal-sheet${
              timetableSubjectProposal?.proposalId === proposal.id &&
              !timetableSubjectProposal.reviewed
                ? " subject-reviewing"
                : ""
            }`}
            aria-label="Calendar change preview"
          >
            <header>
              <div className="proposal-icon">
                <Layers3 size={19} />
              </div>
              <div>
                <span className="micro-label">Proposed changes</span>
                <h2>{proposal.title}</h2>
                <p>{proposal.summary}</p>
              </div>
              <button
                type="button"
                onClick={closeProposal}
                aria-label="Close proposal"
              >
                <X size={16} />
              </button>
            </header>
            {timetableSubjectProposal?.proposalId === proposal.id &&
            !timetableSubjectProposal.reviewed ? (
              <section className="subject-review-splash">
                <div className="subject-review-intro">
                  <span className="micro-label">Before the timetable</span>
                  <h3>Check the subjects I found</h3>
                  <p>
                    Unknown labels stay editable. Correct names, teachers, and
                    rooms now; nothing is saved until the final timetable review.
                  </p>
                </div>
                <div className="subject-review-grid">
                  {timetableSubjectProposal.subjects.map((subject, index) => (
                    <article className="subject-review-card" key={subject.id}>
                      <header>
                        <span
                          className="proposal-subject-dot"
                          style={{ background: subject.color }}
                        />
                        <strong>Subject {index + 1}</strong>
                        <button
                          type="button"
                          onClick={() => removeTimetableSubject(subject.id)}
                          aria-label={`Do not create ${subject.name || "this subject"}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </header>
                      <label className="subject-review-name">
                        <span>Name</span>
                        <input
                          autoFocus={index === 0}
                          value={subject.name}
                          onChange={(event) =>
                            updateTimetableSubject(subject.id, {
                              name: event.target.value,
                            })
                          }
                          placeholder="New subject"
                        />
                      </label>
                      <div className="subject-review-fields">
                        <label>
                          <span>Short</span>
                          <input
                            value={subject.shortName}
                            onChange={(event) =>
                              updateTimetableSubject(subject.id, {
                                shortName: event.target.value,
                              })
                            }
                            placeholder="BIO"
                          />
                        </label>
                        <label>
                          <span>Color</span>
                          <input
                            type="color"
                            value={subject.color}
                            onChange={(event) =>
                              updateTimetableSubject(subject.id, {
                                color: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Teacher</span>
                          <input
                            value={subject.teacher}
                            onChange={(event) =>
                              updateTimetableSubject(subject.id, {
                                teacher: event.target.value,
                              })
                            }
                            placeholder="Optional"
                          />
                        </label>
                        <label>
                          <span>Room</span>
                          <input
                            value={subject.room}
                            onChange={(event) =>
                              updateTimetableSubject(subject.id, {
                                room: event.target.value,
                              })
                            }
                            placeholder="Optional"
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="subject-review-actions">
                  <button type="button" onClick={addTimetableSubject}>
                    <Plus size={14} /> Add missing subject
                  </button>
                  <button
                    className="approve"
                    type="button"
                    onClick={finishTimetableSubjectReview}
                    disabled={timetableSubjectProposal.subjects.some(
                      (subject) =>
                        !subject.name.trim() || !subject.shortName.trim(),
                    )}
                  >
                    Continue to {proposal.changes.filter((change) => change.type === "create").length} periods
                  </button>
                </div>
              </section>
            ) : (
              <>
                {timetableSubjectProposal?.proposalId === proposal.id &&
                  timetableSubjectProposal.subjects.length > 0 && (
                    <section className="proposal-subject-preview">
                      <div>
                        <span className="micro-label">New subjects ready</span>
                        <button
                          type="button"
                          onClick={() =>
                            setTimetableSubjectProposal((current) =>
                              current ? { ...current, reviewed: false } : current,
                            )
                          }
                        >
                          Edit {timetableSubjectProposal.subjects.length}
                        </button>
                      </div>
                      <div className="proposal-subject-list">
                        {timetableSubjectProposal.subjects.map((subject) => (
                          <article key={subject.id}>
                            <span
                              className="proposal-subject-dot"
                              style={{ background: subject.color }}
                            />
                            <div>
                              <strong>{subject.name}</strong>
                              <small>
                                {[subject.shortName, subject.teacher, subject.room]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </small>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                <div className="proposal-list">
              {proposal.changes.map((change) => {
                const result = proposalValidation?.results.find(
                  (candidate) => candidate.changeId === change.id,
                );
                return (
                  <article
                    className={result?.valid ? "valid" : "invalid"}
                    key={change.id}
                  >
                    <span className={`change-type ${change.type}`}>
                      {change.type}
                    </span>
                    <div>
                      <h3>
                        {change.after?.title ??
                          change.before?.title ??
                          "Calendar item"}
                      </h3>
                      <p>{change.reason}</p>
                      {change.before && change.after && (
                        <div className="diff-row">
                          <span>{formatProposalTiming(change.before)}</span>
                          <Move size={12} />
                          <strong>{formatProposalTiming(change.after)}</strong>
                        </div>
                      )}
                      {!change.before && change.after && (
                        <div className="diff-row">
                          <strong>
                            {kindLabels[change.after.kind]} ·{" "}
                            {formatProposalTiming(change.after)}
                          </strong>
                        </div>
                      )}
                      {change.before && !change.after && (
                        <div className="diff-row">
                          <span>{formatProposalTiming(change.before)}</span>
                        </div>
                      )}
                      {result && !result.valid && (
                        <small className="validation-error">
                          {result.errors.join(" ")}
                        </small>
                      )}
                      {result?.warnings.map((warning) => (
                        <small className="validation-warning" key={warning}>
                          {warning}
                        </small>
                      ))}
                    </div>
                    <span className="validation-mark">
                      {result?.valid ? <Check size={14} /> : <X size={14} />}
                    </span>
                  </article>
                );
              })}
                </div>
                <footer>
              <div>
                <Lock size={13} />
                <span>
                  {proposalValidation?.valid
                    ? "Validated against fixed events, windows, deadlines, and durations."
                    : "Resolve invalid changes before applying."}
                </span>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={closeProposal}
              >
                Cancel
              </button>
              <button
                className="approve"
                type="button"
                onClick={approveProposal}
                disabled={!proposalValidation?.valid}
              >
                Apply{" "}
                {proposal.changes.length +
                  (timetableSubjectProposal?.proposalId === proposal.id
                    ? timetableSubjectProposal.subjects.length
                    : 0)}{" "}
                changes
              </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}

      {draftItem && selectedItem && (
        <div
          className="overlay item-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setSelectedItem(null);
              setDraftItem(null);
              setIsCreatingItem(false);
            }
          }}
        >
          <form className="item-inspector" onSubmit={saveDraft}>
            <header>
              <div>
                <span className="micro-label">
                  {isImportedTimetableItem(draftItem)
                    ? "Edit school period"
                    : isCreatingItem
                      ? "New calendar item"
                      : "Edit calendar item"}
                </span>
                {!isImportedTimetableItem(draftItem) && (
                  <div className="quick-kind-switch" aria-label="Item type">
                  {kinds.map((kind) => (
                    <button
                      className={draftItem.kind === kind ? "active" : ""}
                      type="button"
                      key={kind}
                      onClick={() =>
                        setDraftItem({
                          ...draftItem,
                          kind,
                          flexibility:
                            kind === "event"
                              ? "flexible"
                              : draftItem.flexibility === "fixed"
                                ? "flexible"
                                : draftItem.flexibility,
                        })
                      }
                    >
                      {kindLabels[kind]}
                    </button>
                  ))}
                  </div>
                )}
              </div>
              <button
                className="inspector-close"
                type="button"
                onClick={() => {
                  setSelectedItem(null);
                  setDraftItem(null);
                  setIsCreatingItem(false);
                }}
                aria-label="Close item editor"
              >
                <X size={16} />
              </button>
            </header>
            {isImportedTimetableItem(draftItem) && (
              <section className="school-period-subject">
                <label>
                  <span>Subject</span>
                  <select
                    autoFocus
                    value={
                      subjects.find((subject) =>
                        subjectsAreSimilar(
                          draftItem.title,
                          subject.name,
                          "",
                          subject.shortName,
                        ),
                      )?.id ??
                      (draftItem.title === "Assembly" ? "__assembly" : "__custom")
                    }
                    onChange={(event) => {
                      if (event.target.value === "__assembly") {
                        setDraftItem({
                          ...draftItem,
                          title: "Assembly",
                          energyType: "social",
                        });
                        return;
                      }
                      if (event.target.value === "__custom") return;
                      const subject = subjects.find(
                        (candidate) => candidate.id === event.target.value,
                      );
                      if (!subject) return;
                      setDraftItem({
                        ...draftItem,
                        title: subject.name,
                        subjectId: subject.id,
                        description:
                          draftItem.description ||
                          subject.teacher,
                      });
                    }}
                  >
                    <option value="__assembly">Assembly</option>
                    {subjects.map((subject) => (
                      <option value={subject.id} key={subject.id}>
                        {subject.name} ({subject.shortName})
                      </option>
                    ))}
                    <option value="__custom">Custom label</option>
                  </select>
                </label>
                <small>This changes only this period, not the whole subject.</small>
              </section>
            )}
            <input
              className="item-title-input"
              autoFocus={!isImportedTimetableItem(draftItem)}
              value={draftItem.title}
              onChange={(event) =>
                setDraftItem({ ...draftItem, title: event.target.value })
              }
              aria-label="Item title"
              placeholder={
                draftItem.kind === "event"
                  ? "What’s happening?"
                  : "What needs doing?"
              }
            />
            <section className="item-schedule-card">
              <header className="item-section-heading">
                <CalendarClock size={16} />
                <div>
                  <strong>Schedule</strong>
                  <small>
                    {draftItem.startsAt
                      ? formatProposalTiming(draftItem)
                      : "Leave unscheduled to keep it in your inbox"}
                  </small>
                </div>
              </header>
              <div className="item-schedule-row">
                <label className="item-start-field">
                  <span>Starts</span>
                  <TemporalField
                    mode="datetime"
                    value={toLocalInput(draftItem.startsAt)}
                    onChange={(value) => {
                      const startsAt = fromLocalInput(value);
                      const minutes = durationMinutes(draftItem);
                      setDraftItem({
                        ...draftItem,
                        startsAt,
                        endsAt: startsAt
                          ? new Date(
                              new Date(startsAt).getTime() + minutes * 60_000,
                            ).toISOString()
                          : null,
                        status: startsAt ? "scheduled" : "inbox",
                      });
                    }}
                    ariaLabel="Choose start date and time"
                  />
                </label>
                <label className="item-duration-field">
                  <span>Duration</span>
                  <select
                    value={durationMinutes(draftItem)}
                    disabled={!draftItem.startsAt || isAllDayItem(draftItem)}
                    onChange={(event) =>
                      setDraftItem(
                        itemWithDuration(draftItem, Number(event.target.value)),
                      )
                    }
                  >
                    {draftDurationOptions.map((minutes) => (
                      <option value={minutes} key={minutes}>
                        {minutes < 60
                          ? `${minutes} min`
                          : minutes % 60 === 0
                            ? `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`
                            : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!isImportedTimetableItem(draftItem) && draftItem.startsAt && (
                <button
                  className={`item-all-day-toggle ${
                    isAllDayItem(draftItem) ? "active" : ""
                  }`}
                  type="button"
                  aria-pressed={isAllDayItem(draftItem)}
                  onClick={() => setDraftItem(toggleAllDayItem(draftItem))}
                >
                  <span aria-hidden="true" /> All day
                </button>
              )}
            </section>
            {draftTimingError && (
              <p className="item-timing-error" role="alert">
                {draftTimingError}
              </p>
            )}
            {isCalendarSpanItem(draftItem) && (
              <p className="item-span-summary">
                <CalendarClock size={13} /> {formatSpan(draftItem)} · shown as a
                continuous span in every calendar view
              </p>
            )}
            {isImportedTimetableItem(draftItem) && (
              <div className="school-period-details">
                <label className="school-period-room">
                  <span>Room</span>
                  <input
                    value={draftItem.room}
                    onChange={(event) =>
                      setDraftItem({
                        ...draftItem,
                        room: event.target.value,
                      })
                    }
                    placeholder="e.g. KE114"
                    maxLength={80}
                  />
                  <small>This changes only this class occurrence.</small>
                </label>
                <label className="school-period-notes">
                  <span>Teacher & notes</span>
                  <textarea
                    value={draftItem.description}
                    onChange={(event) =>
                      setDraftItem({
                        ...draftItem,
                        description: event.target.value,
                      })
                    }
                    placeholder="Teacher · class details"
                  />
                </label>
              </div>
            )}
            <details className="item-more">
              <summary>
                <span>Details</span>
                <small>Notes, exact time & planning</small>
              </summary>
              {!isImportedTimetableItem(draftItem) && (
                <textarea
                  className="item-detail-notes"
                  value={draftItem.description}
                  onChange={(event) =>
                    setDraftItem({
                      ...draftItem,
                      description: event.target.value,
                    })
                  }
                  placeholder="Add notes (optional)"
                  aria-label="Item notes"
                />
              )}
              <div className="compact-options-grid">
                <label>
                  <span>Exact end</span>
                  <TemporalField
                    mode="datetime"
                    value={toLocalInput(draftItem.endsAt)}
                    onChange={(value) => {
                      const endsAt = fromLocalInput(value);
                      const minutes =
                        draftItem.startsAt && endsAt
                          ? Math.max(
                              5,
                              Math.round(
                                (new Date(endsAt).getTime() -
                                  new Date(draftItem.startsAt).getTime()) /
                                  60_000,
                              ),
                            )
                          : draftItem.durationMin;
                      setDraftItem({
                        ...draftItem,
                        endsAt,
                        durationMin: minutes,
                        durationMax: minutes,
                      });
                    }}
                    ariaLabel="Choose exact end date and time"
                  />
                </label>
                <label>
                  <span>Energy</span>
                  <select
                    value={draftItem.energyType}
                    onChange={(event) =>
                      setDraftItem({
                        ...draftItem,
                        energyType: event.target.value as EnergyType,
                      })
                    }
                  >
                    {energyTypes.map((energy) => (
                      <option key={energy} value={energy}>
                        {energyLabels[energy]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select
                    value={draftItem.priority}
                    onChange={(event) =>
                      setDraftItem({
                        ...draftItem,
                        priority: event.target.value as Priority,
                      })
                    }
                  >
                    {priorities.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                {!isImportedTimetableItem(draftItem) && (
                  <>
                    <label>
                      <span>Deadline</span>
                      <TemporalField
                        mode="datetime"
                        value={toLocalInput(draftItem.deadline)}
                        onChange={(value) =>
                          setDraftItem({
                            ...draftItem,
                            deadline: fromLocalInput(value),
                          })
                        }
                        placeholder="No deadline"
                        ariaLabel="Choose deadline"
                      />
                    </label>
                    <label>
                      <span>Flexibility</span>
                      <select
                        value={draftItem.flexibility}
                        disabled={isCreatingItem && draftItem.kind === "event"}
                        onChange={(event) =>
                          setDraftItem({
                            ...draftItem,
                            flexibility: event.target.value as Flexibility,
                          })
                        }
                      >
                        {(isCreatingItem && draftItem.kind === "event"
                          ? (["flexible"] as Flexibility[])
                          : flexibilities
                        ).map((flexibility) => (
                          <option key={flexibility}>{flexibility}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Window starts</span>
                      <TemporalField
                        mode="datetime"
                        value={toLocalInput(draftItem.windowStart)}
                        onChange={(value) =>
                          setDraftItem({
                            ...draftItem,
                            windowStart: fromLocalInput(value),
                          })
                        }
                        placeholder="No start"
                        ariaLabel="Choose window start"
                      />
                    </label>
                    <label>
                      <span>Window ends</span>
                      <TemporalField
                        mode="datetime"
                        value={toLocalInput(draftItem.windowEnd)}
                        onChange={(value) =>
                          setDraftItem({
                            ...draftItem,
                            windowEnd: fromLocalInput(value),
                          })
                        }
                        placeholder="No end"
                        ariaLabel="Choose window end"
                      />
                    </label>
                  </>
                )}
              </div>
              <label className="constraint-field">
                <span>Constraints</span>
                <input
                  value={draftItem.constraints.join(", ")}
                  onChange={(event) =>
                    setDraftItem({
                      ...draftItem,
                      constraints: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="after school, before deadline"
                />
              </label>
              {draftItem.kind === "task" && (
                <>
                  <label className="constraint-field">
                    <span>Work type</span>
                    <select
                      value={draftItem.workType ?? ""}
                      onChange={(event) => {
                        const workType =
                          (event.target.value as SchoolWorkType) || null;
                        const template = workType
                          ? schoolDaySettings.focusTemplates[workType]
                          : null;
                        setDraftItem({
                          ...draftItem,
                          workType,
                          energyType: energyTypeForWorkType(workType),
                          ...(template
                            ? {
                                durationMin: template.durationMin,
                                durationMax: template.durationMax,
                                endsAt: draftItem.startsAt
                                  ? new Date(
                                      new Date(draftItem.startsAt).getTime() +
                                        template.durationMin * 60_000,
                                    ).toISOString()
                                  : null,
                              }
                            : {}),
                        });
                      }}
                    >
                      <option value="">Unspecified</option>
                      {schoolWorkTypes.map((workType) => (
                        <option value={workType} key={workType}>
                          {WORK_TYPE_LABELS[workType]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="constraint-field">
                    <span>Required energy</span>
                    <select
                      value={draftItem.requiredEnergy}
                      onChange={(event) =>
                        setDraftItem({
                          ...draftItem,
                          requiredEnergy: event.target
                            .value as EnergyRequirement,
                        })
                      }
                    >
                      {energyRequirements.map((energy) => (
                        <option value={energy} key={energy}>
                          {energy}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="constraint-field">
                    <span>Work context</span>
                    <select
                      value={draftItem.taskContext}
                      onChange={(event) =>
                        setDraftItem({
                          ...draftItem,
                          taskContext: event.target.value as TaskContext,
                        })
                      }
                    >
                      <option value="anywhere">Anywhere</option>
                      <option value="school">School</option>
                      <option value="home">Home</option>
                      <option value="library">Library</option>
                    </select>
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={draftItem.computerRequired}
                      onChange={(event) =>
                        setDraftItem({
                          ...draftItem,
                          computerRequired: event.target.checked,
                        })
                      }
                    />
                    Computer required
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={draftItem.splittable}
                      onChange={(event) =>
                        setDraftItem({
                          ...draftItem,
                          splittable: event.target.checked,
                        })
                      }
                    />
                    May be split into sessions
                  </label>
                </>
              )}
            </details>
            {!isCreatingItem &&
              (selectedItem.kind === "task" ||
                selectedItem.subjectId ||
                selectedItem.assignmentId ||
                selectedItem.assessmentId) && (
                <LearningControls
                  source={sourceForCalendarItem(selectedItem)}
                  value={latestSignalFor(sourceForCalendarItem(selectedItem), learningSignals)?.challengeLevel ?? null}
                  onChallenge={recordChallenge}
                  onGoDeeper={openGoDeeper}
                />
              )}
            <footer>
              {!isCreatingItem && (
                <button
                  className="delete"
                  type="button"
                  onClick={() => deleteItem(selectedItem)}
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
              {!isCreatingItem &&
                selectedItem.flexibility !== "fixed" &&
                selectedItem.status === "scheduled" && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      unscheduleItem(selectedItem.id);
                      setSelectedItem(null);
                      setDraftItem(null);
                    }}
                  >
                    Unschedule
                  </button>
                )}
              {!isCreatingItem &&
                selectedItem.kind === "task" &&
                (selectedItem.assignmentId || selectedItem.intentionId) && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      toggleAssignmentSession(selectedItem);
                      setSelectedItem(null);
                      setDraftItem(null);
                    }}
                  >
                    <Check size={14} />
                    {selectedItem.status === "completed"
                      ? "Reopen session"
                      : "Mark complete"}
                  </button>
                )}
              {!isCreatingItem &&
                selectedItem.kind === "task" &&
                selectedItem.assessmentId &&
                !selectedItem.learnedAt && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      const assessment = assessments.find(
                        (entry) => entry.id === selectedItem.assessmentId,
                      );
                      if (assessment) {
                        markRevisionLearned(selectedItem, assessment);
                      }
                      setSelectedItem(null);
                      setDraftItem(null);
                    }}
                  >
                    <Check size={14} /> Mark learned
                  </button>
                )}
              <button
                className="save"
                type="submit"
                disabled={!draftItem.title.trim() || Boolean(draftTimingError)}
              >
                {isCreatingItem
                  ? `Create ${kindLabels[draftItem.kind].toLowerCase()}`
                  : "Save changes"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {accountOpen && (
        <section className="account-card" aria-label="Account">
          <button
            className="account-close"
            type="button"
            onClick={() => setAccountOpen(false)}
            aria-label="Close account"
          >
            <X size={14} />
          </button>
          {user ? (
            <>
              <Cloud size={18} />
              <h2>Calendar synced</h2>
              <p>{user.email}</p>
              <div className="account-invites">
                <h3>Invite someone</h3>
                <p>Copy a one-time link, or create their account and email a verification code.</p>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="friend@example.com"
                  aria-label="Friend's email address"
                />
                <div className="account-invite-actions">
                  <button
                    type="button"
                    disabled={inviteBusy}
                    onClick={() => createInvitation(false)}
                  >
                    Copy invite link
                  </button>
                  <button
                    type="button"
                    disabled={inviteBusy || !inviteEmail.trim()}
                    onClick={() => createInvitation(true)}
                  >
                    {inviteBusy ? "Working…" : "Create & send code"}
                  </button>
                </div>
                {inviteUrl && (
                  <button
                    className="invite-url"
                    type="button"
                    onClick={() => navigator.clipboard.writeText(inviteUrl)}
                    title={inviteUrl}
                  >
                    {inviteUrl}
                  </button>
                )}
              </div>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : authSent ? (
            <>
              <Lock size={18} />
              <h2>Enter your code</h2>
              <p>We sent a single-use verification code to {email}.</p>
              <form onSubmit={verifyCode}>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  placeholder="Verification code"
                  minLength={6}
                  maxLength={8}
                  required
                  autoFocus
                  aria-label="Verification code"
                />
                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Checking…" : "Verify & sign in"}
                </button>
              </form>
              <button type="button" onClick={() => { setAuthSent(false); setVerificationCode(""); }}>
                Use another email
              </button>
            </>
          ) : (
            <>
              <Cloud size={18} />
              <h2>{inviteToken ? "Accept your invitation" : "Sync every device"}</h2>
              <p>
                {inviteToken
                  ? "Enter your email and we'll create your account with a single-use code."
                  : "Enter your email to receive a single-use sign-in code."}
              </p>
              <form onSubmit={sendVerificationCode}>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  aria-label="Email address"
                />
                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Sending…" : "Send verification code"}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </main>
  );
}

export function UpcomingView({
  items,
  onOpenItem,
  onCreate,
  commandText,
  commandBusy,
  onCommandChange,
  onCommandSubmit,
  onOpenCommand,
  onOpenNow,
}: {
  items: CalendarItem[];
  onOpenItem: (item: CalendarItem) => void;
  onCreate: () => void;
  commandText: string;
  commandBusy: boolean;
  onCommandChange: (value: string) => void;
  onCommandSubmit: (event: FormEvent) => void;
  onOpenCommand: () => void;
  onOpenNow: () => void;
}) {
  return (
    <section className="upcoming-view" aria-label="Five soonest events">
      <form className="upcoming-command" onSubmit={onCommandSubmit}>
        <Sparkles size={17} />
        <input
          value={commandText}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder="Add homework or change your schedule…"
          aria-label="Quick calendar command"
        />
        <button
          className="upcoming-command-expand"
          type="button"
          onClick={onOpenCommand}
          aria-label="Open full command palette"
        >
          ⌘K
        </button>
        <button
          className="upcoming-command-submit"
          type="submit"
          disabled={!commandText.trim() || commandBusy}
        >
          {commandBusy ? "Planning…" : "Preview"}
        </button>
      </form>
      <button className="now-launcher" type="button" onClick={onOpenNow}>
        <span className="now-launcher-icon">
          <Play size={16} fill="currentColor" />
        </span>
        <span>
          <strong>What should I do now?</strong>
          <small>Find the best task for the time and energy you have.</small>
        </span>
        <span className="now-launcher-action">
          Decide now <ChevronRight size={14} />
        </span>
      </button>
      <header>
        <div>
          <span className="micro-label">Upcoming</span>
          <h2>Your next five</h2>
          <p>A focused list of what is scheduled next.</p>
        </div>
        <button type="button" onClick={onCreate}>
          <CalendarPlus size={15} />
          New event
        </button>
      </header>
      {items.length ? (
        <div className="upcoming-list">
          {items.map((item, index) => (
            <button
              className={`upcoming-item energy-${item.energyType} kind-${item.kind} flex-${item.flexibility}`}
              type="button"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <span className="upcoming-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <time>
                <strong>
                  {formatDate(new Date(item.startsAt!), {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </strong>
                <small>{formatRange(item)}</small>
              </time>
              <i aria-hidden="true" />
              <span className="upcoming-copy">
                <strong>{item.title}</strong>
                <small>
                  {kindLabels[item.kind]} · {energyLabels[item.energyType]}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <div className="upcoming-empty">
          <List size={21} />
          <h3>Nothing scheduled yet</h3>
          <p>Create an event here, or click any time in the calendar.</p>
          <button type="button" onClick={onCreate}>
            <Plus size={14} /> Add the first event
          </button>
        </div>
      )}
    </section>
  );
}

function NowPanel({
  result,
  location,
  energy,
  computerAvailable,
  onLocationChange,
  onEnergyChange,
  onComputerAvailableChange,
  onRefresh,
  onStart,
  onClose,
}: {
  result: NowRecommendationResult;
  location: CurrentStudyLocation;
  energy: EnergyRequirement;
  computerAvailable: boolean;
  onLocationChange: (value: CurrentStudyLocation) => void;
  onEnergyChange: (value: EnergyRequirement) => void;
  onComputerAvailableChange: (value: boolean) => void;
  onRefresh: () => void;
  onStart: (recommendation: NowRecommendation) => void;
  onClose: () => void;
}) {
  const locations: CurrentStudyLocation[] = [
    "home",
    "school",
    "library",
    "commute",
  ];
  const energies: EnergyRequirement[] = ["low", "medium", "high"];
  return (
    <div
      className="overlay now-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="now-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="now-panel-title"
      >
        <header>
          <span className="now-panel-mark">
            <Zap size={17} fill="currentColor" />
          </span>
          <div>
            <span className="micro-label">Decision mode</span>
            <h2 id="now-panel-title">What should I do now?</h2>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh options"
          >
            <RefreshCw size={15} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="now-context">
          <fieldset>
            <legend>Where are you?</legend>
            <div className="now-segments">
              {locations.map((value) => (
                <button
                  className={location === value ? "active" : ""}
                  type="button"
                  key={value}
                  onClick={() => onLocationChange(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Energy right now</legend>
            <div className="now-segments">
              {energies.map((value) => (
                <button
                  className={energy === value ? "active" : ""}
                  type="button"
                  key={value}
                  onClick={() => onEnergyChange(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="now-tool-toggle">
            <input
              type="checkbox"
              checked={computerAvailable}
              onChange={(event) =>
                onComputerAvailableChange(event.target.checked)
              }
            />
            <Laptop size={14} />
            Computer available
          </label>
        </div>

        <div className="now-window">
          <CalendarClock size={17} />
          {result.nextFixed ? (
            <div>
              <strong>
                {result.nextFixed.current
                  ? `${result.nextFixed.title} is happening now`
                  : `You have ${result.availableMinutes} minutes`}
              </strong>
              <span>
                {result.nextFixed.current
                  ? `Until ${formatDate(new Date(result.nextFixed.endsAt), {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : `Before ${result.nextFixed.title} at ${formatDate(
                      new Date(result.nextFixed.startsAt),
                      { hour: "2-digit", minute: "2-digit" },
                    )}`}
              </span>
            </div>
          ) : (
            <div>
              <strong>{result.availableMinutes} usable minutes</strong>
              <span>No fixed event in the next two hours.</span>
            </div>
          )}
        </div>

        {result.recommendations.length ? (
          <div className="now-recommendations">
            {result.recommendations.map((recommendation, index) => (
              <article
                className={index === 0 ? "is-best" : ""}
                key={recommendation.id}
              >
                <span className="now-rank">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="now-recommendation-copy">
                  <div>
                    <h3>{recommendation.title}</h3>

                    <span className="now-duration">
                      {recommendation.durationMinutes} min
                    </span>
                  </div>
                  <p>{recommendation.detail}</p>
                  <ul aria-label="Why this was recommended">
                    {recommendation.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <button
                  className="now-start"
                  type="button"
                  onClick={() => onStart(recommendation)}
                >
                  <Play size={13} fill="currentColor" />
                  {recommendation.source === "exploration" ? "Explore" : "Start"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="now-empty">
            <Focus size={20} />
            <h3>Nothing suitable right now</h3>
            <p>
              {result.blockedReason ??
                result.freeTimeReason ??
                "Try changing your location, energy, or available tools."}
            </p>
          </div>
        )}
        <footer>
          <Lock size={12} />
          Ranked locally from time, urgency, context, energy, challenge, recent
          work, tools, and progress. Nothing starts until you choose it.
        </footer>
      </section>
    </div>
  );
}

function MobileAgenda({
  mode,
  days,
  items,
  subjects,
  selectedDay,
  onSelectDay,
  onOpenItem,
  onQuickCapture,
}: {
  mode: "day" | "week";
  days: Date[];
  items: CalendarItem[];
  subjects: Subject[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
  onOpenItem: (item: CalendarItem) => void;
  onQuickCapture: () => void;
}) {
  const selectedDate = dateFromKey(selectedDay);
  const scheduled = items
    .filter(
      (item) =>
        item.status === "scheduled" &&
        item.startsAt &&
        item.endsAt &&
        itemOverlapsDay(item, selectedDay),
    )
    .sort(
      (a, b) =>
        new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
    );
  const possible = items.filter(
    (item) =>
      item.status === "inbox" &&
      item.windowStart &&
      dateKey(new Date(item.windowStart)) === selectedDay,
  );
  const unscheduled = items
    .filter((item) => item.status === "inbox" && !possible.includes(item))
    .slice(0, 4);
  const capacity = capacityForDay(items, selectedDay);

  return (
    <section className="mobile-agenda">
      <div className="mobile-capture">
        <button type="button" onClick={onQuickCapture}>
          <Plus size={17} />
          <span>What needs time?</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      <div className="mobile-date-ribbon">
        {days.map((day) => {
          const key = dateKey(day);
          const dayLoad = capacityForDay(items, key);
          return (
            <button
              className={`${key === selectedDay ? "selected" : ""} ${
                key === dateKey(new Date()) ? "today" : ""
              }`}
              type="button"
              key={key}
              onClick={() => onSelectDay(key)}
            >
              <span>{formatDate(day, { weekday: "short" })}</span>
              <strong>{day.getDate()}</strong>
              <i>
                <b style={{ width: `${dayLoad.load}%` }} />
              </i>
            </button>
          );
        })}
      </div>

      <header className="mobile-agenda-header">
        <div>
          <span className="micro-label">{mode === "day" ? "Day" : "Week"} agenda</span>
          <h2>
            {formatDate(selectedDate, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h2>
        </div>
        <span>
          {capacity.total ? `${capacity.total} min planned` : "Open day"}
        </span>
      </header>

      <div className="agenda-list">
        {scheduled.length === 0 && (
          <div className="agenda-open-space">
            <span />
            <div>
              <strong>Open time</strong>
              <p>Nothing fixed here. Keep it open or give a task some room.</p>
            </div>
          </div>
        )}
        {scheduled.map((item) => (
          <button
            className={`agenda-item kind-${item.kind} flex-${item.flexibility} energy-${item.energyType} priority-${item.priority} ${urgencyClass(
              item,
            )}`}
            type="button"
            key={item.id}
            style={classColorStyle(item, subjects)}
            onClick={() => onOpenItem(item)}
          >
            <time>
              {isCalendarSpanItem(item) ? "Span" : formatTime(item.startsAt)}
              <small>
                {isCalendarSpanItem(item)
                  ? formatSpan(item)
                  : formatTime(item.endsAt)}
              </small>
            </time>
            <span className="agenda-shape" />
            <div>
              <strong>{item.title}</strong>
              {isImportedTimetableItem(item) && timetableRoomForItem(item) && (
                <span className="calendar-class-room">
                  Room {timetableRoomForItem(item)}
                </span>
              )}
              <small>
                {isCalendarSpanItem(item)
                  ? `${kindLabels[item.kind]} · continues across days`
                  : `${energyLabels[item.energyType]} · ${durationMinutes(item)} min`}
              </small>
            </div>
          </button>
        ))}
      </div>

      {possible.length > 0 && (
        <section className="agenda-possibilities">
          <header>
            <span>Could fit today</span>
            <small>Flexible window</small>
          </header>
          {possible.map((item) => (
            <button
              className={`agenda-possibility energy-${item.energyType}`}
              type="button"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <span />
              <div>
                <strong>{item.title}</strong>
                <small>{formatRange(item)}</small>
              </div>
              <Sparkles size={14} />
            </button>
          ))}
        </section>
      )}

      {unscheduled.length > 0 && (
        <section className="agenda-unscheduled">
          <header>
            <span>Still unscheduled</span>
            <small>{unscheduled.length}</small>
          </header>
          {unscheduled.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => onOpenItem(item)}
            >
              <span className={`energy-${item.energyType}`} />
              <strong>{item.title}</strong>
              <small>{item.durationMin} min</small>
            </button>
          ))}
        </section>
      )}
    </section>
  );
}

function InlineItemTitle({
  item,
  onRename,
}: {
  item: CalendarItem;
  onRename: (item: CalendarItem, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);

  useEffect(() => setTitle(item.title), [item.title]);

  function finish() {
    const nextTitle = title.trim();
    if (nextTitle) onRename(item, nextTitle);
    else setTitle(item.title);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        className="inline-item-title-input"
        value={title}
        autoFocus
        aria-label={`Rename ${item.title}`}
        onChange={(event) => setTitle(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setTitle(item.title);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <strong
      className="inline-item-title"
      role="button"
      tabIndex={0}
      title="Click to rename"
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          setEditing(true);
        }
      }}
    >
      {item.title}
    </strong>
  );
}

function TimeCalendar({
  days,
  items,
  subjects,
  proposal,
  rowHeight,
  selectedDay,
  resizing,
  dragSnap,
  draggingItem,
  onSelectDay,
  onDrop,
  onDragOver,
  onOpenItem,
  onRenameItem,
  onResize,
  onCreateAt,
  onCreateSpan,
  onMoveAt,
  compact = false,
}: {
  days: Date[];
  items: CalendarItem[];
  subjects: Subject[];
  proposal: CalendarProposal | null;
  rowHeight: number;
  selectedDay: string;
  resizing: {
    id: string;
    minutes: number;
    startsAt: string;
    endsAt: string;
  } | null;
  dragSnap: { day: string; hour: number; minute: number } | null;
  draggingItem: CalendarItem | null;
  onSelectDay: (day: string) => void;
  onDrop: (event: DragEvent, day: string, hour: number, minute: number) => void;
  onDragOver: (
    event: DragEvent,
    day: string,
    hour: number,
    minute: number,
  ) => void;
  onOpenItem: (item: CalendarItem) => void;
  onRenameItem: (item: CalendarItem, title: string) => void;
  onResize: (
    event: ReactPointerEvent,
    item: CalendarItem,
    rowHeight: number,
    edge: "start" | "end",
  ) => void;
  onCreateAt: (
    day: string,
    hour: number,
    minute: number,
    duration?: number,
  ) => void;
  onCreateSpan: (startDay: string, endDay: string) => void;
  onMoveAt: (
    item: CalendarItem,
    day: string,
    hour: number,
    minute: number,
  ) => void;
  compact?: boolean;
}) {
  const hours = DAY_HOURS;
  const [creationRange, setCreationRange] = useState<{
    day: string;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const creationGesture = useRef<{
    day: string;
    anchorMinute: number;
    moved: boolean;
  } | null>(null);
  const mobileCreationGesture = useRef<{
    day: string;
    anchorMinute: number;
    currentMinute: number;
    startX: number;
    startY: number;
    activated: boolean;
    timer: number;
  } | null>(null);
  const mobileCreationScrollBlocker = useRef<
    ((event: globalThis.TouchEvent) => void) | null
  >(null);
  const [mobileMovePreview, setMobileMovePreview] = useState<{
    id: string;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  const [desktopMovePreview, setDesktopMovePreview] = useState<{
    item: CalendarItem;
    day: string;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  const desktopMoveGesture = useRef<{
    item: CalendarItem;
    pointerId: number;
    startX: number;
    startY: number;
    grabOffsetMinutes: number;
    active: boolean;
    preview: {
      day: string;
      startsAt: string;
      endsAt: string;
    } | null;
  } | null>(null);
  const suppressDesktopMoveClickUntil = useRef(0);
  const mobileMoveGesture = useRef<{
    item: CalendarItem;
    day: string;
    grabOffsetMinutes: number;
    currentStartMinute: number;
    startX: number;
    startY: number;
    activated: boolean;
    timer: number;
  } | null>(null);
  const suppressMobileMoveClickUntil = useRef(0);
  const suppressCreateClick = useRef(false);
  const [spanCreation, setSpanCreation] = useState<{
    startIndex: number;
    endIndex: number;
  } | null>(null);
  const spanCreationGesture = useRef<{
    anchorIndex: number;
  } | null>(null);
  const calendarRef = useRef<HTMLElement>(null);
  const autoScrolledDayRef = useRef<string | null>(null);
  const axisWidth = compact ? 44 : 52;
  const bodyHeight = hours.reduce(
    (total, hour) => total + hourHeight(hour, rowHeight),
    0,
  );
  const proposalOrigins = new Set(
    proposal?.changes
      .filter((change) => change.before)
      .map((change) => change.before!.id) ?? [],
  );
  const proposalItems =
    proposal?.changes.flatMap((change) =>
      change.after ? [change.after] : [],
    ) ?? [];
  const spanningItems = items.filter(
    (item) =>
      item.status === "scheduled" &&
      isCalendarSpanItem(item) &&
      days.some((day) => itemOverlapsDay(item, dateKey(day))),
  );
  const proposedSpanningItems = proposalItems.filter(
    (item) =>
      item.status === "scheduled" &&
      isCalendarSpanItem(item) &&
      days.some((day) => itemOverlapsDay(item, dateKey(day))),
  );

  useEffect(() => {
    if (!compact || days.length !== 1) return;
    const day = dateKey(days[0]);
    if (autoScrolledDayRef.current === day) return;
    autoScrolledDayRef.current = day;
    const frame = window.requestAnimationFrame(() => {
      const calendar = calendarRef.current;
      const viewport = calendar?.closest<HTMLElement>(".calendar-stage");
      if (!calendar || !viewport) return;
      const now = new Date();
      const focusHour = day === dateKey(now) ? Math.max(6, now.getHours() - 2) : 7;
      viewport.scrollTo({
        top: Math.max(
          0,
          calendar.offsetTop + timeOffset(focusHour, 0, rowHeight) -
            Math.min(window.innerHeight * 0.2, 150),
        ),
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [compact, days, rowHeight]);

  useEffect(
    () => () => {
      const gesture = mobileCreationGesture.current;
      if (gesture) window.clearTimeout(gesture.timer);
      const moveGesture = mobileMoveGesture.current;
      if (moveGesture) window.clearTimeout(moveGesture.timer);
      const blocker = mobileCreationScrollBlocker.current;
      if (blocker) document.removeEventListener("touchmove", blocker);
    },
    [],
  );

  function minuteFromClientY(element: HTMLElement, clientY: number) {
    const column = element.closest<HTMLElement>(".day-column");
    if (!column) return 0;
    const rect = column.getBoundingClientRect();
    const time = timeAtOffset(clientY - rect.top, rowHeight);
    return time.hour * 60 + time.minute;
  }

  function minuteFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    return minuteFromClientY(event.currentTarget, event.clientY);
  }

  function clearMobileCreation(clearSelection = true) {
    const gesture = mobileCreationGesture.current;
    if (gesture) window.clearTimeout(gesture.timer);
    mobileCreationGesture.current = null;
    unlockMobileCreationScroll();
    if (clearSelection) setCreationRange(null);
  }

  function clearMobileMove(clearPreview = true) {
    const gesture = mobileMoveGesture.current;
    if (gesture) window.clearTimeout(gesture.timer);
    mobileMoveGesture.current = null;
    unlockMobileCreationScroll();
    if (clearPreview) setMobileMovePreview(null);
  }

  function clearDesktopMove(clearPreview = true) {
    desktopMoveGesture.current = null;
    if (clearPreview) setDesktopMovePreview(null);
  }

  function desktopMovePosition(
    gesture: NonNullable<typeof desktopMoveGesture.current>,
    clientX: number,
    clientY: number,
  ) {
    const body = calendarRef.current?.querySelector<HTMLElement>(".time-body");
    if (!body || days.length === 0) return null;
    const rect = body.getBoundingClientRect();
    const columnsWidth = Math.max(1, rect.width - axisWidth);
    const dayWidth = columnsWidth / days.length;
    const relativeX = Math.max(
      0,
      Math.min(columnsWidth - 1, clientX - rect.left - axisWidth),
    );
    const day = dateKey(days[Math.floor(relativeX / dayWidth)] ?? days[0]);
    const pointerTime = timeAtOffset(clientY - rect.top, rowHeight);
    const pointerMinute = pointerTime.hour * 60 + pointerTime.minute;
    const duration = Math.max(15, durationMinutes(gesture.item));
    const startMinute = Math.max(
      0,
      Math.min(
        24 * 60 - duration,
        Math.round((pointerMinute - gesture.grabOffsetMinutes) / 15) * 15,
      ),
    );
    const start = dateFromKey(day);
    start.setHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
    return {
      item: gesture.item,
      day,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
    };
  }

  function beginDesktopMove(
    event: ReactPointerEvent<HTMLElement>,
    item: CalendarItem,
  ) {
    if (
      compact ||
      event.pointerType === "touch" ||
      event.button !== 0 ||
      item.flexibility === "fixed" ||
      event.target instanceof Element && event.target.closest(".resize-handle")
    ) {
      return;
    }
    clearDesktopMove();
    const pointerMinute = minuteFromClientY(event.currentTarget, event.clientY);
    const start = new Date(item.startsAt!);
    desktopMoveGesture.current = {
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabOffsetMinutes:
        pointerMinute - (start.getHours() * 60 + start.getMinutes()),
      active: false,
      preview: null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDesktopEvent(event: ReactPointerEvent<HTMLElement>) {
    const gesture = desktopMoveGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.active) {
      const distance = Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      );
      if (distance < 5) return;
      gesture.active = true;
    }
    event.preventDefault();
    event.stopPropagation();
    const preview = desktopMovePosition(gesture, event.clientX, event.clientY);
    if (preview) {
      gesture.preview = {
        day: preview.day,
        startsAt: preview.startsAt,
        endsAt: preview.endsAt,
      };
      setDesktopMovePreview(preview);
    }
  }

  function finishDesktopMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = desktopMoveGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const preview = gesture.preview;
    clearDesktopMove();
    if (!gesture.active || !preview) return;
    event.preventDefault();
    event.stopPropagation();
    suppressDesktopMoveClickUntil.current = performance.now() + 500;
    const start = new Date(preview.startsAt);
    onMoveAt(
      gesture.item,
      preview.day,
      start.getHours(),
      start.getMinutes(),
    );
  }

  function cancelDesktopMove() {
    clearDesktopMove();
  }

  function lockMobileCreationScroll() {
    if (mobileCreationScrollBlocker.current) return;
    const blocker = (event: globalThis.TouchEvent) => {
      if (
        mobileCreationGesture.current?.activated ||
        mobileMoveGesture.current?.activated
      ) {
        event.preventDefault();
      }
    };
    mobileCreationScrollBlocker.current = blocker;
    document.addEventListener("touchmove", blocker, { passive: false });
  }

  function unlockMobileCreationScroll() {
    const blocker = mobileCreationScrollBlocker.current;
    if (!blocker) return;
    document.removeEventListener("touchmove", blocker);
    mobileCreationScrollBlocker.current = null;
  }

  function beginMobileCreation(
    event: ReactTouchEvent<HTMLButtonElement>,
    day: string,
  ) {
    if (!compact || event.touches.length !== 1) return;
    clearMobileMove();
    clearMobileCreation();
    const touch = event.touches[0];
    const button = event.currentTarget;
    const anchorMinute = minuteFromClientY(button, touch.clientY);
    const gesture = {
      day,
      anchorMinute,
      currentMinute: Math.min(24 * 60, anchorMinute + 60),
      startX: touch.clientX,
      startY: touch.clientY,
      activated: false,
      timer: 0,
    };
    gesture.timer = window.setTimeout(() => {
      if (mobileCreationGesture.current !== gesture) return;
      gesture.activated = true;
      lockMobileCreationScroll();
      setCreationRange({
        day,
        startMinute: anchorMinute,
        endMinute: gesture.currentMinute,
      });
      navigator.vibrate?.(10);
    }, 420);
    mobileCreationGesture.current = gesture;
  }

  function moveMobileCreation(event: ReactTouchEvent<HTMLButtonElement>) {
    const gesture = mobileCreationGesture.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;
    if (!gesture.activated) {
      const distance = Math.hypot(
        touch.clientX - gesture.startX,
        touch.clientY - gesture.startY,
      );
      if (distance > 10) clearMobileCreation();
      return;
    }

    event.preventDefault();
    gesture.currentMinute = minuteFromClientY(event.currentTarget, touch.clientY);
    const startMinute = Math.min(gesture.anchorMinute, gesture.currentMinute);
    const endMinute = Math.max(
      Math.max(gesture.anchorMinute, gesture.currentMinute),
      Math.min(24 * 60, startMinute + 15),
    );
    setCreationRange({ day: gesture.day, startMinute, endMinute });
  }

  function finishMobileCreation(event: ReactTouchEvent<HTMLButtonElement>) {
    const gesture = mobileCreationGesture.current;
    if (!gesture) return;
    window.clearTimeout(gesture.timer);
    mobileCreationGesture.current = null;
    unlockMobileCreationScroll();
    setCreationRange(null);
    if (!gesture.activated) return;

    event.preventDefault();
    const startMinute = Math.min(gesture.anchorMinute, gesture.currentMinute);
    const endMinute = Math.max(
      Math.max(gesture.anchorMinute, gesture.currentMinute),
      Math.min(24 * 60, startMinute + 15),
    );
    onCreateAt(
      gesture.day,
      Math.floor(startMinute / 60),
      startMinute % 60,
      Math.max(15, endMinute - startMinute),
    );
  }

  function setMobileMovePosition(
    gesture: NonNullable<typeof mobileMoveGesture.current>,
    startMinute: number,
  ) {
    const duration = Math.max(15, durationMinutes(gesture.item));
    const boundedStart = Math.max(0, Math.min(24 * 60 - duration, startMinute));
    gesture.currentStartMinute = boundedStart;
    const start = dateFromKey(gesture.day);
    start.setHours(Math.floor(boundedStart / 60), boundedStart % 60, 0, 0);
    setMobileMovePreview({
      id: gesture.item.id,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
    });
  }

  function beginMobileMove(
    event: ReactTouchEvent<HTMLElement>,
    item: CalendarItem,
    day: string,
  ) {
    if (
      !compact ||
      item.flexibility === "fixed" ||
      event.touches.length !== 1
    ) {
      return;
    }
    clearMobileCreation();
    clearMobileMove();
    const touch = event.touches[0];
    const touchMinute = minuteFromClientY(event.currentTarget, touch.clientY);
    const start = new Date(item.startsAt!);
    const startMinute = start.getHours() * 60 + start.getMinutes();
    const gesture = {
      item,
      day,
      grabOffsetMinutes: touchMinute - startMinute,
      currentStartMinute: startMinute,
      startX: touch.clientX,
      startY: touch.clientY,
      activated: false,
      timer: 0,
    };
    gesture.timer = window.setTimeout(() => {
      if (mobileMoveGesture.current !== gesture) return;
      gesture.activated = true;
      lockMobileCreationScroll();
      setMobileMovePosition(gesture, startMinute);
      navigator.vibrate?.(10);
    }, 420);
    mobileMoveGesture.current = gesture;
  }

  function moveMobileEvent(event: ReactTouchEvent<HTMLElement>) {
    const gesture = mobileMoveGesture.current;
    const touch = event.touches[0];
    if (!gesture || !touch) return;
    if (!gesture.activated) {
      const distance = Math.hypot(
        touch.clientX - gesture.startX,
        touch.clientY - gesture.startY,
      );
      if (distance > 10) clearMobileMove();
      return;
    }
    event.preventDefault();
    const touchMinute = minuteFromClientY(event.currentTarget, touch.clientY);
    const startMinute =
      Math.round((touchMinute - gesture.grabOffsetMinutes) / 15) * 15;
    setMobileMovePosition(gesture, startMinute);
  }

  function finishMobileMove(event: ReactTouchEvent<HTMLElement>) {
    const gesture = mobileMoveGesture.current;
    if (!gesture) return;
    window.clearTimeout(gesture.timer);
    mobileMoveGesture.current = null;
    unlockMobileCreationScroll();
    setMobileMovePreview(null);
    if (!gesture.activated) return;
    event.preventDefault();
    suppressMobileMoveClickUntil.current = performance.now() + 500;
    onMoveAt(
      gesture.item,
      gesture.day,
      Math.floor(gesture.currentStartMinute / 60),
      gesture.currentStartMinute % 60,
    );
  }

  function beginCreation(
    event: ReactPointerEvent<HTMLButtonElement>,
    day: string,
  ) {
    if (event.button !== 0 || (compact && event.pointerType !== "mouse")) return;
    const anchorMinute = minuteFromPointer(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    creationGesture.current = { day, anchorMinute, moved: false };
    setCreationRange({
      day,
      startMinute: anchorMinute,
      endMinute: Math.min(24 * 60, anchorMinute + 15),
    });
  }

  function moveCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    if (compact && event.pointerType !== "mouse") return;
    const gesture = creationGesture.current;
    if (!gesture) return;
    const currentMinute = minuteFromPointer(event);
    if (Math.abs(currentMinute - gesture.anchorMinute) >= 15) {
      gesture.moved = true;
    }
    setCreationRange({
      day: gesture.day,
      startMinute: Math.min(gesture.anchorMinute, currentMinute),
      endMinute: Math.max(
        Math.max(gesture.anchorMinute, currentMinute),
        Math.min(24 * 60, Math.min(gesture.anchorMinute, currentMinute) + 15),
      ),
    });
  }

  function finishCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    if (compact && event.pointerType !== "mouse") return;
    const gesture = creationGesture.current;
    if (!gesture) return;
    const currentMinute = minuteFromPointer(event);
    creationGesture.current = null;
    setCreationRange(null);
    if (!gesture.moved) return;
    const startMinute = Math.min(gesture.anchorMinute, currentMinute);
    const endMinute = Math.max(gesture.anchorMinute, currentMinute);
    const duration = Math.max(15, endMinute - startMinute);
    suppressCreateClick.current = true;
    window.setTimeout(() => {
      suppressCreateClick.current = false;
    }, 0);
    onCreateAt(
      gesture.day,
      Math.floor(startMinute / 60),
      startMinute % 60,
      duration,
    );
  }

  function cancelCreation() {
    creationGesture.current = null;
    setCreationRange(null);
  }

  function spanIndexFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    return Math.max(
      0,
      Math.min(days.length - 1, Math.floor(ratio * days.length)),
    );
  }

  function beginSpanCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || days.length === 0) return;
    const anchorIndex = spanIndexFromPointer(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    spanCreationGesture.current = { anchorIndex };
    setSpanCreation({ startIndex: anchorIndex, endIndex: anchorIndex });
  }

  function moveSpanCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = spanCreationGesture.current;
    if (!gesture) return;
    const currentIndex = spanIndexFromPointer(event);
    setSpanCreation({
      startIndex: Math.min(gesture.anchorIndex, currentIndex),
      endIndex: Math.max(gesture.anchorIndex, currentIndex),
    });
  }

  function finishSpanCreation(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = spanCreationGesture.current;
    if (!gesture || days.length === 0) return;
    const currentIndex = spanIndexFromPointer(event);
    const startIndex = Math.min(gesture.anchorIndex, currentIndex);
    const endIndex = Math.max(gesture.anchorIndex, currentIndex);
    spanCreationGesture.current = null;
    setSpanCreation(null);
    onCreateSpan(dateKey(days[startIndex]), dateKey(days[endIndex]));
  }

  function cancelSpanCreation() {
    spanCreationGesture.current = null;
    setSpanCreation(null);
  }

  return (
    <section
      ref={calendarRef}
      className={`time-calendar ${compact ? "mobile-day-calendar" : ""}`}
      style={{ "--row-height": `${rowHeight}px` } as CSSProperties}
    >
      <div
        className="day-head"
        style={{
          gridTemplateColumns: `${axisWidth}px repeat(${days.length}, minmax(${compact ? 0 : 110}px, 1fr))`,
        }}
      >
        <span />
        {days.map((day) => {
          const key = dateKey(day);
          const capacity = capacityForDay(items, key);
          return (
            <button
              className={`${key === selectedDay ? "selected" : ""} ${
                key === dateKey(new Date()) ? "today" : ""
              }`}
              type="button"
              key={key}
              onClick={() => onSelectDay(key)}
            >
              <span>{formatDate(day, { weekday: "short" })}</span>
              <strong>{day.getDate()}</strong>
              <i>
                <b style={{ width: `${capacity.load}%` }} />
              </i>
            </button>
          );
        })}
      </div>
      <div
        className="multi-day-strip"
        style={{
          gridTemplateColumns: `${axisWidth}px repeat(${days.length}, minmax(${compact ? 0 : 110}px, 1fr))`,
        }}
      >
          <span className="multi-day-label">{compact ? "all day" : "add span"}</span>
          <button
            type="button"
            className="multi-day-create-surface"
            aria-label={compact ? "Add an all-day event" : "Drag across days to create a multi-day event"}
            onPointerDown={beginSpanCreation}
            onPointerMove={moveSpanCreation}
            onPointerUp={finishSpanCreation}
            onPointerCancel={cancelSpanCreation}
            onLostPointerCapture={cancelSpanCreation}
          >
            {compact ? "Tap to add an all-day event" : "Drag across days to add an event"}
          </button>
          {spanCreation && (
            <span
              className="multi-day-create-selection"
              aria-hidden="true"
              style={{
                gridColumn: `${spanCreation.startIndex + 2} / ${spanCreation.endIndex + 3}`,
              }}
            />
          )}
          {[...spanningItems, ...proposedSpanningItems].map((item, row) => {
            const covered = days
              .map((day, index) =>
                itemOverlapsDay(item, dateKey(day)) ? index : -1,
              )
              .filter((index) => index >= 0);
            const first = covered[0];
            const last = covered.at(-1);
            if (first === undefined || last === undefined) return null;
            const proposed = proposedSpanningItems.includes(item);
            const visibleStart = new Date(days[0]);
            visibleStart.setHours(0, 0, 0, 0);
            const visibleEnd = addDays(days.at(-1) ?? days[0], 1);
            visibleEnd.setHours(0, 0, 0, 0);
            const continuesBefore = new Date(item.startsAt!) < visibleStart;
            const continuesAfter = new Date(item.endsAt!) > visibleEnd;
            return (
              <button
                className={`multi-day-item kind-${item.kind} energy-${item.energyType} ${
                  proposed ? "proposal-target" : ""
                } ${continuesBefore ? "continues-before" : ""} ${
                  continuesAfter ? "continues-after" : ""
                }`}
                type="button"
                key={`${proposed ? "proposal-" : ""}${item.id}`}
                onClick={() => !proposed && onOpenItem(item)}
                aria-label={`${item.title}, ${formatSpan(item)}${
                  continuesBefore || continuesAfter
                    ? ", continues beyond this week"
                    : ""
                }`}
                style={{
                  gridColumn: `${first + 2} / ${last + 3}`,
                  gridRow: row + 2,
                }}
              >
                {item.flexibility === "fixed" ? (
                  <Lock size={10} />
                ) : (
                  <Sparkles size={10} />
                )}
                <InlineItemTitle item={item} onRename={onRenameItem} />
                <small>{formatSpan(item)}</small>
              </button>
            );
          })}
        </div>
      <div
        className="time-body"
        style={{
          gridTemplateColumns: `${axisWidth}px repeat(${days.length}, minmax(${compact ? 0 : 110}px, 1fr))`,
          height: `${bodyHeight}px`,
        }}
      >
        <div className="time-axis">
          {hours.map((hour) => (
            <time
              className={isInactiveHour(hour) ? "inactive" : ""}
              key={hour}
              style={{
                top: `${Math.max(4, timeOffset(hour, 0, rowHeight) - 6)}px`,
              }}
            >
              {String(hour).padStart(2, "0")}:00
            </time>
          ))}
        </div>
        {days.map((day) => {
          const key = dateKey(day);
          const dayItems = items.filter(
            (item) =>
              item.startsAt &&
              item.endsAt &&
              item.status === "scheduled" &&
              !isCalendarSpanItem(item) &&
              dateKey(new Date(item.startsAt)) === key,
          );
          const ranges = items.filter(
            (item) =>
              item.status === "inbox" &&
              item.windowStart &&
              item.windowEnd &&
              dateKey(new Date(item.windowStart)) === key,
          );
          const deadlines = items.filter(
            (item) => item.deadline && dateKey(new Date(item.deadline)) === key,
          );
          const proposedDayItems = proposalItems.filter(
            (item) =>
              item.startsAt &&
              item.endsAt &&
              item.status === "scheduled" &&
              !isCalendarSpanItem(item) &&
              dateKey(new Date(item.startsAt)) === key,
          );
          const proposedRanges = proposalItems.filter(
            (item) =>
              item.status === "inbox" &&
              item.windowStart &&
              item.windowEnd &&
              dateKey(new Date(item.windowStart)) === key,
          );
          const layout = overlapLayout(dayItems);
          const columnTime = (event: DragEvent<HTMLDivElement>) => {
            const rect = event.currentTarget.getBoundingClientRect();
            return timeAtOffset(event.clientY - rect.top, rowHeight);
          };
          let desktopDropPreview: {
            item: CalendarItem;
            top: number;
            height: number;
            startsAt: string;
            endsAt: string;
            valid: boolean;
            reason: string;
          } | null = null;
          const previewSource = desktopMovePreview?.day === key
            ? desktopMovePreview
            : !compact && draggingItem && dragSnap?.day === key
              ? (() => {
                  const start = dateFromKey(key);
                  start.setHours(dragSnap.hour, dragSnap.minute, 0, 0);
                  const duration = Math.max(
                    draggingItem.durationMin,
                    durationMinutes(draggingItem),
                  );
                  return {
                    item: draggingItem,
                    day: key,
                    startsAt: start.toISOString(),
                    endsAt: new Date(
                      start.getTime() + duration * 60_000,
                    ).toISOString(),
                  };
                })()
              : null;
          if (previewSource) {
            const { item: previewItem } = previewSource;
            const candidate = {
              ...previewItem,
              startsAt: previewSource.startsAt,
              endsAt: previewSource.endsAt,
            };
            const validation = validatePlacement(
              previewItem,
              candidate.startsAt,
              candidate.endsAt,
              items,
            );
            const geometry = itemGeometry(candidate, rowHeight);
            desktopDropPreview = {
              item: candidate,
              ...geometry,
              startsAt: candidate.startsAt,
              endsAt: candidate.endsAt,
              valid: validation.valid,
              reason: validation.errors[0] ?? "Ready to move",
            };
          }
          return (
            <div
              className="day-column"
              key={key}
              onDragOver={(event) => {
                const time = columnTime(event);
                onDragOver(event, key, time.hour, time.minute);
              }}
              onDrop={(event) => {
                const time = columnTime(event);
                onDrop(event, key, time.hour, time.minute);
              }}
            >
              {hours.map((hour) => {
                return (
                  <button
                    className={`time-slot ${
                      isInactiveHour(hour) ? "inactive" : ""
                    }`}
                    type="button"
                    key={hour}
                    aria-label={`Schedule at ${formatDate(day, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })} ${hour}:00`}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      if (compact) {
                        event.preventDefault();
                        return;
                      }
                      if (suppressCreateClick.current) {
                        event.preventDefault();
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const minute = Math.min(
                        45,
                        Math.round(
                          ((event.clientY - rect.top) / rect.height) * 4,
                        ) * 15,
                      );
                      onCreateAt(key, hour, minute);
                    }}
                    onPointerDown={(event) => beginCreation(event, key)}
                    onPointerMove={moveCreation}
                    onPointerUp={finishCreation}
                    onPointerCancel={cancelCreation}
                    onTouchStart={(event) => beginMobileCreation(event, key)}
                    onTouchMove={moveMobileCreation}
                    onTouchEnd={finishMobileCreation}
                    onTouchCancel={() => clearMobileCreation()}
                    style={{ height: `${hourHeight(hour, rowHeight)}px` }}
                  >
                  </button>
                );
              })}
              {creationRange?.day === key && (
                <div
                  className="creation-selection"
                  style={{
                    top: timeOffset(
                      Math.floor(creationRange.startMinute / 60),
                      creationRange.startMinute % 60,
                      rowHeight,
                    ),
                    height: Math.max(
                      12,
                      timeOffset(
                        Math.floor(creationRange.endMinute / 60),
                        creationRange.endMinute % 60,
                        rowHeight,
                      ) -
                        timeOffset(
                          Math.floor(creationRange.startMinute / 60),
                          creationRange.startMinute % 60,
                          rowHeight,
                        ),
                    ),
                  }}
                >
                  <span>
                    {String(
                      Math.floor(creationRange.startMinute / 60),
                    ).padStart(2, "0")}
                    :{String(creationRange.startMinute % 60).padStart(2, "0")}–
                    {String(Math.floor(creationRange.endMinute / 60)).padStart(
                      2,
                      "0",
                    )}
                    :{String(creationRange.endMinute % 60).padStart(2, "0")}
                  </span>
                </div>
              )}
              {desktopDropPreview && (
                <div
                  className={`calendar-drop-preview ${
                    desktopDropPreview.valid ? "is-valid" : "is-invalid"
                  }`}
                  style={{
                    top: desktopDropPreview.top,
                    height: desktopDropPreview.height,
                    ...classColorStyle(desktopDropPreview.item, subjects),
                  }}
                  aria-live="polite"
                >
                  <span>
                    {formatTime(desktopDropPreview.startsAt)}–
                    {formatTime(desktopDropPreview.endsAt)}
                  </span>
                  <strong>{desktopDropPreview.item.title}</strong>
                  <small>
                    {desktopDropPreview.valid
                      ? "Release to move"
                      : desktopDropPreview.reason}
                  </small>
                </div>
              )}
              {mobileMovePreview &&
                dayItems.some((item) => item.id === mobileMovePreview.id) &&
                (() => {
                  const original = dayItems.find(
                    (item) => item.id === mobileMovePreview.id,
                  );
                  if (!original) return null;
                  const geometry = itemGeometry(original, rowHeight);
                  return (
                    <div
                      className="mobile-move-origin"
                      style={{ top: geometry.top, height: geometry.height }}
                      aria-hidden="true"
                    >
                      <span>Original</span>
                    </div>
                  );
                })()}
              {ranges.map((item) => {
                const start = new Date(item.windowStart!);
                const end = new Date(item.windowEnd!);
                const top = timeOffset(
                  start.getHours(),
                  start.getMinutes(),
                  rowHeight,
                );
                const endTop =
                  dateKey(start) === dateKey(end)
                    ? timeOffset(end.getHours(), end.getMinutes(), rowHeight)
                    : timeOffset(24, 0, rowHeight);
                const height = Math.max(24, endTop - top);
                return (
                  <button
                    className={`possibility-band energy-${item.energyType} kind-${item.kind}`}
                    type="button"
                    key={item.id}
                    onClick={() => onOpenItem(item)}
                    style={{ top, height }}
                  >
                    <Sparkles size={11} />
                    <span>{item.title}</span>
                  </button>
                );
              })}
              {proposedRanges.map((item) => {
                const start = new Date(item.windowStart!);
                const end = new Date(item.windowEnd!);
                const top = timeOffset(
                  start.getHours(),
                  start.getMinutes(),
                  rowHeight,
                );
                const endTop =
                  dateKey(start) === dateKey(end)
                    ? timeOffset(end.getHours(), end.getMinutes(), rowHeight)
                    : timeOffset(24, 0, rowHeight);
                const height = Math.max(24, endTop - top);
                return (
                  <div
                    className={`possibility-band proposal-target energy-${item.energyType} kind-${item.kind}`}
                    key={`proposal-range-${item.id}`}
                    style={{ top, height }}
                  >
                    <Layers3 size={11} />
                    <span>{item.title}</span>
                  </div>
                );
              })}
              {deadlines.map((item) => {
                const deadline = new Date(item.deadline!);
                const top = timeOffset(
                  deadline.getHours(),
                  deadline.getMinutes(),
                  rowHeight,
                );
                return (
                  <button
                    className="deadline-line"
                    type="button"
                    key={`${item.id}-deadline`}
                    onClick={() => onOpenItem(item)}
                    style={{ top }}
                  >
                    <span>Deadline · {item.title}</span>
                  </button>
                );
              })}
              {dayItems.map((item) => {
                const previewItem =
                  resizing?.id === item.id
                    ? {
                        ...item,
                        startsAt: resizing.startsAt,
                        endsAt: resizing.endsAt,
                      }
                    : mobileMovePreview?.id === item.id
                      ? {
                          ...item,
                          startsAt: mobileMovePreview.startsAt,
                          endsAt: mobileMovePreview.endsAt,
                        }
                      : item;
                const { top, height } = itemGeometry(previewItem, rowHeight);
                const placement = layout.get(item.id) ?? { lane: 0, lanes: 1 };
                const width = 100 / placement.lanes;
                return (
                  <article
                    className={`calendar-block ${
                      resizing?.id === item.id ? "is-resizing" : ""
                    } ${
                      mobileMovePreview?.id === item.id ? "is-mobile-moving" : ""
                    } ${
                      desktopMovePreview?.item.id === item.id
                        ? "is-drag-origin"
                        : ""
                    } kind-${item.kind} energy-${item.energyType} flex-${item.flexibility} priority-${item.priority} ${urgencyClass(
                      item,
                    )} ${
                      proposalOrigins.has(item.id) ? "proposal-origin" : ""
                    }`}
                    key={item.id}
                    onPointerDown={(event) => beginDesktopMove(event, item)}
                    onPointerMove={moveDesktopEvent}
                    onPointerUp={finishDesktopMove}
                    onPointerCancel={cancelDesktopMove}
                    onClick={(event) => {
                      if (
                        performance.now() < suppressMobileMoveClickUntil.current ||
                        performance.now() < suppressDesktopMoveClickUntil.current
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                      onOpenItem(item);
                    }}
                    onTouchStart={(event) => beginMobileMove(event, item, key)}
                    onTouchMove={moveMobileEvent}
                    onTouchEnd={finishMobileMove}
                    onTouchCancel={() => clearMobileMove()}
                    style={
                      {
                        top,
                        height,
                        left: `calc(${placement.lane * width}% + 3px)`,
                        right: "auto",
                      width: `calc(${width}% - 6px)`,
                      viewTransitionName: `calendar-item-${item.id}`,
                      ...classColorStyle(item, subjects),
                    } as CSSProperties
                    }
                  >
                    {!compact && (
                      <button
                        className="resize-handle resize-handle-start"
                        type="button"
                        draggable={false}
                        aria-label={`Extend or shorten the start of ${item.title}`}
                        onDragStart={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) =>
                          onResize(event, item, rowHeight, "start")
                        }
                      />
                    )}
                    <div>
                      {item.flexibility === "fixed" ? (
                        <Lock size={10} />
                      ) : compact ? (
                        <CalendarClock size={10} />
                      ) : (
                        <GripVertical size={10} />
                      )}
                      <time>{formatTime(item.startsAt)}</time>
                    </div>
                    <InlineItemTitle item={item} onRename={onRenameItem} />
                    {isImportedTimetableItem(item) && timetableRoomForItem(item) && (
                      <span className="calendar-class-room">
                        Room {timetableRoomForItem(item)}
                      </span>
                    )}
                    {mobileMovePreview?.id === item.id && (
                      <span className="mobile-move-time-badge">
                        {formatTime(previewItem.startsAt)}–
                        {formatTime(previewItem.endsAt)}
                      </span>
                    )}
                    <small>
                      {isImportedTimetableItem(item)
                        ? item.description || "Click to edit this period"
                        : `${energyLabels[item.energyType]}${
                            item.constraints.length
                              ? ` · ${item.constraints.length} constraint${
                                  item.constraints.length === 1 ? "" : "s"
                                }`
                              : ""
                          }`}
                    </small>
                    {!compact && (
                      <button
                        className="resize-handle resize-handle-end"
                        type="button"
                        draggable={false}
                        aria-label={`Extend or shorten the end of ${item.title}`}
                        onDragStart={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) =>
                          onResize(event, item, rowHeight, "end")
                        }
                      />
                    )}
                  </article>
                );
              })}
              {proposedDayItems.map((item) => {
                const { top, height } = itemGeometry(item, rowHeight);
                return (
                  <article
                    className={`calendar-block proposal-target kind-${item.kind} energy-${item.energyType} flex-${item.flexibility}`}
                    key={`proposal-${item.id}`}
                    style={{ top, height }}
                  >
                    <div>
                      <Layers3 size={10} />
                      <time>{formatTime(item.startsAt)}</time>
                    </div>
                    <strong>{item.title}</strong>
                    <small>Proposed position</small>
                  </article>
                );
              })}
            </div>
          );
        })}
        <NowLine days={days} rowHeight={rowHeight} axisWidth={axisWidth} />
      </div>
    </section>
  );
}

function NowLine({
  days,
  rowHeight,
  axisWidth = 52,
}: {
  days: Date[];
  rowHeight: number;
  axisWidth?: number;
}) {
  const now = new Date();
  const dayIndex = days.findIndex((day) => dateKey(day) === dateKey(now));
  if (dayIndex < 0) {
    return null;
  }
  const top = timeOffset(now.getHours(), now.getMinutes(), rowHeight);
  return (
    <div
      className="now-line"
      style={{
        top,
        left: `calc(${axisWidth}px + (100% - ${axisWidth}px) * ${dayIndex} / ${days.length})`,
        width: `calc((100% - ${axisWidth}px) / ${days.length})`,
      }}
    >
      <i />
      <span>now</span>
    </div>
  );
}

function OverviewCalendar({
  anchor,
  months,
  items,
  subjects,
  onSelectDay,
}: {
  anchor: Date;
  months: number;
  items: CalendarItem[];
  subjects: Subject[];
  onSelectDay: (day: string) => void;
}) {
  const firstMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  return (
    <section className={`overview-grid months-${months}`}>
      {Array.from({ length: months }, (_, monthIndex) => {
        const month = new Date(
          firstMonth.getFullYear(),
          firstMonth.getMonth() + monthIndex,
          1,
          12,
        );
        const daysInMonth = new Date(
          month.getFullYear(),
          month.getMonth() + 1,
          0,
        ).getDate();
        const leading = (month.getDay() + 6) % 7;
        const monthItems = items.filter((item) => {
          const inMonth = (value: string | null) => {
            if (!value) return false;
            const date = new Date(value);
            return (
              date.getFullYear() === month.getFullYear() &&
              date.getMonth() === month.getMonth()
            );
          };
          const monthStart = new Date(
            month.getFullYear(),
            month.getMonth(),
            1,
          );
          const monthEnd = new Date(
            month.getFullYear(),
            month.getMonth() + 1,
            1,
          );
          const overlapsMonth = Boolean(
            item.startsAt &&
              item.endsAt &&
              new Date(item.startsAt) < monthEnd &&
              new Date(item.endsAt) > monthStart,
          );
          return overlapsMonth || inMonth(item.deadline);
        });
        const monthDeadlines = monthItems.filter((item) => {
          if (!item.deadline) return false;
          const deadline = new Date(item.deadline);
          return (
            deadline.getFullYear() === month.getFullYear() &&
            deadline.getMonth() === month.getMonth()
          );
        }).length;
        return (
          <article className="month-card" key={dateKey(month)}>
            <header>
              <div>
                <h2>
                  {formatDate(month, {
                    month: "long",
                    year: months === 1 ? "numeric" : undefined,
                  })}
                </h2>
                <span>
                  {monthItems.length} planned
                  {monthDeadlines ? ` · ${monthDeadlines} due` : ""}
                </span>
              </div>
              <div className="month-load-key" aria-label="Daily load key">
                <i />
                <span>load</span>
              </div>
            </header>
            <div className="month-weekdays">
              {"MTWTFSS".split("").map((day, index) => (
                <span key={`${day}-${index}`}>{day}</span>
              ))}
            </div>
            <div className="month-days">
              {Array.from({ length: leading }, (_, index) => (
                <span key={`empty-${index}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const date = new Date(
                  month.getFullYear(),
                  month.getMonth(),
                  index + 1,
                  12,
                );
                const key = dateKey(date);
                const dayItems = items.filter(
                  (item) =>
                    (item.startsAt &&
                      item.endsAt &&
                      itemOverlapsDay(item, key)) ||
                    (item.deadline && dateKey(new Date(item.deadline)) === key),
                );
                const capacity = capacityForDay(items, key);
                return (
                  <button
                    className={`${key === dateKey(new Date()) ? "today" : ""} ${
                      capacity.load >= 85 ? "overloaded" : ""
                    }`}
                    type="button"
                    key={key}
                    onClick={() => onSelectDay(key)}
                    aria-label={`${formatDate(date, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}, ${dayItems.length} calendar items, ${capacity.load}% load`}
                  >
                    <div className="month-day-heading">
                      <strong>{index + 1}</strong>
                      {capacity.load > 0 && <span>{capacity.load}%</span>}
                    </div>
                    {months === 1 ? (
                      <div className="month-event-list">
                        {dayItems.slice(0, 3).map((item) => (
                          <span
                            className={`month-event energy-${item.energyType} ${item.deadline ? "has-deadline" : ""}`}
                            key={`${item.id}-${item.deadline ? "deadline" : "item"}`}
                            style={classColorStyle(item, subjects)}
                          >
                            <i />
                            <time>
                              {item.deadline && !itemOverlapsDay(item, key)
                                ? "Due"
                                : isCalendarSpanItem(item)
                                  ? "Span"
                                  : item.startsAt
                                    ? formatTime(item.startsAt)
                                    : "Due"}
                            </time>
                            <em>
                              {item.title}
                              {isImportedTimetableItem(item) &&
                                timetableRoomForItem(item) && (
                                  <small>Room {timetableRoomForItem(item)}</small>
                                )}
                            </em>
                          </span>
                        ))}
                        {dayItems.length > 3 && (
                          <small>+{dayItems.length - 3} more</small>
                        )}
                      </div>
                    ) : (
                      <div className="semester-density">
                        <span style={{ width: `${Math.max(4, capacity.load)}%` }} />
                        <div>
                          {dayItems.slice(0, 4).map((item) => (
                            <i
                              className={`energy-${item.energyType}`}
                              key={`${item.id}-${item.deadline ? "deadline" : "item"}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {dayItems.some((item) => item.deadline) && (
                      <span className="month-deadline-mark" />
                    )}
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function HudRow({
  label,
  item,
  empty,
}: {
  label: string;
  item?: CalendarItem;
  empty: string;
}) {
  return (
    <div className="hud-row">
      <span>{label}</span>
      {item ? (
        <div>
          <time>{formatTime(item.startsAt)}</time>
          <strong>{item.title}</strong>
          <small>{energyLabels[item.energyType]}</small>
        </div>
      ) : (
        <div className="hud-row-empty">{empty}</div>
      )}
    </div>
  );
}
