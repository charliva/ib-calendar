import { clerkClient } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function serverEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase admin client is not configured");
  }

  return { url, secretKey };
}

export function createAdminClient() {
  const { url, secretKey } = serverEnv();
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type InvitationResult = {
  clerkUserId: string;
  signInUrl: string;
  expiresAt: string;
};

/**
 * Invite a new user by email.
 *
 * With Clerk in charge of identity, the invitation flow is:
 *   1. Create a Clerk user for the email (or look one up if they already
 *      exist on this Clerk instance).
 *   2. Mint a one-time sign-in token scoped to that user. Visiting the
 *      token URL signs them in directly without a password, which is the
 *      closest equivalent to the legacy email-code flow.
 *   3. Pre-provision the matching `auth.users` row in Supabase so the
 *      foreign keys in our application tables resolve as soon as they
 *      make their first authenticated request. The before_user_created
 *      hook stamps `app_metadata.clerk_user_id` with the Clerk user id.
 *
 * `invitedBy` is the Clerk user id of the inviter, kept for audit.
 */
export async function inviteUserByEmail(
  email: string,
  invitedBy: string,
): Promise<InvitationResult> {
  const clients = await clerkClient();

  // Step 1 — look up or create the Clerk user.
  let clerkUserId: string;
  const existing = await clients.users.getUserList({ emailAddress: [email] });
  if (existing.data.length > 0) {
    clerkUserId = existing.data[0]!.id;
  } else {
    const created = await clients.users.createUser({
      emailAddress: [email],
      skipPasswordRequirement: true,
    });
    clerkUserId = created.id;
  }

  // Step 2 — pre-provision the Supabase auth.users row. A row inserted via
  // the admin client bypasses RLS, so we go through the `profiles` table
  // (which the on_auth_user_created trigger mirrors). If the row already
  // exists the upsert is a no-op.
  const admin = createAdminClient();
  const { error: provisionError } = await admin
    .from("profiles")
    .upsert({ id: clerkUserId }, { onConflict: "id", ignoreDuplicates: true });
  if (provisionError && provisionError.code !== "23505") {
    throw provisionError;
  }

  // Step 3 — mint the one-time sign-in token.
  const token = await clients.signInTokens.createSignInToken({
    userId: clerkUserId,
    expiresInSeconds: INVITATION_TTL_SECONDS,
  });

  // Audit the invitation source on the Clerk user so admin tooling can
  // see who sent it. This is independent of Supabase RLS.
  await clients.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      invited_by: invitedBy,
      invited_at: new Date().toISOString(),
    },
  });

  return {
    clerkUserId,
    signInUrl: token.url,
    expiresAt: new Date(Date.now() + INVITATION_TTL_SECONDS * 1000).toISOString(),
  };
}
