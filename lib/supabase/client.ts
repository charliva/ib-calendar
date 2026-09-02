"use client";

import { useAuth } from "@clerk/nextjs";
import { createBrowserClient } from "@supabase/ssr";
import { useMemo } from "react";

/**
 * Build a Supabase browser client that authenticates as the active Clerk
 * session. The Clerk session token is fetched on every Supabase request so
 * the JWT does not go stale mid-session.
 *
 * On the Supabase side the `custom_access_token` hook validates the Clerk
 * JWT, copies the Clerk user id into the `sub` claim, and RLS policies
 * read it via `public.clerk_uid()`.
 */
export function useSupabaseClient() {
  const { getToken, isSignedIn } = useAuth();

  return useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        accessToken: isSignedIn
          ? async () => (await getToken()) ?? null
          : undefined,
      },
    );
  }, [getToken, isSignedIn]);
}

/**
 * Plain (non-hook) browser client builder for code paths that cannot use a
 * hook — e.g. error boundaries, service workers, or code invoked from
 * non-React contexts. The caller is responsible for forwarding the Clerk
 * session token via the `Authorization` header; if no token is supplied,
 * the request runs as the `anon` role and RLS denies it.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
