import type {
  EnergyRequirement,
  Priority,
  SchoolWorkType,
} from "@/lib/calendar-engine";
import { WORK_TYPE_LABELS } from "@/lib/school";
import type { AssessmentStatus, AssignmentStatus, TaskContext } from "@/lib/school";

export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const priorities: Priority[] = ["low", "medium", "high"];
export const contexts: TaskContext[] = ["school", "home", "library", "anywhere"];
export const workTypes = Object.keys(WORK_TYPE_LABELS) as SchoolWorkType[];
export const energyRequirements: EnergyRequirement[] = ["low", "medium", "high"];
export const assignmentStatuses: AssignmentStatus[] = [
  "inbox",
  "planned",
  "in_progress",
  "submitted",
  "completed",
  "archived",
];
export const assessmentStatuses: AssessmentStatus[] = [
  "upcoming",
  "completed",
  "cancelled",
];
