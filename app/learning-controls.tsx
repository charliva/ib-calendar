"use client";

import { ArrowDown, ArrowUp, Brain, CircleHelp, Sparkles } from "lucide-react";
import type { ChallengeLevel, LearningSource } from "@/lib/study-intelligence";

const options: Array<{ value: ChallengeLevel; label: string; icon: typeof ArrowUp; key: string }> = [
  { value: "too_easy", label: "Too easy", icon: ArrowDown, key: "1" },
  { value: "good_challenge", label: "Good challenge", icon: Sparkles, key: "2" },
  { value: "difficult", label: "Difficult", icon: ArrowUp, key: "3" },
  { value: "not_understood", label: "Not understood yet", icon: CircleHelp, key: "4" },
];

export function LearningControls({ source, value, onChallenge, onGoDeeper, compact = false }: {
  source: LearningSource;
  value: ChallengeLevel | null;
  onChallenge: (source: LearningSource, value: ChallengeLevel) => void;
  onGoDeeper: (source: LearningSource) => void;
  compact?: boolean;
}) {
  return (
    <div className={`learning-controls ${compact ? "is-compact" : ""}`}>
      <span className="learning-controls-label">Challenge</span>
      <div className="challenge-dial" role="group" aria-label={`Challenge level for ${source.title}`}>
        {options.map(({ value: option, label, icon: Icon, key }) => (
          <button
            className={value === option ? "active" : ""}
            type="button"
            key={option}
            title={`${label} (${key})`}
            aria-label={label}
            aria-pressed={value === option}
            onClick={() => onChallenge(source, option)}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <button className="go-deeper-button" type="button" onClick={() => onGoDeeper(source)}>
        <Brain size={14} /> Go deeper
      </button>
    </div>
  );
}
