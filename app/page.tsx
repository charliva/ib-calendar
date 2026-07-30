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
  Plus,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getLocalAssignments,
  putLocalAssignment,
  type LocalAssignment,
} from "@/lib/offline";

type Plan = {
  urgency: "low" | "medium" | "high";
  estimatedMinutes: number;
  reason: string;
  suggestedStart: string;
  studySteps: string[];
};

const subjects = [
  { name: "Mathematics", short: "MA", color: "violet" },
  { name: "Physics", short: "PH", color: "blue" },
  { name: "English", short: "EN", color: "orange" },
  { name: "History", short: "HI", color: "green" },
];

const week = [
  { day: "Mon", date: 27 },
  { day: "Tue", date: 28 },
  { day: "Wed", date: 29 },
  { day: "Thu", date: 30, active: true },
  { day: "Fri", date: 31 },
  { day: "Sat", date: 1 },
  { day: "Sun", date: 2 },
];

const initialTasks = [
  {
    id: 1,
    time: "08:15",
    duration: "45 min",
    subject: "Mathematics",
    title: "Calculus problem set",
    color: "violet",
    badge: "Due tomorrow",
    done: false,
  },
  {
    id: 2,
    time: "15:30",
    duration: "30 min",
    subject: "Physics",
    title: "Review electric fields",
    color: "blue",
    badge: "AI scheduled",
    done: false,
  },
  {
    id: 3,
    time: "17:00",
    duration: "25 min",
    subject: "English",
    title: "Outline comparative essay",
    color: "orange",
    badge: "Study block",
    done: true,
  },
];

function fallbackPlan(subject: string, title: string): Plan {
  const looksLikeTest = /test|exam|quiz|mock|assessment/i.test(title);
  return {
    urgency: looksLikeTest ? "high" : "medium",
    estimatedMinutes: looksLikeTest ? 45 : 30,
    reason: looksLikeTest
      ? "This sounds like test preparation, so it is split into a focused first session."
      : `${subject} fits your open afternoon focus window without crowding tonight.`,
    suggestedStart: new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 16),
    studySteps: looksLikeTest
      ? ["Recall key ideas", "Practice without notes", "Review mistakes"]
      : ["Read the task", "Complete the core work", "Check and submit"],
  };
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Mathematics");
  const [tasks, setTasks] = useState(initialTasks);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    getLocalAssignments()
      .then((localTasks) => {
        if (localTasks.length) {
          setTasks((current) => [
            ...current,
            ...localTasks.filter(
              (local) => !current.some((task) => task.id === local.id),
            ),
          ]);
        }
      })
      .catch(() => undefined);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const completion = useMemo(
    () => Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100),
    [tasks],
  );

  async function addHomework(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setIsPlanning(true);
    setNotice("");

    let suggestion = fallbackPlan(subject, title);
    if (isOnline) {
      try {
        const response = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            title,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        if (response.ok) suggestion = await response.json();
        else setNotice("Using a local suggestion until the AI key is connected.");
      } catch {
        setNotice("Saved offline. The AI plan will refresh when you reconnect.");
      }
    } else {
      setNotice("Saved offline. It will sync and refine the plan when you reconnect.");
    }

    setPlan(suggestion);
    const localTask: LocalAssignment = {
      id: Date.now(),
      time: new Date(suggestion.suggestedStart).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      duration: `${suggestion.estimatedMinutes} min`,
      subject,
      title: title.trim(),
      color: subjects.find((item) => item.name === subject)?.color ?? "violet",
      badge: isOnline ? "AI suggested" : "Queued offline",
      done: false,
      syncStatus: "pending",
    };
    setTasks((current) => [...current, localTask]);
    await putLocalAssignment(localTask).catch(() => undefined);
    setTitle("");
    setIsPlanning(false);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Syllabi home">
          <span className="brand-mark"><Check size={18} strokeWidth={3} /></span>
          <span>Syllabi</span>
        </a>

        <nav className="primary-nav" aria-label="Main navigation">
          <a className="active" href="#"><CalendarDays size={19} />Today</a>
          <a href="#"><ListTodo size={19} />All tasks<span className="nav-count">6</span></a>
          <a href="#"><Brain size={19} />Study plans</a>
          <a href="#"><Bell size={19} />Reminders</a>
        </nav>

        <div className="subjects">
          <div className="section-label"><span>Subjects</span><Plus size={15} /></div>
          {subjects.map((item) => (
            <button key={item.name} type="button" onClick={() => setSubject(item.name)}>
              <span className={`subject-dot ${item.color}`}>{item.short}</span>
              <span>{item.name}</span>
            </button>
          ))}
        </div>

        <div className="sync-card">
          <span className={`sync-icon ${isOnline ? "" : "offline"}`}>
            {isOnline ? <Cloud size={17} /> : <CloudOff size={17} />}
          </span>
          <div><strong>{isOnline ? "Synced" : "Working offline"}</strong><small>{isOnline ? "Across all devices" : "Changes are queued"}</small></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Thursday, July 30</p>
            <h1>Good afternoon, Charlie</h1>
          </div>
          <div className="top-actions">
            <span className="streak"><Sparkles size={16} /> 8 day streak</span>
            <button className="avatar" type="button" aria-label="Open account menu">CS</button>
          </div>
        </header>

        <section className="capture-card" aria-labelledby="capture-title">
          <div className="capture-heading">
            <span className="ai-mark"><Sparkles size={18} /></span>
            <div>
              <h2 id="capture-title">What do you need to get done?</h2>
              <p>Drop it here. I’ll figure out the urgency and a good time.</p>
            </div>
          </div>
          <form className="capture-form" onSubmit={addHomework}>
            <select value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Subject">
              {subjects.map((item) => <option key={item.name}>{item.name}</option>)}
            </select>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder='e.g. "Prepare for the biology test next Friday"'
              aria-label="Homework title"
            />
            <button type="submit" disabled={!title.trim() || isPlanning}>
              {isPlanning ? "Planning…" : <><Sparkles size={16} /> Plan it</>}
            </button>
          </form>
          <div className="capture-footer">
            <span>Try: “Read chapter 7 by Monday”</span>
            <span className={isOnline ? "online" : "offline-copy"}>
              {isOnline ? <Cloud size={14} /> : <CloudOff size={14} />}
              {isOnline ? "Ready to sync" : "Offline capture enabled"}
            </span>
          </div>
        </section>

        {plan && (
          <section className="plan-card" aria-live="polite">
            <div className="plan-accent"><Brain size={20} /></div>
            <div className="plan-copy">
              <div className="plan-title-row">
                <h2>Your new study block is ready</h2>
                <span className={`urgency ${plan.urgency}`}>{plan.urgency} urgency</span>
              </div>
              <p>{plan.reason}</p>
              <div className="plan-meta">
                <span><Clock3 size={15} /> {plan.estimatedMinutes} minutes</span>
                <span><BookOpen size={15} /> {plan.studySteps.length} focused steps</span>
              </div>
              {notice && <small>{notice}</small>}
            </div>
            <button type="button" className="dismiss-plan" onClick={() => setPlan(null)}>Got it</button>
          </section>
        )}

        <div className="week-header">
          <div>
            <h2>Your week</h2>
            <p>July 27 – August 2</p>
          </div>
          <div className="week-actions">
            <button type="button" aria-label="Previous week"><ChevronLeft size={17} /></button>
            <button type="button">Today</button>
            <button type="button" aria-label="Next week"><ChevronRight size={17} /></button>
          </div>
        </div>

        <div className="week-strip" aria-label="Week dates">
          {week.map((item) => (
            <button className={item.active ? "active" : ""} key={`${item.day}-${item.date}`} type="button">
              <span>{item.day}</span><strong>{item.date}</strong>
              {item.day !== "Sat" && item.day !== "Sun" && <i />}
            </button>
          ))}
        </div>

        <section className="today-panel">
          <div className="today-heading">
            <div><h2>Today</h2><p>{tasks.filter((task) => !task.done).length} tasks · {tasks.reduce((sum, task) => sum + Number.parseInt(task.duration), 0)} min planned</p></div>
            <div className="progress-wrap"><span>{completion}% done</span><div><i style={{ width: `${completion}%` }} /></div></div>
          </div>

          <div className="task-list">
            {tasks.map((task) => (
              <article className={`task ${task.done ? "done" : ""}`} key={task.id}>
                <div className="task-time"><strong>{task.time}</strong><span>{task.duration}</span></div>
                <span className={`task-line ${task.color}`} />
                <button
                  className="check-button"
                  type="button"
                  aria-label={`Mark ${task.title} ${task.done ? "incomplete" : "complete"}`}
                  onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))}
                >
                  {task.done && <Check size={14} />}
                </button>
                <div className="task-body"><span>{task.subject}</span><h3>{task.title}</h3></div>
                <span className="task-badge">{task.badge}</span>
              </article>
            ))}
          </div>
        </section>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <a className="active" href="#"><CalendarDays size={20} /><span>Today</span></a>
        <a href="#"><ListTodo size={20} /><span>Tasks</span></a>
        <button type="button" onClick={() => document.querySelector<HTMLInputElement>(".capture-form input")?.focus()}><Plus size={24} /></button>
        <a href="#"><Brain size={20} /><span>Plans</span></a>
        <a href="#"><Bell size={20} /><span>Alerts</span></a>
      </nav>
    </main>
  );
}
