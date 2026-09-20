import {
  makeItem,
  validatePlacement,
  type CalendarItem,
} from "@/lib/calendar-engine";
import {
  recommendNow,
  type CurrentStudyLocation,
  type NowRecommendation,
} from "@/lib/now-recommender";
import type { EnergyRequirement } from "@/lib/calendar-engine";
import type {
  Assessment,
  Assignment,
  ClassException,
  SchoolClass,
  SchoolDaySettings,
  Subject,
} from "@/lib/school";
import type { LearningSignal, LearningSource } from "@/lib/study-intelligence";

type NowSessionParams = {
  items: CalendarItem[];
  assignments: Assignment[];
  assessments: Assessment[];
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  schoolDaySettings: SchoolDaySettings;
  learningSignals: LearningSignal[];
  /** The three answers that narrow what can realistically be started now. */
  nowLocation: CurrentStudyLocation;
  nowEnergy: EnergyRequirement;
  nowComputerAvailable: boolean;
  setNowMoment: (moment: string | null) => void;
  setNowOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setInboxOpen: (open: boolean) => void;
  setHudOpen: (open: boolean) => void;
  setNotice: (notice: string) => void;
  createItem: (item: CalendarItem) => void;
  updateItem: (item: CalendarItem, label: string) => void;
  /** A recommendation to explore rather than schedule hands off to Go Deeper. */
  openGoDeeper: (source: LearningSource) => void;
};

/**
 * "What should I do now?" — ranking the options and turning the chosen one
 * into a session on the calendar.
 *
 * Starting recomputes the ranking before committing, because the panel may
 * have been open long enough for the slot to have changed underneath it.
 */
export function useNowSession({
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
}: NowSessionParams) {
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

  return { nowRecommendations, openNowRecommendations, startNow };
}
