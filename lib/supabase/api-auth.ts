import { auth } from "@clerk/nextjs/server";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

/**
 * Read the active Clerk session from a request. Designed for Edge route
 * handlers, which run outside Next.js's per-request Clerk middleware context
 * (so we have to call `auth()` ourselves).
 *
 * Returns `null` when the request is unauthenticated or the Clerk session
 * has expired. Callers should treat that as a 401.
 */
export async function authenticatedUser(): Promise<AuthenticatedUser | null> {
  // `auth()` inside an edge route handler still has access to the Clerk
  // session cookies when the request is routed through Clerk's middleware.
  // We grab the active user id and email rather than calling `getUser()` on
  // the Clerk backend, which would add a network hop to every request.
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const email =
    typeof sessionClaims?.email === "string" ? sessionClaims.email : null;

  return { id: userId, email };
}
