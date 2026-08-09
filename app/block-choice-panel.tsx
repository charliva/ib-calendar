"use client";

import {
  BatteryMedium,
  BookCheck,
  Check,
  ChevronRight,
  CircleStop,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  useRef,
  useState,
  type UIEvent,
} from "react";
import type {
  BlockChoice,
  BlockChoiceStatus,
  BlockSuggestion,
  BlockSuggestionCategory,
} from "@/lib/block-choices";

const categoryCopy: Record<
  BlockSuggestionCategory,
  { label: string; icon: typeof BatteryMedium }
> = {
  recovery: { label: "Light", icon: BatteryMedium },
  responsibility: { label: "Useful", icon: BookCheck },
  meaningful: { label: "Meaningful", icon: Sparkles },
};

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `~${hours} hr ${remainder} min` : `~${hours} hr`;
}

function SuggestionCard({
  suggestion,
  onSelect,
  onOpen,
}: {
  suggestion: BlockSuggestion;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const category = categoryCopy[suggestion.category];
  const Icon = category.icon;
  const canOpen = !["recovery", "generic"].includes(suggestion.sourceType);
  return (
    <article className={`block-path category-${suggestion.category}`}>
      <header>
        <span><Icon size={13} /> {category.label}</span>
        <time>{durationLabel(suggestion.estimatedDuration)}</time>
      </header>
      <h3>{suggestion.title}</h3>
      <p>{suggestion.description}</p>
      {suggestion.reason && <small>{suggestion.reason}</small>}
      <footer>
        <button type="button" className="path-select" onClick={onSelect}>
          Choose this path <ChevronRight size={14} />
        </button>
        {canOpen && (
          <button type="button" className="path-open" onClick={onOpen}>
            Open source
          </button>
        )}
      </footer>
    </article>
  );
}

export function BlockChoicePanel({
  choice,
  onSelect,
  onStatus,
  onChange,
  onOpen,
}: {
  choice: BlockChoice;
  onSelect: (suggestion: BlockSuggestion) => void;
  onStatus: (status: BlockChoiceStatus) => void;
  onChange: () => void;
  onOpen: (suggestion: BlockSuggestion) => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activePath, setActivePath] = useState(0);
  const selected = choice.suggestions.find(
    (suggestion) => suggestion.id === choice.selectedSuggestionId,
  );
  return (
    <section className="block-choice" aria-label="Choose a path for this time block">
      <header className="block-choice-heading">
        <div>
          <span className="attention-eyebrow">{choice.context.label}</span>
          <h2>{selected ? "Your direction" : "Choose your path"}</h2>
        </div>
        <time>{formatClock(choice.startsAt)}–{formatClock(choice.endsAt)}</time>
      </header>

      {selected ? (
        <article className={`block-selected category-${selected.category}`}>
          <div>
            <span>{categoryCopy[selected.category].label} · {durationLabel(selected.estimatedDuration)}</span>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
          </div>
          <strong className={`block-status status-${choice.status}`}>
            {choice.status === "completed" ? <Check size={13} /> : null}
            {choice.status}
          </strong>
          <footer>
            {choice.status === "selected" && (
              <button type="button" className="path-primary" onClick={() => onStatus("started")}>
                Start this path
              </button>
            )}
            {choice.status === "started" && (
              <button type="button" className="path-primary" onClick={() => onStatus("completed")}>
                <Check size={14} /> Done
              </button>
            )}
            {!["completed", "skipped"].includes(choice.status) && (
              <button type="button" onClick={() => onStatus("skipped")}>
                <CircleStop size={14} /> Skip
              </button>
            )}
            <button type="button" onClick={onChange}>
              <RotateCcw size={14} /> Change
            </button>
            {!["recovery", "generic"].includes(selected.sourceType) && (
              <button type="button" onClick={() => onOpen(selected)}>Open source</button>
            )}
          </footer>
        </article>
      ) : (
        <>
        <div
          className="block-paths block-path-carousel"
          ref={carouselRef}
          onScroll={(event: UIEvent<HTMLDivElement>) => {
            const element = event.currentTarget;
            const cardWidth = element.firstElementChild?.getBoundingClientRect().width ?? element.clientWidth;
            if (cardWidth > 0) {
              setActivePath(Math.max(0, Math.min(2, Math.round(element.scrollLeft / cardWidth))));
            }
          }}
        >
          {choice.suggestions.slice(0, 3).map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onSelect={() => onSelect(suggestion)}
              onOpen={() => onOpen(suggestion)}
            />
          ))}
        </div>
        <div className="block-carousel-pagination" aria-label={`Path ${activePath + 1} of 3`}>
          {choice.suggestions.slice(0, 3).map((suggestion, index) => (
            <button
              className={activePath === index ? "active" : ""}
              type="button"
              key={suggestion.id}
              aria-label={`Show ${categoryCopy[suggestion.category].label} path`}
              onClick={() => {
                const card = carouselRef.current?.children[index] as HTMLElement | undefined;
                card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
                setActivePath(index);
              }}
            />
          ))}
          <span>Swipe for three paths</span>
        </div>
        </>
      )}
      <p className="block-choice-note">Choosing one is enough. This does not reserve the whole block or create a rigid event.</p>
    </section>
  );
}
