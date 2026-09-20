"use client";

import {
  Activity,
  CalendarDays,
  House,
  ClipboardCheck,
  Command,
  GraduationCap,
  History,
  Inbox,
  Settings,
  UserRound,
  Zap,
} from "lucide-react";

export type CalendarZoom =
  "school" | "upcoming" | "day" | "week" | "month" | "semester";

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
  hudOpen,
  historyOpen,
  weeklyReviewOpen,
  weeklyReviewAvailable,
  inboxCount,
  userEmail,
  onToday,
  onHome,
  onCalendar,
  onSchool,
  onToggleInbox,
  onWeeklyReview,
  onOpenCommand,
  onToggleHud,
  onOpenHistory,
  onToggleAccount,
  onOpenSettings,
}: {
  zoom: CalendarZoom;
  inboxOpen: boolean;
  hudOpen: boolean;
  historyOpen: boolean;
  weeklyReviewOpen: boolean;
  weeklyReviewAvailable: boolean;
  inboxCount: number;
  userEmail?: string | null;
  onToday: () => void;
  onHome: () => void;
  onCalendar: () => void;
  onSchool: () => void;
  onToggleInbox: () => void;
  onWeeklyReview: () => void;
  onOpenCommand: () => void;
  onToggleHud: () => void;
  onOpenHistory: () => void;
  onToggleAccount: () => void;
  onOpenSettings: () => void;
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
            !inboxOpen && !hudOpen && zoom === "upcoming"
              ? "active"
              : ""
          }
          type="button"
          aria-label="Attention home"
          aria-current={zoom === "upcoming" ? "page" : undefined}
          onClick={onHome}
        >
          <House size={19} />
          <small className="rail-label">Home</small>
        </button>
        <button
          type="button"
          aria-label="Calendar"
          aria-current={
            !["upcoming", "school"].includes(zoom) ? "page" : undefined
          }
          className={!["upcoming", "school"].includes(zoom) ? "active" : ""}
          onClick={onCalendar}
        >
          <CalendarDays size={19} />
          <small className="rail-label">Calendar</small>
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
        className="rail-settings"
        type="button"
        aria-label="Settings"
        data-tour="settings"
        onClick={onOpenSettings}
      >
        <Settings size={18} />
        <small className="rail-label">Settings</small>
      </button>
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
