"use client";

import { Pause, Play, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { TemporalField } from "@/app/ui/temporal-field";
import { makeIntention, intentionProgress, type Intention } from "@/lib/intentions";
import type { CalendarItem } from "@/lib/calendar-engine";
import type { Subject } from "@/lib/school";
import { LearningControls } from "@/app/learning-controls";
import { latestSignalFor, type ChallengeLevel, type LearningSignal, type LearningSource } from "@/lib/study-intelligence";

export function IntentionsPanel({ open, intentions, subjects, items, learningSignals, seed, onClose, onSave, onDelete, onStart, onChallenge, onGoDeeper }: {
  open: boolean;
  intentions: Intention[];
  subjects: Subject[];
  items: CalendarItem[];
  learningSignals: LearningSignal[];
  seed: Partial<Intention> | null;
  onClose: () => void;
  onSave: (intention: Intention) => void;
  onDelete: (intention: Intention) => void;
  onStart: (intention: Intention) => void;
  onChallenge: (source: LearningSource, level: ChallengeLevel) => void;
  onGoDeeper: (source: LearningSource) => void;
}) {
  const [draft, setDraft] = useState<Intention | null>(() =>
    seed ? makeIntention({ title: seed.title ?? "", ...seed }) : null,
  );
  if (!open) return null;
  const active = intentions.filter((entry) => entry.status !== "archived");
  return (
    <div className="panel-scrim intention-scrim" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <aside className="intentions-panel" aria-label="Intentions">
        <header><div><span className="micro-label">Flexible direction</span><h2>Intentions</h2><p>Things you want to make happen, not fixed commitments.</p></div><button type="button" onClick={onClose} aria-label="Close intentions"><X size={17} /></button></header>
        {draft ? (
          <form onSubmit={(event) => { event.preventDefault(); if (!draft.title.trim()) return; onSave({ ...draft, title: draft.title.trim() }); setDraft(null); }}>
            <label>What do you want to make happen?<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Understand organic chemistry better" /></label>
            <div className="intention-form-grid">
              <label>Cadence<select value={draft.cadence} onChange={(event) => setDraft({ ...draft, cadence: event.target.value as Intention["cadence"] })}><option value="flexible">Flexible</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
              <label>Preferred block<input type="number" min="5" max="240" step="5" value={draft.preferredSessionMinutes} onChange={(event) => setDraft({ ...draft, preferredSessionMinutes: Number(event.target.value) })} /></label>
              <label>Subject<select value={draft.subjectId ?? ""} onChange={(event) => setDraft({ ...draft, subjectId: event.target.value || null })}><option value="">Any subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
              <label>By when<TemporalField mode="date" value={draft.horizonEnd ?? ""} onChange={(value) => setDraft({ ...draft, horizonEnd: value || null })} ariaLabel="Intention horizon" /></label>
            </div>
            <label>Why / useful context<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="What would progress look like?" /></label>
            <div className="intention-form-actions"><button type="button" onClick={() => setDraft(null)}>Cancel</button><button type="submit">Save intention</button></div>
          </form>
        ) : (
          <>
            <button className="intention-new" type="button" onClick={() => setDraft(makeIntention({ title: "" }))}><Plus size={15} /> New intention</button>
            <div className="intention-list">
              {active.length ? active.map((intention) => { const progress = intentionProgress(intention, items); const source: LearningSource = { type: "intention", id: intention.id, title: intention.title, subjectId: intention.subjectId, subjectName: subjects.find((subject) => subject.id === intention.subjectId)?.name ?? null, context: intention.notes }; return (
                <article key={intention.id} className={intention.status === "paused" ? "is-paused" : ""}>
                  <button className="intention-copy" type="button" onClick={() => setDraft(intention)}><small>{intention.cadence} · {progress.completedMinutes}/{intention.targetMinutes} min</small><strong>{intention.title}</strong><p>{intention.notes || "Open to shape this intention."}</p></button>
                  <div><button type="button" onClick={() => onStart(intention)} disabled={intention.status !== "active"} aria-label={`Start ${intention.title}`}><Play size={14} /></button><button type="button" onClick={() => onSave({ ...intention, status: intention.status === "paused" ? "active" : "paused" })} aria-label={intention.status === "paused" ? "Resume" : "Pause"}>{intention.status === "paused" ? <Sparkles size={14} /> : <Pause size={14} />}</button><button type="button" onClick={() => onDelete(intention)} aria-label="Archive intention"><Trash2 size={14} /></button></div>
                  <LearningControls compact source={source} value={latestSignalFor(source, learningSignals)?.challengeLevel ?? null} onChallenge={onChallenge} onGoDeeper={onGoDeeper} />
                </article>
              ); }) : <div className="intentions-empty"><Sparkles size={22} /><h3>No active intentions</h3><p>Capture a direction. Syllabi will suggest opportunities without filling your calendar.</p></div>}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
