import { createClient, type User } from "@supabase/supabase-js";

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
    // With public signup disabled, GoTrue only sends an OTP when the address
    // already belongs to a confirmed account. The OTP still proves ownership
    // before a browser session is issued.
    email_confirm: true,
    app_metadata: { invited_by: invitedBy },
  });

  if (
    createError &&
    createError.code !== "email_exists" &&
    createError.code !== "user_already_exists"
  ) {
    throw createError;
  }

  if (createError) {
    // Repair accounts left unconfirmed by an earlier failed invitation.
    // Supabase has no admin get-by-email method, so use its paginated list.
    let existingUser: User | null = null;
    for (let page = 1; page <= 20 && !existingUser; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      existingUser =
        data.users.find(
          (user) => user.email?.trim().toLowerCase() === email,
        ) ?? null;
      if (data.users.length < 1000) break;
    }

    if (!existingUser) {
      throw new Error("The invited account could not be found");
    }

    if (!existingUser.email_confirmed_at) {
      const { error: confirmError } = await admin.auth.admin.updateUserById(
        existingUser.id,
        {
          email_confirm: true,
          app_metadata: {
            ...existingUser.app_metadata,
            invited_by: invitedBy,
          },
        },
      );
      if (confirmError) throw confirmError;
    }
  }

  const auth = createServerAuthClient();
  const { error: otpError } = await auth.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (otpError) throw otpError;
}
