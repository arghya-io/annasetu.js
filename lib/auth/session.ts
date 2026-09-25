import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { one } from '@/lib/supabase/helpers';
import type { AppRole } from '@/types/database';

export interface SessionUser {
  id: string;
  role: AppRole;
}

/**
 * Resolves the caller from the verified session cookie. Server Actions are
 * public POST endpoints, so every action MUST derive identity from here —
 * never from an id passed in by the client.
 *
 * Returns null unless the user is signed in, has an app profile, is
 * 'active', and has cleared any forced password change.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('role, account_status, must_change_password, is_active')
    .eq('id', user.id)
    .maybeSingle();
  const row = one<{ role: AppRole; account_status: string; must_change_password: boolean; is_active: boolean }>(data);
  if (!row) return null;
  if (row.account_status !== 'active' || row.must_change_password || !row.is_active) return null;
  return { id: user.id, role: row.role };
}

/** Like getSessionUser() but also requires one of the given roles. */
export async function requireRole(...roles: AppRole[]): Promise<SessionUser | null> {
  const session = await getSessionUser();
  if (!session || !roles.includes(session.role)) return null;
  return session;
}

/**
 * For pages/layouts: the signed-in, active user, or a redirect to /login.
 * (The middleware already keeps other roles/states out; this gives the page
 * the user id it needs and a safe fallback if the middleware was bypassed.)
 */
export async function requirePageUser(...roles: AppRole[]): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  if (roles.length > 0 && !roles.includes(session.role)) redirect('/unauthorized');
  return session;
}
