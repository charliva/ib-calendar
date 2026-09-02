import { authenticatedUser } from "@/lib/supabase/api-auth";
import { inviteUserByEmail } from "@/lib/supabase/admin";
import {
  INVITATION_LIMIT_PER_DAY,
  normalizeInvitationEmail,
} from "@/lib/invitations";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("Supabase admin client is not configured");
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const hasEmail = typeof body.email === "string" && body.email.trim().length > 0;
  const email = hasEmail ? normalizeInvitationEmail(body.email) : null;
  if (hasEmail && !email) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  try {
    const admin = adminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("created_by", user.id)
      .gte("created_at", since);
    if (countError) throw countError;
    if ((count ?? 0) >= INVITATION_LIMIT_PER_DAY) {
      return Response.json(
        { error: "You can create up to 10 invitations every 24 hours" },
        { status: 429 },
      );
    }

    if (!email) {
      return Response.json(
        { error: "An email address is required" },
        { status: 400 },
      );
    }

    const result = await inviteUserByEmail(email, user.id);

    const { error: insertError } = await admin.from("invitations").insert({
      created_by: user.id,
      invited_email: email,
      token_hash: `clerk:${result.clerkUserId}:${result.expiresAt}`,
      status: "open",
    });
    if (insertError) {
      // Surface duplicate or quota issues clearly.
      if (insertError.code === "23505") {
        return Response.json(
          { error: "This email already has a pending invitation" },
          { status: 409 },
        );
      }
      throw insertError;
    }

    return Response.json({
      inviteUrl: result.signInUrl,
      email,
      expiresAt: result.expiresAt,
      clerkUserId: result.clerkUserId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create invitation";
    return Response.json({ error: message }, { status: 500 });
  }
}
