import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormEvent } from "react";

type AccountSessionParams = {
  supabase: SupabaseClient;
  /** Current values of the sign-in and invitation fields. */
  email: string;
  verificationCode: string;
  inviteToken: string;
  inviteEmail: string;
  setAuthBusy: (value: boolean) => void;
  setAuthSent: (value: boolean) => void;
  setNotice: (value: string) => void;
  setVerificationCode: (value: string) => void;
  setInviteToken: (value: string) => void;
  setInviteBusy: (value: boolean) => void;
  setInviteUrl: (value: string) => void;
  setInviteEmail: (value: string) => void;
  /**
   * Drops every calendar record this device holds. Signing out has to leave a
   * fresh local calendar behind rather than the previous account's data, and
   * the records themselves belong to the calendar store, not to this hook.
   */
  clearLocalCalendar: () => Promise<void>;
};

/**
 * Sign-in, code verification, invitations, and sign-out.
 *
 * This is deliberately not memoised: the handlers close over field values that
 * change on every keystroke, and they only ever run from an event handler, so
 * a stable identity would buy nothing and risk a stale closure.
 */
export function useAccountSession({
  supabase,
  email,
  verificationCode,
  inviteToken,
  inviteEmail,
  setAuthBusy,
  setAuthSent,
  setNotice,
  setVerificationCode,
  setInviteToken,
  setInviteBusy,
  setInviteUrl,
  setInviteEmail,
  clearLocalCalendar,
}: AccountSessionParams) {
  async function sendVerificationCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setAuthBusy(true);
    let errorMessage = "";
    if (inviteToken) {
      const response = await fetch("/api/invitations/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), token: inviteToken }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        errorMessage = result.error ?? "Could not accept invitation";
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      errorMessage = error?.message ?? "";
    }
    setAuthBusy(false);
    if (errorMessage) {
      setNotice(errorMessage);
      return;
    }
    setAuthSent(true);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !verificationCode.trim()) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: verificationCode.replace(/\s/g, ""),
      type: "email",
    });
    setAuthBusy(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    if (inviteToken) {
      window.history.replaceState({}, "", window.location.pathname);
      setInviteToken("");
    }
    setVerificationCode("");
    setAuthSent(false);
    setNotice("Signed in. Your calendar is syncing now.");
  }

  async function createInvitation(sendCode: boolean) {
    setInviteBusy(true);
    setInviteUrl("");
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ email: sendCode ? inviteEmail : "" }),
    });
    const result = (await response.json()) as {
      error?: string;
      inviteUrl?: string;
    };
    setInviteBusy(false);
    if (!response.ok || !result.inviteUrl) {
      setNotice(result.error ?? "Could not create invitation");
      return;
    }
    if (sendCode) {
      setInviteUrl("");
      setNotice(
        `Account ready. A verification code was sent to ${inviteEmail.trim()}.`,
      );
      setInviteEmail("");
    } else {
      setInviteUrl(result.inviteUrl);
      try {
        await navigator.clipboard.writeText(result.inviteUrl);
        setNotice("One-time invite link copied.");
      } catch {
        setNotice("Invite link created. Copy it below.");
      }
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    await clearLocalCalendar();
    setNotice("Signed out. This device now has a fresh local calendar.");
  }

  return { sendVerificationCode, verifyCode, createInvitation, signOut };
}
