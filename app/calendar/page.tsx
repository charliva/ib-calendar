"use client";

import type { User } from "@supabase/supabase-js";
import {
  CalendarPlus,
  CalendarClock,
  GraduationCap,
  Layers3,
  Plus,
  X,
} from "lucide-react";
import {
  useCallback,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import {
  parsedCommand,
  restoreProposal,
} from "@/lib/calendar/commands";
import {
  isBlockPolishResponse,
  type ClarificationResponse,
} from "@/lib/ai/study-planner";
import { AccountPanel } from "@/components/calendar/AccountPanel";
import { CalendarRail } from "@/components/calendar/CalendarRail";
import { MobileActionSheets } from "@/components/calendar/MobileActionSheets";
import { TaskDock } from "@/components/calendar/TaskDock";
import { QuickHud } from "@/components/calendar/QuickHud";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { ProposalReview } from "@/components/calendar/ProposalReview";
import { CompactEventEditor } from "@/components/calendar/CompactEventEditor";
import { SelectionDeleteDialog } from "@/components/calendar/SelectionDeleteDialog";
import {
  classCalendarItems,
  isClassEvent,
} from "@/lib/calendar/interactions";
import { CommandPalette } from "@/components/calendar/CommandPalette";
import {
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
  import("@/app/overview-calendar").then((mod) => ({
    default: mod.OverviewCalendar,
  })),
);
const SchoolWorkspace = lazy(() =>
  import("@/app/school-workspace").then((mod) => ({
    default: mod.SchoolWorkspace,
  })),
);
const IntentionsPanel = lazy(() =>
  import("@/app/intentions-panel").then((mod) => ({
    default: mod.IntentionsPanel,
  })),
);
const GoDeeperPanel = lazy(() =>
  import("@/app/go-deeper-panel").then((mod) => ({
    default: mod.GoDeeperPanel,
  })),
);
import {
  buildAttentionSnapshot,
  type AttentionCard,
} from "@/lib/attention-engine";
import {
  blockChoiceToRow,
  buildBlockChoice,
  updateBlockChoice,
  type BlockChoice,
  type BlockChoiceStatus,
  type BlockSuggestion,
} from "@/lib/block-choices";
import {
  type Intention,
} from "@/lib/intentions";
import {
  type Exploration,
  type LearningSignal,
  type LearningSource,
} from "@/lib/study-intelligence";
import { isWeeklyReviewAvailable } from "@/lib/weekly-review";
import {
  addDays,
  capacityForDay,
  dateFromKey,
  dateKey,
  durationMinutes,
  energyLabels,
  itemToRow,
  makeItem,
  scheduleInsights,
  startOfWeek,
  validatePlacement,
  validateProposal,
  type CalendarItem,
  type CalendarProposal,
  type EnergyRequirement,
  type HistoryEntry,
} from "@/lib/calendar-engine";
import {
  looksLikeHomeworkCommand,
  parseHomework,
  parseReviewSession,
} from "@/lib/homework-parser";
import {
  type CurrentStudyLocation,
} from "@/lib/now-recommender";
import {
  type RejectedTimetableCandidate,
} from "@/lib/timetable-import";
import { hasBlockingOverlay } from "@/lib/overlay/escape-stack";
import {
  buildStalenessReport,
  releaseStaleItems,
} from "@/lib/onboarding/staleness";
import {
  DEFAULT_ACCOUNT_PREFERENCES,
  accountPreferencesToRow,
  type AccountPreferences,
} from "@/lib/settings/account-preferences";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { WelcomeBack } from "@/components/onboarding/WelcomeBack";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { useOnboarding } from "@/app/calendar/use-onboarding";
import {
  getLastViewState,
  getOfflineState,
  getPendingMutations,
  moveToDeadLetter,
  queueMutation,
  removePendingMutation,
  getDeadLetterMutations,
  removeDeadLetterMutation,
  saveLastViewState,
  saveOfflineState,
  shouldDeadLetter,
  updatePendingMutation,
  type DeadLetterMutation,
  type LastViewState,
  type PendingMutation,
} from "@/lib/offline";
import { type SwipePoint } from "@/lib/week-swipe";
import { calendarViewFromSearch } from "@/lib/calendar/view-state";
import {
  DEFAULT_SCHOOL_DAY_SETTINGS,
  normalizeAssignment,
  normalizeAssessment,
  normalizeSchoolDaySettings,
  type Assessment,
  type Assignment,
  type ClassException,
  type SchoolClass,
  type SchoolDaySettings,
  type Subject,
} from "@/lib/school";
import { createClient } from "@/lib/supabase/client";
import {
  compactPendingMutations,
  prepareMutation,
  mutationIdentity,
} from "@/lib/sync";

import {
  defaultViewState,
  isRestorableZoom,
  transitionState,
  type CommandTurn,
  type PaletteMode,
  type Zoom,
} from "@/app/calendar/view-types";
import {
  promoteLegacyOfflineHomework,
  type LegacyOfflineState,
} from "@/app/calendar/legacy-offline";
import { fetchCloudSnapshot } from "@/app/calendar/cloud-snapshot";
import { useAccountSession } from "@/app/calendar/use-account-session";
import { useSchoolRecords } from "@/app/calendar/use-school-records";
import { useWorkCapture } from "@/app/calendar/use-work-capture";
import { useLearningActions } from "@/app/calendar/use-learning-actions";
import { useNowSession } from "@/app/calendar/use-now-session";
import { useCommandConsole } from "@/app/calendar/use-command-console";
import { useProposals } from "@/app/calendar/use-proposals";
import { useEventEditor } from "@/app/calendar/use-event-editor";
import { useDragAndResize } from "@/app/calendar/use-drag-and-resize";
import { useCalendarNavigation } from "@/app/calendar/use-calendar-navigation";

const GATE_EMAILS = (process.env.NEXT_PUBLIC_ACCESS_GATE_EMAILS ?? "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

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
  /**
   * Whether we know what this account holds — either because its snapshot has
   * arrived, or because there is no account to ask. Local state hydrates from
   * IndexedDB long before auth resolves, so without this a returning student on
   * a new device looks exactly like a brand-new one and gets the setup wizard.
   */
  const [cloudSnapshotLoaded, setCloudSnapshotLoaded] = useState(false);
  // A session with no account has nothing to wait for, so the gate opens as
  // soon as local state is in memory. Derived rather than stored so there is no
  // effect to keep in step with it.
  const cloudLoaded = cloudSnapshotLoaded || (hydrated && !user);
  const [cloudOnboardingState, setCloudOnboardingState] =
    useState<unknown>(null);
  const [cloudLastSeenAt, setCloudLastSeenAt] = useState<string | null>(null);
  const [accountPreferences, setAccountPreferences] = useState<AccountPreferences>(
    DEFAULT_ACCOUNT_PREFERENCES,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeBackDismissed, setWelcomeBackDismissed] = useState(false);
  const [deadLettered, setDeadLettered] = useState<DeadLetterMutation[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  const [zoom, setZoom] = useState<Zoom>("upcoming");
  const [anchorDate, setAnchorDate] = useState("1970-01-01");
  const [selectedDay, setSelectedDay] = useState("1970-01-01");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [commandText, setCommandText] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandError] = useState("");
  const [commandTargetId, setCommandTargetId] = useState<string | null>(null);
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
  const [eventAnchor, setEventAnchor] = useState<DOMRect | null>(null);
  const [eventSelection, setEventSelection] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [classesOnly, setClassesOnly] = useState(false);
  const closeCompactEditor = useCallback(() => {
    setSelectedItem(null);
    setDraftItem(null);
    setIsCreatingItem(false);
  }, []);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxDockPosition, setInboxDockPosition] = useState({
    x: 70,
    y: 74,
  });
  const [isDockRepositioning, setIsDockRepositioning] = useState(false);
  const [isCalendarItemRepositioning, setIsCalendarItemRepositioning] =
    useState(false);
  const [weeklyReviewOpen, setWeeklyReviewOpen] = useState(false);
  const [completedReviewWeeks, setCompletedReviewWeeks] = useState<string[]>(
    [],
  );
  const [weeklyReviewPromptWeek, setWeeklyReviewPromptWeek] = useState<
    string | null
  >(null);
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
      inboxDockPosition,
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
      visibleMinute: Math.min(45, Math.round((visiblePosition % 1) * 4) * 15),
    };
  }, [
    anchorDate,
    historyOpen,
    weeklyReviewOpen,
    weeklyReviewPromptWeek,
    hudOpen,
    inboxOpen,
    inboxDockPosition,
    intentionsOpen,
    nowOpen,
    selectedDay,
    user,
    zoom,
  ]);

  const applyViewState = useCallback((state: LastViewState | null) => {
    const next = state ?? defaultViewState();
    const { view: urlView, date: urlDate } = calendarViewFromSearch(
      window.location.search,
    );
    if (urlView && isRestorableZoom(urlView)) setZoom(urlView);
    else if (isRestorableZoom(next.zoom)) setZoom(next.zoom);
    setAnchorDate(urlDate ?? next.anchorDate);
    setSelectedDay(urlDate ?? next.selectedDay);
    setNowOpen(next.nowOpen);
    setInboxOpen(next.inboxOpen);
    setInboxDockPosition(
      typeof next.inboxDockPosition?.x === "number" &&
        typeof next.inboxDockPosition?.y === "number"
        ? next.inboxDockPosition
        : { x: 70, y: 74 },
    );
    setIntentionsOpen(next.intentionsOpen);
    setHudOpen(next.hudOpen);
    setHistoryOpen(next.historyOpen);
    setWeeklyReviewOpen(Boolean(next.weeklyReviewOpen));
    setWeeklyReviewPromptWeek(next.weeklyReviewPromptWeek ?? null);
  }, []);

  const urlReady = useRef(false);
  const urlRestoring = useRef(false);
  useEffect(() => {
    if (!viewRestored) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", zoom === "upcoming" ? "home" : zoom);
    url.searchParams.set("date", zoom === "day" ? selectedDay : anchorDate);
    if (url.toString() !== window.location.href) {
      if (!urlReady.current || urlRestoring.current)
        window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    }
    urlReady.current = true;
    urlRestoring.current = false;
  }, [viewRestored, zoom, anchorDate, selectedDay]);

  useEffect(() => {
    const restore = () => {
      urlRestoring.current = true;
      applyViewState(defaultViewState());
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [applyViewState]);

  const applyRestoredScroll = useCallback((state: LastViewState | null) => {
    if (!state) return;
    const rowHeight = state.zoom === "day" ? 72 : 52;
    const anchorTop =
      (state.visibleHour ?? 6) * rowHeight +
      ((state.visibleMinute ?? 0) / 60) * rowHeight;
    const exactTop = state.scrollTop ?? anchorTop;
    const preferAnchor =
      !state.viewportHeight ||
      Math.abs(
        (calendarStageRef.current?.clientHeight ?? 0) - state.viewportHeight,
      ) > 160;
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
      const failedDependencies = new Set<string>();
      for (const mutation of [
        ...pending.filter((entry) => !entry.dependsOn),
        ...pending.filter((entry) => entry.dependsOn),
      ]) {
        if (mutation.dependsOn && failedDependencies.has(mutation.dependsOn))
          continue;
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
          failedDependencies.add(mutationIdentity(mutation));
          const message = syncErrorMessage(error);
          failures.push(message);
          const attempted = {
            ...mutation,
            ownerKey,
            failureCount: (mutation.failureCount ?? 0) + 1,
            lastError: message,
          };
          // A change that has failed this many times will not start working
          // because it was retried every fifteen seconds for another week.
          // Park it so the rest of the queue can drain, rather than leaving a
          // permanent "changes are waiting to sync" notice with no way out.
          if (shouldDeadLetter(attempted)) {
            await moveToDeadLetter(attempted, message);
          } else {
            await updatePendingMutation(attempted);
          }
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
      let snapshot;
      try {
        snapshot = await fetchCloudSnapshot(supabase, activeUser.id);
      } finally {
        setSyncing(false);
      }
      // A local edit made while this snapshot was loading is newer than the
      // snapshot. Realtime (or the focus retry) will request a fresh one.
      if (writeRevisionAtStart !== writeRevisionRef.current) return;
      setItems(snapshot.items);
      setHistory(snapshot.history);
      setSubjects(snapshot.subjects);
      setClasses(snapshot.classes);
      setClassExceptions(snapshot.classExceptions);
      setAssignments(snapshot.assignments);
      setAssessments(snapshot.assessments);
      setIntentions(snapshot.intentions);
      setLearningSignals(snapshot.learningSignals);
      setExplorations(snapshot.explorations);
      setBlockChoices(snapshot.blockChoices);
      setSchoolDaySettings(snapshot.schoolDaySettings);
      setAccountPreferences(snapshot.accountPreferences);
      setCloudOnboardingState(snapshot.onboardingState);
      setCloudLastSeenAt(snapshot.lastSeenAt);
      setCloudSnapshotLoaded(true);
    },
    [supabase],
  );

  useEffect(() => {
    const updateClock = () => setClockNow(new Date());
    const initialView = calendarViewFromSearch(window.location.search);
    const today = initialView.date ?? dateKey(new Date());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe: server and client must agree on the initial date
    setAnchorDate(today);
    setSelectedDay(today);
    if (initialView.view && isRestorableZoom(initialView.view))
      setZoom(initialView.view);
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
        const legacyState = stored as typeof stored & LegacyOfflineState;
        const promoted = promoteLegacyOfflineHomework(stored.items, legacyState);
        setItems(promoted.items);
        if (promoted.changed.length > 0) {
          await Promise.all(
            promoted.changed.map((item) =>
              queueMutation({
                table: "calendar_items",
                action: "upsert",
                recordId: item.id,
                payload: itemToRow(item),
                ownerKey: legacyState.ownerKey ?? "local",
              }),
            ),
          );
        }
        const legacyMutations = await getPendingMutations(
          legacyState.ownerKey ?? "local",
        );
        await Promise.all(
          legacyMutations
            .filter(
              (mutation) =>
                (mutation as { table?: unknown }).table ===
                "homework_captures",
            )
            .flatMap((mutation) =>
              mutation.id === undefined ? [] : [removePendingMutation(mutation.id)],
            ),
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
  }, [applyRestoredScroll, applyViewState, hydrated, user, viewRestored]);

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
  }, [currentViewState, user, viewRestored]);

  useEffect(() => {
    scheduleViewSave();
  }, [scheduleViewSave]);

  useEffect(() => {
    if (!weeklyReviewAvailable || weeklyReviewPromptWeek === currentWeekKey) {
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
    // The outbox flush and the cloud reload are independent. A failed
    // flush (e.g. a block-choice row rejected by a DB constraint) must
    // not block the rest of the calendar from loading, otherwise the user
    // sees an empty agenda whenever a single mutation fails. We run them
    // sequentially, but a non-empty failures list does not short-circuit
    // loadCloud.
    flushPending(user.id)
      .then((failures) => {
        if (cancelled) return;
        if (failures.length) {
          setNotice(
            `${failures.length} change${failures.length === 1 ? " is" : "s are"} waiting to sync. Retrying automatically.`,
          );
        }
        return loadCloud(user);
      })
      .catch((error) => {
        if (cancelled) return;
        setNotice(
          `Cloud sync will retry automatically: ${syncErrorMessage(error)}`,
        );
        // Still try to load the calendar so the user is not stuck on an
        // empty agenda when the outbox itself throws.
        return loadCloud(user);
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
        setIntentionsOpen(false);
        setIntentionSeed(null);
        setDeeperSource(null);
        setDeeperExploration(null);
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
        // A guided-tour step or the settings panel takes Escape for itself.
        // Without this, one stray keypress closes the very surface a coachmark
        // is pointing at.
        if (hasBlockingOverlay()) return;
        setNowOpen(false);
        setPaletteOpen(false);
        setProposal(null);
        setTimetableSubjectProposal(null);
        setTimetableImportIssues(null);
        setSelectedItem(null);
        setDraftItem(null);
        setIsCreatingItem(false);
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

  useEffect(() => {
    if (!settingsOpen) return;
    getDeadLetterMutations()
      .then(setDeadLettered)
      .catch(() => undefined);
  }, [settingsOpen, syncTick]);

  // Counted rather than assumed: the welcome-back surface tells a returning
  // student how much never reached their account, and an invented zero there
  // would be worse than saying nothing.
  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    getPendingMutations(user?.id ?? "local")
      .then((queued) => {
        if (alive) setPendingCount(queued.length);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hydrated, syncTick, user]);

  const onboarding = useOnboarding({
    user,
    isOnline,
    cloudLoaded,
    cloudOnboardingState,
    cloudLastSeenAt,
    subjectCount: subjects.length,
    lessonCount: classes.length,
    hasSchoolDaySettings: Boolean(schoolDaySettings.schoolLocation),
    persistMutation,
  });

  // A coachmark cannot point at an element that is not rendered. Moving the app
  // to the step's own view is the step's job, not the student's.
  const onboardingStep = onboarding.step;
  useEffect(() => {
    if (!onboardingStep) return;
    if (onboardingStep.requiresView) {
      const target = onboardingStep.requiresView;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setZoom((current) => (current === target ? current : target));
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (onboardingStep.requiresDock) setInboxOpen(true);
  }, [onboardingStep]);

  const stalenessReport = useMemo(
    () =>
      buildStalenessReport({
        items,
        now: clockNow,
        currentWeekStart: startOfWeek(clockNow),
        pendingMutationCount: pendingCount,
        awayDays: onboarding.awayDays,
      }),
    [clockNow, items, onboarding.awayDays, pendingCount],
  );

  function saveAccountPreferences(preferences: AccountPreferences) {
    setAccountPreferences(preferences);
    if (!user) return;
    persistMutation({
      table: "profiles",
      action: "upsert",
      recordId: user.id,
      payload: { id: user.id, ...accountPreferencesToRow(preferences) },
    }).catch(() => undefined);
  }

  /**
   * Return stranded work to the list so it can be planned again.
   *
   * Recorded as a single history entry rather than one per item: undo history
   * is capped at fifty, and a bulk release of more than that would evict
   * everything else the student might want to undo — including this.
   */
  function releaseStrandedWork(stale: CalendarItem[]) {
    if (!stale.length) return;
    const before = items;
    const released = new Map(
      releaseStaleItems(stale, clockNow).map((item) => [item.id, item]),
    );
    const after = items.map((item) => released.get(item.id) ?? item);
    recordHistory(
      `Put ${stale.length} item${stale.length === 1 ? "" : "s"} back on the list`,
      before,
    );
    transitionState(() => setItems(after));
    syncSnapshotDiff(before, after);
    setWelcomeBackDismissed(true);
    setNotice(
      `${stale.length} item${stale.length === 1 ? " is" : "s are"} back on your list.`,
    );
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

  function syncSnapshotDiff(
    before: CalendarItem[],
    after: CalendarItem[],
    dependencyForItem?: (item: CalendarItem) => string | undefined,
  ) {
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
        dependsOn: dependencyForItem?.(item),
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
    if (item.classId) {
      void persistClassOccurrence(item, true).catch(() =>
        setNotice("Could not delete the class. Try again."),
      );
      closeCompactEditor();
      setEventSelection([]);
      return;
    }
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
    setEventSelection([]);
  }

  function scheduleAt(itemId: string, day: string, hour: number, minute = 0) {
    const item = calendarDisplayItems.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) return;
    const start = dateFromKey(day);
    start.setHours(hour, minute, 0, 0);
    const minutes = Math.max(item.durationMin, durationMinutes(item));
    const end = new Date(start.getTime() + minutes * 60_000);
    const validation = validatePlacement(
      item,
      start.toISOString(),
      end.toISOString(),
      [],
      { allowFixedChange: true },
    );
    if (!validation.valid) {
      setNotice(validation.errors[0]);
      return;
    }
    if (item.classId) {
      void persistClassOccurrence({
        ...item,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
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

  const {
    persistClassOccurrence,
    saveCompactEvent,
    editEventNaturally,
    openItem,
    renameItem,
    openNewEvent,
    openNewSpan,
    openNewTask,
  } = useEventEditor({
    supabase,
    user,
    isOnline,
    items,
    subjects,
    classes,
    classExceptions,
    selectedDay,
    setItems,
    setSubjects,
    setClasses,
    setClassExceptions,
    setSelectedDay,
    setSelectedItem,
    setDraftItem,
    setIsCreatingItem,
    setEventAnchor,
    setEventSelection,
    setNotice,
    persistMutation,
    recordHistory,
    updateItem,
  });

  const {
    onDragStart,
    onCalendarDragOver,
    onCalendarDrop,
    onInboxDrop,
    endDrag,
    beginResize,
  } = useDragAndResize({
    resizeGestureActive,
    setDraggingItemId,
    setDragSnap,
    setResizing,
    setIsCalendarItemRepositioning,
    setNotice,
    scheduleAt,
    unscheduleItem,
    updateItem,
    persistClassOccurrence,
  });

  const {
    saveSubject,
    deleteSubject,
    saveClass,
    saveSchoolDaySettings,
    deleteClass,
    saveClassException,
    deleteClassException,
    saveAssignment,
    previewAssignmentPlan,
    addAssignmentSession,
    completeAssignment,
    previewFreePeriodSession,
    toggleAssignmentSession,
    deleteAssignment,
    saveAssessment,
    previewRevisionRunway,
    markRevisionLearned,
    deleteAssessment,
  } = useSchoolRecords({
    items,
    classes,
    classExceptions,
    schoolDaySettings,
    user,
    setSubjects,
    setClasses,
    setClassExceptions,
    setAssignments,
    setAssessments,
    setSchoolDaySettings,
    setNotice,
    setAnchorDate,
    setSelectedDay,
    setZoom,
    setProposal,
    persistMutation,
    createItem,
    updateItem,
  });

  const { createWorkItemFromText } = useWorkCapture({
    items,
    subjects,
    createItem,
    setNotice,
    setSelectedDay,
  });

  const { submitCommand } = useCommandConsole({
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
  });

  const {
    onDocumentSelected,
    approveProposal,
    closeProposal,
    skipProposalChange,
    updateTimetableSubject,
    addTimetableSubject,
    removeTimetableSubject,
    finishTimetableSubjectReview,
  } = useProposals({
    supabase,
    items,
    subjects,
    proposal,
    timetableSubjectProposal,
    fileInputRef,
    setItems,
    setSubjects,
    setProposal,
    setTimetableSubjectProposal,
    setTimetableImportIssues,
    setTimetableImportBusy,
    setCommandBusy,
    setPaletteOpen,
    setAnchorDate,
    setSelectedDay,
    setNotice,
    persistMutation,
    recordHistory,
    syncSnapshotDiff,
  });

  // Signing out must leave this device with an empty local calendar rather
  // than the previous account's records.
  async function clearLocalCalendar() {
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
      completedReviewWeeks: [],
      schoolDaySettings: DEFAULT_SCHOOL_DAY_SETTINGS,
      ownerKey: "local",
    });
  }

  const { sendVerificationCode, verifyCode, createInvitation, signOut } =
    useAccountSession({
      supabase,
      email,
      verificationCode,
      inviteToken,
      inviteEmail,
      setAuthBusy,
      setAuthSent,
      setNotice,
      setVerificationCode,
      setInviteToken,
      setInviteBusy,
      setInviteUrl,
      setInviteEmail,
      clearLocalCalendar,
    });

  const {
    saveIntention,
    deleteIntention,
    startIntention,
    subjectName,
    recordChallenge,
    generateDeeper,
    openGoDeeper,
    saveExploration,
    startExplorationDirection,
  } = useLearningActions({
    supabase,
    items,
    subjects,
    explorations,
    learningSignals,
    deeperSource,
    setIntentions,
    setLearningSignals,
    setExplorations,
    setIntentionSeed,
    setIntentionsOpen,
    setDeeperSource,
    setDeeperExploration,
    setDeeperBusy,
    setDeeperError,
    setNotice,
    createItem,
    persistMutation,
  });

  const { nowRecommendations, openNowRecommendations, startNow } =
    useNowSession({
      items,
      assignments,
      assessments,
      subjects,
      classes,
      classExceptions,
      schoolDaySettings,
      learningSignals,
      nowLocation,
      nowEnergy,
      nowComputerAvailable,
      setNowMoment,
      setNowOpen,
      setPaletteOpen,
      setInboxOpen,
      setHudOpen,
      setNotice,
      createItem,
      updateItem,
      openGoDeeper,
    });

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
  const scheduledItems = filteredItems.filter(
    (item) => item.status === "scheduled" && item.startsAt && item.endsAt,
  );
  const anchor = dateFromKey(anchorDate);
  const weekStart = startOfWeek(anchor);
  const visibleDays =
    zoom === "day"
      ? [dateFromKey(selectedDay)]
      : Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const classOccurrences = classCalendarItems(
    classes,
    classExceptions,
    subjects,
    visibleDays[0],
    visibleDays.at(-1)!,
  );
  const calendarDisplayItems = [
    ...filteredItems.filter(
      (entry) => !classes.some((lesson) => lesson.id === entry.id),
    ),
    ...classOccurrences,
  ].filter((entry) => !classesOnly || isClassEvent(entry));
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, [contenteditable=true], [role=dialog]",
        )
      )
        return;
      if (event.key === "Escape") {
        setEventSelection([]);
        setBulkDeleteOpen(false);
        closeCompactEditor();
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        eventSelection.length > 1
      ) {
        event.preventDefault();
        setBulkDeleteOpen(true);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [eventSelection, closeCompactEditor]);
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
  const reviewCommandPreview = parseReviewSession(commandText, subjects, now);
  const commandIsHomework = looksLikeHomeworkCommand(
    commandText,
    homeworkCommandPreview,
  );
  const nowResult = nowMoment ? nowRecommendations(new Date(nowMoment)) : null;
  const {
    moveAnchor,
    onCalendarPointerDown,
    onCalendarPointerMove,
    finishCalendarPointerSwipe,
    onWeekWheel,
  } = useCalendarNavigation({
    zoom,
    anchor,
    selectedDay,
    isCompact,
    draggingItemId,
    calendarSwipeStartRef,
    calendarSwipeLastRef,
    suppressSwipeClickUntilRef,
    weekWheelRef,
    setAnchorDate,
    setSelectedDay,
  });

  if (!gateAllowed) {
    return <AccessGate denied={gateDenied} />;
  }

  return (
    <main
      id="main-content"
      className={`flex-shell calendar-redesign ${
        draggingItemId ? "is-dragging" : ""
      } ${isDockRepositioning ? "is-dock-repositioning" : ""} ${
        isCalendarItemRepositioning ? "is-calendar-item-repositioning" : ""
      }`}
    >
      <CalendarRail
        zoom={zoom}
        inboxOpen={inboxOpen}
        hudOpen={hudOpen}
        historyOpen={historyOpen}
        weeklyReviewOpen={weeklyReviewOpen}
        weeklyReviewAvailable={weeklyReviewAvailable}
        inboxCount={inboxItems.length}
        userEmail={user?.email}
        onCalendar={() => {
          setInboxOpen(false);
          setHudOpen(false);
          setZoom("week");
        }}
        onToday={() => {
          const today = dateKey(new Date());
          setAnchorDate(today);
          setSelectedDay(today);
        }}
        onHome={() => {
          setInboxOpen(false);
          setHudOpen(false);
          transitionState(() => setZoom("upcoming"));
        }}
        onSchool={() => {
          setInboxOpen(false);
          setHudOpen(false);
          transitionState(() => setZoom("school"));
        }}
        onToggleInbox={() => {
          setInboxOpen((current) => !current);
          setHudOpen(false);
        }}
        onWeeklyReview={() => {
          setWeeklyReviewOpen(true);
          setInboxOpen(false);
          setHudOpen(false);
        }}
        onOpenCommand={() => {
          setPaletteOpen(true);
          setInboxOpen(false);
          setHudOpen(false);
        }}
        onToggleHud={() => {
          setHudOpen((current) => !current || historyOpen);
          setHistoryOpen(false);
          setInboxOpen(false);
        }}
        onOpenHistory={() => {
          setHistoryOpen(true);
          setHudOpen(true);
          setInboxOpen(false);
        }}
        onToggleAccount={() => setAccountOpen((current) => !current)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <nav className="mobile-tab-bar" aria-label="Mobile navigation">
        <button
          className={zoom === "upcoming" ? "active" : ""}
          type="button"
          onClick={() => {
            setInboxOpen(false);
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
          aria-expanded={paletteOpen}
          onClick={() => {
            setMobileMenuOpen(false);
            setMobileCreateOpen(false);
            setPaletteMode("command");
            setPaletteOpen(true);
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
        position={inboxDockPosition}
        items={inboxItems}
        subjects={subjects}
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
        onQuickCreate={createWorkItemFromText}
        onClose={() => setInboxOpen(false)}
        onPositionChange={setInboxDockPosition}
        onRepositioningChange={setIsDockRepositioning}
        onFilterChange={setFilterText}
      />

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
          onCapture={() => {
            setPaletteMode("command");
            setPaletteOpen(true);
          }}
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

        <OnboardingFlow
          open={onboarding.mode === "new" || onboarding.mode === "resuming"}
          step={onboarding.step}
          completedSteps={onboarding.completedSteps}
          hasAccount={Boolean(user)}
          isOnline={isOnline}
          awayDays={onboarding.awayDays}
          stepNumber={onboarding.stepNumber}
          stepCount={onboarding.stepCount}
          schoolDaySettings={schoolDaySettings}
          onChangeSchoolDaySettings={saveSchoolDaySettings}
          onSkipStep={() => onboarding.step && onboarding.skipStep(onboarding.step.id)}
          onDismiss={onboarding.dismiss}
          onSignIn={() => setAccountOpen(true)}
          onRunStepAction={(step) => onboarding.completeStep(step.id)}
          onManualAlternative={(step) => {
            transitionState(() => setZoom("school"));
            onboarding.completeStep(step.id);
          }}
        />

        <WelcomeBack
          open={onboarding.mode === "returning" && !welcomeBackDismissed}
          report={stalenessReport}
          onClose={() => setWelcomeBackDismissed(true)}
          onRelease={releaseStrandedWork}
          onReimportTimetable={() => {
            setWelcomeBackDismissed(true);
            transitionState(() => setZoom("school"));
          }}
          onReplayTour={() => {
            setWelcomeBackDismissed(true);
            onboarding.replayTour();
          }}
        />

        <SettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          hasAccount={Boolean(user)}
          showDeveloperOverride={process.env.NODE_ENV !== "production"}
          schoolDaySettings={schoolDaySettings}
          onSaveSchoolDaySettings={saveSchoolDaySettings}
          accountPreferences={accountPreferences}
          onSaveAccountPreferences={saveAccountPreferences}
          onboardingState={onboarding.state}
          onReplayTour={onboarding.replayTour}
          onReimportTimetable={() => {
            onboarding.restartSetup();
            transitionState(() => setZoom("school"));
          }}
          onRestartEverything={onboarding.restartEverything}
          onForceOnboardingMode={(mode) => {
            setWelcomeBackDismissed(false);
            onboarding.setForcedMode(mode);
          }}
          pendingCount={pendingCount}
          hasAlternatingClasses={classes.some(
            (entry) => entry.weekPattern !== "every",
          )}
          deadLettered={deadLettered}
          onRetryDeadLetter={(mutation) => {
            queueMutation({ ...mutation, failureCount: 0 });
            if (mutation.id !== undefined) {
              removeDeadLetterMutation(mutation.id).catch(() => undefined);
            }
            setDeadLettered((current) =>
              current.filter((entry) => entry.id !== mutation.id),
            );
            setSyncTick((tick) => tick + 1);
          }}
          onDiscardDeadLetter={(mutation) => {
            if (mutation.id !== undefined) {
              removeDeadLetterMutation(mutation.id).catch(() => undefined);
            }
            setDeadLettered((current) =>
              current.filter((entry) => entry.id !== mutation.id),
            );
          }}
        />

        {notice && (
          <div className="toast" role="status">
            <span>{notice}</span>
            {undoStack.length > 0 && (
              <button type="button" onClick={undoLast}>
                Undo
              </button>
            )}
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
            <button type="button" onClick={() => setWeeklyReviewOpen(true)}>
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
            now={now}
            loading={!hydrated}
            blockChoice={currentBlockChoice}
            onSelectBlockSuggestion={selectBlockSuggestion}
            onBlockStatus={setBlockChoiceStatus}
            onChangeBlockSuggestion={changeBlockSuggestion}
            onOpenBlockSuggestion={openBlockSuggestion}
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
            <div className="calendar-class-filter" aria-label="Calendar filter">
              <button
                type="button"
                aria-pressed={!classesOnly}
                onClick={() => {
                  setClassesOnly(false);
                  setEventSelection([]);
                }}
              >
                All events
              </button>
              <button
                type="button"
                aria-pressed={classesOnly}
                onClick={() => {
                  setClassesOnly(true);
                  setEventSelection([]);
                }}
              >
                Classes only
              </button>
              {eventSelection.length > 1 && (
                <div className="calendar-selection-bar">
                  <span>{eventSelection.length} selected</span>
                  <button type="button" onClick={() => setBulkDeleteOpen(true)}>
                    Delete selection
                  </button>
                  <button
                    type="button"
                    aria-label="Clear selection"
                    onClick={() => setEventSelection([])}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            <TimeCalendar
              days={visibleDays}
              items={calendarDisplayItems}
              selectedIds={eventSelection}
              onSelectItem={(item, shift) => {
                if (shift) {
                  closeCompactEditor();
                  setEventSelection((current) =>
                    current.includes(item.id)
                      ? current.filter((id) => id !== item.id)
                      : [...current, item.id],
                  );
                } else openItem(item);
              }}
              onClearSelection={() => setEventSelection([])}
              onCompleteItem={(item) =>
                void saveCompactEvent(
                  {
                    ...item,
                    status:
                      item.status === "completed" ? "scheduled" : "completed",
                  },
                  { isClass: false, repeat: "once", scope: "occurrence" },
                )
              }
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
              onMoveAt={(item, day, hour, minute, duration) => {
                if (duration != null) {
                  const start = dateFromKey(day);
                  start.setHours(hour, minute, 0, 0);
                  const next = {
                    ...item,
                    startsAt: start.toISOString(),
                    endsAt: new Date(
                      start.getTime() + duration * 60000,
                    ).toISOString(),
                    durationMin: duration,
                    durationMax: duration,
                  };
                  if (item.classId) void persistClassOccurrence(next);
                  else updateItem(next, `Move “${item.title}”`);
                } else scheduleAt(item.id, day, hour, minute);
                closeCompactEditor();
              }}
              onDesktopMoveStateChange={setIsCalendarItemRepositioning}
              compact={isCompact && zoom === "day"}
              touchMode={isCompact}
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

      {(inboxOpen || hudOpen) && (
        <button
          className="panel-scrim"
          type="button"
          aria-label="Close contextual panel"
          onClick={() => {
            setInboxOpen(false);
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
        error={commandError}
        open={paletteOpen}
        mode={paletteMode}
        commandText={commandText}
        commandBusy={commandBusy}
        commandConversation={commandConversation}
        commandQuestions={commandQuestions}
        commandPreview={commandPreview}
        homeworkCommandPreview={homeworkCommandPreview}
        reviewCommandPreview={reviewCommandPreview}
        commandIsHomework={commandIsHomework}
        onClose={() => {
          setPaletteOpen(false);
          setCommandTargetId(null);
        }}
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
        <CompactEventEditor
          key={selectedItem.id}
          item={draftItem}
          creating={isCreatingItem}
          anchor={eventAnchor}
          subjects={subjects}
          classes={classes}
          occurrences={classOccurrences}
          onSave={saveCompactEvent}
          onClose={closeCompactEditor}
          onDelete={deleteItem}
          onNaturalEdit={editEventNaturally}
        />
      )}
      {bulkDeleteOpen && (
        <SelectionDeleteDialog
          count={eventSelection.length}
          onClose={() => setBulkDeleteOpen(false)}
          onDelete={async () => {
            const selection = calendarDisplayItems.filter((item) =>
              eventSelection.includes(item.id),
            );
            recordHistory(`Delete ${selection.length} events`);
            for (const item of selection) {
              if (item.classId) await persistClassOccurrence(item, true);
              else {
                await persistMutation({
                  table: "calendar_items",
                  action: "delete",
                  recordId: item.id,
                });
                setItems((current) =>
                  current.filter((entry) => entry.id !== item.id),
                );
              }
              setEventSelection((current) =>
                current.filter((id) => id !== item.id),
              );
            }
            closeCompactEditor();
          }}
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
