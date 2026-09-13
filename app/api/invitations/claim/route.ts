import { createAdminClient, ensureAccountAndSendCode } from "@/lib/supabase/admin";
import {
  invitationTokenHash,
  isInvitationToken,
  normalizeInvitationEmail,
} from "@/lib/invitations";

export async function POST(request: Request) {
  let body: { token?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = normalizeInvitationEmail(body.email);
  if (!email || !isInvitationToken(body.token)) {
    return Response.json({ error: "This invitation is invalid" }, { status: 400 });
  }

  try {
    const tokenHash = await invitationTokenHash(body.token);
    const admin = createAdminClient();
    const claimedAt = new Date().toISOString();
    const { data: invitation, error: claimError } = await admin
      .from("invitations")
      .update({
        invited_email: email,
        status: "claimed",
        claimed_at: claimedAt,
      })
      .eq("token_hash", tokenHash)
      .eq("status", "open")
      .gt("expires_at", claimedAt)
      .select("id, created_by")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!invitation) {
      return Response.json(
        { error: "This invitation has expired or was already used" },
        { status: 410 },
      );
    }

    try {
      await ensureAccountAndSendCode(email, invitation.created_by);
    } catch (error) {
      await admin
        .from("invitations")
        .update({
          invited_email: null,
          status: "open",
          claimed_at: null,
        })
        .eq("id", invitation.id)
        .eq("status", "claimed");
      throw error;
    }

    return Response.json({ codeSent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not accept invitation";
    return Response.json({ error: message }, { status: 500 });
  }
}
