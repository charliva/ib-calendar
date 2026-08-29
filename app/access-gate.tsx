"use client";

import { CloudOff, Lock } from "lucide-react";
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

  return (
    <main className="access-gate">
      <section className="access-gate-card" aria-label="Restricted access">
        <span className="access-gate-mark">
          {denied ? <CloudOff size={20} /> : <Lock size={20} />}
        </span>
        <h1>{denied ? "Access not permitted" : "Restricted preview"}</h1>
        <p>
          {denied
            ? "This deployment is limited to invited email addresses."
            : "Sign in with an invited email address to continue."}
        </p>
        {error ? <p className="access-gate-error">{error}</p> : null}
        {codeSent ? (
          <form onSubmit={verifyCode}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder="Verification code"
              aria-label="Verification code"
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Verify & continue"}
            </button>
            <button
              type="button"
              className="access-gate-secondary"
              onClick={() => {
                setCodeSent(false);
                setVerificationCode("");
              }}
            >
              Use another email
            </button>
          </form>
        ) : (
          <form onSubmit={sendCode}>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send verification code"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
