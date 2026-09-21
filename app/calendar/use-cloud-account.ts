"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveCloudAccount,
  type OwnedCloudSnapshot,
} from "@/lib/calendar/cloud-account-owner";

/**
 * The per-account half of a cloud snapshot, and whether the calendar may
 * read it.
 *
 * Owner-tagging the snapshot is the whole point. The calendar keeps reading one snapshot into a
 * page session that can outlive the account that produced it: signing out and
 * back in as somebody else never remounts the page, and `onAuthStateChange`
 * can null the user from another tab or an expired session without any of the
 * sign-out code running at all. A bare `cloudOnboardingState` therefore
 * survived the swap, and the first student's completed setup steps were read
 * as the second student's, written to their device record and upserted into
 * their `profiles` row. `mergeOnboardingState` is a union that never
 * subtracts, so that pollution was permanent: the new student landed on an
 * empty calendar with the guided setup already marked finished.
 *
 * Keying off the owner rather than clearing on sign-out is deliberate — there
 * is no single place a sign-out reliably passes through, but every read can
 * ask "is this mine?" and get the right answer.
 *
 * The rule itself lives in lib/calendar/cloud-account-owner.ts so it can be
 * tested without React.
 */
export type CloudAccount = {
  /** The signed-in account's id, or `"local"` for a session with no account. */
  ownerKey: string;
  /**
   * Whether we know what the *current* account holds — either because its own
   * snapshot has arrived, or because there is no account to ask.
   */
  cloudLoaded: boolean;
  /** The current account's setup progress, or `null` if it is not ours. */
  cloudOnboardingState: unknown;
  /** The current account's last visit, or `null` if it is not ours. */
  cloudLastSeenAt: string | null;
  /** Records a freshly fetched snapshot against the account it came from. */
  adoptSnapshot: (
    ownerKey: string,
    onboardingState: unknown,
    lastSeenAt: string | null,
  ) => void;
  /**
   * The account id as of the last commit, for guarding an in-flight fetch.
   * Data that is not owner-tagged — the items, subjects and classes a
   * snapshot also carries — has to be dropped rather than tagged, so the
   * caller compares this before applying any of it.
   */
  currentOwnerRef: { readonly current: string };
};

export function useCloudAccount(
  user: User | null,
  hydrated: boolean,
): CloudAccount {
  const ownerKey = user?.id ?? "local";
  const [snapshot, setSnapshot] = useState<OwnedCloudSnapshot | null>(null);

  const currentOwnerRef = useRef(ownerKey);
  useEffect(() => {
    currentOwnerRef.current = ownerKey;
  }, [ownerKey]);

  const adoptSnapshot = useCallback(
    (owner: string, onboardingState: unknown, lastSeenAt: string | null) => {
      setSnapshot({ ownerKey: owner, onboardingState, lastSeenAt });
    },
    [],
  );

  return useMemo(
    () => ({
      ownerKey,
      ...resolveCloudAccount(snapshot, ownerKey, hydrated, Boolean(user)),
      adoptSnapshot,
      currentOwnerRef,
    }),
    [snapshot, ownerKey, hydrated, user, adoptSnapshot],
  );
}
