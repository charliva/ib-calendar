import type { CalendarItem } from "@/lib/calendar-engine";
import type {
  FreePeriod,
  FreePeriodRecommendation,
} from "@/lib/school-day-engine";
import type {
  ChallengeLevel,
  LearningSignal,
  LearningSource,
} from "@/lib/study-intelligence";
import type {
  Assessment,
  Assignment,
  ClassException,
  SchoolClass,
  SchoolDaySettings,
  Subject,
} from "@/lib/school";

export type SchoolTab = "timetable" | "subjects" | "assignments" | "assessments";
export type Editor =
  | "subject"
  | "class"
  | "exception"
  | "assignment"
  | "assessment"
  | "school_day";

export type SchoolWorkspaceProps = {
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  assignments: Assignment[];
  assessments: Assessment[];
  assignmentSessions: CalendarItem[];
  schoolDaySettings: SchoolDaySettings;
  onSaveSubject: (subject: Subject) => void;
  onDeleteSubject: (subject: Subject) => void;
  onSaveClass: (schoolClass: SchoolClass) => void;
  onDeleteClass: (schoolClass: SchoolClass) => void;
  onSaveException: (exception: ClassException) => void;
  onDeleteException: (exception: ClassException) => void;
  onSaveSchoolDaySettings: (settings: SchoolDaySettings) => void;
  onSaveAssignment: (assignment: Assignment) => void;
  onDeleteAssignment: (assignment: Assignment) => void;
  onCompleteAssignment: (assignment: Assignment) => void;
  onPlanAssignment: (assignment: Assignment) => void;
  onAddAssignmentSession: (assignment: Assignment) => void;
  onOpenAssignmentSession: (session: CalendarItem) => void;
  onToggleAssignmentSession: (session: CalendarItem) => void;
  onUseFreePeriod: (
    recommendation: FreePeriodRecommendation,
    period: FreePeriod,
  ) => void;
  onSaveAssessment: (assessment: Assessment) => void;
  onDeleteAssessment: (assessment: Assessment) => void;
  onPlanRevision: (assessment: Assessment) => void;
  onMarkRevisionLearned: (
    session: CalendarItem,
    assessment: Assessment,
  ) => void;
  onOpenRevisionSession: (session: CalendarItem) => void;
  onOpenCalendarItem: (item: CalendarItem) => void;
  onImportTimetable: (file: File, weekStart: string) => void;
  timetableImportBusy: boolean;
  learningSignals: LearningSignal[];
  onChallenge: (source: LearningSource, level: ChallengeLevel) => void;
  onGoDeeper: (source: LearningSource) => void;
};
