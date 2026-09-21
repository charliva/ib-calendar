// Whose cloud snapshot is in hand, and whether the calendar may read it.
//
// Split out of the hook so it can be tested without React: the rule it
// encodes is the one that went wrong in production, where a snapshot fetched
// for one account was still being read after a different account signed in.

export type OwnedCloudSnapshot = {
  ownerKey: string;
  onboardingState: unknown;
  lastSeenAt: string | null;
};

export type ResolvedCloudAccount = {
  /** Whether we know what the *current* account holds. */
  cloudLoaded: boolean;
  /** The current account's setup progress, or `null` if the snapshot is not theirs. */
  cloudOnboardingState: unknown;
  /** The current account's last visit, or `null` if the snapshot is not theirs. */
  cloudLastSeenAt: string | null;
};

/**
 * Reads a snapshot only if it belongs to the account asking.
 *
 * A signed-out session has nothing to fetch, so it counts as loaded once local
 * state is in memory; a signed-in one stays unloaded until its own snapshot
 * arrives, because opening the setup wizard on a returning student is worse
 * than making them wait a beat.
 */
export function resolveCloudAccount(
  snapshot: OwnedCloudSnapshot | null,
  ownerKey: string,
  hydrated: boolean,
  hasUser: boolean,
): ResolvedCloudAccount {
  const owned = snapshot !== null && snapshot.ownerKey === ownerKey;
  return {
    cloudLoaded: owned || (hydrated && !hasUser),
    cloudOnboardingState: owned ? snapshot.onboardingState : null,
    cloudLastSeenAt: owned ? snapshot.lastSeenAt : null,
  };
}
