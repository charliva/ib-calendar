export type ItemKind = "event" | "task" | "intention";
export type EnergyType =
  "deep_focus" | "light_work" | "social" | "movement" | "recovery" | "transit";
export type Priority = "low" | "medium" | "high";
export type Flexibility = "fixed" | "flexible" | "elastic";
export type ItemStatus = "inbox" | "scheduled" | "completed" | "archived";
export type TaskContext = "school" | "home" | "library" | "city" | "anywhere";
export type SchoolWorkType =
  | "deep_focus"
  | "light_work"
  | "reading"
  | "memorization"
  | "problem_solving"
  | "creative_project";
export type EnergyRequirement = "low" | "medium" | "high";

export const TIMETABLE_IMPORT_MARKER = "Weekly timetable screenshot";

export function flexibilityForNewItem(
  input: Pick<CalendarItem, "kind"> &
    Partial<Pick<CalendarItem, "flexibility" | "constraints">>,
): Flexibility {
  if (input.kind !== "event") return input.flexibility ?? "flexible";
  return input.constraints?.includes(TIMETABLE_IMPORT_MARKER)
    ? "fixed"
    : "flexible";
}

export type CalendarItem = {
  id: string;
  kind: ItemKind;
  title: string;
  description: string;
  room: string;
  startsAt: string | null;
  endsAt: string | null;
  durationMin: number;
  durationMax: number;
  deadline: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  energyType: EnergyType;
  energyUsage?: number;
  classId?: string | null;
  occurrenceDate?: string | null;
  linkedClassId?: string | null;
  linkedOccurrenceDate?: string | null;
  priority: Priority;
  splittable: boolean;
  flexibility: Flexibility;
  constraints: string[];
  assignmentId: string | null;
  assessmentId: string | null;
  intentionId: string | null;
  subjectId: string | null;
  revisionStage: string | null;
  reviewOffsetDays: number | null;
  learnedAt: string | null;
  homeworkCaptureId: string | null;
  taskContext: TaskContext;
  computerRequired: boolean;
  workType: SchoolWorkType | null;
  requiredEnergy: EnergyRequirement;
  status: ItemStatus;
  source: "manual" | "command" | "document" | "import";
  createdAt: string;
  syncStatus: "pending" | "synced";
};

export type HistoryEntry = {
  id: string;
  label: string;
  items: CalendarItem[];
  createdAt: string;
};

export type ProposalChange = {
  id: string;
  type: "create" | "update" | "delete";
  itemId: string | null;
  reason: string;
  before: CalendarItem | null;
  after: CalendarItem | null;
};

export type CalendarProposal = {
  id: string;
  title: string;
  summary: string;
  changes: ProposalChange[];
  source: "command" | "document";
};

export type PlacementResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export const energyLabels: Record<EnergyType, string> = {
  deep_focus: "Deep focus",
  light_work: "Light work",
  social: "Social",
  movement: "Movement",
  recovery: "Recovery",
  transit: "Transit",
};

export const kindLabels: Record<ItemKind, string> = {
  event: "Event",
  task: "Task",
  intention: "Intention",
};

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeek(date: Date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function durationMinutes(item: CalendarItem) {
  if (!item.startsAt || !item.endsAt) return item.durationMin;
  const minutes = Math.round(
    (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) /
      60_000,
  );
  return Number.isFinite(minutes) && minutes > 0
    ? Math.max(5, minutes)
    : item.durationMin;
}

/** Manual edge resizing makes the chosen duration an allowed duration. */
export function withResizedDuration(
  item: CalendarItem,
  minutes: number,
): CalendarItem {
  const safeMinutes = Math.max(5, Math.round(minutes));
  return {
    ...item,
    durationMin:
      item.flexibility === "fixed"
        ? safeMinutes
        : Math.min(item.durationMin, safeMinutes),
    durationMax:
      item.flexibility === "fixed"
        ? safeMinutes
        : Math.max(item.durationMax, safeMinutes),
  };
}

/** Calendar spans use an exclusive end, matching normal calendar APIs. */
export function itemOverlapsDay(item: CalendarItem, day: string) {
  if (!item.startsAt || !item.endsAt) return false;
  const dayStart = dateFromKey(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  return new Date(item.startsAt) < dayEnd && new Date(item.endsAt) > dayStart;
}

export function isMultiDayItem(item: CalendarItem) {
  if (!item.startsAt || !item.endsAt) return false;
  const start = new Date(item.startsAt);
  const end = new Date(item.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return false;
  }
  const lastMoment = new Date(end.getTime() - 1);
  return dateKey(start) !== dateKey(lastMoment);
}

export function isLongSpanItem(item: CalendarItem) {
  return durationMinutes(item) >= 24 * 60;
}

/** Midnight-to-midnight items are date-level events, not zero-length sessions. */
export function isAllDayItem(item: CalendarItem) {
  if (!item.startsAt || !item.endsAt) return false;
  const start = new Date(item.startsAt);
  const end = new Date(item.endsAt);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    return false;
  }
  return (
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    start.getSeconds() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    durationMinutes(item) % (24 * 60) === 0
  );
}

/** Items that should live in the calendar's span lane instead of the hour grid. */
export function isCalendarSpanItem(item: CalendarItem) {
  return isMultiDayItem(item) || isLongSpanItem(item);
}

export function validatePlacement(
  item: CalendarItem,
  nextStart: string,
  nextEnd: string,
  items: CalendarItem[],
  options: { allowFixedChange?: boolean } = {},
): PlacementResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const start = new Date(nextStart);
  const end = new Date(nextEnd);
  const minutes = (end.getTime() - start.getTime()) / 60_000;

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    errors.push("The placement needs a valid start and end.");
    return { valid: false, errors, warnings };
  }
  if (
    !Number.isFinite(item.durationMin) ||
    !Number.isFinite(item.durationMax) ||
    item.durationMin < 5 ||
    item.durationMax < item.durationMin
  ) {
    errors.push("The item has invalid duration limits.");
  }
  if (
    item.flexibility === "fixed" &&
    !options.allowFixedChange &&
    item.startsAt &&
    (new Date(item.startsAt).getTime() !== start.getTime() ||
      new Date(item.endsAt ?? "").getTime() !== end.getTime())
  ) {
    errors.push("Fixed events cannot be moved or resized.");
  }
  if (minutes < item.durationMin || minutes > item.durationMax) {
    errors.push(
      `Duration must stay between ${item.durationMin} and ${item.durationMax} minutes.`,
    );
  }
  if (item.windowStart && start < new Date(item.windowStart)) {
    errors.push("This starts before its allowed window.");
  }
  if (item.windowEnd && end > new Date(item.windowEnd)) {
    errors.push("This ends after its allowed window.");
  }
  if (item.deadline && end > new Date(item.deadline)) {
    errors.push("This placement misses the deadline.");
  }

  const collisions = items.filter((other) => {
    if (
      isLongSpanItem(item) ||
      isLongSpanItem(other) ||
      other.id === item.id ||
      other.status !== "scheduled" ||
      !other.startsAt ||
      !other.endsAt
    ) {
      return false;
    }
    return start < new Date(other.endsAt) && end > new Date(other.startsAt);
  });
  const fixedCollision = collisions.find(
    (other) => other.flexibility === "fixed",
  );
  if (fixedCollision) {
    const sameTimetableImport =
      item.source === "document" &&
      fixedCollision.source === "document" &&
      item.constraints.includes(TIMETABLE_IMPORT_MARKER) &&
      fixedCollision.constraints.includes(TIMETABLE_IMPORT_MARKER);
    if (sameTimetableImport) {
      warnings.push(`Overlaps imported lesson “${fixedCollision.title}”.`);
    } else {
      errors.push(`Conflicts with fixed event “${fixedCollision.title}”.`);
    }
  } else if (collisions.length) {
    warnings.push(
      `Overlaps ${collisions.length} flexible item${
        collisions.length === 1 ? "" : "s"
      }.`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateProposal(
  proposal: CalendarProposal,
  items: CalendarItem[],
) {
  const projected = new Map(items.map((item) => [item.id, item]));
  const results = proposal.changes.map((change) => {
    if (change.type === "delete") {
      const existing = change.itemId ? projected.get(change.itemId) : undefined;
      const isApprovedTimetableReplacement =
        proposal.source === "document" &&
        existing?.source === "document" &&
        existing.constraints.includes(TIMETABLE_IMPORT_MARKER);
      if (
        existing?.flexibility === "fixed" &&
        !isApprovedTimetableReplacement
      ) {
        return {
          changeId: change.id,
          valid: false,
          errors: ["Fixed events require manual deletion."],
          warnings: [],
        };
      }
      if (change.itemId) projected.delete(change.itemId);
      return {
        changeId: change.id,
        valid: true,
        errors: [],
        warnings: [],
      };
    }

    const next = change.after;
    if (!next) {
      return {
        changeId: change.id,
        valid: false,
        errors: ["The proposed item is missing."],
        warnings: [],
      };
    }
    if (next.status === "scheduled" && next.startsAt && next.endsAt) {
      const result = validatePlacement(next, next.startsAt, next.endsAt, [
        ...projected.values(),
      ]);
      if (result.valid) projected.set(next.id, next);
      return { changeId: change.id, ...result };
    }
    projected.set(next.id, next);
    return {
      changeId: change.id,
      valid: true,
      errors: [],
      warnings: [],
    };
  });
  return {
    valid: results.every((result) => result.valid),
    results,
  };
}

export function applyProposal(
  proposal: CalendarProposal,
  items: CalendarItem[],
) {
  const next = new Map(items.map((item) => [item.id, item]));
  for (const change of proposal.changes) {
    if (change.type === "delete") {
      if (change.itemId) next.delete(change.itemId);
    } else if (change.after) {
      next.set(change.after.id, change.after);
    }
  }
  return [...next.values()];
}

export function capacityForDay(items: CalendarItem[], day: string) {
  const dayStart = dateFromKey(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  const scheduled = items.filter(
    (item) =>
      item.status === "scheduled" &&
      item.startsAt &&
      item.endsAt &&
      !isLongSpanItem(item) &&
      new Date(item.startsAt) < dayEnd &&
      new Date(item.endsAt) > dayStart,
  );
  const minutesWithinDay = (item: CalendarItem) => {
    const start = Math.max(
      new Date(item.startsAt!).getTime(),
      dayStart.getTime(),
    );
    const end = Math.min(new Date(item.endsAt!).getTime(), dayEnd.getTime());
    return Math.max(0, Math.round((end - start) / 60_000));
  };
  const sum = (predicate: (item: CalendarItem) => boolean) =>
    scheduled
      .filter(predicate)
      .reduce((total, item) => total + minutesWithinDay(item), 0);
  const total = sum(() => true);
  const deep = sum((item) => (item.energyUsage ?? 3) >= 4);
  const social = sum((item) => (item.energyUsage ?? 3) === 3);
  const recovery = sum((item) => (item.energyUsage ?? 3) <= 2);
  return {
    total,
    deep,
    social,
    recovery,
    load: Math.min(100, Math.round((total / 600) * 100)),
    balance:
      total === 0 ? 100 : Math.min(100, Math.round((recovery / total) * 300)),
  };
}

export function scheduleInsights(items: CalendarItem[], day: string) {
  const dayStart = dateFromKey(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  const scheduled = items
    .filter(
      (item) =>
        item.status === "scheduled" &&
        item.startsAt &&
        item.endsAt &&
        !isLongSpanItem(item) &&
        new Date(item.startsAt) < dayEnd &&
        new Date(item.endsAt) > dayStart,
    )
    .sort(
      (a, b) =>
        new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
    );
  const insights: string[] = [];
  let switches = 0;
  let consecutiveFocus = 0;
  let longestFocus = 0;
  for (let index = 0; index < scheduled.length; index += 1) {
    const item = scheduled[index];
    const previous = scheduled[index - 1];
    const gap = previous
      ? (new Date(item.startsAt!).getTime() -
          new Date(previous.endsAt!).getTime()) /
        60_000
      : Infinity;
    if (previous && gap <= 30 && previous.energyUsage !== item.energyUsage) {
      switches += 1;
    }
    if ((item.energyUsage ?? 3) >= 4) {
      const effectiveStart = Math.max(
        new Date(item.startsAt!).getTime(),
        dayStart.getTime(),
      );
      const effectiveEnd = Math.min(
        new Date(item.endsAt!).getTime(),
        dayEnd.getTime(),
      );
      const focusedMinutes = Math.max(
        0,
        Math.round((effectiveEnd - effectiveStart) / 60_000),
      );
      if (!previous || (previous.energyUsage ?? 3) < 4 || gap > 15) {
        consecutiveFocus = 0;
      }
      consecutiveFocus += focusedMinutes;
      longestFocus = Math.max(longestFocus, consecutiveFocus);
    } else {
      consecutiveFocus = 0;
    }
  }
  const capacity = capacityForDay(items, day);
  if (switches >= 4) insights.push(`${switches} context switches`);
  if (longestFocus > 120) {
    insights.push(`${longestFocus} min of consecutive deep focus`);
  }
  if (capacity.load >= 85) insights.push("Day is close to capacity");
  if (capacity.total > 240 && capacity.recovery < 30) {
    insights.push("Add recovery time");
  }
  return insights;
}

export function makeItem(
  input: Partial<CalendarItem> & Pick<CalendarItem, "title" | "kind">,
): CalendarItem {
  const now = new Date().toISOString();
  const durationMin = Math.max(5, Math.round(input.durationMin ?? 30));
  const durationMax = Math.max(
    durationMin,
    Math.round(input.durationMax ?? durationMin),
  );
  return {
    id: input.id ?? crypto.randomUUID(),
    kind: input.kind,
    title: input.title,
    description: input.description ?? "",
    room: input.room?.trim() ?? "",
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    durationMin,
    durationMax,
    deadline: input.deadline ?? null,
    windowStart: input.windowStart ?? null,
    windowEnd: input.windowEnd ?? null,
    energyType: input.energyType ?? "light_work",
    energyUsage: Math.max(
      1,
      Math.min(
        5,
        Math.round(
          input.energyUsage ??
            {
              deep_focus: 5,
              light_work: 2,
              social: 3,
              movement: 3,
              recovery: 1,
              transit: 2,
            }[input.energyType ?? "light_work"],
        ),
      ),
    ),
    classId: input.classId ?? null,
    occurrenceDate: input.occurrenceDate ?? null,
    linkedClassId: input.linkedClassId ?? null,
    linkedOccurrenceDate: input.linkedOccurrenceDate ?? null,
    priority: input.priority ?? "medium",
    splittable: input.splittable ?? false,
    flexibility: input.flexibility ?? "flexible",
    constraints: input.constraints ?? [],
    assignmentId: input.assignmentId ?? null,
    assessmentId: input.assessmentId ?? null,
    intentionId: input.intentionId ?? null,
    subjectId: input.subjectId ?? null,
    revisionStage: input.revisionStage ?? null,
    reviewOffsetDays: input.reviewOffsetDays ?? null,
    learnedAt: input.learnedAt ?? null,
    homeworkCaptureId: input.homeworkCaptureId ?? null,
    taskContext: input.taskContext ?? "anywhere",
    computerRequired: input.computerRequired ?? false,
    workType: input.workType ?? null,
    requiredEnergy:
      input.energyUsage != null
        ? input.energyUsage <= 2
          ? "low"
          : input.energyUsage >= 4
            ? "high"
            : "medium"
        : (input.requiredEnergy ?? "medium"),
    status: input.status ?? (input.startsAt ? "scheduled" : "inbox"),
    source: input.source ?? "manual",
    createdAt: input.createdAt ?? now,
    syncStatus: input.syncStatus ?? "pending",
  };
}

export function itemToRow(item: CalendarItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    description: item.description || null,
    room: item.room || null,
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    duration_min: item.durationMin,
    duration_max: item.durationMax,
    deadline: item.deadline,
    window_start: item.windowStart,
    window_end: item.windowEnd,
    energy_type: item.energyType,
    energy_usage: item.energyUsage ?? 3,
    linked_class_id: item.linkedClassId ?? null,
    linked_occurrence_date: item.linkedOccurrenceDate ?? null,
    priority: item.priority,
    splittable: item.splittable,
    flexibility: item.flexibility,
    constraints: item.constraints,
    assignment_id: item.assignmentId,
    assessment_id: item.assessmentId,
    intention_id: item.intentionId,
    subject_id: item.subjectId,
    revision_stage: item.revisionStage,
    review_offset_days: item.reviewOffsetDays,
    learned_at: item.learnedAt,
    homework_capture_id: item.homeworkCaptureId,
    task_context: item.taskContext,
    computer_required: item.computerRequired,
    work_type: item.workType,
    required_energy: item.requiredEnergy,
    status: item.status,
    source: item.source,
    completed_at: item.status === "completed" ? new Date().toISOString() : null,
  };
}
