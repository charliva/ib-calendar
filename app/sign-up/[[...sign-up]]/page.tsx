"use client";

import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { clerkVariables } from "@/components/auth/clerk-appearance";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Private preview"
      title="Create your account"
      subtitle="Syllabi turns quick captures into a realistic study plan, then keeps it honest when the week goes sideways."
      form={
        <SignUp
          appearance={{ variables: clerkVariables }}
          fallbackRedirectUrl="/calendar"
          signInUrl="/sign-in"
        />
      }
      footnote={
        <>
          Already have an account?{" "}
          <Link className="auth-shell-link" href="/sign-in">
            Sign in
          </Link>{" "}
          instead.
        </>
      }
    />
  );
}
