"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function AccessGate({ denied }: { denied: boolean }) {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError("");
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setCodeSent(true);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !verificationCode.trim() || busy) return;
    setBusy(true);
    setError("");
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: verificationCode.replace(/\s/g, ""),
      type: "email",
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
    }
  }

  const eyebrow = denied ? "Access not permitted" : "Restricted preview";
  const title = denied
    ? "This account is not on the list"
    : "Sign in to continue";
  const subtitle = denied
    ? "This deployment of Syllabi is limited to invited email addresses. Ask the person who invited you to send a fresh link."
    : "Enter an invited email and we will send a single-use code. The code proves the address is yours before a calendar session is issued.";

  return (
    <main className="auth-shell auth-shell-page" aria-label="Sign in">
      <Link className="auth-shell-mark" href="/">
        <span className="auth-shell-mark-glyph" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14" role="presentation">
            <rect x="0" y="0" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.92" />
            <rect x="9" y="0" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.42" />
            <rect x="0" y="9" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.42" />
            <rect x="9" y="9" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.92" />
          </svg>
        </span>
        <span className="auth-shell-mark-text">Syllabi</span>
      </Link>

      <section className="auth-shell-card" aria-label={title}>
        <p className="auth-shell-eyebrow">{eyebrow}</p>
        <h1 className="auth-shell-title">{title}</h1>
        <p className="auth-shell-subtitle">{subtitle}</p>

        {error ? (
          <p className="auth-shell-footnote auth-shell-error" role="alert">
            {error}
          </p>
        ) : null}

        {codeSent ? (
          <form className="auth-shell-form" onSubmit={verifyCode} noValidate>
            <label className="auth-shell-field">
              <span className="auth-shell-field-label">Verification code</span>
              <input
                className="auth-shell-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                spellCheck={false}
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                placeholder="Six-digit code"
                aria-label="Verification code"
                required
                disabled={busy}
              />
            </label>
            <button
              className="auth-shell-submit"
              type="submit"
              disabled={busy || !verificationCode.trim()}
            >
              {busy ? "Checking" : "Verify and continue"}
            </button>
            <p className="auth-shell-footnote">
              Sent to {email.trim()}.{" "}
              <button
                type="button"
                className="auth-shell-link"
                onClick={() => {
                  setCodeSent(false);
                  setVerificationCode("");
                  setError("");
                }}
              >
                Use a different email
              </button>
            </p>
          </form>
        ) : (
          <form className="auth-shell-form" onSubmit={sendCode} noValidate>
            <label className="auth-shell-field">
              <span className="auth-shell-field-label">Email address</span>
              <input
                className="auth-shell-input"
                type="email"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                required
                disabled={busy}
              />
            </label>
            <button
              className="auth-shell-submit"
              type="submit"
              disabled={busy || !email.trim()}
            >
              {busy ? "Sending code" : "Send verification code"}
            </button>
            <p className="auth-shell-footnote">
              Sign-in is by invitation. New here?{" "}
              <a className="auth-shell-link" href="mailto:hello@syllabi.app">
                Ask for an invite
              </a>
              .
            </p>
          </form>
        )}
      </section>

      <p className="auth-shell-footnote auth-shell-foot">
        Syllabi runs a personal calendar that syncs across every device.
      </p>
    </main>
  );
}
