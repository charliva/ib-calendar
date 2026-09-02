import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Build a Supabase server client that authenticates as the active Clerk
 * session.
 *
 * The Clerk session JWT is forwarded as the `Authorization: Bearer ...`
 * header on every request. On the Supabase side the `custom_access_token`
 * hook (see supabase/migrations/20260902073540_clerk_third_party_auth.sql)
 * inspects the JWT, copies the Clerk user id into the `sub` claim, and
 * RLS policies continue to read it via `auth.uid()`.
 *
 * Server Components cannot refresh the Clerk session, so we surface that
 * failure as a logged warning rather than throwing.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { getToken } = await auth();
  const accessToken = await getToken();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {},
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot write cookies. The Clerk session is
            // refreshed by the Clerk middleware on the next request.
          }
        },
      },
    },
  );
}
