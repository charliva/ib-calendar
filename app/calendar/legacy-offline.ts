// Migration for calendar state saved before homework captures became ordinary
// work items. It runs against whatever is already in IndexedDB on this device,
// so it has to stay tolerant of shapes that no longer exist in the code.
import { makeItem, type CalendarItem } from "@/lib/calendar-engine";
import { normalizeItemTiming } from "@/lib/calendar/scheduling";

type LegacyOfflineState = {
  homeworkCaptures?: unknown;
  ownerKey?: string;
};

type LegacyCalendarItem = CalendarItem & {
  homeworkCaptureId?: unknown;
};

function legacyHomeworkWorkType(value: unknown): CalendarItem["workType"] {
  switch (value) {
    case "reading":
      return "reading";
    case "vocabulary":
      return "memorization";
    case "practice":
      return "problem_solving";
    case "writing":
    case "project":
      return "creative_project";
    case "revision":
      return "deep_focus";
    default:
      return null;
  }
}

function inferredLegacyWorkItemType(
  item: CalendarItem,
  hasLegacyHomeworkLink: boolean,
) {
  if (item.workItemType === "homework" || item.workItemType === "review")
    return item.workItemType;
  if (hasLegacyHomeworkLink) return "homework" as const;
  if (
    item.kind === "task" &&
    /(?:^|[-:]\s*)review session\b/i.test(item.title)
  ) {
    return "review" as const;
  }
  return item.workItemType ?? undefined;
}

function promoteLegacyOfflineHomework(
  storedItems: CalendarItem[],
  stored: LegacyOfflineState,
) {
  const changed = new Map<string, CalendarItem>();
  const items = storedItems.map((item) => {
    const legacyItem = item as LegacyCalendarItem;
    const hasLegacyHomeworkLink =
      typeof legacyItem.homeworkCaptureId === "string" &&
      legacyItem.homeworkCaptureId.length > 0;
    const inferredType = inferredLegacyWorkItemType(
      item,
      hasLegacyHomeworkLink,
    );
    const promoted = normalizeItemTiming(
      makeItem({
        ...item,
        workItemType: inferredType,
      }),
    );
    if (
      hasLegacyHomeworkLink ||
      (inferredType !== undefined && inferredType !== item.workItemType)
    ) {
      changed.set(promoted.id, promoted);
    }
    return promoted;
  });
  const knownIds = new Set(items.map((item) => item.id));
  const captures = Array.isArray(stored.homeworkCaptures)
    ? stored.homeworkCaptures
    : [];

  for (const rawCapture of captures) {
    if (!rawCapture || typeof rawCapture !== "object") continue;
    const capture = rawCapture as Record<string, unknown>;
    const id = typeof capture.id === "string" ? capture.id : "";
    if (!id || knownIds.has(id)) continue;
    const title =
      typeof capture.title === "string" && capture.title.trim()
        ? capture.title.trim()
        : typeof capture.rawText === "string" && capture.rawText.trim()
          ? capture.rawText.trim()
          : "Homework";
    const minutes = Math.max(
      5,
      Math.min(720, Math.round(Number(capture.estimatedMinutes) || 30)),
    );
    const legacyStatus = capture.status;
    const status =
      legacyStatus === "completed"
        ? "completed"
        : legacyStatus === "converted" || legacyStatus === "archived"
          ? "archived"
          : "inbox";
    const taskType = capture.taskType;
    const item = makeItem({
      id,
      kind: "task",
      title,
      description:
        typeof capture.rawText === "string" ? capture.rawText : title,
      subjectId: typeof capture.subjectId === "string" ? capture.subjectId : null,
      deadline: typeof capture.deadline === "string" ? capture.deadline : null,
      durationMin: minutes,
      durationMax: minutes,
      energyType:
        taskType === "reading" || taskType === "vocabulary"
          ? "light_work"
          : "deep_focus",
      workType: legacyHomeworkWorkType(taskType),
      requiredEnergy:
        taskType === "practice" || taskType === "writing" || taskType === "project"
          ? "high"
          : taskType === "reading" || taskType === "vocabulary"
            ? "low"
            : "medium",
      workItemType: "homework",
      status,
      createdAt:
        typeof capture.createdAt === "string"
          ? capture.createdAt
          : new Date().toISOString(),
    });
    items.push(item);
    knownIds.add(id);
    changed.set(id, item);
  }

  return { items, changed: [...changed.values()] };
}

export type { LegacyOfflineState };
export { promoteLegacyOfflineHomework };
