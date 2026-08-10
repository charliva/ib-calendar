import { createClient } from "@supabase/supabase-js";

function serverEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !publishableKey || !secretKey) {
    throw new Error("Invitation service is not configured");
  }

  return { url, publishableKey, secretKey };
}

export function createAdminClient() {
  const { url, secretKey } = serverEnv();
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createServerAuthClient() {
  const { url, publishableKey } = serverEnv();
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function ensureAccountAndSendCode(
  email: string,
  invitedBy: string,
) {
  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { invited_by: invitedBy },
  });

  if (
    createError &&
    createError.code !== "email_exists" &&
    createError.code !== "user_already_exists"
  ) {
    throw createError;
  }

  const auth = createServerAuthClient();
  const { error: otpError } = await auth.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (otpError) throw otpError;
}
