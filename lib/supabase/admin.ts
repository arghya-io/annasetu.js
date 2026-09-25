import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * SERVICE-ROLE client. Bypasses RLS entirely.
 *
 * The `server-only` import above makes any accidental client-side import of
 * this file fail the build, on top of SUPABASE_SERVICE_ROLE_KEY never being
 * prefixed NEXT_PUBLIC_ and thus never being bundled to the browser anyway.
 *
 * Use this ONLY for operations that must legitimately cross RLS boundaries,
 * and ALWAYS authorize the caller yourself immediately before calling it —
 * this client trusts nothing on your behalf. Legitimate uses:
 *   - Creating/deleting Supabase Auth identities and the role rows around
 *     them, AFTER an RLS-respecting RPC has confirmed the caller is a
 *     government admin whose jurisdiction covers the target (see
 *     services/admin/provisioning-service.ts — the check comes FIRST).
 *   - Clearing must_change_password after a verified password change.
 *   - Generating signed URLs for private Storage objects after an RPC has
 *     confirmed the requester may see that specific document.
 *   - Cron/maintenance RPCs restricted to service_role.
 *
 * Do NOT use this as a shortcut around an RLS policy that's merely
 * inconvenient — if a normal farmer/operator/CSC read or write needs it, the
 * RLS policy or the RPC in supabase/migrations/*.sql is what needs fixing.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase service-role environment variables are not configured');
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
