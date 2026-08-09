"use client";

import { BookOpen, Brain, Check, LoaderCircle, Play, RefreshCw, Sparkles, X } from "lucide-react";
import type { Exploration, ExplorationDirection, LearningSource } from "@/lib/study-intelligence";

const kindLabels: Record<ExplorationDirection["kind"], string> = {
  why: "Why it works",
  connection: "Connection",
  harder_problem: "Harder problem",
  application: "Application",
  edge_case: "Edge case",
  teacher_question: "Ask your teacher",
  understanding_check: "Understanding check",
  further_reading: "Read further",
};

export function GoDeeperPanel({ source, exploration, busy, error, onClose, onGenerate, onSave, onStart }: {
  source: LearningSource;
  exploration: Exploration | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onGenerate: (fresh?: boolean) => void;
  onSave: (exploration: Exploration) => void;
  onStart: (direction: ExplorationDirection) => void;
}) {
  return (
    <div className="overlay go-deeper-overlay" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="go-deeper-panel" aria-label={`Go deeper: ${source.title}`}>
        <header>
          <div><span className="micro-label"><Brain size={13} /> Go deeper</span><h2>{source.title}</h2><p>{source.subjectName ? `${source.subjectName} · ` : ""}Directions worth thinking about—not extra homework.</p></div>
          <button type="button" onClick={onClose} aria-label="Close Go Deeper"><X size={17} /></button>
        </header>

        {busy ? (
          <div className="go-deeper-loading"><LoaderCircle size={22} className="spin" /><strong>Finding the interesting edge…</strong><p>Looking for explanations, connections, and questions that expose real understanding.</p></div>
        ) : error ? (
          <div className="go-deeper-empty"><Brain size={22} /><h3>Couldn’t explore this yet</h3><p>{error}</p><button type="button" onClick={() => onGenerate(true)}><RefreshCw size={14} /> Try again</button></div>
        ) : exploration ? (
          <>
            <p className="exploration-framing"><Sparkles size={15} /> {exploration.framing}</p>
            <div className="exploration-directions">
              {exploration.directions.map((direction, index) => (
                <article key={`${direction.kind}:${index}`}>
                  <span>{kindLabels[direction.kind]}</span>
                  <h3>{direction.title}</h3>
                  <p>{direction.prompt}</p>
                  <small>{direction.whyUseful}</small>
                  <button type="button" onClick={() => onStart(direction)}><Play size={13} /> Explore for 15 min</button>
                </article>
              ))}
            </div>
            <footer>
              <button type="button" onClick={() => onGenerate(true)}><RefreshCw size={14} /> Fresh directions</button>
              <button type="button" className="primary" onClick={() => onSave(exploration)} disabled={exploration.status === "saved"}>
                {exploration.status === "saved" ? <Check size={14} /> : <BookOpen size={14} />}
                {exploration.status === "saved" ? "Saved" : "Save exploration"}
              </button>
            </footer>
          </>
        ) : (
          <div className="go-deeper-empty"><Brain size={22} /><h3>Find the interesting question</h3><p>Generate a small set of specific ways to test, connect, or extend this idea.</p><button type="button" onClick={() => onGenerate()}><Sparkles size={14} /> Go deeper</button></div>
        )}
      </section>
    </div>
  );
}
