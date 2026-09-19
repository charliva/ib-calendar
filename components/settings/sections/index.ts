/**
 * The settings panel's contents, in order.
 *
 * Kept as data so a section can be added, reordered or renamed without editing
 * the panel itself — and so the panel has no growing switch statement inside
 * it as more preferences find a home here.
 */

export type SettingsSectionId =
  | "school-day"
  | "week-cycle"
  | "profile"
  | "onboarding"
  | "sync";

export type SettingsSectionMeta = {
  id: SettingsSectionId;
  title: string;
  summary: string;
  /** Sections that only make sense for an account are hidden without one. */
  requiresAccount: boolean;
};

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: "school-day",
    title: "School day",
    summary:
      "When your day runs, how long you travel, and the default shape of each kind of study block.",
    requiresAccount: false,
  },
  {
    id: "week-cycle",
    title: "Week cycle",
    summary:
      "Whether your timetable repeats every week or alternates, and which week you are in now.",
    requiresAccount: false,
  },
  {
    id: "profile",
    title: "You",
    summary: "Your name and the timezone your calendar is read in.",
    requiresAccount: true,
  },
  {
    id: "onboarding",
    title: "Getting started",
    summary: "Replay the walkthrough, or set your timetable up again.",
    requiresAccount: false,
  },
  {
    id: "sync",
    title: "Sync and this device",
    summary: "Changes waiting to reach your account, and anything that failed.",
    requiresAccount: false,
  },
];
