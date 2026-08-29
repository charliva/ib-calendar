"use client";

import { Cloud, Lock, X } from "lucide-react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";

export function AccountPanel({
  user,
  authSent,
  authBusy,
  email,
  verificationCode,
  inviteEmail,
  inviteUrl,
  inviteBusy,
  inviteToken,
  onClose,
  onEmailChange,
  onVerificationCodeChange,
  onInviteEmailChange,
  onUseAnotherEmail,
  onCreateInvitation,
  onSendVerificationCode,
  onVerifyCode,
  onSignOut,
}: {
  user: User | null;
  authSent: boolean;
  authBusy: boolean;
  email: string;
  verificationCode: string;
  inviteEmail: string;
  inviteUrl: string;
  inviteBusy: boolean;
  inviteToken: string;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onVerificationCodeChange: (value: string) => void;
  onInviteEmailChange: (value: string) => void;
  onUseAnotherEmail: () => void;
  onCreateInvitation: (sendCode: boolean) => void;
  onSendVerificationCode: (event: FormEvent) => void;
  onVerifyCode: (event: FormEvent) => void;
  onSignOut: () => void;
}) {
  return (
    <section className="account-card" aria-label="Account">
      <button
        className="account-close"
        type="button"
        onClick={onClose}
        aria-label="Close account"
      >
        <X size={14} />
      </button>
      {user ? (
        <>
          <Cloud size={18} />
          <h2>Calendar synced</h2>
          <p>{user.email}</p>
          <div className="account-invites">
            <h3>Invite someone</h3>
            <p>
              Copy a one-time link, or create their account and email a
              verification code.
            </p>
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => onInviteEmailChange(event.target.value)}
              placeholder="friend@example.com"
              aria-label="Friend's email address"
            />
            <div className="account-invite-actions">
              <button
                type="button"
                disabled={inviteBusy}
                onClick={() => onCreateInvitation(false)}
              >
                Copy invite link
              </button>
              <button
                type="button"
                disabled={inviteBusy || !inviteEmail.trim()}
                onClick={() => onCreateInvitation(true)}
              >
                {inviteBusy ? "Working…" : "Create & send code"}
              </button>
            </div>
            {inviteUrl && (
              <button
                className="invite-url"
                type="button"
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                title={inviteUrl}
              >
                {inviteUrl}
              </button>
            )}
          </div>
          <button type="button" onClick={onSignOut}>
            Sign out
          </button>
        </>
      ) : authSent ? (
        <>
          <Lock size={18} />
          <h2>Enter your code</h2>
          <p>We sent a single-use verification code to {email}.</p>
          <form onSubmit={onVerifyCode}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(event) => onVerificationCodeChange(event.target.value)}
              placeholder="Verification code"
              minLength={6}
              maxLength={8}
              required
              autoFocus
              aria-label="Verification code"
            />
            <button type="submit" disabled={authBusy}>
              {authBusy ? "Checking…" : "Verify & sign in"}
            </button>
          </form>
          <button type="button" onClick={onUseAnotherEmail}>
            Use another email
          </button>
        </>
      ) : (
        <>
          <Cloud size={18} />
          <h2>
            {inviteToken ? "Accept your invitation" : "Sync every device"}
          </h2>
          <p>
            {inviteToken
              ? "Enter your email and we'll create your account with a single-use code."
              : "Enter your email to receive a single-use sign-in code."}
          </p>
          <form onSubmit={onSendVerificationCode}>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@example.com"
              required
              aria-label="Email address"
            />
            <button type="submit" disabled={authBusy}>
              {authBusy ? "Sending…" : "Send verification code"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
