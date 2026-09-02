import { Asterisk } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Calm editorial shell for the sign-in / sign-up pages. Single column on
 * a paper-textured background, with the wordmark at the top and a quiet
 * footer note. The Clerk <SignIn /> or <SignUp /> component is passed in
 * as the `form` slot so we own the chrome and Clerk owns the form fields.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  form,
  footnote,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  form: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <Link href="/" className="auth-shell-mark" aria-label="Syllabi home">
        <span className="auth-shell-mark-glyph" aria-hidden="true">
          <Asterisk size={18} strokeWidth={1.5} />
        </span>
        <span className="auth-shell-mark-text">Syllabi</span>
      </Link>

      <section className="auth-shell-card">
        <p className="auth-shell-eyebrow">{eyebrow}</p>
        <h1 className="auth-shell-title">{title}</h1>
        <p className="auth-shell-subtitle">{subtitle}</p>
        <div className="auth-shell-form">{form}</div>
      </section>

      {footnote ? (
        <p className="auth-shell-footnote">{footnote}</p>
      ) : null}
    </div>
  );
}
