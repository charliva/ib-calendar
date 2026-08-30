"use client";

import {
  Activity,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  Command,
  GraduationCap,
  History,
  Inbox,
  UserRound,
  Zap,
} from "lucide-react";

export type CalendarZoom =
  | "school"
  | "upcoming"
  | "day"
  | "week"
  | "month"
  | "semester";

function initials(value?: string | null) {
  if (!value) return <UserRound size={16} />;
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function CalendarRail({
  zoom,
  inboxOpen,
  homeworkOpen,
  hudOpen,
  historyOpen,
  weeklyReviewOpen,
  weeklyReviewAvailable,
  activeHomeworkCount,
  inboxCount,
  userEmail,
  onToday,
  onHome,
  onSchool,
  onToggleHomework,
  onToggleInbox,
  onWeeklyReview,
  onOpenCommand,
  onToggleHud,
  onOpenHistory,
  onToggleAccount,
}: {
  zoom: CalendarZoom;
  inboxOpen: boolean;
  homeworkOpen: boolean;
  hudOpen: boolean;
  historyOpen: boolean;
  weeklyReviewOpen: boolean;
  weeklyReviewAvailable: boolean;
  activeHomeworkCount: number;
  inboxCount: number;
  userEmail?: string | null;
  onToday: () => void;
  onHome: () => void;
  onSchool: () => void;
  onToggleHomework: () => void;
  onToggleInbox: () => void;
  onWeeklyReview: () => void;
  onOpenCommand: () => void;
  onToggleHud: () => void;
  onOpenHistory: () => void;
  onToggleAccount: () => void;
}) {
  return (
    <aside className="icon-rail">
      <button
        className="flux-mark"
        type="button"
        aria-label="Today"
        onClick={onToday}
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
          onClick={onHome}
        >
          <CalendarClock size={19} />
          <small className="rail-label">Home</small>
        </button>
        <button
          className={zoom === "school" ? "active" : ""}
          type="button"
          aria-label="School"
          onClick={onSchool}
        >
          <GraduationCap size={19} />
          <small className="rail-label">School</small>
        </button>
        <button
          className={homeworkOpen ? "active" : ""}
          type="button"
          aria-label="Homework inbox"
          onClick={onToggleHomework}
        >
          <BookOpen size={18} />
          {activeHomeworkCount > 0 && <span>{activeHomeworkCount}</span>}
          <small className="rail-label">Homework</small>
        </button>
        <button
          className={inboxOpen ? "active" : ""}
          type="button"
          aria-label="Flexible work"
          onClick={onToggleInbox}
        >
          <Inbox size={18} />
          {inboxCount > 0 && <span>{inboxCount}</span>}
          <small className="rail-label">Flexible work</small>
        </button>
        {weeklyReviewAvailable && (
          <button
            className={weeklyReviewOpen ? "active" : ""}
            type="button"
            aria-label="Weekly review"
            onClick={onWeeklyReview}
          >
            <ClipboardCheck size={18} />
            <small className="rail-label">Review</small>
          </button>
        )}
        <button
          type="button"
          aria-label="Command palette"
          onClick={onOpenCommand}
        >
          <Command size={19} />
          <small className="rail-label">Command menu</small>
        </button>
        <button
          className={hudOpen && !historyOpen ? "active" : ""}
          type="button"
          aria-label="Quick HUD"
          onClick={onToggleHud}
        >
          <Activity size={18} />
          <small className="rail-label">Now & next</small>
        </button>
        <button
          className={hudOpen && historyOpen ? "active" : ""}
          type="button"
          aria-label="History"
          onClick={onOpenHistory}
        >
          <History size={19} />
          <small className="rail-label">History</small>
        </button>
      </nav>
      <button
        className="rail-account"
        type="button"
        aria-label="Account and sync"
        onClick={onToggleAccount}
      >
        {initials(userEmail)}
        <small className="rail-label">Account & sync</small>
      </button>
    </aside>
  );
}
