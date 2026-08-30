"use client";

import type { User } from "@supabase/supabase-js";
import {
  assignmentProgress,
  formatWorkMinutes,
  planAssignment,
} from "@/lib/assignment-planner";
import { planRevisionRunway, planSpacedReviews } from "@/lib/revision-planner";
import {
  energyTypeForWorkType,
  type FreePeriod,
  type FreePeriodRecommendation,
} from "@/lib/school-day-engine";
import {
  CalendarPlus,
  CalendarClock,
  GraduationCap,
  Layers3,
  Plus,
  X,
} from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import {
} from "@/app/calendar-format";
import {
  isAttentionQuestion,
  intentionFromCommand,
  parsedCommand,
  proposalFromCommandResponse,
  restoreProposal,
  simpleFallbackProposal,
} from "@/lib/calendar/commands";
import {
  normalizeItemTiming,
  relevantCommandItems,
} from "@/lib/calendar/scheduling";
import {
  isBlockPolishResponse,
  isClarificationResponse,
  isCommandResponse,
  isDeeperResponse,
  type ClarificationResponse,
} from "@/lib/ai/study-planner";
import {
  documentMediaType,
  isExtractionResponse,
} from "@/lib/ai/timetable-parser";
import { AccountPanel } from "@/components/calendar/AccountPanel";
import { CalendarRail } from "@/components/calendar/CalendarRail";
import { MobileActionSheets } from "@/components/calendar/MobileActionSheets";
import { TaskDock } from "@/components/calendar/TaskDock";
import { QuickHud } from "@/components/calendar/QuickHud";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { ProposalReview } from "@/components/calendar/ProposalReview";
import { EventModal } from "@/components/calendar/EventModal";
import { CommandPalette } from "@/components/calendar/CommandPalette";
import {
  rowToItem,
  safeMutationPayload,
  syncErrorMessage,
} from "@/lib/db/queries/calendar";
import { AttentionHome } from "@/app/attention-home";
import { AccessGate } from "@/app/access-gate";
import { CalendarFallback } from "@/app/calendar-ui";
const WeeklyReview = lazy(() =>
  import("@/app/weekly-review").then((mod) => ({ default: mod.WeeklyReview })),
);
const NowPanel = lazy(() =>
  import("@/app/now-panel").then((mod) => ({ default: mod.NowPanel })),
);
const MobileAgenda = lazy(() =>
  import("@/app/mobile-agenda").then((mod) => ({ default: mod.MobileAgenda })),
);
const TimeCalendar = lazy(() =>
  import("@/app/time-calendar").then((mod) => ({ default: mod.TimeCalendar })),
);
const OverviewCalendar = lazy(() =>
  import("@/app/overview-calendar").then((mod) => ({ default: mod.OverviewCalendar })),
);
const HomeworkInbox = lazy(() =>
  import("@/app/homework-inbox").then((mod) => ({ default: mod.HomeworkInbox })),
);
const SchoolWorkspace = lazy(() =>
  import("@/app/school-workspace").then((mod) => ({ default: mod.SchoolWorkspace })),
);
const IntentionsPanel = lazy(() =>
  import("@/app/intentions-panel").then((mod) => ({ default: mod.IntentionsPanel })),
);
const GoDeeperPanel = lazy(() =>
  import("@/app/go-deeper-panel").then((mod) => ({ default: mod.GoDeeperPanel })),
);
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
import { isWeeklyReviewAvailable } from "@/lib/weekly-review";
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
  makeItem,
  scheduleInsights,
  startOfWeek,
  validatePlacement,
  validateProposal,
  withResizedDuration,
  type CalendarItem,
  type CalendarProposal,
  type EnergyRequirement,
  type HistoryEntry,
  type ProposalChange,
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
} from "@/lib/now-recommender";
import {
  isImportedTimetableItem,
  isItemInWeek,
  reconcileTimetableImport,
  timetableRoomForItem,
  type RejectedTimetableCandidate,
} from "@/lib/timetable-import";
import {
  getLastViewState,
  getOfflineState,
  getPendingMutations,
  queueMutation,
  removePendingMutation,
  saveLastViewState,
  MAX_PENDING_FAILURES,
  moveToDeadLetter,
  saveOfflineState,
  updatePendingMutation,
  type LastViewState,
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
} from "@/lib/school";
import { createClient } from "@/lib/supabase/client";
import { compactPendingMutations, prepareMutation } from "@/lib/sync";

type Zoom = "school" | "upcoming" | "day" | "week" | "month" | "semester";
type PaletteMode = "command" | "filter" | "upload";
type CommandTurn = { role: "user" | "assistant"; text: string };


function transitionState(update: () => void) {
  if (typeof document !== "undefined" && "startViewTransition" in document) {
    document.startViewTransition(update);
    return;
  }
  update();
}

function isRestorableZoom(value: string): value is Zoom {
  return ["school", "upcoming", "day", "week", "month", "semester"].includes(
    value,
  );
}

function defaultViewState(): LastViewState {
  const today = dateKey(new Date());
  return {
    zoom: "upcoming",
    anchorDate: today,
    selectedDay: today,
    nowOpen: false,
    inboxOpen: false,
    homeworkOpen: false,
    intentionsOpen: false,
    hudOpen: false,
    historyOpen: false,
    weeklyReviewOpen: false,
    weeklyReviewPromptWeek: null,
    scrollTop: 0,
    viewportHeight: 0,
    visibleDay: today,
    visibleHour: 6,
    visibleMinute: 0,
  };
}

const GATE_EMAILS = (process.env.NEXT_PUBLIC_ACCESS_GATE_EMAILS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

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
    description: item.description,
    room: item.room,
    subjectId: item.subjectId,
    assignmentId: item.assignmentId,
    homeworkCaptureId: item.homeworkCaptureId,
    taskContext: item.taskContext,
    computerRequired: item.computerRequired,
    status: item.status,
  };
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [gateDenied, setGateDenied] = useState(false);
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
  const gateActive = GATE_EMAILS.length > 0;
  const gateAllowed =
    !gateActive ||
    Boolean(user && GATE_EMAILS.includes((user.email ?? "").toLowerCase()));
  const [isOnline, setIsOnline] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("upcoming");
  const [anchorDate, setAnchorDate] = useState("1970-01-01");
  const [selectedDay, setSelectedDay] = useState("1970-01-01");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [commandText, setCommandText] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandConversation, setCommandConversation] = useState<CommandTurn[]>(
    [],
  );
  const [commandQuestions, setCommandQuestions] = useState<
    ClarificationResponse["questions"]
  >([]);
  const [timetableImportBusy, setTimetableImportBusy] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [proposal, setProposal] = useState<CalendarProposal | null>(null);
  const [timetableSubjectProposal, setTimetableSubjectProposal] = useState<{
    proposalId: string;
    subjects: Subject[];
    reviewed: boolean;
  } | null>(null);
  const [timetableImportIssues, setTimetableImportIssues] = useState<{
    proposalId: string;
    issues: RejectedTimetableCandidate[];
  } | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [draftItem, setDraftItem] = useState<CalendarItem | null>(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [homeworkOpen, setHomeworkOpen] = useState(false);
  const [weeklyReviewOpen, setWeeklyReviewOpen] = useState(false);
  const [completedReviewWeeks, setCompletedReviewWeeks] = useState<string[]>([]);
  const [weeklyReviewPromptWeek, setWeeklyReviewPromptWeek] = useState<string | null>(null);
  const [intentionsOpen, setIntentionsOpen] = useState(false);
  const [intentionSeed, setIntentionSeed] = useState<Partial<Intention> | null>(
    null,
  );
  const [deeperSource, setDeeperSource] = useState<LearningSource | null>(null);
  const [deeperExploration, setDeeperExploration] =
    useState<Exploration | null>(null);
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
  const [viewRestored, setViewRestored] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const calendarStageRef = useRef<HTMLElement | null>(null);
  const deviceViewRef = useRef<LastViewState | null>(null);
  const restoredViewRef = useRef<LastViewState | null>(null);
  const viewSaveTimerRef = useRef<number | null>(null);
  const reconciledUserKeyRef = useRef<string | null>(null);

  const currentWeekKey = useMemo(
    () => dateKey(startOfWeek(clockNow)),
    [clockNow],
  );
  const weeklyReviewAvailable = useMemo(
    () =>
      hydrated &&
      isWeeklyReviewAvailable({
        now: clockNow,
        items,
        classes,
        classExceptions,
        assignments,
        assessments,
        completedReviewWeeks,
      }),
    [
      assessments,
      assignments,
      clockNow,
      completedReviewWeeks,
      hydrated,
      classExceptions,
      classes,
      items,
    ],
  );

  const currentViewState = useCallback((): LastViewState => {
    const stage = calendarStageRef.current;
    const scrollTop = stage?.scrollTop ?? 0;
    const viewportHeight = stage?.clientHeight ?? 0;
    const rowHeight = zoom === "day" ? 72 : 52;
    const visiblePosition = Math.max(0, scrollTop / rowHeight);
    return {
      zoom,
      anchorDate,
      selectedDay,
      nowOpen,
      inboxOpen,
      homeworkOpen,
      intentionsOpen,
      hudOpen,
      historyOpen,
      weeklyReviewOpen,
      weeklyReviewPromptWeek,
      ownerKey: user?.id ?? "local",
      scrollTop,
      viewportHeight,
      visibleDay: zoom === "day" || zoom === "week" ? selectedDay : anchorDate,
      visibleHour: Math.min(23, Math.floor(visiblePosition)),
      visibleMinute:
        Math.min(45, Math.round((visiblePosition % 1) * 4) * 15),
    };
  }, [
    anchorDate,
    historyOpen,
    homeworkOpen,
    weeklyReviewOpen,
    weeklyReviewPromptWeek,
    hudOpen,
    inboxOpen,
    intentionsOpen,
    nowOpen,
    selectedDay,
    user,
    zoom,
  ]);

  const applyViewState = useCallback((state: LastViewState | null) => {
    const next = state ?? defaultViewState();
    if (isRestorableZoom(next.zoom)) setZoom(next.zoom);
    setAnchorDate(next.anchorDate);
    setSelectedDay(next.selectedDay);
    setNowOpen(next.nowOpen);
    setInboxOpen(next.inboxOpen);
    setHomeworkOpen(next.homeworkOpen);
    setIntentionsOpen(next.intentionsOpen);
    setHudOpen(next.hudOpen);
    setHistoryOpen(next.historyOpen);
    setWeeklyReviewOpen(Boolean(next.weeklyReviewOpen));
    setWeeklyReviewPromptWeek(next.weeklyReviewPromptWeek ?? null);
  }, []);

  const applyRestoredScroll = useCallback((state: LastViewState | null) => {
    if (!state) return;
    const rowHeight = state.zoom === "day" ? 72 : 52;
    const anchorTop =
      (state.visibleHour ?? 6) * rowHeight +
      ((state.visibleMinute ?? 0) / 60) * rowHeight;
    const exactTop = state.scrollTop ?? anchorTop;
    const preferAnchor =
      !state.viewportHeight ||
      Math.abs((calendarStageRef.current?.clientHeight ?? 0) - state.viewportHeight) > 160;
    const targetTop = preferAnchor ? anchorTop : exactTop;
    let attempts = 0;
    const attempt = () => {
      const stage = calendarStageRef.current;
      if (!stage) return;
      if (stage.scrollHeight <= targetTop + 80 && attempts < 5) {
        attempts += 1;
        requestAnimationFrame(attempt);
        return;
      }
      stage.scrollTo({ top: targetTop });
    };
    requestAnimationFrame(attempt);
  }, []);
  const resizeGestureActive = useRef(false);
  const polishedBlocksRef = useRef(new Set<string>());
  const calendarSwipeStartRef = useRef<SwipePoint | null>(null);
  const calendarSwipeLastRef = useRef<SwipePoint | null>(null);
  const suppressSwipeClickUntilRef = useRef(0);
  const weekWheelRef = useRef({ totalX: 0, lastAt: 0, lockedUntil: 0 });
  const writeRevisionRef = useRef(0);

  const flushPending = useCallback(
    async (ownerKey: string) => {
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
          if (mutation.action === "insert")
            query = supabase.from(mutation.table).insert(payload ?? {});
          else if (mutation.action === "upsert")
            query = supabase
              .from(mutation.table)
              .upsert(payload ?? {}, { onConflict: prepared.onConflict });
          else if (mutation.action === "update")
            query = supabase
              .from(mutation.table)
              .update(payload ?? {})
              .eq("id", mutation.recordId);
          else
            query = supabase
              .from(mutation.table)
              .delete()
              .eq("id", mutation.recordId);
          const { error } = await query;
          if (error) throw new Error(syncErrorMessage(error));
          if (mutation.id !== undefined)
            await removePendingMutation(mutation.id);
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
    },
    [supabase],
  );

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
          .gte(
            "starts_at",
            new Date(Date.now() - 30 * 86_400_000).toISOString(),
          )
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
    const today = dateKey(new Date());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe: server and client must agree on the initial date
    setAnchorDate(today);
    setSelectedDay(today);
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
      .then(async (stored) => {
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
        setCompletedReviewWeeks(stored.completedReviewWeeks ?? []);
        setHomeworkCaptures(stored.homeworkCaptures ?? []);
        setSchoolDaySettings(
          normalizeSchoolDaySettings(
            stored.schoolDaySettings ?? DEFAULT_SCHOOL_DAY_SETTINGS,
          ),
        );
        const deviceView = await getLastViewState("device-last-view");
        if (!alive) return;
        deviceViewRef.current = deviceView;
        applyViewState(deviceView);
        restoredViewRef.current = deviceView;
        applyRestoredScroll(deviceView);
      })
      .finally(() => {
        if (alive) {
          setHydrated(true);
          setViewRestored(true);
        }
      });
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const email = (data.session?.user?.email ?? "").toLowerCase();
      if (GATE_EMAILS.length > 0 && email && !GATE_EMAILS.includes(email)) {
        setGateDenied(true);
        void supabase.auth.signOut();
        setUser(null);
        return;
      }
      setUser(data.session?.user ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      const email = (session?.user?.email ?? "").toLowerCase();
      if (
        GATE_EMAILS.length > 0 &&
        event === "SIGNED_IN" &&
        email &&
        !GATE_EMAILS.includes(email)
      ) {
        setGateDenied(true);
        void supabase.auth.signOut();
        setUser(null);
        setAccountOpen(false);
        return;
      }
      setUser(session?.user ?? null);
      setAccountOpen(false);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [applyRestoredScroll, applyViewState, supabase]);

  useEffect(() => {
    if (!hydrated || !viewRestored || !user) return;
    let cancelled = false;
    const ownerViewKey = `owner:${user.id}:last-view`;
    getLastViewState(ownerViewKey)
      .then((ownerView) => {
        if (cancelled) return;
        const deviceView = deviceViewRef.current;
        if (ownerView) {
          const reconciled = { ...ownerView, ownerKey: user.id };
          deviceViewRef.current = reconciled;
          restoredViewRef.current = reconciled;
          applyViewState(reconciled);
          applyRestoredScroll(reconciled);
        } else if (
          !deviceView ||
          deviceView.ownerKey === "local" ||
          !deviceView.ownerKey
        ) {
          const promoted = {
            ...(deviceView ?? defaultViewState()),
            ownerKey: user.id,
          };
          deviceViewRef.current = promoted;
          restoredViewRef.current = promoted;
          applyViewState(promoted);
          applyRestoredScroll(promoted);
          void saveLastViewState("device-last-view", promoted);
          void saveLastViewState(ownerViewKey, promoted);
        } else {
          const reset = { ...defaultViewState(), ownerKey: user.id };
          deviceViewRef.current = reset;
          restoredViewRef.current = reset;
          applyViewState(reset);
          applyRestoredScroll(reset);
          void saveLastViewState("device-last-view", reset);
          void saveLastViewState(ownerViewKey, reset);
        }
        reconciledUserKeyRef.current = user.id;
      })
      .catch(() => {
        reconciledUserKeyRef.current = user.id;
      });
    return () => {
      cancelled = true;
    };
  }, [
    applyRestoredScroll,
    applyViewState,
    hydrated,
    user,
    viewRestored,
  ]);

  const scheduleViewSave = useCallback(() => {
    if (!viewRestored) return;
    if (viewSaveTimerRef.current !== null) {
      window.clearTimeout(viewSaveTimerRef.current);
    }
    viewSaveTimerRef.current = window.setTimeout(() => {
      if (user && reconciledUserKeyRef.current !== user.id) return;
      const state = currentViewState();
      void saveLastViewState("device-last-view", state);
      if (user && reconciledUserKeyRef.current === user.id) {
        void saveLastViewState(`owner:${user.id}:last-view`, state);
      }
    }, 400);
  }, [
    currentViewState,
    user,
    viewRestored,
  ]);

  useEffect(() => {
    scheduleViewSave();
  }, [scheduleViewSave]);

  useEffect(() => {
    if (
      !weeklyReviewAvailable ||
      weeklyReviewPromptWeek === currentWeekKey
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setWeeklyReviewPromptWeek(currentWeekKey);
      setWeeklyReviewOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentWeekKey, weeklyReviewAvailable, weeklyReviewPromptWeek]);

  useEffect(() => {
    const stage = calendarStageRef.current;
    if (!stage) return;
    stage.addEventListener("scroll", scheduleViewSave, { passive: true });
    return () => stage.removeEventListener("scroll", scheduleViewSave);
  }, [scheduleViewSave]);

  useEffect(
    () => () => {
      if (viewSaveTimerRef.current !== null) {
        window.clearTimeout(viewSaveTimerRef.current);
      }
    },
    [],
  );

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
      completedReviewWeeks,
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
    completedReviewWeeks,
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
          setNotice(
            `${failures.length} change${failures.length === 1 ? " is" : "s are"} waiting to sync. Retrying automatically.`,
          );
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
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(
          () => setSyncTick((current) => current + 1),
          250,
        );
      })
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
        setTimetableImportIssues(null);
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

  const persistMutation = useCallback(
    async (mutation: PendingMutation) => {
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
    },
    [isOnline, supabase, user],
  );

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
    const continuingConversation = commandConversation.length > 0;
    const homework = parseHomework(clean, subjects, new Date());
    if (!continuingConversation && looksLikeHomeworkCommand(clean, homework)) {
      captureHomework(clean);
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
    const intentionDraft = continuingConversation
      ? null
      : intentionFromCommand(clean);
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
          command: clean,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          items: relevantCommandItems(
            [...commandConversation.map((turn) => turn.text), clean].join(" "),
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
      setProposal(proposalFromCommandResponse(raw, items));
      setCommandConversation([]);
      setCommandQuestions([]);
    } catch {
      if (
        /^(?:add|create|schedule|new)\b/i.test(clean) &&
        !/(?:move|delete|remove|cancel)\b/i.test(clean)
      ) {
        setProposal(simpleFallbackProposal(clean));
      } else {
        setNotice(
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
      }
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
      if (!sessionData.session?.access_token)
        throw new Error("Sign in to use document extraction");
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
          raw &&
          typeof raw === "object" &&
          "error" in raw &&
          typeof raw.error === "string"
            ? raw.error
            : "Extraction failed";
        throw new Error(message);
      }
      if (!isExtractionResponse(raw)) {
        throw new Error("AI returned an invalid document proposal");
      }
      if (timetableMode && options.weekStart) {
        const { lessons, newSubjects, rejected } = reconcileTimetableImport(
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
          summary: `${previousWeek.length ? `Replace ${previousWeek.length} earlier imported lesson${previousWeek.length === 1 ? "" : "s"}. ` : ""}${newSubjects.length ? `Add ${newSubjects.length} new subject${newSubjects.length === 1 ? "" : "s"}; similar labels were matched to subjects you already have. ` : ""}${rejected.length ? `Hold ${rejected.length} unclear or conflicting row${rejected.length === 1 ? "" : "s"} for review. ` : ""}This applies only to the week of ${options.weekStart}. Review everything before applying.`,
          source: "document",
          changes,
        });
        setTimetableImportIssues(
          rejected.length ? { proposalId, issues: rejected } : null,
        );
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
    setTimetableImportIssues(null);
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
    setTimetableImportIssues(null);
  }

  function skipProposalChange(changeId: string) {
    setProposal((current) =>
      current
        ? {
            ...current,
            changes: current.changes.filter((change) => change.id !== changeId),
          }
        : current,
    );
  }

  function updateTimetableSubject(
    subjectId: string,
    patch: Partial<
      Pick<Subject, "name" | "shortName" | "teacher" | "room" | "color">
    >,
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
                      after: {
                        ...change.after,
                        title: patch.name || currentSubject.name,
                      },
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
            subjects: current.subjects.filter(
              (subject) => subject.id !== subjectId,
            ),
          }
        : current,
    );
  }

  function finishTimetableSubjectReview() {
    const pending = timetableSubjectProposal?.subjects ?? [];
    if (
      pending.some(
        (subject) => !subject.name.trim() || !subject.shortName.trim(),
      )
    ) {
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

  function completeAssignment(assignment: Assignment) {
    const progress = assignmentProgress(assignment, items);
    const actualMinutes =
      progress.completedMinutes > 0
        ? progress.completedMinutes
        : assignment.estimatedMinutes;
    saveAssignment({
      ...assignment,
      status: "completed",
      actualMinutes,
    });
    setNotice(
      `Marked "${assignment.title}" complete — actual time ${formatWorkMinutes(actualMinutes)} (estimated ${formatWorkMinutes(assignment.estimatedMinutes)}).`,
    );
  }

  function previewFreePeriodSession(
    recommendation: FreePeriodRecommendation,
    period: FreePeriod,
  ) {
    const minutes = recommendation.durationMinutes;
    if (recommendation.sourceType === "calendar_item") {
      const existing = recommendation.item;
      const scheduled = {
        ...existing,
        startsAt: period.start.toISOString(),
        endsAt: new Date(
          period.start.getTime() + minutes * 60_000,
        ).toISOString(),
        status: "scheduled" as const,
      };
      setAnchorDate(dateKey(period.start));
      setSelectedDay(dateKey(period.start));
      setZoom("week");
      setProposal({
        id: crypto.randomUUID(),
        title: `Use free period for ${existing.title}`,
        summary: `${minutes} minutes at school. Nothing changes until you apply this preview.`,
        source: "command",
        changes: [
          {
            id: crypto.randomUUID(),
            type: "update",
            itemId: existing.id,
            reason: "This flexible calendar item fits the verified school gap.",
            before: existing,
            after: scheduled,
          },
        ],
      });
      return;
    }

    const assignment = recommendation.assignment;
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
      estimatedMinutes: overrides.estimatedMinutes ?? parsed.estimatedMinutes,
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
      actualMinutes: null,
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
      if (!response.ok)
        errorMessage = result.error ?? "Could not accept invitation";
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
      setNotice(
        `Account ready. A verification code was sent to ${inviteEmail.trim()}.`,
      );
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
    setCompletedReviewWeeks([]);
    setWeeklyReviewPromptWeek(null);
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
      completedReviewWeeks: [],
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
      const subject = subjects.find(
        (entry) => entry.id === recommendation.subjectId,
      );
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
          durationMin: Math.min(fresh.durationMinutes, sourceDurationMin),
          durationMax: Math.max(fresh.durationMinutes, sourceDurationMax),
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
    setIntentions((current) => [
      normalized,
      ...current.filter((entry) => entry.id !== normalized.id),
    ]);
    persistMutation({
      table: "intentions",
      action: "upsert",
      recordId: normalized.id,
      payload: intentionToRow(normalized),
    }).catch(() => undefined);
    setIntentionSeed(null);
    setNotice(
      `Saved intention “${normalized.title}”. No calendar time was created.`,
    );
  }

  function deleteIntention(intention: Intention) {
    const archived = { ...intention, status: "archived" as const };
    setIntentions((current) =>
      current.map((entry) => (entry.id === archived.id ? archived : entry)),
    );
    persistMutation({
      table: "intentions",
      action: "update",
      recordId: archived.id,
      payload: { status: "archived" },
    }).catch(() => undefined);
    setNotice(`Archived “${intention.title}”.`);
  }

  function startIntention(
    intention: Intention,
    requestedMinutes = intention.preferredSessionMinutes,
  ) {
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
      deadline: intention.horizonEnd
        ? `${intention.horizonEnd}T23:59:00`
        : null,
      energyType:
        intention.workType === "deep_focus" ||
        intention.workType === "problem_solving"
          ? "deep_focus"
          : "light_work",
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
    const validation = validatePlacement(
      task,
      start.toISOString(),
      end.toISOString(),
      items,
    );
    if (!validation.valid) {
      setNotice(
        validation.errors[0] ?? "That intention does not fit right now.",
      );
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
    const subjectId =
      item.subjectId ?? assignment?.subjectId ?? assessment?.subjectId ?? null;
    return {
      type: "calendar_item",
      id: item.id,
      title: item.title,
      subjectId,
      subjectName: subjectName(subjectId),
      context: [item.description, item.revisionStage, item.workType]
        .filter(Boolean)
        .join(" · "),
    };
  }

  function recordChallenge(
    source: LearningSource,
    challengeLevel: ChallengeLevel,
  ) {
    const signal = makeLearningSignal(source, challengeLevel);
    setLearningSignals((current) => [signal, ...current]);
    persistMutation({
      table: "learning_signals",
      action: "insert",
      recordId: signal.id,
      payload: learningSignalToRow(signal),
    }).catch(() => undefined);
    setNotice(
      `Challenge noted: ${challengeLevel === "not_understood" ? "not understood yet" : challengeLevel.replace("_", " ")}.`,
    );
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
      if (!data.session?.access_token)
        throw new Error(
          "Sign in to use Go Deeper. Challenge feedback still works locally.",
        );
      const latest = latestSignalFor(source, learningSignals);
      const summary = subjectChallengeSummary(
        source.subjectId,
        learningSignals,
      );
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
      if (!response.ok || !isDeeperResponse(raw))
        throw new Error(
          "No useful exploration was returned. Try again in a moment.",
        );
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
      persistMutation({
        table: "explorations",
        action: "insert",
        recordId: exploration.id,
        payload: explorationToRow(exploration),
      }).catch(() => undefined);
    } catch (error) {
      setDeeperError(
        error instanceof Error
          ? error.message
          : "Go Deeper is unavailable right now.",
      );
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
    setExplorations((current) =>
      current.map((entry) => (entry.id === saved.id ? saved : entry)),
    );
    setDeeperExploration(saved);
    persistMutation({
      table: "explorations",
      action: "update",
      recordId: saved.id,
      payload: { status: "saved" },
    }).catch(() => undefined);
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
    const validation = validatePlacement(
      base,
      base.startsAt!,
      base.endsAt!,
      items,
    );
    if (validation.valid) {
      createItem(base);
      setNotice(`Started a 15-minute exploration: “${direction.title}”.`);
    } else {
      createItem({ ...base, startsAt: null, endsAt: null, status: "inbox" });
      setNotice(
        `Saved “${direction.title}” as a 15-minute possibility; your current fixed event stays protected.`,
      );
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

  const saveBlockChoice = useCallback(
    (choice: BlockChoice) => {
      setBlockChoices((current) =>
        [choice, ...current.filter((entry) => entry.id !== choice.id)].slice(
          0,
          150,
        ),
      );
      persistMutation({
        table: "time_block_choices",
        action: "upsert",
        recordId: choice.id,
        payload: blockChoiceToRow(choice),
      }).catch(() => undefined);
    },
    [persistMutation],
  );

  function selectBlockSuggestion(suggestion: BlockSuggestion) {
    if (!currentBlockChoice) return;
    const next = updateBlockChoice(
      currentBlockChoice,
      suggestion.id,
      "selected",
    );
    saveBlockChoice(next);
    setNotice(
      `This ${next.context.label.toLowerCase()}: “${suggestion.title}”. You can change your mind.`,
    );
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
    saveBlockChoice(updateBlockChoice(currentBlockChoice, null, "suggested"));
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
      const intention = intentions.find(
        (entry) => entry.id === suggestion.sourceId,
      );
      setIntentionSeed(intention ?? null);
      setIntentionsOpen(true);
      return;
    }
    if (suggestion.sourceType === "exploration" && suggestion.sourceId) {
      const exploration = explorations.find(
        (entry) => entry.id === suggestion.sourceId,
      );
      if (!exploration) return;
      setDeeperSource({
        type: exploration.sourceType,
        id: exploration.sourceId,
        title: exploration.sourceTitle,
        subjectId: exploration.subjectId,
        subjectName: subjects.find(
          (entry) => entry.id === exploration.subjectId,
        )?.name,
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
      hydrated
        ? buildBlockChoice({
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
          })
        : null,
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
      blockChoices.some(
        (choice) => choice.blockKey === currentBlockChoice.blockKey,
      )
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setBlockChoices((current) =>
        [currentBlockChoice, ...current].slice(0, 150),
      );
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
      const wording = new Map(
        raw.suggestions.map((suggestion) => [suggestion.id, suggestion]),
      );
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

  if (!gateAllowed) {
    return <AccessGate denied={gateDenied} />;
  }

  return (
    <main id="main-content" className={`flex-shell ${draggingItemId ? "is-dragging" : ""}`}>
      <CalendarRail
        zoom={zoom}
        inboxOpen={inboxOpen}
        homeworkOpen={homeworkOpen}
        hudOpen={hudOpen}
        historyOpen={historyOpen}
        weeklyReviewOpen={weeklyReviewOpen}
        weeklyReviewAvailable={weeklyReviewAvailable}
        activeHomeworkCount={activeHomework.length}
        inboxCount={inboxItems.length}
        userEmail={user?.email}
        onToday={() => {
          const today = dateKey(new Date());
          setAnchorDate(today);
          setSelectedDay(today);
        }}
        onHome={() => {
          setInboxOpen(false);
          setHomeworkOpen(false);
          setHudOpen(false);
          transitionState(() => setZoom("upcoming"));
        }}
        onSchool={() => {
          setInboxOpen(false);
          setHomeworkOpen(false);
          setHudOpen(false);
          transitionState(() => setZoom("school"));
        }}
        onToggleHomework={() => {
          setHomeworkOpen((current) => !current);
          setInboxOpen(false);
          setHudOpen(false);
        }}
        onToggleInbox={() => {
          setInboxOpen((current) => !current);
          setHomeworkOpen(false);
          setHudOpen(false);
        }}
        onWeeklyReview={() => {
          setWeeklyReviewOpen(true);
          setInboxOpen(false);
          setHomeworkOpen(false);
          setHudOpen(false);
        }}
        onOpenCommand={() => {
          setPaletteOpen(true);
          setInboxOpen(false);
          setHomeworkOpen(false);
          setHudOpen(false);
        }}
        onToggleHud={() => {
          setHudOpen((current) => !current || historyOpen);
          setHistoryOpen(false);
          setInboxOpen(false);
          setHomeworkOpen(false);
        }}
        onOpenHistory={() => {
          setHistoryOpen(true);
          setHudOpen(true);
          setInboxOpen(false);
          setHomeworkOpen(false);
        }}
        onToggleAccount={() => setAccountOpen((current) => !current)}
      />

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

      <MobileActionSheets
        createOpen={mobileCreateOpen}
        menuOpen={mobileMenuOpen}
        weeklyReviewAvailable={weeklyReviewAvailable}
        activeHomeworkCount={activeHomework.length}
        inboxCount={inboxItems.length}
        undoCount={undoStack.length}
        signedIn={Boolean(user)}
        onClose={() => {
          setMobileCreateOpen(false);
          setMobileMenuOpen(false);
        }}
        onOpenCommand={() => {
          setMobileCreateOpen(false);
          setPaletteMode("command");
          setPaletteOpen(true);
        }}
        onNewEvent={() => {
          setMobileCreateOpen(false);
          openNewEvent();
        }}
        onNewTask={() => {
          setMobileCreateOpen(false);
          openNewTask();
        }}
        onOpenHomework={() => {
          setMobileCreateOpen(false);
          setHomeworkOpen(true);
        }}
        onWeeklyReview={() => {
          setMobileMenuOpen(false);
          setWeeklyReviewOpen(true);
        }}
        onOpenInbox={() => {
          setMobileMenuOpen(false);
          setInboxOpen(true);
        }}
        onOpenHud={() => {
          setMobileMenuOpen(false);
          setHudOpen(true);
          setHistoryOpen(false);
        }}
        onOpenHistory={() => {
          setMobileMenuOpen(false);
          setHudOpen(true);
          setHistoryOpen(true);
        }}
        onUndo={() => {
          setMobileMenuOpen(false);
          undoLast();
        }}
        onOpenAccount={() => {
          setMobileMenuOpen(false);
          setAccountOpen(true);
        }}
      />

      <TaskDock
        open={inboxOpen}
        items={inboxItems}
        draggingItemId={draggingItemId}
        filterText={filterText}
        syncing={syncing}
        isOnline={isOnline}
        signedIn={Boolean(user)}
        userEmail={user?.email}
        onDrop={onInboxDrop}
        onDragStart={onDragStart}
        onDragEnd={endDrag}
        onOpenItem={openItem}
        onOpenCommand={() => setPaletteOpen(true)}
        onClose={() => setInboxOpen(false)}
        onFilterChange={setFilterText}
      />

      {homeworkOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {weeklyReviewOpen && (
        <Suspense fallback={null}>
          <WeeklyReview
            items={items}
            subjects={subjects}
            classes={classes}
            classExceptions={classExceptions}
            assignments={assignments}
            assessments={assessments}
            learningSignals={learningSignals}
            onChallenge={(source, value) => {
              const item =
                source.type === "calendar_item"
                  ? items.find((candidate) => candidate.id === source.id)
                  : null;
              const assignment =
                source.type === "assignment"
                  ? assignments.find((candidate) => candidate.id === source.id)
                  : null;
              const assessment =
                source.type === "assessment"
                  ? assessments.find((candidate) => candidate.id === source.id)
                  : null;
              const subjectId =
                item?.subjectId ??
                assignment?.subjectId ??
                assessment?.subjectId ??
                null;
              recordChallenge(
                {
                  type: source.type,
                  id: source.id,
                  title:
                    item?.title ??
                    assignment?.title ??
                    assessment?.title ??
                    "Untitled",
                  subjectId,
                  subjectName: subjectName(subjectId),
                },
                value,
              );
            }}
            onSavePlan={(planItems) => {
              for (const plan of planItems) {
                const item = makeItem({
                  title: `${plan.title} - review session`,
                  kind: "task",
                  subjectId: plan.subjectId,
                  durationMin: plan.durationMin,
                  energyType: "deep_focus",
                  workType: "problem_solving",
                  flexibility: "flexible",
                  status: "inbox",
                  source: "command",
                });
                setItems((current) => [...current, item]);
                persistMutation({
                  table: "calendar_items",
                  action: "insert",
                  recordId: item.id,
                  payload: itemToRow(item),
                }).catch(() => undefined);
              }
              setCompletedReviewWeeks((current) =>
                current.includes(currentWeekKey)
                  ? current
                  : [...current, currentWeekKey],
              );
              setNotice("Study plan saved to inbox.");
            }}
            onClose={() => setWeeklyReviewOpen(false)}
          />
        </Suspense>
      )}

      <section
        ref={calendarStageRef}
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
        <CalendarHeader
          zoom={zoom}
          anchor={anchor}
          anchorDate={anchorDate}
          undoCount={undoStack.length}
          onPrevious={() => moveAnchor(-1)}
          onNext={() => moveAnchor(1)}
          onToday={() => {
            const today = dateKey(new Date());
            setAnchorDate(today);
            setSelectedDay(today);
          }}
          onAnchorChange={(value) => {
            if (!value) return;
            setAnchorDate(value);
            setSelectedDay(value);
          }}
          onZoomChange={(level) => transitionState(() => setZoom(level))}
          onUndo={undoLast}
        />

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

        {weeklyReviewAvailable && !weeklyReviewOpen && (
          <aside className="toast weekly-review-toast" role="status">
            <span>Weekly review is ready.</span>
            <button
              type="button"
              onClick={() => setWeeklyReviewOpen(true)}
            >
              Open
            </button>
          </aside>
        )}

        {zoom === "school" ? (
          <Suspense fallback={null}>
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
              onCompleteAssignment={completeAssignment}
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
          </Suspense>
        ) : zoom === "upcoming" ? (
          <AttentionHome
            snapshot={attentionSnapshot}
            commandText={commandText}
            commandBusy={commandBusy}
            intentionCount={
              intentions.filter((entry) => entry.status === "active").length
            }
            onCommandChange={setCommandText}
            onCommandSubmit={(event) => submitCommand(event, "command")}
            onOpenCommand={() => {
              setPaletteMode("command");
              setPaletteOpen(true);
            }}
            onOpenCard={openAttentionCard}
            onStartRecommendation={() =>
              attentionSnapshot.recommendation &&
              startNow(attentionSnapshot.recommendation)
            }
            onStartIntention={() =>
              attentionSnapshot.intentionOpportunity &&
              startIntention(
                attentionSnapshot.intentionOpportunity.intention,
                attentionSnapshot.intentionOpportunity.durationMinutes,
              )
            }
            onOpenIntentions={() => {
              setIntentionSeed(null);
              setIntentionsOpen(true);
            }}
            onOpenCalendar={() => transitionState(() => setZoom("week"))}
            blockChoice={currentBlockChoice}
            onSelectBlockSuggestion={selectBlockSuggestion}
            onBlockStatus={setBlockChoiceStatus}
            onChangeBlockSuggestion={changeBlockSuggestion}
            onOpenBlockSuggestion={openBlockSuggestion}
          />
        ) : isCompact && zoom === "week" ? (
          <Suspense fallback={<CalendarFallback />}>
            <MobileAgenda
              mode={zoom}
              days={Array.from({ length: 7 }, (_, index) =>
                addDays(weekStart, index),
              )}
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
          </Suspense>
        ) : zoom === "month" || zoom === "semester" ? (
          <Suspense fallback={<CalendarFallback />}>
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
          </Suspense>
        ) : (
          <Suspense fallback={<CalendarFallback />}>
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
                  ? (filteredItems.find((item) => item.id === draggingItemId) ??
                    null)
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
          </Suspense>
        )}
      </section>

      <QuickHud
        open={hudOpen}
        historyOpen={historyOpen}
        history={history}
        selectedDay={selectedDay}
        nowItem={nowItem}
        nextItem={nextItem}
        laterItems={laterItems}
        dayCapacity={dayCapacity}
        insights={insights}
        onClose={() => {
          setHistoryOpen(false);
          setHudOpen(false);
        }}
        onRestore={(entry) => setProposal(restoreProposal(entry, items))}
        onOpenItem={openItem}
      />

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

      {intentionsOpen && (
        <Suspense fallback={null}>
          <IntentionsPanel
            key={intentionSeed?.id ?? intentionSeed?.title ?? "intentions"}
            open={intentionsOpen}
            intentions={intentions}
            subjects={subjects}
            items={items}
            learningSignals={learningSignals}
            seed={intentionSeed}
            onClose={() => {
              setIntentionsOpen(false);
              setIntentionSeed(null);
            }}
            onSave={saveIntention}
            onDelete={deleteIntention}
            onStart={startIntention}
            onChallenge={recordChallenge}
            onGoDeeper={openGoDeeper}
          />
        </Suspense>
      )}

      {deeperSource && (
        <Suspense fallback={null}>
          <GoDeeperPanel
            source={deeperSource}
            exploration={deeperExploration}
            busy={deeperBusy}
            error={deeperError}
            onClose={() => {
              setDeeperSource(null);
              setDeeperExploration(null);
              setDeeperError("");
            }}
            onGenerate={(fresh) =>
              generateDeeper(deeperSource, fresh).catch(() => undefined)
            }
            onSave={saveExploration}
            onStart={startExplorationDirection}
          />
        </Suspense>
      )}

      {nowOpen && nowResult && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      <CommandPalette
        open={paletteOpen}
        mode={paletteMode}
        commandText={commandText}
        commandBusy={commandBusy}
        commandConversation={commandConversation}
        commandQuestions={commandQuestions}
        commandPreview={commandPreview}
        homeworkCommandPreview={homeworkCommandPreview}
        commandIsHomework={commandIsHomework}
        onClose={() => setPaletteOpen(false)}
        onModeChange={setPaletteMode}
        onCommandTextChange={setCommandText}
        onSubmit={(event) => submitCommand(event, "command")}
        onResetConversation={() => {
          setCommandConversation([]);
          setCommandQuestions([]);
          setCommandText("");
        }}
        onDocumentSelected={(file) =>
          onDocumentSelected(file, { mode: "school_timetable" })
        }
      />
      <ProposalReview
        proposal={proposal}
        timetableSubjectProposal={timetableSubjectProposal}
        proposalValidation={proposalValidation}
        onClose={closeProposal}
        onApprove={approveProposal}
        onUpdateSubject={updateTimetableSubject}
        onAddSubject={addTimetableSubject}
        onRemoveSubject={removeTimetableSubject}
        onFinishSubjectReview={finishTimetableSubjectReview}
        onSkipChange={skipProposalChange}
        onEditSubjects={() =>
          setTimetableSubjectProposal((current) =>
            current ? { ...current, reviewed: false } : current,
          )
        }
        timetableImportIssues={timetableImportIssues}
      />
      {selectedItem && draftItem && (
        <EventModal
          selectedItem={selectedItem}
          draftItem={draftItem}
          subjects={subjects}
          assessments={assessments}
          learningSource={sourceForCalendarItem(selectedItem)}
          challengeLevel={latestSignalFor(
            sourceForCalendarItem(selectedItem),
            learningSignals,
          )?.challengeLevel ?? null}
          isCreatingItem={isCreatingItem}
          draftTimingError={draftTimingError}
          durationOptions={draftDurationOptions}
          focusTemplates={schoolDaySettings.focusTemplates}
          onDraftChange={setDraftItem}
          onClose={() => {
            setSelectedItem(null);
            setDraftItem(null);
            setIsCreatingItem(false);
          }}
          onSubmit={saveDraft}
          onDelete={deleteItem}
          onUnschedule={unscheduleItem}
          onToggleAssignmentSession={toggleAssignmentSession}
          onMarkRevisionLearned={markRevisionLearned}
          onChallenge={recordChallenge}
          onGoDeeper={openGoDeeper}
        />
      )}

      {accountOpen && (
        <AccountPanel
          user={user}
          authSent={authSent}
          authBusy={authBusy}
          email={email}
          verificationCode={verificationCode}
          inviteEmail={inviteEmail}
          inviteUrl={inviteUrl}
          inviteBusy={inviteBusy}
          inviteToken={inviteToken}
          onClose={() => setAccountOpen(false)}
          onEmailChange={setEmail}
          onVerificationCodeChange={setVerificationCode}
          onInviteEmailChange={setInviteEmail}
          onUseAnotherEmail={() => {
            setAuthSent(false);
            setVerificationCode("");
          }}
          onCreateInvitation={createInvitation}
          onSendVerificationCode={sendVerificationCode}
          onVerifyCode={verifyCode}
          onSignOut={signOut}
        />
      )}
    </main>
  );
}
