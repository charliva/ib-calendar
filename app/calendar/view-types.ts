import { dateKey } from "@/lib/calendar-engine";
import type { LastViewState } from "@/lib/offline";

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
    inboxDockPosition: { x: 70, y: 74 },
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

export type { Zoom, PaletteMode, CommandTurn };
export { transitionState, isRestorableZoom, defaultViewState };
