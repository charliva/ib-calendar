import type { CalendarItem } from "@/lib/calendar-engine";

// The projection of a work item sent to the command endpoint. Keeping it
// explicit means local-only fields never leak into a model prompt.
function commandItem(item: CalendarItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    durationMin: item.durationMin,
    durationMax: item.durationMax,
    deadline: item.deadline,
    windowStart: item.windowStart,
    windowEnd: item.windowEnd,
    energyType: item.energyType,
    energyUsage: item.energyUsage,
    priority: item.priority,
    splittable: item.splittable,
    flexibility: item.flexibility,
    constraints: item.constraints,
    description: item.description,
    room: item.room,
    subjectId: item.subjectId,
    assignmentId: item.assignmentId,
    workItemType: item.workItemType,
    taskContext: item.taskContext,
    computerRequired: item.computerRequired,
    status: item.status,
  };
}

export { commandItem };
