"use client";

import { CLOUD_FEATURE_COPY, type CloudLockReason } from "@/lib/cloud-features";

type Props = {
  reason: CloudLockReason;
  /** Copy written for this specific feature, preferred over the generic line. */
  body?: string;
  lockedLabel: string;
  manualLabel?: string;
  onSignIn: () => void;
  onManual?: () => void;
};

/**
 * The one affordance every cloud-only feature uses when it is unavailable.
 *
 * Shown rather than hidden on purpose: a student who never sees that reading a
 * timetable out of a photo exists has no reason to make an account. The manual
 * alternative sits beside it so the locked step is never a dead end.
 */
export function CloudLockedNotice({
  reason,
  body,
  lockedLabel,
  manualLabel,
  onSignIn,
  onManual,
}: Props) {
  return (
    <div className="cloud-locked" role="note">
      <p>{body ?? CLOUD_FEATURE_COPY[reason]}</p>
      <div className="cloud-locked-actions">
        {reason === "no-account" ? (
          <button type="button" className="cloud-locked-primary" onClick={onSignIn}>
            {lockedLabel}
          </button>
        ) : null}
        {manualLabel && onManual ? (
          <button type="button" onClick={onManual}>
            {manualLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
