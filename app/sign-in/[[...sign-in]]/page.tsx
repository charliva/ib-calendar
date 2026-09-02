"use client";

import { SignIn } from "@clerk/nextjs";
import { clerkVariables } from "@/components/auth/clerk-appearance";
import { AuthShell } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Private preview"
      title="Sign in to Syllabi"
      subtitle="Your calendar, intentions, and assignments — synced across every device you use for school."
      form={
        <SignIn
          appearance={{ variables: clerkVariables }}
          fallbackRedirectUrl="/calendar"
          signUpUrl="/sign-up"
        />
      }
      footnote={
        <>
          New here? Syllabi is invitation-only for now. Ask a friend to send
          you an invite link, or use the email address they added you under.
        </>
      }
    />
  );
}
