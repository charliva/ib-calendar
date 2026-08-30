"use client";

import {
  Activity,
  BookOpen,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  Command,
  History,
  Inbox,
  Undo2,
  UserRound,
} from "lucide-react";

export function MobileActionSheets({
  createOpen,
  menuOpen,
  weeklyReviewAvailable,
  activeHomeworkCount,
  inboxCount,
  undoCount,
  signedIn,
  onClose,
  onOpenCommand,
  onNewEvent,
  onNewTask,
  onOpenHomework,
  onWeeklyReview,
  onOpenInbox,
  onOpenHud,
  onOpenHistory,
  onUndo,
  onOpenAccount,
}: {
  createOpen: boolean;
  menuOpen: boolean;
  weeklyReviewAvailable: boolean;
  activeHomeworkCount: number;
  inboxCount: number;
  undoCount: number;
  signedIn: boolean;
  onClose: () => void;
  onOpenCommand: () => void;
  onNewEvent: () => void;
  onNewTask: () => void;
  onOpenHomework: () => void;
  onWeeklyReview: () => void;
  onOpenInbox: () => void;
  onOpenHud: () => void;
  onOpenHistory: () => void;
  onUndo: () => void;
  onOpenAccount: () => void;
}) {
  return (
    <>
      {(createOpen || menuOpen) && (
        <button
          className="mobile-sheet-scrim"
          type="button"
          aria-label="Close mobile menu"
          onClick={onClose}
        />
      )}

      {createOpen && (
        <aside
          className="mobile-action-sheet mobile-create-sheet"
          aria-label="Add something"
        >
          <header>
            <span className="micro-label">Quick capture</span>
            <h2>What are you adding?</h2>
          </header>
          <div>
            <button
              type="button"
              onClick={onOpenCommand}
            >
              <Command size={19} />
              <span>
                <strong>Describe it</strong>
                <small>Use natural language for anything</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button type="button" onClick={onNewEvent}>
              <CalendarPlus size={19} />
              <span>
                <strong>Calendar event</strong>
                <small>Choose a date, time, or all day</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button type="button" onClick={onNewTask}>
              <Inbox size={19} />
              <span>
                <strong>Flexible task</strong>
                <small>Keep it unscheduled until it fits</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={onOpenHomework}
            >
              <BookOpen size={19} />
              <span>
                <strong>Homework</strong>
                <small>Capture it quickly during class</small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
        </aside>
      )}

      {menuOpen && (
        <aside
          className="mobile-action-sheet mobile-more-sheet"
          aria-label="More tools"
        >
          <header>
            <span className="micro-label">Syllabi</span>
            <h2>More tools</h2>
          </header>
          <div>
            <button type="button" onClick={onOpenHomework}>
              <BookOpen size={19} />
              <span>
                <strong>Homework</strong>
                <small>{activeHomeworkCount} waiting</small>
              </span>
              <ChevronRight size={17} />
            </button>
            {weeklyReviewAvailable && (
              <button type="button" onClick={onWeeklyReview}>
                <ClipboardCheck size={19} />
                <span>
                  <strong>Weekly review</strong>
                  <small>Rate this week and plan study</small>
                </span>
                <ChevronRight size={17} />
              </button>
            )}
            <button type="button" onClick={onOpenInbox}>
              <Inbox size={19} />
              <span>
                <strong>Flexible work</strong>
                <small>{inboxCount} unscheduled</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button type="button" onClick={onOpenHud}>
              <Activity size={19} />
              <span>
                <strong>Now & next</strong>
                <small>See the shape of today</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button type="button" onClick={onOpenHistory}>
              <History size={19} />
              <span>
                <strong>History</strong>
                <small>Review recent calendar changes</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              disabled={undoCount === 0}
              onClick={onUndo}
            >
              <Undo2 size={19} />
              <span>
                <strong>Undo last change</strong>
                <small>
                  {undoCount
                    ? "Restore the previous calendar state"
                    : "Nothing to undo"}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
            <button type="button" onClick={onOpenAccount}>
              <UserRound size={19} />
              <span>
                <strong>Account & sync</strong>
                <small>
                  {signedIn ? "Calendar synced" : "Sign in on this device"}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
