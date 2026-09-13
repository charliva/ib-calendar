"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

import {
  getFeatureRoadmapState,
  getServerFeatureRoadmapState,
  subscribeFeatureRoadmapState,
  writeFeatureRoadmapState,
} from "@/lib/feature-roadmap";

const roadmap = [
  {
    id: "resilient-import",
    priority: "P0",
    status: "Ready to build",
    title: "Conflict-safe timetable import",
    promise: "A busy week with overlaps and personal appointments imports instead of failing.",
    problem:
      "Today a screenshot import behaves like an all-or-nothing transaction. One overlapping class, a double-booked lesson, or a dentist appointment can invalidate the entire import.",
    solution: [
      "Parse every detected lesson into a candidate list before touching the calendar.",
      "Validate candidates individually, not as one set. An invalid row gets a reason; valid rows stay available.",
      "Detect four outcomes: new, matching replacement, overlap, and non-class personal event.",
      "Offer resolution actions per row: keep existing, replace existing, keep both, skip, or edit before adding.",
      "Use an exception model for appointments and one-off changes so the normal weekly timetable remains intact.",
      "Finish with a review summary: imported, replaced, kept both, skipped, and needs attention.",
    ],
    acceptance: [
      "One bad row never blocks otherwise valid rows.",
      "Overlaps are visible before the user commits.",
      "Personal events can be captured without pretending they are classes.",
      "The user always sees what will change before applying the import.",
    ],
  },
  {
    id: "assignment-capture",
    priority: "P0",
    status: "Ready to build",
    title: "One-screenshot assignment capture",
    promise: "Paste an Uddataplus assignment page and get an editable assignment in seconds.",
    problem:
      "Assignments from the school platform already contain most required fields, but users have to recreate them manually. The system needs a fast capture path for assignment detail pages, not only syllabi.",
    solution: [
      "Accept a screenshot, clipboard image, or file in the existing upload flow.",
      "Use vision extraction tuned to the IST Studio+ / Uddataplus assignment layout.",
      "Extract: title, subject or class, due date, due time, estimated student time, teacher, description, files, submission status, groups, and evaluation form.",
      "Treat '2 hours' as the default estimated workload and split it into sessions using the existing assignment planner.",
      "Auto-map 'GP SL/HL' to an existing subject when the name is similar; otherwise create a pending subject choice.",
      "Show a structured preview before saving, with low-confidence fields highlighted.",
      "Make description and attachments optional; never block capture because an optional field is missing.",
    ],
    acceptance: [
      "A clear assignment screenshot becomes a reviewable draft without manual retyping.",
      "Date formats like 16.11.2026 23:55 are parsed correctly.",
      "The user can edit any extracted value before import.",
      "A missing teacher, file, or course does not prevent saving.",
    ],
  },
  {
    id: "smart-resolution",
    priority: "P1",
    status: "Next",
    title: "Smart calendar resolution assistant",
    promise: "Turn conflicts into choices instead of errors.",
    problem:
      "A calendar should help the user decide what wins when life overlaps school. It should not ask the user to fix the same collision repeatedly.",
    solution: [
      "Rank conflicts by fixedness, priority, deadline proximity, and whether the event is personal or school-related.",
      "Propose resolutions: move flexible work, keep both, attend the fixed event, or reschedule around travel time.",
      "Remember preferences such as always keeping medical appointments or never double-booking practical lessons.",
      "Undo changes as a grouped action.",
    ],
    acceptance: [
      "Recurring conflicts can be resolved once, not every week.",
      "Fixed events remain visually distinct from flexible work.",
      "Every proposed change is reversible.",
    ],
  },
  {
    id: "assignment-triage",
    priority: "P1",
    status: "Next",
    title: "Assignment inbox and deadline radar",
    promise: "See what needs attention today without scanning every class.",
    problem:
      "Assignments arrive from several classes and platforms. Without a single intake point, users discover urgent work too late.",
    solution: [
      "Collect captured assignments into an inbox with unread, needs review, scheduled, and submitted states.",
      "Show deadline pressure using time available, estimated effort, existing calendar load, and submission risk.",
      "Let the user turn any assignment into a ready-made work plan with one action.",
      "Flag assignments that cannot fit before their deadline while there is still time to ask for help.",
    ],
    acceptance: [
      "New captures are easy to review and correct.",
      "The first recommended work session appears without manual scheduling.",
      "Impossible workloads surface early.",
    ],
  },
  // Open questions to resolve before implementation:
  //   - Should personal deadlines (the student's self-set soft date) be
  //     editable independently from the school's hard date, or always coupled?
  //   - When a teacher grants an extension, do we ingest it automatically
  //     from the school platform, or is the student always the one who types
  //     the new date?
  {
    id: "deadline-extension",
    priority: "P1",
    status: "Next",
    title: "Extend deadlines for homeworks and assignments",
    promise:
      "Move a due date forward or back and have the study plan re-flow in one step, with a clear preview of what changes.",
    problem:
      "Deadlines shift in real life: a teacher grants an extension, a personal appointment makes a date impossible, or the student realizes the workload is unrealistic. Today changing an assignment's dueAt leaves the existing study blocks anchored to the old date, so the planner and the calendar disagree. Manually re-planning every related block is friction most students will not do, and the result is a calendar full of stale work sessions.",
    solution: [
      "Offer 'Extend' on any homework or assignment card, with both a date picker and a quick '+1 day / +3 days / +1 week' affordance.",
      "Before committing, show a preview of every block that will move, drop, or be created, and every assessment or test that will slide with it.",
      "Default to confirm-before-apply. The user has final say; silent reschedules violate the product's 'no autonomous calendar changes' rule.",
      "Cascade the new deadline to related assessments the student has linked, and surface a separate confirmation when the cascade affects a fixed school event (e.g. a real test date) so the user can opt out.",
      "Re-run the assignment planner against the new dueAt, keeping the existing energy and study-type rules rather than replacing the plan wholesale.",
      "Record the extension as a small audit trail on the assignment (previous dueAt, new dueAt, timestamp, reason text optional) so the student can see why the plan changed.",
      "Suggest the inverse: 'You finished this two days early on the last one, want to keep the original date?' when usage data supports it. Not in v1; v1 only extends.",
    ],
    acceptance: [
      "A single confirmation moves every related block, no manual cleanup required.",
      "Cascading to a linked assessment is explicit and reversible, never silent.",
      "The audit trail on the assignment shows previous and new deadlines, with timestamps.",
      "Reverting the extension within the same session restores the original plan exactly.",
      "Quick '+1 / +3 / +7' buttons work without opening a date picker.",
    ],
  },
  {
    id: "capture-console",
    priority: "P2",
    status: "Exploring",
    title: "Universal school capture console",
    promise: "One place for screenshots, links, PDFs, and quick notes.",
    problem:
      "School information arrives in inconsistent formats. A shared capture layer can normalize it into one review queue.",
    solution: [
      "Support assignment screenshots, timetable screenshots, syllabus PDFs, and plain-text notes.",
      "Show the extraction confidence and source for every recognized field.",
      "Reuse subject matching, date parsing, class exceptions, and assignment planning across all formats.",
      "Store the original image with the imported record for audit and correction.",
    ],
    acceptance: [
      "Every import path produces the same review-and-apply experience.",
      "Failed extractions still save enough context to retry.",
      "Users can trace any calendar item back to its source.",
    ],
  },
];

const metrics = [
  { label: "Partial import success", value: "Valid rows survive bad rows" },
  { label: "Assignment capture time", value: "Under 30 seconds to draft" },
  { label: "Manual field entry", value: "Only edits, not full retyping" },
  { label: "Commit safety", value: "Preview before every write" },
];

export default function FeatureRoadmapPage() {
  const completedFeatures = useSyncExternalStore(
    subscribeFeatureRoadmapState,
    getFeatureRoadmapState,
    getServerFeatureRoadmapState,
  );

  function toggleFeature(featureId: string) {
    const next = new Set(completedFeatures);
    if (next.has(featureId)) {
      next.delete(featureId);
    } else {
      next.add(featureId);
    }
    writeFeatureRoadmapState(next);
  }

  return (
    <main className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-12 lg:py-16">
        <header className="mb-14">
          <Link
            href="/calendar"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            ← Back to Syllabi
          </Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[var(--lilac-dark)]">
            Product roadmap
          </p>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            Make imports forgiving and assignments effortless.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[color-mix(in_srgb,var(--ink)_68%,transparent)]">
            These features focus on the two highest-friction moments: a timetable that breaks when
            real life does not fit the grid, and school assignments that force manual data entry
            even when the platform already knows the answer.
          </p>
          <p className="mt-6 inline-flex rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--muted)]">
            {completedFeatures.size} of {roadmap.length} completed
          </p>
        </header>

        <section aria-labelledby="metrics-heading" className="mb-16">
          <h2 id="metrics-heading" className="sr-only">
            Success criteria
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[0_14px_40px_rgb(20_34_27_/_5%)]"
              >
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--muted)]">
                  {metric.label}
                </p>
                <p className="mt-3 text-lg font-semibold leading-snug tracking-[-0.02em]">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="solutions-heading" className="space-y-6">
          <h2 id="solutions-heading" className="sr-only">
            Feature solutions
          </h2>

          {roadmap.map((feature, index) => (
            <article
              key={feature.id}
              id={feature.id}
              className={`overflow-hidden rounded-[28px] border bg-[var(--paper)] shadow-[0_20px_70px_rgb(20_34_27_/_6%)] transition-opacity ${
                completedFeatures.has(feature.id)
                  ? "border-[var(--mint)] opacity-75"
                  : "border-[var(--line)]"
              }`}
            >
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="p-7 sm:p-9">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.11em] ${
                        feature.priority === "P0"
                          ? "bg-[var(--lilac)] text-white"
                          : feature.priority === "P1"
                            ? "bg-[var(--peach)] text-[#3b2213]"
                            : "bg-[var(--lilac-wash)] text-[var(--lilac-dark)]"
                      }`}
                    >
                      {feature.priority}
                    </span>
                    <span className="rounded-full border border-[var(--line)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
                      {feature.status}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--muted)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="mt-5 flex items-start justify-between gap-5">
                    <div>
                      <h3
                        className={`text-3xl font-semibold leading-[1.03] tracking-[-0.035em] sm:text-4xl ${
                          completedFeatures.has(feature.id)
                            ? "text-[var(--muted)] line-through decoration-2"
                            : ""
                        }`}
                      >
                        {feature.title}
                      </h3>
                      <p className="mt-4 text-lg font-medium leading-snug text-[color-mix(in_srgb,var(--ink)_76%,transparent)]">
                        {feature.promise}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFeature(feature.id)}
                      aria-pressed={completedFeatures.has(feature.id)}
                      className={`mt-2 inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                        completedFeatures.has(feature.id)
                          ? "border-[var(--mint)] bg-[var(--mint)] text-white"
                          : "border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:bg-[var(--lilac-wash)]"
                      }`}
                    >
                      <span aria-hidden="true">
                        {completedFeatures.has(feature.id) ? "✓" : ""}
                      </span>
                      {completedFeatures.has(feature.id) ? "Complete" : "Mark complete"}
                    </button>
                  </div>

                  <div className="mt-7 border-t border-[var(--line-soft)] pt-6">
                    <h4 className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--muted)]">
                      Problem
                    </h4>
                    <p className="mt-3 leading-relaxed text-[color-mix(in_srgb,var(--ink)_68%,transparent)]">
                      {feature.problem}
                    </p>
                  </div>

                  <div className="mt-7">
                    <h4 className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--muted)]">
                      Solution
                    </h4>
                    <ul className="mt-4 space-y-3">
                      {feature.solution.map((item) => (
                        <li key={item} className="flex gap-3 leading-relaxed">
                          <span
                            aria-hidden="true"
                            className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[var(--lilac)]"
                          />
                          <span className="text-[color-mix(in_srgb,var(--ink)_76%,transparent)]">
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <aside className="border-t border-[var(--line-soft)] bg-[linear-gradient(160deg,var(--lilac-wash),var(--paper))] p-7 sm:p-9 lg:border-l lg:border-t-0">
                  <h4 className="text-xs font-bold uppercase tracking-[0.13em] text-[var(--lilac-dark)]">
                    Done when
                  </h4>
                  <ul className="mt-5 space-y-4">
                    {feature.acceptance.map((item) => (
                      <li key={item} className="flex gap-3 leading-relaxed">
                        <span
                          aria-hidden="true"
                          className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border border-[var(--lilac)] text-[8px] text-[var(--lilac-dark)]"
                        >
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>
            </article>
          ))}
        </section>

        <footer className="mt-16 rounded-[28px] border border-[var(--line)] bg-[var(--ink-soft)] p-8 text-white sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">
            Build order
          </p>
          <p className="mt-4 max-w-3xl text-2xl font-semibold leading-snug tracking-[-0.03em]">
            Start with candidate-based imports and assignment screenshot capture. They remove the
            two current dead ends and reuse the same review-before-apply model.
          </p>
          <Link
            href="/calendar"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[var(--ink)] transition-transform hover:-translate-y-0.5"
          >
            Return to the calendar
          </Link>
        </footer>
      </div>
    </main>
  );
}
