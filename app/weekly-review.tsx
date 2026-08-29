"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CircleHelp,
  Sparkles,
  X,
} from "lucide-react";
import type { CalendarItem } from "@/lib/calendar-engine";
import type { Subject } from "@/lib/school";
import type { ChallengeLevel, LearningSignal } from "@/lib/study-intelligence";

type ReviewEntry = {
  id: string;
  title: string;
  kind: "Class" | "Assignment" | "Test";
  detail: string;
  subjectId: string | null;
  subjectName: string;
  subjectColor: string;
  date: string;
};

type Props = {
  items: CalendarItem[];
  subjects: Subject[];
  learningSignals: LearningSignal[];
  onChallenge: (sourceId: string, value: ChallengeLevel) => void;
  onSavePlan: (items: Array<{ title: string; subjectId: string | null; durationMin: number }>) => void;
  onClose: () => void;
};

const challengeOptions: Array<{ value: ChallengeLevel; label: string; icon: typeof ArrowDown }> = [
  { value: "too_easy", label: "Easy", icon: ArrowDown },
  { value: "good_challenge", label: "Good", icon: Sparkles },
  { value: "difficult", label: "Hard", icon: ArrowUp },
  { value: "not_understood", label: "Lost", icon: CircleHelp },
];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 7);
  return d;
}

function challengeScore(value: ChallengeLevel) {
  return { too_easy: 1, good_challenge: 2, difficult: 3, not_understood: 4 }[value] || 0;
}

export function WeeklyReview({ items, subjects, learningSignals, onChallenge, onSavePlan, onClose }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"receipt" | "plan">("receipt");

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekEnd = useMemo(() => endOfWeek(new Date()), []);

  const entries = useMemo<ReviewEntry[]>(() => {
    const result: ReviewEntry[] = [];
    for (const item of items) {
      if (!item.subjectId) continue;
      const subject = subjects.find((s) => s.id === item.subjectId);
      if (!subject) continue;
      const date = item.startsAt ?? item.deadline;
      if (!date) continue;
      const d = new Date(date);
      if (d < weekStart || d >= weekEnd) continue;
      if (item.kind === "event" && item.status === "completed") {
        result.push({
          id: item.id,
          title: item.title,
          kind: "Class",
          detail: `${item.durationMin} min`,
          subjectId: item.subjectId,
          subjectName: subject.name,
          subjectColor: subject.color,
          date,
        });
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [items, subjects, weekStart, weekEnd]);

  const planItems = useMemo(() => {
    const subjectGroups = new Map<string | null, ReviewEntry[]>();
    for (const entry of entries) {
      const key = entry.subjectId;
      if (!subjectGroups.has(key)) subjectGroups.set(key, []);
      subjectGroups.get(key)?.push(entry);
    }
    const results: Array<{ title: string; subjectId: string | null; durationMin: number; detail: string }> = [];
    for (const [subjectId, group] of subjectGroups) {
      const rated = group.filter((entry) => {
        const signal = learningSignals.find(
          (s) => s.sourceType === "calendar_item" && s.sourceId === entry.id,
        );
        return signal !== undefined;
      });
      if (!rated.length) continue;
      const avg = rated.reduce((sum, entry) => {
        const signal = learningSignals.find(
          (s) => s.sourceType === "calendar_item" && s.sourceId === entry.id,
        );
        return sum + challengeScore(signal?.challengeLevel ?? "good_challenge");
      }, 0) / rated.length;
      const subject = subjects.find((s) => s.id === subjectId);
      if (!subject) continue;
      if (avg >= 3.5) {
        results.push({ title: subject.name, subjectId, durationMin: 50, detail: "Two short sessions: concept repair, then guided practice." });
      } else if (avg >= 2.5) {
        results.push({ title: subject.name, subjectId, durationMin: 30, detail: "One retrieval session before the next lesson." });
      } else if (avg >= 1.5) {
        results.push({ title: subject.name, subjectId, durationMin: 20, detail: "Light maintenance to keep the topic active." });
      } else {
        results.push({ title: subject.name, subjectId, durationMin: 25, detail: "Extend with a harder problem set or depth reading." });
      }
    }
    return results;
  }, [entries, learningSignals, subjects]);

  const ratedCount = entries.filter((entry) =>
    learningSignals.some((s) => s.sourceType === "calendar_item" && s.sourceId === entry.id),
  ).length;

  return (
    <div className="weekly-review-overlay" role="dialog" aria-label="Weekly review">
      <div className="weekly-review-panel">
        <header className="weekly-review-header">
          <div>
            <span className="micro-label">Weekly review</span>
            <h2>
              {mode === "receipt" ? "This week's receipt" : "Draft study plan"}
            </h2>
            <p>
              {mode === "receipt"
                ? "Tap any line to rate how challenging it was."
                : "Generated from your ratings. Nothing is scheduled until you save."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close weekly review">
            <X size={16} />
          </button>
        </header>

        <div className="weekly-review-body">
          {mode === "receipt" ? (
            entries.length === 0 ? (
              <div className="weekly-review-empty">
                <p>No completed classes this week yet.</p>
              </div>
            ) : (
              <div className="receipt-list">
                {entries.map((entry) => {
                  const signal = learningSignals.find(
                    (s) => s.sourceType === "calendar_item" && s.sourceId === entry.id,
                  );
                  const value = signal?.challengeLevel ?? null;
                  const isOpen = openId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className={`receipt-row${isOpen ? " open" : ""}`}
                      style={{ ["--subject" as string]: entry.subjectColor }}
                      onClick={() => setOpenId(isOpen ? null : entry.id)}
                    >
                      <div className="receipt-meta">
                        <div className="receipt-title">
                          <div>
                            <b>{entry.title}</b>
                            <small className="receipt-meta-line">
                              <span className="subject-label">{entry.subjectName}</span>
                              <span>{entry.kind}</span>
                              <span>{entry.detail}</span>
                            </small>
                          </div>
                        </div>
                        <div className="receipt-right">
                          {value ? (
                            <span className={`stamp ${value}`}>{challengeOptions.find((o) => o.value === value)?.label}</span>
                          ) : (
                            <span className="receipt-unrated">Unrated</span>
                          )}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="receipt-rating">
                          {challengeOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`chip${value === option.value ? " on" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onChallenge(entry.id, option.value);
                                const idx = entries.findIndex((en) => en.id === entry.id);
                                setOpenId(entries[idx + 1]?.id ?? null);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            planItems.length === 0 ? (
              <div className="weekly-review-empty">
                <p>Rate some items first to generate a study plan.</p>
              </div>
            ) : (
              <div className="plan-rows">
                {planItems.map((plan, index) => (
                  <div key={index} className="plan-row">
                    <div>
                      <b>{plan.title}</b>
                      <span>{plan.detail}</span>
                    </div>
                    <span className="duration">{plan.durationMin} min</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {mode === "receipt" && ratedCount > 0 && (
          <p className="review-progress">{ratedCount} / {entries.length} rated</p>
        )}
      </div>

      <div className="bottom-dock">
        {mode === "plan" && (
          <button
            type="button"
            className="dock-back"
            onClick={() => setMode("receipt")}
            aria-label="Back to review"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <button
          type="button"
          className="dock-primary"
          onClick={() => {
            if (mode === "receipt") {
              setMode("plan");
            } else {
              onSavePlan(planItems.map(({ title, subjectId, durationMin }) => ({ title, subjectId, durationMin })));
              onClose();
            }
          }}
          disabled={mode === "plan" && planItems.length === 0}
        >
          {mode === "receipt" ? "Generate study plan" : "Save draft"}
        </button>
      </div>
    </div>
  );
}
