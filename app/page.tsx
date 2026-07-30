"use client";

import {
  Bell,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cloud,
  CloudOff,
  ListTodo,
  LogOut,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getOfflineState,
  getPendingMutations,
  queueMutation,
  removePendingMutation,
  saveOfflineState,
  type Assignment,
  type PendingMutation,
  type Reminder,
  type Subject,
} from "@/lib/offline";
import { createClient } from "@/lib/supabase/client";

type View = "today" | "tasks" | "plans" | "reminders";

type Plan = {
  urgency: "low" | "medium" | "high";
  estimatedMinutes: number;
  reason: string;
  suggestedStart: string;
  studySteps: string[];
};

const colors: Subject["color"][] = ["violet", "blue", "orange", "green"];

const navItems: Array<{
  id: View;
  label: string;
  mobileLabel: string;
  icon: typeof CalendarDays;
}> = [
  { id: "today", label: "Today", mobileLabel: "Today", icon: CalendarDays },
  { id: "tasks", label: "All tasks", mobileLabel: "Tasks", icon: ListTodo },
  { id: "plans", label: "Study plans", mobileLabel: "Plans", icon: Brain },
  { id: "reminders", label: "Reminders", mobileLabel: "Alerts", icon: Bell },
];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function initials(value?: string | null) {
  if (!value) return <UserRound size={17} />;
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function normalizeColor(value: string | null | undefined): Subject["color"] {
  return colors.includes(value as Subject["color"])
    ? (value as Subject["color"])
    : "violet";
}

function fallbackPlan(subject: string, title: string): Plan {
  const looksLikeTest = /test|exam|quiz|mock|assessment/i.test(title);
  const nextStart = new Date(Date.now() + 60 * 60 * 1000);
  nextStart.setMinutes(0, 0, 0);
  return {
    urgency: looksLikeTest ? "high" : "medium",
    estimatedMinutes: looksLikeTest ? 45 : 30,
    reason: looksLikeTest
      ? "This sounds like test preparation, so the first focused review is scheduled soon."
      : `${subject || "This task"} fits into a focused work block without taking over your day.`,
    suggestedStart: nextStart.toISOString(),
    studySteps: looksLikeTest
      ? ["Recall the key ideas", "Practice without notes", "Review mistakes"]
      : ["Read the task carefully", "Complete the core work", "Check and submit"],
  };
}

function formatTaskTime(task: Assignment) {
  if (!task.startsAt) return "Inbox";
  return formatDate(new Date(task.startsAt), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<View>("today");
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [subjectFormOpen, setSubjectFormOpen] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectColor, setNewSubjectColor] =
    useState<Subject["color"]>("violet");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));

  const flushPending = useCallback(async () => {
    const pending = await getPendingMutations();
    for (const mutation of pending) {
      let query;
      if (mutation.action === "upsert") {
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

  const loadCloudData = useCallback(async () => {
    setIsSyncing(true);
    const [subjectResult, assignmentResult, blockResult, reminderResult] =
      await Promise.all([
        supabase.from("subjects").select("id,name,color").order("name"),
        supabase
          .from("assignments")
          .select(
            "id,subject_id,title,due_at,estimated_minutes,urgency,status,ai_reason,ai_plan,created_at",
          )
          .neq("status", "archived")
          .order("created_at", { ascending: false }),
        supabase
          .from("study_blocks")
          .select("id,assignment_id,starts_at")
          .order("starts_at"),
        supabase
          .from("reminders")
          .select("id,assignment_id,remind_at,status")
          .neq("status", "cancelled")
          .order("remind_at"),
      ]);

    const firstError =
      subjectResult.error ??
      assignmentResult.error ??
      blockResult.error ??
      reminderResult.error;
    if (firstError) {
      setIsSyncing(false);
      throw firstError;
    }

    const cloudSubjects: Subject[] = (subjectResult.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      color: normalizeColor(item.color),
    }));
    const subjectMap = new Map(cloudSubjects.map((item) => [item.id, item]));
    const blockMap = new Map(
      (blockResult.data ?? []).map((item) => [item.assignment_id, item]),
    );
    const cloudAssignments: Assignment[] = (assignmentResult.data ?? []).map(
      (item) => {
        const linkedSubject = item.subject_id
          ? subjectMap.get(item.subject_id)
          : undefined;
        const block = blockMap.get(item.id);
        return {
          id: item.id,
          subjectId: item.subject_id,
          subjectName: linkedSubject?.name ?? "Uncategorized",
          color: linkedSubject?.color ?? "violet",
          title: item.title,
          dueAt: item.due_at,
          startsAt: block?.starts_at ?? null,
          studyBlockId: block?.id ?? null,
          estimatedMinutes: item.estimated_minutes ?? 30,
          urgency: item.urgency ?? "medium",
          status: item.status === "completed" ? "completed" : "planned",
          reason: item.ai_reason ?? "",
          studySteps: Array.isArray(item.ai_plan)
            ? item.ai_plan.filter(
                (step): step is string => typeof step === "string",
              )
            : [],
          createdAt: item.created_at,
          syncStatus: "synced",
        };
      },
    );
    const assignmentMap = new Map(
      cloudAssignments.map((item) => [item.id, item]),
    );
    const cloudReminders: Reminder[] = (reminderResult.data ?? [])
      .filter((item) => item.assignment_id)
      .map((item) => ({
        id: item.id,
        assignmentId: item.assignment_id!,
        assignmentTitle:
          assignmentMap.get(item.assignment_id!)?.title ?? "Homework",
        remindAt: item.remind_at,
        status: item.status,
        syncStatus: "synced",
      }));

    setSubjects(cloudSubjects);
    setAssignments(cloudAssignments);
    setReminders(cloudReminders);
    setSubjectId((current) =>
      current && cloudSubjects.some((item) => item.id === current)
        ? current
        : "",
    );
    setIsSyncing(false);
  }, [supabase]);

  useEffect(() => {
    const updateNetwork = () => setIsOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getOfflineState()
      .then((stored) => {
        if (!alive || !stored) return;
        setSubjects(stored.subjects);
        setAssignments(stored.assignments);
        setReminders(stored.reminders);
      })
      .finally(() => {
        if (alive) {
          setIsHydrated(true);
          setIsLoading(false);
        }
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
    if (!isHydrated) return;
    saveOfflineState({ subjects, assignments, reminders }).catch(
      () => undefined,
    );
  }, [assignments, isHydrated, reminders, subjects]);

  useEffect(() => {
    if (!user || !isOnline || !isHydrated) return;
    let cancelled = false;
    flushPending()
      .then(() => {
        if (!cancelled) return loadCloudData();
      })
      .catch((error) => {
        if (!cancelled) {
          setNotice(`Sync paused: ${toErrorMessage(error)}`);
          setIsSyncing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [flushPending, isHydrated, isOnline, loadCloudData, user]);

  async function persistMutation(mutation: PendingMutation) {
    if (user && isOnline) {
      let query;
      if (mutation.action === "upsert") {
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

  async function addSubject(event: FormEvent) {
    event.preventDefault();
    const name = newSubjectName.trim();
    if (!name) return;
    if (
      subjects.some(
        (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setNotice("That subject already exists.");
      return;
    }
    const newSubject: Subject = {
      id: crypto.randomUUID(),
      name,
      color: newSubjectColor,
    };
    setSubjects((current) => [...current, newSubject]);
    setSubjectId(newSubject.id);
    setNewSubjectName("");
    setSubjectFormOpen(false);
    const synced = await persistMutation({
      table: "subjects",
      action: "upsert",
      recordId: newSubject.id,
      payload: newSubject,
    });
    setNotice(
      synced
        ? `${name} added.`
        : `${name} saved on this device and queued for sync.`,
    );
  }

  async function deleteSubject(id: string) {
    const removed = subjects.find((item) => item.id === id);
    if (!removed) return;
    setSubjects((current) => current.filter((item) => item.id !== id));
    setAssignments((current) =>
      current.map((item) =>
        item.subjectId === id
          ? {
              ...item,
              subjectId: null,
              subjectName: "Uncategorized",
              color: "violet",
            }
          : item,
      ),
    );
    if (subjectId === id) setSubjectId("");
    if (subjectFilter === id) setSubjectFilter(null);
    const synced = await persistMutation({
      table: "subjects",
      action: "delete",
      recordId: id,
    });
    setNotice(
      synced
        ? `${removed.name} deleted. Its homework is now uncategorized.`
        : `${removed.name} deletion queued for sync.`,
    );
  }

  async function addHomework(event: FormEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setIsPlanning(true);
    setNotice("");

    const selectedSubject = subjects.find((item) => item.id === subjectId);
    const subjectName = selectedSubject?.name ?? "Uncategorized";
    let suggestion = fallbackPlan(subjectName, cleanTitle);
    if (isOnline) {
      try {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: subjectName,
            title: cleanTitle,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            existingEvents: assignments
              .filter((item) => item.startsAt)
              .slice(0, 100)
              .map((item) => {
                const start = new Date(item.startsAt!);
                return {
                  start: start.toISOString(),
                  end: new Date(
                    start.getTime() + item.estimatedMinutes * 60_000,
                  ).toISOString(),
                  title: item.title,
                };
              }),
          }),
        });
        if (response.ok) {
          suggestion = await response.json();
        } else {
          setNotice("AI planning is unavailable, so a local plan was used.");
        }
      } catch {
        setNotice("You went offline, so a local plan was used.");
      }
    } else {
      setNotice("Saved offline with a local plan. AI can refine it after sync.");
    }

    const assignmentId = crypto.randomUUID();
    const studyBlockId = crypto.randomUUID();
    const suggestedDate = new Date(suggestion.suggestedStart);
    const startsAt = Number.isNaN(suggestedDate.getTime())
      ? fallbackPlan(subjectName, cleanTitle).suggestedStart
      : suggestedDate.toISOString();
    const endsAt = new Date(
      new Date(startsAt).getTime() + suggestion.estimatedMinutes * 60_000,
    ).toISOString();
    const assignment: Assignment = {
      id: assignmentId,
      subjectId: selectedSubject?.id ?? null,
      subjectName,
      color: selectedSubject?.color ?? "violet",
      title: cleanTitle,
      dueAt: null,
      startsAt,
      studyBlockId,
      estimatedMinutes: suggestion.estimatedMinutes,
      urgency: suggestion.urgency,
      status: "planned",
      reason: suggestion.reason,
      studySteps: suggestion.studySteps,
      createdAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    setAssignments((current) => [assignment, ...current]);
    setPlan(suggestion);
    setTitle("");

    const assignmentSynced = await persistMutation({
      table: "assignments",
      action: "upsert",
      recordId: assignmentId,
      payload: {
        id: assignmentId,
        subject_id: assignment.subjectId,
        title: assignment.title,
        source_text: cleanTitle,
        estimated_minutes: assignment.estimatedMinutes,
        urgency: assignment.urgency,
        status: "planned",
        ai_reason: assignment.reason,
        ai_plan: assignment.studySteps,
        ai_model: process.env.NEXT_PUBLIC_AI_GATEWAY_MODEL ?? "gateway",
      },
    });
    const blockSynced = await persistMutation({
      table: "study_blocks",
      action: "upsert",
      recordId: studyBlockId,
      payload: {
        id: studyBlockId,
        assignment_id: assignmentId,
        title: assignment.title,
        kind: /test|exam|quiz|mock/i.test(assignment.title)
          ? "review"
          : "homework",
        starts_at: startsAt,
        ends_at: endsAt,
      },
    });
    if (assignmentSynced && blockSynced) {
      setAssignments((current) =>
        current.map((item) =>
          item.id === assignmentId ? { ...item, syncStatus: "synced" } : item,
        ),
      );
    }
    setIsPlanning(false);
  }

  async function toggleAssignment(task: Assignment) {
    const completed = task.status !== "completed";
    setAssignments((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: completed ? "completed" : "planned",
              syncStatus: "pending",
            }
          : item,
      ),
    );
    const synced = await persistMutation({
      table: "assignments",
      action: "update",
      recordId: task.id,
      payload: {
        status: completed ? "completed" : "planned",
        completed_at: completed ? new Date().toISOString() : null,
      },
    });
    if (synced) {
      setAssignments((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, syncStatus: "synced" } : item,
        ),
      );
    }
  }

  async function deleteAssignment(task: Assignment) {
    setAssignments((current) => current.filter((item) => item.id !== task.id));
    setReminders((current) =>
      current.filter((item) => item.assignmentId !== task.id),
    );
    const synced = await persistMutation({
      table: "assignments",
      action: "delete",
      recordId: task.id,
    });
    setNotice(
      synced ? `"${task.title}" deleted.` : "Deletion queued for sync.",
    );
  }

  async function addReminder(task: Assignment) {
    if (
      reminders.some(
        (item) =>
          item.assignmentId === task.id &&
          !["cancelled", "failed"].includes(item.status),
      )
    ) {
      setNotice("This task already has a reminder.");
      setView("reminders");
      return;
    }
    const base = task.startsAt ? new Date(task.startsAt) : addDays(new Date(), 1);
    const remindAt = new Date(base.getTime() - 30 * 60_000);
    if (remindAt.getTime() <= Date.now()) {
      remindAt.setTime(Date.now() + 5 * 60_000);
    }
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      assignmentId: task.id,
      assignmentTitle: task.title,
      remindAt: remindAt.toISOString(),
      status: "scheduled",
      syncStatus: "pending",
    };
    setReminders((current) => [...current, reminder]);
    const synced = await persistMutation({
      table: "reminders",
      action: "upsert",
      recordId: reminder.id,
      payload: {
        id: reminder.id,
        assignment_id: task.id,
        remind_at: reminder.remindAt,
        channel: "in_app",
        status: "scheduled",
      },
    });
    if (synced) {
      setReminders((current) =>
        current.map((item) =>
          item.id === reminder.id ? { ...item, syncStatus: "synced" } : item,
        ),
      );
    }
    setNotice("Reminder set for 30 minutes before the study block.");
  }

  async function deleteReminder(reminder: Reminder) {
    setReminders((current) =>
      current.filter((item) => item.id !== reminder.id),
    );
    await persistMutation({
      table: "reminders",
      action: "delete",
      recordId: reminder.id,
    });
    setNotice("Reminder removed.");
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setAuthBusy(true);
    setNotice("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
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
    setSubjects([]);
    setAssignments([]);
    setReminders([]);
    setSubjectId("");
    setSubjectFilter(null);
    await saveOfflineState({
      subjects: [],
      assignments: [],
      reminders: [],
    });
    setNotice("Signed out. You can still work offline on this device.");
  }

  const selectedDateObject = dateFromKey(selectedDate);
  const weekStart = startOfWeek(selectedDateObject);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const todayKey = dateKey(new Date());

  const filteredAssignments = assignments.filter((task) => {
    if (subjectFilter && task.subjectId !== subjectFilter) return false;
    if (view !== "today") return true;
    return task.startsAt
      ? dateKey(new Date(task.startsAt)) === selectedDate
      : selectedDate === todayKey;
  });
  const sortedAssignments = [...filteredAssignments].sort((a, b) => {
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
  const completedCount = filteredAssignments.filter(
    (task) => task.status === "completed",
  ).length;
  const completion = filteredAssignments.length
    ? Math.round((completedCount / filteredAssignments.length) * 100)
    : 0;
  const activeCount = assignments.filter(
    (task) => task.status !== "completed",
  ).length;

  function switchView(nextView: View) {
    setView(nextView);
    setSubjectFilter(null);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          type="button"
          onClick={() => switchView("today")}
          aria-label="Syllabi home"
        >
          <span className="brand-mark">
            <Check size={18} strokeWidth={3} />
          </span>
          <span>Syllabi</span>
        </button>

        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={view === item.id && !subjectFilter ? "active" : ""}
                type="button"
                key={item.id}
                onClick={() => switchView(item.id)}
              >
                <Icon size={19} />
                {item.label}
                {item.id === "tasks" && (
                  <span className="nav-count">{activeCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="subjects">
          <div className="section-label">
            <span>Subjects</span>
            <button
              type="button"
              onClick={() => setSubjectFormOpen((current) => !current)}
              aria-label="Add subject"
            >
              {subjectFormOpen ? <X size={15} /> : <Plus size={15} />}
            </button>
          </div>
          {subjectFormOpen && (
            <form className="subject-form" onSubmit={addSubject}>
              <input
                value={newSubjectName}
                onChange={(event) => setNewSubjectName(event.target.value)}
                placeholder="Subject name"
                aria-label="New subject name"
                autoFocus
              />
              <div>
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-choice ${color} ${
                      newSubjectColor === color ? "selected" : ""
                    }`}
                    onClick={() => setNewSubjectColor(color)}
                    aria-label={`Use ${color}`}
                  />
                ))}
                <button
                  className="subject-save"
                  type="submit"
                  disabled={!newSubjectName.trim()}
                >
                  Add
                </button>
              </div>
            </form>
          )}
          {subjects.length === 0 && !subjectFormOpen && (
            <button
              className="empty-subjects"
              type="button"
              onClick={() => setSubjectFormOpen(true)}
            >
              <Plus size={14} /> Add your first subject
            </button>
          )}
          {subjects.map((item) => (
            <div className="subject-row" key={item.id}>
              <button
                className={subjectFilter === item.id ? "selected" : ""}
                type="button"
                onClick={() => {
                  setSubjectFilter(item.id);
                  setView("tasks");
                }}
              >
                <span className={`subject-dot ${item.color}`}>
                  {item.name.slice(0, 2).toUpperCase()}
                </span>
                <span>{item.name}</span>
              </button>
              <button
                className="delete-subject"
                type="button"
                onClick={() => deleteSubject(item.id)}
                aria-label={`Delete ${item.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <button
          className="sync-card"
          type="button"
          onClick={() => setAccountOpen(true)}
        >
          <span
            className={`sync-icon ${
              !isOnline || !user ? "offline" : ""
            }`}
          >
            {isOnline && user ? <Cloud size={17} /> : <CloudOff size={17} />}
          </span>
          <span>
            <strong>
              {isSyncing
                ? "Syncing…"
                : user && isOnline
                  ? "Synced"
                  : isOnline
                    ? "Saved locally"
                    : "Working offline"}
            </strong>
            <small>
              {user
                ? isOnline
                  ? "Across all devices"
                  : "Changes are queued"
                : "Sign in for device sync"}
            </small>
          </span>
        </button>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {formatDate(new Date(), {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1>{greeting()}</h1>
          </div>
          <div className="top-actions">
            <span
              className={`connection-pill ${isOnline ? "" : "offline"}`}
            >
              {isOnline ? <Cloud size={14} /> : <CloudOff size={14} />}
              {isOnline ? "Online" : "Offline"}
            </span>
            <button
              className="avatar"
              type="button"
              aria-label="Open account menu"
              onClick={() => setAccountOpen((current) => !current)}
            >
              {initials(user?.email)}
            </button>
          </div>
          {accountOpen && (
            <section className="account-popover" aria-label="Account">
              <button
                className="popover-close"
                type="button"
                onClick={() => setAccountOpen(false)}
                aria-label="Close account"
              >
                <X size={16} />
              </button>
              {user ? (
                <>
                  <span className="account-icon">
                    <UserRound size={19} />
                  </span>
                  <h2>You’re synced</h2>
                  <p>{user.email}</p>
                  <button className="secondary-button" type="button" onClick={signOut}>
                    <LogOut size={15} /> Sign out
                  </button>
                </>
              ) : authSent ? (
                <>
                  <span className="account-icon">
                    <Check size={19} />
                  </span>
                  <h2>Check your email</h2>
                  <p>Open the secure link we sent to {email}.</p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setAuthSent(false)}
                  >
                    Use another email
                  </button>
                </>
              ) : (
                <>
                  <span className="account-icon">
                    <Cloud size={19} />
                  </span>
                  <h2>Sync your calendar</h2>
                  <p>Sign in by email to use the same homework on every device.</p>
                  <form onSubmit={sendMagicLink}>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      aria-label="Email address"
                      required
                    />
                    <button type="submit" disabled={authBusy}>
                      {authBusy ? "Sending…" : "Email me a sign-in link"}
                    </button>
                  </form>
                </>
              )}
            </section>
          )}
        </header>

        <section className="capture-card" aria-labelledby="capture-title">
          <div className="capture-heading">
            <span className="ai-mark">
              <Sparkles size={18} />
            </span>
            <div>
              <h2 id="capture-title">What do you need to get done?</h2>
              <p>Write it naturally. AI will estimate urgency and find a time.</p>
            </div>
          </div>
          <form className="capture-form" onSubmit={addHomework}>
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              aria-label="Subject"
            >
              <option value="">Uncategorized</option>
              {subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder='e.g. "Prepare for the biology test next Friday"'
              aria-label="Homework title"
            />
            <button type="submit" disabled={!title.trim() || isPlanning}>
              {isPlanning ? (
                "Planning…"
              ) : (
                <>
                  <Sparkles size={16} /> Plan it
                </>
              )}
            </button>
          </form>
          <div className="capture-footer">
            <span>Try: “Read chapter 7 by Monday”</span>
            <span className={isOnline ? "online" : "offline-copy"}>
              {isOnline ? <Cloud size={14} /> : <CloudOff size={14} />}
              {user
                ? isOnline
                  ? "Ready to sync"
                  : "Offline capture enabled"
                : "Saved on this device"}
            </span>
          </div>
        </section>

        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {plan && (
          <section className="plan-card" aria-live="polite">
            <div className="plan-accent">
              <Brain size={20} />
            </div>
            <div className="plan-copy">
              <div className="plan-title-row">
                <h2>Your study block is ready</h2>
                <span className={`urgency ${plan.urgency}`}>
                  {plan.urgency} urgency
                </span>
              </div>
              <p>{plan.reason}</p>
              <div className="plan-meta">
                <span>
                  <Clock3 size={15} /> {plan.estimatedMinutes} minutes
                </span>
                <span>
                  <BookOpen size={15} /> {plan.studySteps.length} focused steps
                </span>
              </div>
            </div>
            <button
              type="button"
              className="dismiss-plan"
              onClick={() => setPlan(null)}
            >
              Got it
            </button>
          </section>
        )}

        {view === "today" && (
          <>
            <div className="week-header">
              <div>
                <h2>Your week</h2>
                <p>
                  {formatDate(weekStart, { month: "short", day: "numeric" })} –{" "}
                  {formatDate(addDays(weekStart, 6), {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="week-actions">
                <button
                  type="button"
                  aria-label="Previous week"
                  onClick={() =>
                    setSelectedDate(dateKey(addDays(selectedDateObject, -7)))
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayKey)}
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Next week"
                  onClick={() =>
                    setSelectedDate(dateKey(addDays(selectedDateObject, 7)))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            <div className="week-strip" aria-label="Week dates">
              {weekDays.map((date) => {
                const key = dateKey(date);
                const hasTasks = assignments.some(
                  (task) =>
                    task.startsAt && dateKey(new Date(task.startsAt)) === key,
                );
                return (
                  <button
                    className={key === selectedDate ? "active" : ""}
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(key)}
                    aria-label={formatDate(date, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  >
                    <span>{formatDate(date, { weekday: "short" })}</span>
                    <strong>{date.getDate()}</strong>
                    {hasTasks && <i />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {view === "plans" ? (
          <PlansView
            assignments={sortedAssignments}
            onReminder={addReminder}
          />
        ) : view === "reminders" ? (
          <RemindersView
            reminders={reminders}
            onDelete={deleteReminder}
          />
        ) : (
          <TasksView
            title={
              subjectFilter
                ? subjects.find((item) => item.id === subjectFilter)?.name ??
                  "Subject"
                : view === "today"
                  ? formatDate(selectedDateObject, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : "All tasks"
            }
            isLoading={isLoading}
            assignments={sortedAssignments}
            completion={completion}
            onToggle={toggleAssignment}
            onDelete={deleteAssignment}
            onReminder={addReminder}
            onClearFilter={() => setSubjectFilter(null)}
            filtered={Boolean(subjectFilter)}
            onCapture={() =>
              document
                .querySelector<HTMLInputElement>(".capture-form input")
                ?.focus()
            }
          />
        )}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={view === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => switchView(item.id)}
            >
              <Icon size={20} />
              <span>{item.mobileLabel}</span>
            </button>
          );
        })}
        <button
          className="mobile-add"
          type="button"
          onClick={() =>
            document
              .querySelector<HTMLInputElement>(".capture-form input")
              ?.focus()
          }
          aria-label="Add homework"
        >
          <Plus size={24} />
        </button>
        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={view === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => switchView(item.id)}
            >
              <Icon size={20} />
              <span>{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function TasksView({
  title,
  isLoading,
  assignments,
  completion,
  onToggle,
  onDelete,
  onReminder,
  onCapture,
  onClearFilter,
  filtered,
}: {
  title: string;
  isLoading: boolean;
  assignments: Assignment[];
  completion: number;
  onToggle: (task: Assignment) => void;
  onDelete: (task: Assignment) => void;
  onReminder: (task: Assignment) => void;
  onCapture: () => void;
  onClearFilter: () => void;
  filtered: boolean;
}) {
  const minutes = assignments
    .filter((task) => task.status !== "completed")
    .reduce((sum, task) => sum + task.estimatedMinutes, 0);
  return (
    <section className="today-panel">
      <div className="today-heading">
        <div>
          <div className="heading-with-action">
            <h2>{title}</h2>
            {filtered && (
              <button type="button" onClick={onClearFilter}>
                Clear filter
              </button>
            )}
          </div>
          <p>
            {assignments.filter((task) => task.status !== "completed").length}{" "}
            tasks · {minutes} min planned
          </p>
        </div>
        <div className="progress-wrap">
          <span>{completion}% done</span>
          <div>
            <i style={{ width: `${completion}%` }} />
          </div>
        </div>
      </div>

      <div className="task-list">
        {isLoading ? (
          <div className="empty-state compact">
            <span className="empty-icon">
              <Cloud size={20} />
            </span>
            <h3>Loading your calendar…</h3>
          </div>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              <CalendarDays size={21} />
            </span>
            <h3>Nothing planned here yet</h3>
            <p>Add homework above and Syllabi will find it a time.</p>
            <button type="button" onClick={onCapture}>
              <Plus size={15} /> Add homework
            </button>
          </div>
        ) : (
          assignments.map((task) => (
            <article
              className={`task ${
                task.status === "completed" ? "done" : ""
              }`}
              key={task.id}
            >
              <div className="task-time">
                <strong>{formatTaskTime(task)}</strong>
                <span>{task.estimatedMinutes} min</span>
              </div>
              <span className={`task-line ${task.color}`} />
              <button
                className="check-button"
                type="button"
                aria-label={`Mark ${task.title} ${
                  task.status === "completed" ? "incomplete" : "complete"
                }`}
                onClick={() => onToggle(task)}
              >
                {task.status === "completed" && <Check size={14} />}
              </button>
              <div className="task-body">
                <span>
                  {task.subjectName}
                  {task.syncStatus === "pending" ? " · pending sync" : ""}
                </span>
                <h3>{task.title}</h3>
              </div>
              <span className={`urgency ${task.urgency}`}>
                {task.urgency}
              </span>
              <div className="task-actions">
                <button
                  type="button"
                  onClick={() => onReminder(task)}
                  aria-label={`Add reminder for ${task.title}`}
                >
                  <Bell size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(task)}
                  aria-label={`Delete ${task.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function PlansView({
  assignments,
  onReminder,
}: {
  assignments: Assignment[];
  onReminder: (task: Assignment) => void;
}) {
  return (
    <section className="collection-panel">
      <div className="collection-heading">
        <div>
          <h2>Study plans</h2>
          <p>The focused steps created for your homework and tests.</p>
        </div>
        <Brain size={20} />
      </div>
      {assignments.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Brain size={21} />
          </span>
          <h3>No study plans yet</h3>
          <p>Add homework above to generate your first plan.</p>
        </div>
      ) : (
        <div className="plan-list">
          {assignments.map((task) => (
            <article className="study-plan" key={task.id}>
              <div className="study-plan-top">
                <span className={`subject-dot ${task.color}`}>
                  {task.subjectName.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <span>{task.subjectName}</span>
                  <h3>{task.title}</h3>
                </div>
                <span className={`urgency ${task.urgency}`}>
                  {task.urgency}
                </span>
              </div>
              <p>{task.reason || "A focused plan is ready for this task."}</p>
              <ol>
                {(task.studySteps.length
                  ? task.studySteps
                  : ["Review the task", "Complete the work", "Check your answer"]
                ).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <footer>
                <span>
                  <Clock3 size={14} /> {formatTaskTime(task)} ·{" "}
                  {task.estimatedMinutes} min
                </span>
                <button type="button" onClick={() => onReminder(task)}>
                  <Bell size={14} /> Remind me
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RemindersView({
  reminders,
  onDelete,
}: {
  reminders: Reminder[];
  onDelete: (reminder: Reminder) => void;
}) {
  return (
    <section className="collection-panel">
      <div className="collection-heading">
        <div>
          <h2>Reminders</h2>
          <p>Scheduled alerts are queued securely when they become due.</p>
        </div>
        <Bell size={20} />
      </div>
      {reminders.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Bell size={21} />
          </span>
          <h3>No reminders yet</h3>
          <p>Use the bell beside a task or study plan to create one.</p>
        </div>
      ) : (
        <div className="reminder-list">
          {reminders.map((reminder) => (
            <article className="reminder-row" key={reminder.id}>
              <span className="reminder-icon">
                <Bell size={17} />
              </span>
              <div>
                <h3>{reminder.assignmentTitle}</h3>
                <p>
                  {formatDate(new Date(reminder.remindAt), {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <span className={`reminder-status ${reminder.status}`}>
                {reminder.status}
              </span>
              <button
                type="button"
                onClick={() => onDelete(reminder)}
                aria-label={`Delete reminder for ${reminder.assignmentTitle}`}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
