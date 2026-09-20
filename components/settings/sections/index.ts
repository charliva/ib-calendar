/**
 * The settings panel's contents, in order.
 *
 * Kept as data so a section can be added, reordered or renamed without editing
 * the panel itself. Each row shows its live value rather than a description of
 * itself; the hint is a short nudge for the ones worth a second look, not an
 * explanation of what the section is for.
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
  /** Shown under the value when expanded, or when the value needs context. */
  hint: string;
  /** Sections that only make sense for an account are hidden without one. */
  requiresAccount: boolean;
};

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: "school-day",
    title: "Your day",
    hint: "When school runs and when you like to work.",
    requiresAccount: false,
  },
  {
    id: "week-cycle",
    title: "Week cycle",
    hint: "For timetables that alternate between two weeks.",
    requiresAccount: false,
  },
  {
    id: "profile",
    title: "You",
    hint: "Your name, and the timezone your calendar is read in.",
    requiresAccount: true,
  },
  {
    id: "onboarding",
    title: "Getting started",
    hint: "Replay the walkthrough, or set your timetable up again.",
    requiresAccount: false,
  },
  {
    id: "sync",
    title: "Sync",
    hint: "Changes waiting to reach your account.",
    requiresAccount: false,
  },
];
