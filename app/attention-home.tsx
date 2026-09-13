"use client";

import {
  ArrowRight,
  CalendarDays,
  Command,
  MapPin,
  Play,
  Sparkles,
} from "lucide-react";
import type { FormEvent } from "react";
import type { AttentionCard, AttentionSnapshot } from "@/lib/attention-engine";
import { BlockChoicePanel } from "@/app/block-choice-panel";
import type {
  BlockChoice,
  BlockChoiceStatus,
  BlockSuggestion,
} from "@/lib/block-choices";

function BriefingRow({
  card,
  onOpen,
}: {
  card: AttentionCard;
  onOpen: (card: AttentionCard) => void;
}) {
  return (
    <button className="briefing-row" type="button" onClick={() => onOpen(card)}>
      <time>{card.detail}</time>
      <span>
        <strong>{card.title}</strong>
        <small>{card.room ? `Room ${card.room}` : card.reason}</small>
      </span>
      <ArrowRight size={16} />
    </button>
  );
}

export function AttentionHome({
  snapshot,
  now,
  loading,
  commandText,
  commandBusy,
  intentionCount,
  onCommandChange,
  onCommandSubmit,
  onOpenCommand,
  onOpenCard,
  onStartRecommendation,
  onStartIntention,
  onOpenIntentions,
  onOpenCalendar,
  blockChoice,
  onSelectBlockSuggestion,
  onBlockStatus,
  onChangeBlockSuggestion,
  onOpenBlockSuggestion,
}: {
  blockChoice: BlockChoice | null;
  onSelectBlockSuggestion: (suggestion: BlockSuggestion) => void;
  onBlockStatus: (status: BlockChoiceStatus) => void;
  onChangeBlockSuggestion: () => void;
  onOpenBlockSuggestion: (suggestion: BlockSuggestion) => void;
  snapshot: AttentionSnapshot;
  now: Date;
  loading: boolean;
  commandText: string;
  commandBusy: boolean;
  intentionCount: number;
  onCommandChange: (value: string) => void;
  onCommandSubmit: (event: FormEvent) => void;
  onOpenCommand: () => void;
  onOpenCard: (card: AttentionCard) => void;
  onStartRecommendation: () => void;
  onStartIntention: () => void;
  onOpenIntentions: () => void;
  onOpenCalendar: () => void;
}) {
  const remaining = snapshot.todayClasses.filter(
    (card) => new Date(card.endsAt!) > now,
  );
  const currentClass = remaining.find(
    (card) => new Date(card.startsAt!) <= now,
  );
  const primary = currentClass || remaining[0] || snapshot.now || snapshot.next;
  const school = remaining.length > 0;
  const minutes = currentClass
    ? Math.max(
        1,
        Math.ceil(
          (new Date(currentClass.endsAt!).getTime() - now.getTime()) / 60000,
        ),
      )
    : null;
  const nextClasses = remaining.filter((card) => card.id !== primary?.id);
  return (
    <section
      className="attention-home briefing"
      aria-label="Attention home"
      aria-busy={loading}
    >
      <header className="briefing-heading">
        <div>
          <p>Your day, in view</p>
          <h1>
            {now.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h1>
        </div>
        <button type="button" onClick={onOpenCalendar}>
          Plan the week <ArrowRight size={16} />
        </button>
      </header>
      <form className="attention-command" onSubmit={onCommandSubmit}>
        <Command size={18} />
        <input
          value={commandText}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder="Add anything. Just type it."
          aria-label="Natural-language command"
        />
        <button
          type="button"
          onClick={onOpenCommand}
          aria-label="Open full command palette"
        >
          <kbd>⌘K</kbd>
        </button>
        <button type="submit" disabled={!commandText.trim() || commandBusy}>
          {commandBusy ? "Adding…" : "Add"}
        </button>
      </form>
      {loading ? (
        <div className="briefing-skeleton" role="status">
          Loading your day…
        </div>
      ) : (
        <>
          <div className="briefing-columns">
            <section className="briefing-main">
              <article className="briefing-current">
                <div className="briefing-current-label">
                  <span>
                    {currentClass
                      ? "In class"
                      : school
                        ? "Next class"
                        : primary
                          ? "Your focus"
                          : "A little breathing room"}
                  </span>
                  <time>
                    {minutes ? `${minutes} min left` : primary?.detail}
                  </time>
                </div>
                <h2>{primary?.title || "This time can stay free."}</h2>
                {school ? (
                  <p className="briefing-room">
                    <MapPin size={20} />
                    {primary?.room ? `Room ${primary.room}` : "Room not set"}
                    <span>{primary?.detail}</span>
                  </p>
                ) : (
                  <p>
                    {primary?.reason ||
                      "Nothing needs you immediately. Keep the space, or make a plan."}
                  </p>
                )}
                {primary && (
                  <button
                    className="briefing-primary-action"
                    type="button"
                    onClick={() =>
                      primary.source === "recommendation"
                        ? onStartRecommendation()
                        : primary.source === "intention"
                          ? onStartIntention()
                          : onOpenCard(primary)
                    }
                  >
                    {primary.source === "recommendation" ||
                    primary.source === "intention" ? (
                      <>
                        <Play size={15} /> Start
                      </>
                    ) : (
                      <>
                        View details <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                )}
              </article>
              <section className="briefing-section">
                <header>
                  <h2>{school ? "Still to come" : "The rest of today"}</h2>
                  <span>
                    {school
                      ? `${nextClasses.length} ${nextClasses.length === 1 ? "class" : "classes"}`
                      : "Schedule"}
                  </span>
                </header>
                {school ? (
                  nextClasses.length ? (
                    nextClasses.map((card) => (
                      <BriefingRow
                        key={card.id}
                        card={card}
                        onOpen={onOpenCard}
                      />
                    ))
                  ) : (
                    <p className="briefing-empty">
                      Your last class of the day.
                    </p>
                  )
                ) : (
                  snapshot.obligations
                    .filter(
                      (card) =>
                        card.source === "calendar_item" &&
                        card.id !== primary?.id,
                    )
                    .map((card) => (
                      <BriefingRow
                        key={card.id}
                        card={card}
                        onOpen={onOpenCard}
                      />
                    ))
                )}
                {!school &&
                  !snapshot.obligations.some(
                    (card) =>
                      card.source === "calendar_item" &&
                      card.id !== primary?.id,
                  ) && (
                    <p className="briefing-empty">
                      No more scheduled commitments today.
                    </p>
                  )}
              </section>
            </section>
            <aside className="briefing-work">
              <section className="briefing-section">
                <header>
                  <h2>{school ? "After school" : "On your mind"}</h2>
                  <span>Work & deadlines</span>
                </header>
                {snapshot.obligations.filter(
                  (card) => school || card.source !== "calendar_item",
                ).length ? (
                  snapshot.obligations
                    .filter((card) => school || card.source !== "calendar_item")
                    .map((card) => (
                      <BriefingRow
                        key={card.id}
                        card={card}
                        onOpen={onOpenCard}
                      />
                    ))
                ) : (
                  <p className="briefing-empty">
                    Nothing pressing. New assignments will appear here.
                  </p>
                )}
              </section>
              <div className="briefing-note">
                <span className="briefing-note-mark" />
                <p>
                  A plan with room to change.
                  <br />
                  <small>Your free time can stay free.</small>
                </p>
              </div>
            </aside>
          </div>
        </>
      )}
      {blockChoice && (
        <details className="briefing-alternatives">
          <summary>Other possibilities for this time</summary>
          <BlockChoicePanel
            choice={blockChoice}
            onSelect={onSelectBlockSuggestion}
            onStatus={onBlockStatus}
            onChange={onChangeBlockSuggestion}
            onOpen={onOpenBlockSuggestion}
          />
        </details>
      )}
      <footer className="attention-footer">
        <button type="button" onClick={onOpenIntentions}>
          <Sparkles size={15} /> Intentions <span>{intentionCount}</span>
        </button>
        <button type="button" onClick={onOpenCalendar}>
          <CalendarDays size={15} /> Open calendar
        </button>
      </footer>
    </section>
  );
}
