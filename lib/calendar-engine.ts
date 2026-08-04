export type ItemKind = "event" | "task" | "intention";
export type EnergyType =
  | "deep_focus"
  | "light_work"
  | "social"
  | "movement"
  | "recovery"
  | "transit";
export type Priority = "low" | "medium" | "high";
export type Flexibility = "fixed" | "flexible" | "elastic";
export type ItemStatus = "inbox" | "scheduled" | "completed" | "archived";
export type TaskContext = "school" | "home" | "library" | "anywhere";
export type SchoolWorkType =
  | "deep_focus"
  | "light_work"
  | "reading"
  | "memorization"
  | "problem_solving"
  | "creative_project";
export type EnergyRequirement = "low" | "medium" | "high";

export type CalendarItem = {
  id: string;
  kind: ItemKind;
  title: string;
  description: string;
  startsAt: string | null;
  endsAt: string | null;
  durationMin: number;
  durationMax: number;
  deadline: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  energyType: EnergyType;
  priority: Priority;
  splittable: boolean;
  flexibility: Flexibility;
  constraints: string[];
  assignmentId: string | null;
  assessmentId: string | null;
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
    errors.push(`Conflicts with fixed event “${fixedCollision.title}”.`);
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
      if (existing?.flexibility === "fixed") {
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
      new Date(item.startsAt) < dayEnd &&
      new Date(item.endsAt) > dayStart,
  );
  const minutesWithinDay = (item: CalendarItem) => {
    const start = Math.max(new Date(item.startsAt!).getTime(), dayStart.getTime());
    const end = Math.min(new Date(item.endsAt!).getTime(), dayEnd.getTime());
    return Math.max(0, Math.round((end - start) / 60_000));
  };
  const sum = (predicate: (item: CalendarItem) => boolean) =>
    scheduled
      .filter(predicate)
      .reduce((total, item) => total + minutesWithinDay(item), 0);
  const total = sum(() => true);
  const deep = sum((item) => item.energyType === "deep_focus");
  const social = sum((item) => item.energyType === "social");
  const recovery = sum(
    (item) =>
      item.energyType === "recovery" || item.energyType === "movement",
  );
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
    if (
      previous &&
      gap <= 30 &&
      previous.energyType !== item.energyType
    ) {
      switches += 1;
    }
    if (item.energyType === "deep_focus") {
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
      if (!previous || previous.energyType !== "deep_focus" || gap > 15) {
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
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    durationMin,
    durationMax,
    deadline: input.deadline ?? null,
    windowStart: input.windowStart ?? null,
    windowEnd: input.windowEnd ?? null,
    energyType: input.energyType ?? "light_work",
    priority: input.priority ?? "medium",
    splittable: input.splittable ?? false,
    flexibility:
      input.flexibility ?? (input.kind === "event" ? "fixed" : "flexible"),
    constraints: input.constraints ?? [],
    assignmentId: input.assignmentId ?? null,
    assessmentId: input.assessmentId ?? null,
    revisionStage: input.revisionStage ?? null,
    reviewOffsetDays: input.reviewOffsetDays ?? null,
    learnedAt: input.learnedAt ?? null,
    homeworkCaptureId: input.homeworkCaptureId ?? null,
    taskContext: input.taskContext ?? "anywhere",
    computerRequired: input.computerRequired ?? false,
    workType: input.workType ?? null,
    requiredEnergy: input.requiredEnergy ?? "medium",
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
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    duration_min: item.durationMin,
    duration_max: item.durationMax,
    deadline: item.deadline,
    window_start: item.windowStart,
    window_end: item.windowEnd,
    energy_type: item.energyType,
    priority: item.priority,
    splittable: item.splittable,
    flexibility: item.flexibility,
    constraints: item.constraints,
    assignment_id: item.assignmentId,
    assessment_id: item.assessmentId,
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
    completed_at:
      item.status === "completed" ? new Date().toISOString() : null,
  };
}
