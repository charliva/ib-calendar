"use client";

import { CalendarDays, ChevronRight, Command, Play, Sparkles } from "lucide-react";
import type { FormEvent } from "react";
import type { AttentionCard, AttentionSnapshot } from "@/lib/attention-engine";
import type { BlockChoice, BlockChoiceStatus, BlockSuggestion } from "@/lib/block-choices";
import { BlockChoicePanel } from "@/app/block-choice-panel";

function AttentionItem({ card, onOpen }: { card: AttentionCard; onOpen: (card: AttentionCard) => void }) {
  return (
    <button className="attention-item" type="button" onClick={() => onOpen(card)}>
      <span>
        <small>{card.label}</small>
        <strong>{card.title}</strong>
        <p>{card.reason}</p>
      </span>
      <time>{card.detail}</time>
      <ChevronRight size={16} />
    </button>
  );
}

export function AttentionHome({
  snapshot,
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
  snapshot: AttentionSnapshot;
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
  blockChoice: BlockChoice | null;
  onSelectBlockSuggestion: (suggestion: BlockSuggestion) => void;
  onBlockStatus: (status: BlockChoiceStatus) => void;
  onChangeBlockSuggestion: () => void;
  onOpenBlockSuggestion: (suggestion: BlockSuggestion) => void;
}) {
  return (
    <section className="attention-home" aria-label="Attention home">
      <form className="attention-command" onSubmit={onCommandSubmit}>
        <Command size={18} />
        <input
          value={commandText}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder="Tell Syllabi what you need…"
          aria-label="Natural-language command"
        />
        <button type="button" onClick={onOpenCommand} aria-label="Open full command palette"><kbd>⌘K</kbd></button>
        <button type="submit" disabled={!commandText.trim() || commandBusy}>{commandBusy ? "Thinking…" : "Go"}</button>
      </form>

      <div className="attention-primary">
        <span className="attention-eyebrow">Now</span>
        {snapshot.now ? (
          <article className="attention-now">
            <div>
              <small>{snapshot.now.label}</small>
              <h1>{snapshot.now.title}</h1>
              <p>{snapshot.now.reason}</p>
            </div>
            <strong>{snapshot.now.detail}</strong>
            {snapshot.now.source === "recommendation" && snapshot.recommendation ? (
              <button type="button" onClick={onStartRecommendation}><Play size={15} fill="currentColor" /> {snapshot.recommendation.source === "exploration" ? "Go deeper" : "Start"}</button>
            ) : snapshot.now.source === "intention" && snapshot.intentionOpportunity ? (
              <button type="button" onClick={onStartIntention}><Play size={15} fill="currentColor" /> Begin gently</button>
            ) : (
              <button type="button" onClick={() => onOpenCard(snapshot.now!)}>Open <ChevronRight size={15} /></button>
            )}
          </article>
        ) : (
          <article className="attention-now attention-clear">
            <div><small>Nothing needs you immediately</small><h1>This time can stay free.</h1><p>There is no obligation to optimize every gap.</p></div>
          </article>
        )}
      </div>

      {blockChoice && (
        <BlockChoicePanel
          choice={blockChoice}
          onSelect={onSelectBlockSuggestion}
          onStatus={onBlockStatus}
          onChange={onChangeBlockSuggestion}
          onOpen={onOpenBlockSuggestion}
        />
      )}

      <div className="attention-secondary">
        <section>
          <span className="attention-eyebrow">Next</span>
          {snapshot.next ? <AttentionItem card={snapshot.next} onOpen={onOpenCard} /> : <p className="attention-empty">Nothing meaningful is queued next.</p>}
        </section>
        <section>
          <span className="attention-eyebrow">Later</span>
          <div className="attention-later">
            {snapshot.later.length ? snapshot.later.slice(0, 4).map((card) => <AttentionItem key={card.id} card={card} onOpen={onOpenCard} />) : <p className="attention-empty">Later is deliberately quiet.</p>}
          </div>
        </section>
      </div>

      <footer className="attention-footer">
        <button type="button" onClick={onOpenIntentions}><Sparkles size={15} /> Intentions <span>{intentionCount}</span></button>
        <button type="button" onClick={onOpenCalendar}><CalendarDays size={15} /> Open calendar</button>
        <small>{snapshot.freeTimeIsValid ? `${snapshot.availableMinutes} minutes available — leaving it free is also valid.` : "Your next fixed event is close."}</small>
      </footer>
    </section>
  );
}
