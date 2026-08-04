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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HomeworkInbox } from "@/app/homework-inbox";
import { SchoolWorkspace } from "@/app/school-workspace";
import {
  addDays,
  applyProposal,
  capacityForDay,
  dateFromKey,
  dateKey,
  durationMinutes,
  energyLabels,
  itemToRow,
  kindLabels,
  makeItem,
  scheduleInsights,
  startOfWeek,
  validatePlacement,
  validateProposal,
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
  getOfflineState,
  getPendingMutations,
  queueMutation,
  removePendingMutation,
  saveOfflineState,
  type PendingMutation,
} from "@/lib/offline";
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

type Zoom = "school" | "upcoming" | "day" | "week" | "month" | "semester";
type PaletteMode = "command" | "filter" | "upload";
type CommandResponse = Parameters<typeof proposalFromCommandResponse>[0];
type ExtractionCandidate = Partial<CalendarItem> & {
  title: string;
  kind: ItemKind;
  evidence: string;
};
type ExtractionResponse = {
  title: string;
  summary: string;
  items: ExtractionCandidate[];
};

const ACTIVE_START = 6;
const ACTIVE_END = 23;
const DAY_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
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

function rowToItem(row: Record<string, unknown>): CalendarItem {
  return normalizeItemTiming(
    makeItem({
      id: String(row.id),
      kind: row.kind as ItemKind,
      title: String(row.title),
      description: String(row.description ?? ""),
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
    flexibility: kind === "event" ? "fixed" : "flexible",
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
      after = normalizeItemTiming(
        makeItem({
          ...merged,
          id: before?.id ?? crypto.randomUUID(),
          title: change.after.title ?? before?.title ?? "Untitled",
          kind: change.after.kind ?? before?.kind ?? "task",
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
  const [zoom, setZoom] = useState<Zoom>("upcoming");
  const [anchorDate, setAnchorDate] = useState(() => dateKey(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [commandText, setCommandText] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [proposal, setProposal] = useState<CalendarProposal | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [draftItem, setDraftItem] = useState<CalendarItem | null>(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [homeworkOpen, setHomeworkOpen] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragSnap, setDragSnap] = useState<{
    day: string;
    hour: number;
    minute: number;
  } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [nowOpen, setNowOpen] = useState(false);
  const [nowMoment, setNowMoment] = useState<string | null>(null);
  const [nowLocation, setNowLocation] = useState<CurrentStudyLocation>("home");
  const [nowEnergy, setNowEnergy] = useState<EnergyRequirement>("medium");
  const [nowComputerAvailable, setNowComputerAvailable] = useState(true);
  const [resizing, setResizing] = useState<{
    id: string;
    minutes: number;
    startsAt: string;
    endsAt: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeGestureActive = useRef(false);

  const flushPending = useCallback(async () => {
    const pending = await getPendingMutations();
    for (const mutation of pending) {
      let query;
      if (mutation.action === "insert") {
        query = supabase.from(mutation.table).insert(mutation.payload ?? {});
      } else if (mutation.action === "upsert") {
        query = supabase
          .from(mutation.table)
          .upsert(mutation.payload ?? {}, { onConflict: "id" });
      } else if (mutation.action === "update") {
        query = supabase
          .from(mutation.table)
          .update(mutation.payload ?? {})
          .eq("id", mutation.recordId);
      } else {
        query = supabase
          .from(mutation.table)
          .delete()
          .eq("id", mutation.recordId);
      }
      const { error } = await query;
      if (error) throw error;
      if (mutation.id !== undefined) await removePendingMutation(mutation.id);
    }
  }, [supabase]);

  const loadCloud = useCallback(
    async (activeUser: User) => {
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
        profileResult.error;
      if (error) {
        setSyncing(false);
        throw error;
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
      homeworkCaptures,
      schoolDaySettings,
    }).catch(() => undefined);
  }, [
    assessments,
    assignments,
    classExceptions,
    classes,
    history,
    homeworkCaptures,
    hydrated,
    items,
    schoolDaySettings,
    subjects,
  ]);

  useEffect(() => {
    if (!hydrated || !isOnline || !user) return;
    let cancelled = false;
    flushPending()
      .then(() => {
        if (!cancelled) return loadCloud(user);
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(
            `Sync paused: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
          setSyncing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [flushPending, hydrated, isOnline, loadCloud, user]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        setPaletteMode("command");
        setHomeworkOpen(false);
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
        setSelectedItem(null);
        setDraftItem(null);
        setIsCreatingItem(false);
        setHomeworkOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function persistMutation(mutation: PendingMutation) {
    if (user && isOnline) {
      let query;
      if (mutation.action === "insert") {
        query = supabase.from(mutation.table).insert(mutation.payload ?? {});
      } else if (mutation.action === "upsert") {
        query = supabase
          .from(mutation.table)
          .upsert(mutation.payload ?? {}, { onConflict: "id" });
      } else if (mutation.action === "update") {
        query = supabase
          .from(mutation.table)
          .update(mutation.payload ?? {})
          .eq("id", mutation.recordId);
      } else {
        query = supabase
          .from(mutation.table)
          .delete()
          .eq("id", mutation.recordId);
      }
      const { error } = await query;
      if (!error) return true;
    }
    await queueMutation(mutation);
    return false;
  }

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
    setDraggingItemId(item.id);
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
    const maximum = 720;

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

      const validation = validatePlacement(
        item.flexibility === "fixed"
          ? {
              ...item,
              durationMin: nextMinutes,
              durationMax: nextMinutes,
            }
          : item,
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
          ...item,
          startsAt: nextStart.toISOString(),
          endsAt: nextEnd.toISOString(),

          ...(item.flexibility === "fixed"
            ? {
                durationMin: nextMinutes,
                durationMax: nextMinutes,
              }
            : {
                durationMin: Math.min(item.durationMin, nextMinutes),
                durationMax: Math.max(item.durationMax, nextMinutes),
              }),
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
    setCommandBusy(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7_500);
    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setProposal(simpleFallbackProposal(clean));
    } finally {
      window.clearTimeout(timeoutId);
      setCommandBusy(false);
      setPaletteOpen(false);
      setCommandText("");
    }
  }

  async function onDocumentSelected(file: File | null) {
    if (!file) return;
    if (file.size > 5_000_000) {
      setNotice("Choose a document smaller than 5 MB.");
      return;
    }
    setCommandBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mediaType: file.type || "application/pdf",
          data,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!response.ok) throw new Error("Extraction failed");
      const raw: unknown = await response.json();
      if (!isExtractionResponse(raw)) {
        throw new Error("AI returned an invalid document proposal");
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
      setPaletteOpen(false);
    } catch {
      setNotice(
        "I couldn’t read that file. Try a clear image, text file, or PDF.",
      );
    } finally {
      setCommandBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function approveProposal() {
    if (!proposal) return;
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
    setProposal(null);
    setNotice(`Applied: ${proposal.title}. Cmd+Z to undo.`);
  }

  function openItem(item: CalendarItem) {
    setIsCreatingItem(false);
    setSelectedItem(item);
    setDraftItem(structuredClone(item));
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
    const minutes = Math.max(15, Math.min(720, duration));
    const end = new Date(start.getTime() + minutes * 60_000);
    const item = makeItem({
      kind: "event",
      title: "",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      durationMin: minutes,
      durationMax: minutes,
      status: "scheduled",
      flexibility: "fixed",
      source: "manual",
    });
    setSelectedDay(day);
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

  function captureHomework(rawText: string, subjectOverride?: string | null) {
    const parsed = parseHomework(
      rawText,
      subjects,
      new Date(),
      subjectOverride,
    );
    const capture: HomeworkCapture = {
      id: crypto.randomUUID(),
      rawText: parsed.rawText,
      title: parsed.title,
      subjectId: parsed.subjectId,
      deadline: parsed.deadline,
      taskType: parsed.taskType,
      estimatedMinutes: parsed.estimatedMinutes,
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
    let nextDraft = draftItem;
    if (
      draftItem.flexibility === "fixed" &&
      draftItem.startsAt &&
      draftItem.endsAt
    ) {
      const minutes = Math.max(15, durationMinutes(draftItem));
      nextDraft = {
        ...draftItem,
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

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setAuthSent(true);
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
      homeworkCaptures: [],
      schoolDaySettings: DEFAULT_SCHOOL_DAY_SETTINGS,
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
  const now = new Date();
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
  const soonestItems = future.slice(0, 5);
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

  function moveAnchor(amount: number) {
    const unit = zoom === "month" ? 30 : zoom === "semester" ? 180 : 7;
    const next = addDays(anchor, amount * unit);
    setAnchorDate(dateKey(next));
    if (zoom === "day") setSelectedDay(dateKey(next));
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
        </button>
        <nav aria-label="Calendar tools">
          <button
            className={
              !inboxOpen && !homeworkOpen && !hudOpen && zoom !== "school"
                ? "active"
                : ""
            }
            type="button"
            aria-label="Calendar"
            onClick={() => {
              setInboxOpen(false);
              setHomeworkOpen(false);
              setHudOpen(false);
              transitionState(() => setZoom("upcoming"));
            }}
          >
            <CalendarClock size={19} />
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
          </button>
        </nav>
        <button
          className="rail-account"
          type="button"
          aria-label="Account and sync"
          onClick={() => setAccountOpen((current) => !current)}
        >
          {initials(user?.email)}
        </button>
      </aside>

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
        onDelete={deleteHomeworkCapture}
        onDragState={(id) => setDraggingItemId(id ? `homework:${id}` : null)}
        onOpenWeek={() => {
          setHomeworkOpen(false);
          setInboxOpen(false);
          setHudOpen(false);
          transitionState(() => setZoom("week"));
        }}
      />

      <section className={`calendar-stage zoom-${zoom}`}>
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
                <h2>
                  {zoom === "semester"
                    ? `${formatDate(anchor, { month: "long" })} – ${formatDate(
                        addDays(anchor, 150),
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
                    {level === "upcoming" ? "next 5" : level}
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
          />
        ) : zoom === "upcoming" ? (
          <UpcomingView
            items={soonestItems}
            onOpenItem={openItem}
            onCreate={() => openNewEvent()}
            commandText={commandText}
            commandBusy={commandBusy}
            onCommandChange={setCommandText}
            onCommandSubmit={(event) => submitCommand(event, "command")}
            onOpenCommand={() => {
              setPaletteMode("command");
              setPaletteOpen(true);
            }}
            onOpenNow={openNowRecommendations}
          />
        ) : isCompact && zoom === "week" ? (
          <MobileAgenda
            days={visibleDays}
            items={filteredItems}
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
            onSelectDay={(day) => {
              setSelectedDay(day);
              setAnchorDate(day);
              transitionState(() => setZoom("week"));
            }}
          />
        ) : (
          <TimeCalendar
            days={visibleDays}
            items={filteredItems}
            proposal={proposal}
            rowHeight={zoom === "day" ? 72 : 52}
            selectedDay={selectedDay}
            resizing={resizing}
            dragSnap={dragSnap}
            onSelectDay={setSelectedDay}
            onDrop={onCalendarDrop}
            onDragOver={onCalendarDragOver}
            onDragStart={onDragStart}
            onDragEnd={endDrag}
            onOpenItem={openItem}
            onResize={beginResize}
            onCreateAt={openNewEvent}
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
            className="proposal-sheet"
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
                onClick={() => setProposal(null)}
                aria-label="Close proposal"
              >
                <X size={16} />
              </button>
            </header>
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
                          <span>{formatRange(change.before)}</span>
                          <Move size={12} />
                          <strong>{formatRange(change.after)}</strong>
                        </div>
                      )}
                      {!change.before && change.after && (
                        <div className="diff-row">
                          <strong>
                            {kindLabels[change.after.kind]} ·{" "}
                            {formatRange(change.after)}
                          </strong>
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
                onClick={() => setProposal(null)}
              >
                Cancel
              </button>
              <button
                className="approve"
                type="button"
                onClick={approveProposal}
                disabled={!proposalValidation?.valid}
              >
                Apply {proposal.changes.length} change
                {proposal.changes.length === 1 ? "" : "s"}
              </button>
            </footer>
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
                  {isCreatingItem ? "New calendar item" : "Edit calendar item"}
                </span>
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
                              ? "fixed"
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
            <input
              className="item-title-input"
              autoFocus
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
            <div className="quick-item-row">
              <label>
                <span>When</span>
                <input
                  type="datetime-local"
                  value={toLocalInput(draftItem.startsAt)}
                  onChange={(event) => {
                    const startsAt = fromLocalInput(event.target.value);
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
                />
              </label>
              <label>
                <span>Duration</span>
                <div className="compact-duration-control">
                  <input
                    type="number"
                    min={5}
                    max={720}
                    step={5}
                    value={durationMinutes(draftItem)}
                    onChange={(event) => {
                      const minutes = Math.max(5, Number(event.target.value));
                      setDraftItem({
                        ...draftItem,
                        durationMin: minutes,
                        durationMax: minutes,
                        endsAt: draftItem.startsAt
                          ? new Date(
                              new Date(draftItem.startsAt).getTime() +
                                minutes * 60_000,
                            ).toISOString()
                          : null,
                      });
                    }}
                  />
                  <span>min</span>
                </div>
              </label>
            </div>
            <details className="item-more">
              <summary>
                <span>More options</span>
                <small>
                  {energyLabels[draftItem.energyType]} · {draftItem.priority}
                </small>
              </summary>
              <div className="compact-options-grid">
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
                <label>
                  <span>Deadline</span>
                  <input
                    type="datetime-local"
                    value={toLocalInput(draftItem.deadline)}
                    onChange={(event) =>
                      setDraftItem({
                        ...draftItem,
                        deadline: fromLocalInput(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Flexibility</span>
                  <select
                    value={draftItem.flexibility}
                    onChange={(event) =>
                      setDraftItem({
                        ...draftItem,
                        flexibility: event.target.value as Flexibility,
                      })
                    }
                  >
                    {flexibilities.map((flexibility) => (
                      <option key={flexibility}>{flexibility}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Window starts</span>
                  <input
                    type="datetime-local"
                    value={toLocalInput(draftItem.windowStart)}
                    onChange={(event) =>
                      setDraftItem({
                        ...draftItem,
                        windowStart: fromLocalInput(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Window ends</span>
                  <input
                    type="datetime-local"
                    value={toLocalInput(draftItem.windowEnd)}
                    onChange={(event) =>
                      setDraftItem({
                        ...draftItem,
                        windowEnd: fromLocalInput(event.target.value),
                      })
                    }
                  />
                </label>
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
              <textarea
                value={draftItem.description}
                onChange={(event) =>
                  setDraftItem({
                    ...draftItem,
                    description: event.target.value,
                  })
                }
                placeholder="Notes or context"
                aria-label="Item description"
              />
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
                selectedItem.assignmentId && (
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
                disabled={!draftItem.title.trim()}
              >
                {isCreatingItem ? "Create event" : "Save changes"}
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
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : authSent ? (
            <>
              <Check size={18} />
              <h2>Check your email</h2>
              <p>Open the sign-in link sent to {email}.</p>
              <button type="button" onClick={() => setAuthSent(false)}>
                Use another email
              </button>
            </>
          ) : (
            <>
              <Cloud size={18} />
              <h2>Sync every device</h2>
              <p>Offline first, with secure Supabase sync after sign-in.</p>
              <form onSubmit={sendMagicLink}>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  aria-label="Email address"
                />
                <button type="submit" disabled={authBusy}>
                  {authBusy ? "Sending…" : "Send sign-in link"}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function UpcomingView({
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
              <span>No fixed commitment in the next two hours.</span>
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
                  Start
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
                "Try changing your location, energy, or available tools."}
            </p>
          </div>
        )}
        <footer>
          <Lock size={12} />
          Ranked locally from time, urgency, context, energy, tools, and
          progress. Nothing starts until you choose it.
        </footer>
      </section>
    </div>
  );
}

function MobileAgenda({
  days,
  items,
  selectedDay,
  onSelectDay,
  onOpenItem,
  onQuickCapture,
}: {
  days: Date[];
  items: CalendarItem[];
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
        dateKey(new Date(item.startsAt)) === selectedDay,
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
          <span className="micro-label">Agenda</span>
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
            onClick={() => onOpenItem(item)}
          >
            <time>
              {formatTime(item.startsAt)}
              <small>{formatTime(item.endsAt)}</small>
            </time>
            <span className="agenda-shape" />
            <div>
              <strong>{item.title}</strong>
              <small>
                {energyLabels[item.energyType]} · {durationMinutes(item)} min
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

function TimeCalendar({
  days,
  items,
  proposal,
  rowHeight,
  selectedDay,
  resizing,
  dragSnap,
  onSelectDay,
  onDrop,
  onDragOver,
  onDragStart,
  onDragEnd,
  onOpenItem,
  onResize,
  onCreateAt,
}: {
  days: Date[];
  items: CalendarItem[];
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
  onSelectDay: (day: string) => void;
  onDrop: (event: DragEvent, day: string, hour: number, minute: number) => void;
  onDragOver: (
    event: DragEvent,
    day: string,
    hour: number,
    minute: number,
  ) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
  onOpenItem: (item: CalendarItem) => void;
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
  const suppressCreateClick = useRef(false);
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

  function minuteFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const column = event.currentTarget.parentElement;
    if (!column) return 0;
    const rect = column.getBoundingClientRect();
    const time = timeAtOffset(event.clientY - rect.top, rowHeight);
    return time.hour * 60 + time.minute;
  }

  function beginCreation(
    event: ReactPointerEvent<HTMLButtonElement>,
    day: string,
  ) {
    if (event.button !== 0) return;
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

  return (
    <section
      className="time-calendar"
      style={{ "--row-height": `${rowHeight}px` } as CSSProperties}
    >
      <div
        className="day-head"
        style={{
          gridTemplateColumns: `52px repeat(${days.length}, minmax(110px, 1fr))`,
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
        className="time-body"
        style={{
          gridTemplateColumns: `52px repeat(${days.length}, minmax(110px, 1fr))`,
          height: `${bodyHeight}px`,
        }}
      >
        <div className="time-axis">
          {hours.map((hour) => (
            <time
              className={isInactiveHour(hour) ? "inactive" : ""}
              key={hour}
              style={{ top: `${timeOffset(hour, 0, rowHeight) - 6}px` }}
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
                const isSnap = dragSnap?.day === key && dragSnap.hour === hour;
                return (
                  <button
                    className={`time-slot ${
                      isInactiveHour(hour) ? "inactive" : ""
                    } ${isSnap ? "snap-active" : ""}`}
                    type="button"
                    key={hour}
                    aria-label={`Schedule at ${formatDate(day, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })} ${hour}:00`}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
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
                    style={{ height: `${hourHeight(hour, rowHeight)}px` }}
                  >
                    {isSnap && (
                      <span
                        className="snap-guide"
                        style={{
                          top: `${
                            (dragSnap.minute / 60) * hourHeight(hour, rowHeight)
                          }px`,
                        }}
                      >
                        {String(hour).padStart(2, "0")}:
                        {String(dragSnap.minute).padStart(2, "0")}
                      </span>
                    )}
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
                    : item;
                const { top, height } = itemGeometry(previewItem, rowHeight);
                const placement = layout.get(item.id) ?? { lane: 0, lanes: 1 };
                const width = 100 / placement.lanes;
                return (
                  <article
                    className={`calendar-block ${
                      resizing?.id === item.id ? "is-resizing" : ""
                    } kind-${item.kind} energy-${item.energyType} flex-${item.flexibility} priority-${item.priority} ${urgencyClass(
                      item,
                    )} ${
                      proposalOrigins.has(item.id) ? "proposal-origin" : ""
                    }`}
                    key={item.id}
                    draggable={item.flexibility !== "fixed"}
                    onDragStart={(event) => onDragStart(event, item)}
                    onDragEnd={onDragEnd}
                    onClick={() => onOpenItem(item)}
                    style={
                      {
                        top,
                        height,
                        left: `calc(${placement.lane * width}% + 3px)`,
                        right: "auto",
                        width: `calc(${width}% - 6px)`,
                        viewTransitionName: `calendar-item-${item.id}`,
                      } as CSSProperties
                    }
                  >
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
                    <div>
                      {item.flexibility === "fixed" ? (
                        <Lock size={10} />
                      ) : (
                        <GripVertical size={10} />
                      )}
                      <time>{formatTime(item.startsAt)}</time>
                    </div>
                    <strong>{item.title}</strong>
                    <small>
                      {energyLabels[item.energyType]}
                      {item.constraints.length
                        ? ` · ${item.constraints.length} constraint${
                            item.constraints.length === 1 ? "" : "s"
                          }`
                        : ""}
                    </small>
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
        <NowLine days={days} rowHeight={rowHeight} />
      </div>
    </section>
  );
}

function NowLine({ days, rowHeight }: { days: Date[]; rowHeight: number }) {
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
        left: `calc(52px + (100% - 52px) * ${dayIndex} / ${days.length})`,
        width: `calc((100% - 52px) / ${days.length})`,
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
  onSelectDay,
}: {
  anchor: Date;
  months: number;
  items: CalendarItem[];
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
        return (
          <article className="month-card" key={dateKey(month)}>
            <header>
              <h2>
                {formatDate(month, {
                  month: "long",
                  year: months === 1 ? "numeric" : undefined,
                })}
              </h2>
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
                      dateKey(new Date(item.startsAt)) === key) ||
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
                  >
                    <strong>{index + 1}</strong>
                    <div>
                      {dayItems.slice(0, months === 1 ? 3 : 2).map((item) => (
                        <i
                          className={`energy-${item.energyType}`}
                          key={`${item.id}-${item.deadline ? "deadline" : "item"}`}
                          title={item.title}
                        />
                      ))}
                    </div>
                    {dayItems.some((item) => item.deadline) && <em />}
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
