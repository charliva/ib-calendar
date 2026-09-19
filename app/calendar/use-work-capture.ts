import {
  dateKey,
  makeItem,
  validatePlacement,
  type CalendarItem,
} from "@/lib/calendar-engine";
import {
  looksLikeHomeworkCommand,
  parseHomework,
  parseReviewSession,
} from "@/lib/homework-parser";
import type { Subject } from "@/lib/school";

type WorkCaptureParams = {
  items: CalendarItem[];
  subjects: Subject[];
  createItem: (item: CalendarItem) => void;
  setNotice: (notice: string) => void;
  setSelectedDay: (day: string) => void;
};

/**
 * One-line text capture. The text is parsed as a review session first, then as
 * homework, and falls back to a plain task; a capture that resolves to a time
 * is validated against the existing calendar before it is allowed to land.
 */
export function useWorkCapture({
  items,
  subjects,
  createItem,
  setNotice,
  setSelectedDay,
}: WorkCaptureParams) {
  function createWorkItemFromText(rawText: string) {
    const review = parseReviewSession(rawText, subjects, new Date());
    const homework = parseHomework(rawText, subjects, new Date());
    const isHomework = looksLikeHomeworkCommand(rawText, homework);
    const item = review
      ? makeItem({
          kind: "task",
          title: review.title,
          subjectId: review.subjectId,
          startsAt: review.startsAt,
          endsAt: review.endsAt,
          durationMin: review.durationMinutes,
          durationMax: review.durationMinutes,
          deadline: review.deadline,
          energyType: "deep_focus",
          workType: "deep_focus",
          requiredEnergy: "medium",
          flexibility: "flexible",
          workItemType: "review",
          status: review.startsAt ? "scheduled" : "inbox",
          source: "command",
        })
      : makeItem({
          kind: "task",
          title: isHomework ? homework.title : rawText.trim(),
          description: isHomework ? homework.rawText : "",
          subjectId: isHomework ? homework.subjectId : null,
          durationMin: isHomework ? homework.estimatedMinutes : 30,
          durationMax: isHomework ? homework.estimatedMinutes : 30,
          deadline: isHomework ? homework.deadline : null,
          energyType:
            isHomework &&
            (homework.taskType === "reading" ||
              homework.taskType === "vocabulary")
              ? "light_work"
              : "deep_focus",
          workType:
            homework.taskType === "reading"
              ? "reading"
              : homework.taskType === "vocabulary"
                ? "memorization"
                : homework.taskType === "practice"
                  ? "problem_solving"
                  : homework.taskType === "writing" ||
                      homework.taskType === "project"
                    ? "creative_project"
                    : homework.taskType === "revision"
                      ? "deep_focus"
                      : null,
          requiredEnergy:
            homework.taskType === "practice" ||
            homework.taskType === "writing" ||
            homework.taskType === "project"
              ? "high"
              : homework.taskType === "reading" ||
                  homework.taskType === "vocabulary"
                ? "low"
                : "medium",
          flexibility: "flexible",
          workItemType: isHomework ? "homework" : "task",
          status: "inbox",
          source: "command",
        });
    if (item.startsAt && item.endsAt) {
      const validation = validatePlacement(item, item.startsAt, item.endsAt, items);
      if (!validation.valid) {
        setNotice(validation.errors[0]);
        return;
      }
      setSelectedDay(dateKey(new Date(item.startsAt)));
    }
    void createItem(item);
    setNotice(
      item.startsAt
        ? `Scheduled “${item.title}” instantly.`
        : `Added “${item.title}” to Work queue.`,
    );
  }
  return { createWorkItemFromText };
}
