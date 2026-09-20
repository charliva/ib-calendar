import type { CalendarItem, EnergyRequirement } from "../calendar-engine.ts";
import type { Intention } from "../intentions.ts";
import type { CurrentStudyLocation } from "../now-recommender.ts";
import type {
  Assessment,
  Assignment,
  ClassException,
  SchoolClass,
  SchoolDaySettings,
  Subject,
} from "../school.ts";
import type { Exploration, LearningSignal } from "../study-intelligence.ts";

// The vocabulary of the contextual block picker. This module holds types only,
// so the modules that describe blocks, score activities, and build suggestions
// can all depend on it without depending on each other.

export const MINUTE = 60_000;
export const DAY = 86_400_000;

export type TimeBlockType =
  | "morning"
  | "travel_to_school"
  | "school"
  | "travel_home"
  | "after_school"
  | "evening"
  | "night";

export type BlockSuggestionCategory =
  | "recovery"
  | "responsibility"
  | "meaningful";

export type BlockChoiceStatus =
  | "suggested"
  | "selected"
  | "started"
  | "completed"
  | "skipped";

export type BlockSuggestionSource =
  | "recovery"
  | "recommendation"
  | "intention"
  | "exploration"
  | "calendar_item"
  | "generic";

export type BlockSuggestion = {
  id: string;
  category: BlockSuggestionCategory;
  sourceType: BlockSuggestionSource;
  sourceId: string | null;
  title: string;
  description: string;
  estimatedDuration: number;
  reason: string | null;
};

export type TimeBlockContext = {
  label: string;
  location: CurrentStudyLocation;
  availableMinutes: number;
  flexible: boolean;
  fixedTitle: string | null;
  activeEventTitles?: string[];
  schoolStartsAt?: string | null;
  schoolEndsAt?: string | null;
  aiPolished?: boolean;
};

export type TimeBlock = {
  key: string;
  type: TimeBlockType;
  startsAt: string;
  endsAt: string;
  context: TimeBlockContext;
};

export type BlockChoice = {
  id: string;
  blockKey: string;
  blockType: TimeBlockType;
  startsAt: string;
  endsAt: string;
  context: TimeBlockContext;
  suggestions: BlockSuggestion[];
  selectedSuggestionId: string | null;
  status: BlockChoiceStatus;
  selectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlockChoiceInput = {
  now: Date;
  items: CalendarItem[];
  assignments: Assignment[];
  assessments: Assessment[];
  intentions: Intention[];
  explorations: Exploration[];
  subjects: Subject[];
  classes: SchoolClass[];
  classExceptions: ClassException[];
  settings: SchoolDaySettings;
  currentEnergy: EnergyRequirement;
  computerAvailable: boolean;
  learningSignals: LearningSignal[];
  recentChoices: BlockChoice[];
};
