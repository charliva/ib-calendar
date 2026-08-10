import { authenticatedUser } from "@/lib/supabase/api-auth";
import { createAdminClient, ensureAccountAndSendCode } from "@/lib/supabase/admin";
import {
  createInvitationToken,
  INVITATION_LIMIT_PER_DAY,
  invitationTokenHash,
  normalizeInvitationEmail,
} from "@/lib/invitations";

export async function POST(request: Request) {
  const user = await authenticatedUser(request);
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
    const admin = createAdminClient();
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

    const token = createInvitationToken();
    const tokenHash = await invitationTokenHash(token);
    const status = email ? "claimed" : "open";
    const { data: invitation, error: insertError } = await admin
      .from("invitations")
      .insert({
        created_by: user.id,
        invited_email: email,
        token_hash: tokenHash,
        status,
        claimed_at: email ? new Date().toISOString() : null,
      })
      .select("id, expires_at")
      .single();
    if (insertError) throw insertError;

    if (email) {
      try {
        await ensureAccountAndSendCode(email, user.id);
      } catch (error) {
        await admin
          .from("invitations")
          .update({ status: "failed" })
          .eq("id", invitation.id);
        throw error;
      }
    }

    const origin = new URL(request.url).origin;
    return Response.json({
      inviteUrl: `${origin}/?invite=${token}`,
      email,
      expiresAt: invitation.expires_at,
      codeSent: Boolean(email),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create invitation";
    return Response.json({ error: message }, { status: 500 });
  }
}
