"use client";

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
        <svg
          viewBox="0 0 12 12"
          width="11"
          height="11"
          role="presentation"
          aria-hidden="true"
        >
          <path
            d="M2 2L10 10M10 2L2 10"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {user ? (
        <>
          <p className="account-eyebrow">Account</p>
          <h2 className="account-title">
            Calendar synced
            <span className="account-title-name">{user.email}</span>
          </h2>
          <p className="account-meta">
            The personal calendar attached to this address is mirrored across
            every device that signs in.
          </p>

          <div className="account-invites">
            <h3>Invite someone</h3>
            <p>
              Copy a one-time link, or add their address and we will send them
              a single-use code.
            </p>
            <label className="account-invite-form">
              <span className="account-invite-label">Friend email</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => onInviteEmailChange(event.target.value)}
                placeholder="friend@example.com"
                aria-label="Friend's email address"
                disabled={inviteBusy}
              />
            </label>
            <div className="account-invite-actions">
              <button
                type="button"
                disabled={inviteBusy}
                onClick={() => onCreateInvitation(false)}
              >
                {inviteBusy && inviteUrl
                  ? "Working"
                  : inviteBusy
                    ? "Working"
                    : "Copy invite link"}
              </button>
              <button
                type="button"
                className="account-invite-primary"
                disabled={inviteBusy || !inviteEmail.trim()}
                onClick={() => onCreateInvitation(true)}
              >
                {inviteBusy ? "Working" : "Create and send code"}
              </button>
            </div>
            {inviteUrl ? (
              <button
                className="invite-url"
                type="button"
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                title={inviteUrl}
                aria-label={`Copy invite URL ${inviteUrl}`}
              >
                <span className="invite-url-text">{inviteUrl}</span>
                <span className="invite-url-action" aria-hidden="true">
                  <svg viewBox="0 0 12 12" width="11" height="11">
                    <rect
                      x="3"
                      y="3"
                      width="7"
                      height="7"
                      rx="1.5"
                      stroke="currentColor"
                      fill="none"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M2 8V3a1 1 0 011-1h5"
                      stroke="currentColor"
                      fill="none"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className="account-signout"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </>
      ) : authSent ? (
        <>
          <p className="account-eyebrow">Almost there</p>
          <h2 className="account-title">Enter your code</h2>
          <p className="account-meta">
            A single-use code was sent to {email.trim() || "your address"}.
            It expires after a few minutes.
          </p>
          <form className="account-otp" onSubmit={onVerifyCode} noValidate>
            <label className="account-invite-label" htmlFor="account-otp">
              Verification code
            </label>
            <input
              id="account-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              spellCheck={false}
              value={verificationCode}
              onChange={(event) => onVerificationCodeChange(event.target.value)}
              placeholder="Six-digit code"
              minLength={6}
              maxLength={8}
              required
              autoFocus
              aria-label="Verification code"
              disabled={authBusy}
            />
            <button
              type="submit"
              className="account-invite-primary"
              disabled={authBusy || !verificationCode.trim()}
            >
              {authBusy ? "Checking" : "Verify and sign in"}
            </button>
          </form>
          <button
            type="button"
            className="account-link"
            onClick={onUseAnotherEmail}
          >
            Use a different email
          </button>
        </>
      ) : (
        <>
          <p className="account-eyebrow">Sign in</p>
          <h2 className="account-title">
            {inviteToken ? "Accept your invitation" : "Sync every device"}
          </h2>
          <p className="account-meta">
            {inviteToken
              ? "Enter the address this invite was sent to and we will create your account and email a one-time code."
              : "Enter an invited email and we will send a single-use code that signs you in."}
          </p>
          <form className="account-otp" onSubmit={onSendVerificationCode} noValidate>
            <label className="account-invite-label" htmlFor="account-email">
              Email address
            </label>
            <input
              id="account-email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@example.com"
              required
              aria-label="Email address"
              disabled={authBusy}
            />
            <button
              type="submit"
              className="account-invite-primary"
              disabled={authBusy || !email.trim()}
            >
              {authBusy ? "Sending code" : "Send verification code"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
