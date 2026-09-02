"use client";

import { Check, Copy, UserPlus, X } from "lucide-react";
import { useState } from "react";

type AccountUser = {
  id: string;
  email: string | null;
};

export function AccountPanel({
  user,
  inviteEmail,
  inviteUrl,
  inviteBusy,
  onClose,
  onInviteEmailChange,
  onCreateInvitation,
}: {
  user: AccountUser;
  inviteEmail: string;
  inviteUrl: string;
  inviteBusy: boolean;
  onClose: () => void;
  onInviteEmailChange: (value: string) => void;
  onCreateInvitation: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard might be denied in insecure contexts; the button still
      // displays the URL so the user can copy by hand.
    }
  }

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

      <p className="account-eyebrow">Account</p>
      <h2 className="account-title">
        Signed in as <span className="account-title-name">{user.email ?? "you"}</span>
      </h2>
      <p className="account-meta">
        Your calendar syncs to this address across every device. Sign out is in
        the top right.
      </p>

      <div className="account-invites">
        <p className="account-eyebrow">Invite</p>
        <h3>Bring a friend into the preview</h3>
        <p>
          We&apos;ll create their account and email a one-time sign-in link
          that expires in seven days.
        </p>
        <form
          className="account-invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateInvitation();
          }}
        >
          <label className="account-invite-label" htmlFor="invite-email">
            Friend&apos;s email
          </label>
          <input
            id="invite-email"
            type="email"
            value={inviteEmail}
            onChange={(event) => onInviteEmailChange(event.target.value)}
            placeholder="friend@example.com"
            autoComplete="off"
            required
          />
          <button type="submit" disabled={inviteBusy || !inviteEmail.trim()}>
            {inviteBusy ? "Sending invite…" : "Send invite"}
          </button>
        </form>

        {inviteUrl ? (
          <div className="invite-result" role="status">
            <p className="invite-result-label">
              <UserPlus size={12} aria-hidden="true" /> One-time link ready
            </p>
            <button
              className="invite-url"
              type="button"
              onClick={copyInviteUrl}
              title={inviteUrl}
            >
              <span className="invite-url-text">{inviteUrl}</span>
              <span className="invite-url-action" aria-hidden="true">
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </span>
            </button>
            <p className="invite-result-help">
              {copied ? "Copied to clipboard." : "Tap to copy the link."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
