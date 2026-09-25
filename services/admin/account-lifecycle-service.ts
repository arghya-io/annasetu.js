'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateInitialPassword } from '@/lib/password';
import { rpcErrorMessage } from '@/lib/rpc-errors';

export type LifecycleResult = { ok: true } | { ok: false; error: string };
export type RegenerateResult = { ok: true; initialPassword: string } | { ok: false; error: string };

/** ~100 years: Supabase Auth has no "banned forever", only a duration. */
const BAN_DURATION = '876000h';

/**
 * Suspend / activate. The jurisdiction-checked RPC runs first (and is what
 * flips users.account_status, which the database itself checks on every RLS
 * read and RPC). The Auth ban that follows additionally stops the account
 * from refreshing its session or signing in again.
 */
export async function suspendAccount(userId: string, reason: string): Promise<LifecycleResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('suspend_account', { p_user_id: userId, p_reason: reason });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not suspend this account') };

  // Best effort: account_status already blocks every request at the database,
  // the Auth ban is defence in depth (no session refresh, no new sign-in).
  await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
  return { ok: true };
}

export async function activateAccount(userId: string): Promise<LifecycleResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('activate_account', { p_user_id: userId });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not activate this account') };

  await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: 'none' });
  return { ok: true };
}

/**
 * Regenerates an initial password (spec §26). In order:
 *   1. authorize_password_regeneration() — jurisdiction check ONLY, no state change.
 *   2. Rotate the password via the Auth admin API (invalidates the old one).
 *   3. mark_password_regenerated() — re-arms must_change_password + audit.
 * A failed rotation therefore never leaves an account flagged as reset, and
 * administrator accounts / the caller's own account are refused by the RPC.
 */
export async function regenerateInitialPassword(userId: string): Promise<RegenerateResult> {
  const supabase = createClient();

  const { error: authzError } = await supabase.rpc('authorize_password_regeneration', { p_user_id: userId });
  if (authzError) return { ok: false, error: rpcErrorMessage(authzError.message, 'Not authorized for this account') };

  const newPassword = generateInitialPassword();
  const { error: updateError } = await createAdminClient().auth.admin.updateUserById(userId, { password: newPassword });
  if (updateError) return { ok: false, error: 'Could not update the account password' };

  const { error: markError } = await supabase.rpc('mark_password_regenerated', { p_user_id: userId });
  if (markError) {
    return { ok: false, error: 'The password was changed but the account could not be flagged for reset. Regenerate it again.' };
  }

  return { ok: true, initialPassword: newPassword };
}
