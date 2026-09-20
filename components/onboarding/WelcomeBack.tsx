"use client";

import type { CalendarItem } from "@/lib/calendar-engine";
import type { StalenessReport } from "@/lib/onboarding/staleness";
import { OverlayPanel } from "@/components/overlay/OverlayPanel";

type Props = {
  open: boolean;
  report: StalenessReport;
  onClose: () => void;
  onRelease: (items: CalendarItem[]) => void;
  onReimportTimetable: () => void;
  onReplayTour: () => void;
};

function describeAbsence(days: number | null) {
  if (days === null) return "You have been away for a while.";
  if (days >= 60) return `You have been away about ${Math.round(days / 30)} months.`;
  if (days >= 28) return `You have been away about a month.`;
  return `You have been away ${days} days.`;
}

/**
 * What a student comes back to after a long gap.
 *
 * The job here is triage rather than teaching. Work that was planned into a
 * week that has since passed keeps the status "scheduled", which hides it from
 * the dock, the Now recommender and free-period suggestions all at once — so
 * without this screen three weeks of homework is simply invisible. Releasing it
 * is the one action that unblocks every one of those surfaces at once.
 */
export function WelcomeBack({
  open,
  report,
  onClose,
  onRelease,
  onReimportTimetable,
  onReplayTour,
}: Props) {
  const { strandedItems, strandedMinutes } = report;
  const hours = Math.round((strandedMinutes / 60) * 10) / 10;

  return (
    <OverlayPanel
      id="welcome-back"
      open={open}
      onClose={onClose}
      title="Welcome back"
      className="welcome-back"
    >
      <p className="welcome-back-lede">{describeAbsence(report.awayDays)}</p>

      {strandedItems.length ? (
        <section className="welcome-back-block">
          <h3>
            {strandedItems.length} piece
            {strandedItems.length === 1 ? "" : "s"} of work never happened
          </h3>
          <p>
            These were planned into time that has passed, so nothing can see them
            any more &mdash; not your list, not your free periods. Putting them
            back makes them plannable again. Nothing is deleted.
          </p>
          <ul className="welcome-back-items">
            {strandedItems.slice(0, 6).map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <small>{item.durationMin} min</small>
              </li>
            ))}
          </ul>
          {strandedItems.length > 6 ? (
            <small className="welcome-back-more">
              and {strandedItems.length - 6} more
            </small>
          ) : null}
          <button
            type="button"
            className="welcome-back-primary"
            onClick={() => onRelease(strandedItems)}
          >
            Put {strandedItems.length === 1 ? "it" : "them"} back on my list
            {hours >= 1 ? ` (${hours}h of work)` : ""}
          </button>
        </section>
      ) : null}

      {report.timetableCoversCurrentWeek ? null : (
        <section className="welcome-back-block">
          <h3>This week has no lessons in it</h3>
          <p>
            {report.latestImportedWeek
              ? `Your timetable was last imported for the week of ${report.latestImportedWeek}. An import covers one week, so this one is empty.`
              : "There are no lessons for this week yet."}
          </p>
          <button type="button" onClick={onReimportTimetable}>
            Import this week&rsquo;s timetable
          </button>
        </section>
      )}

      {report.pendingMutationCount > 0 ? (
        <section className="welcome-back-block">
          <h3>
            {report.pendingMutationCount} change
            {report.pendingMutationCount === 1 ? "" : "s"} from before you left
          </h3>
          <p>
            These have not reached your account yet. They will sync now that you
            are back &mdash; if any of them fail, you can review them in
            Settings.
          </p>
        </section>
      ) : null}

      <footer className="welcome-back-footer">
        <button type="button" className="is-quiet" onClick={onReplayTour}>
          Remind me how this works
        </button>
        <button type="button" onClick={onClose}>
          Take me to my week
        </button>
      </footer>
    </OverlayPanel>
  );
}
