"use client";

import type { DeadLetterMutation } from "@/lib/offline";

type Props = {
  hasAccount: boolean;
  pendingCount: number;
  deadLettered: DeadLetterMutation[];
  onRetryDeadLetter: (mutation: DeadLetterMutation) => void;
  onDiscardDeadLetter: (mutation: DeadLetterMutation) => void;
};

/**
 * What this device is still holding on to.
 *
 * A change that fails repeatedly used to retry forever on a fifteen-second
 * timer, with no way for the student to see it, retry it deliberately or throw
 * it away. Now that such changes are parked rather than looping, this is where
 * they surface.
 */
export function SyncSection({
  hasAccount,
  pendingCount,
  deadLettered,
  onRetryDeadLetter,
  onDiscardDeadLetter,
}: Props) {
  if (!hasAccount) {
    return (
      <div className="settings-section-body">
        <p className="settings-help">
          This device is keeping your calendar locally. Sign in and everything
          here comes with you — nothing is lost in the move.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-section-body">
      <p className="settings-help">
        {pendingCount === 0
          ? "Everything on this device has reached your account."
          : `${pendingCount} change${pendingCount === 1 ? "" : "s"} still waiting to sync.`}
      </p>
      {deadLettered.length ? (
        <>
          <p className="settings-help settings-help-warning">
            {deadLettered.length} change{deadLettered.length === 1 ? "" : "s"}{" "}
            could not be saved after several attempts. They are held here rather
            than retried forever.
          </p>
          <ul className="settings-dead-letter">
            {deadLettered.map((mutation) => (
              <li key={mutation.id ?? `${mutation.table}-${mutation.recordId}`}>
                <div>
                  <strong>{mutation.table}</strong>
                  <small>{mutation.lastError}</small>
                </div>
                <div className="settings-dead-letter-actions">
                  <button
                    type="button"
                    onClick={() => onRetryDeadLetter(mutation)}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    className="is-destructive"
                    onClick={() => onDiscardDeadLetter(mutation)}
                  >
                    Discard
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
