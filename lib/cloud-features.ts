/**
 * Which capabilities need an account.
 *
 * Every model-backed route in this app already refuses an unauthenticated
 * request, so the server side of this rule is not new. What was missing is the
 * client knowing: a signed-out student was shown the timetable drop zone and
 * the natural-language box, used them, and got a silent failure. The point of
 * this module is that the same predicate decides what the interface offers and
 * what the error handler says, so the two cannot drift apart.
 */

export type CloudLockReason = "unavailable" | "no-account" | "offline";

export type CloudAvailability = {
  available: boolean;
  reason: CloudLockReason | null;
};

export const CLOUD_FEATURE_COPY: Record<CloudLockReason, string> = {
  "no-account":
    "This runs in the cloud, so it needs an account. Everything you have done on this device is kept, and comes with you when you sign in.",
  offline:
    "This runs in the cloud, so it needs a connection. It will be available again once you are back online.",
  unavailable: "This is not available right now.",
};

export function cloudAvailability(input: {
  hasAccount: boolean;
  isOnline: boolean;
}): CloudAvailability {
  if (!input.hasAccount) return { available: false, reason: "no-account" };
  if (!input.isOnline) return { available: false, reason: "offline" };
  return { available: true, reason: null };
}

/**
 * Whether a failed request failed because the session is not (or is no longer)
 * authenticated. Sessions expire mid-action, so the lock above is the
 * deliberate path and this is the net underneath it.
 */
export function isAuthenticationFailure(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 401 || status === 403) return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /authentication required|not authenticated|unauthorized/i.test(
    message,
  );
}
