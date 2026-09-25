'use server';

import { createClient as createEphemeralClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { newPasswordSchema, type NewPasswordInput } from '@/lib/validation/admin';

export type FirstLoginResult = { ok: true } | { ok: false; error: string };

/**
 * Mandatory first-login password change (spec §13).
 *
 * The flow is enforced entirely on the server, in this order:
 *   1. Identify the caller from the verified session (not from client input).
 *   2. Prove they know the current password by signing in with it on a
 *      THROWAWAY client (no cookies touched, session revoked immediately).
 *   3. Rotate the password through the Auth admin API.
 *   4. Clear must_change_password with clear_must_change_password(), an RPC
 *      only the service role can execute.
 *
 * The old design let the browser call complete_first_login_password_change()
 * directly and skip step 3 — a must-change account could unlock itself
 * without ever changing the initial password. That RPC no longer exists.
 */
export async function changeInitialPassword(input: NewPasswordInput): Promise<FirstLoginResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Your session has expired. Please sign in again.' };

  // 2. Verify the current password against the identity this account signs in with.
  const credentials = user.phone
    ? { phone: user.phone.startsWith('+') ? user.phone : `+${user.phone}` }
    : user.email
      ? { email: user.email }
      : null;
  if (!credentials) return { ok: false, error: 'This account has no sign-in identifier.' };

  const throwaway = createEphemeralClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: reauthError } = await throwaway.auth.signInWithPassword({
    ...credentials,
    password: parsed.data.currentPassword,
  });
  if (reauthError) return { ok: false, error: 'Current password is incorrect' };
  await throwaway.auth.signOut({ scope: 'local' });

  // 3 + 4. Rotate, then clear the flag — both with the service role.
  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: parsed.data.newPassword,
  });
  if (updateError) return { ok: false, error: 'Could not set the new password. Try a different one.' };

  const { error: clearError } = await admin.rpc('clear_must_change_password', { p_user_id: user.id });
  if (clearError) {
    return { ok: false, error: 'Password changed, but account setup could not be finished. Contact your BDO/SDO office.' };
  }

  return { ok: true };
}
