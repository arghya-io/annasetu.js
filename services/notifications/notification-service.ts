'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Marks the caller's notifications as read. Clients hold UPDATE on the single
 * column `is_read` only (migration 007), and RLS limits rows to the caller.
 */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const supabase = createClient();
  const query = supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
  if (ids && ids.length > 0) {
    await query.in('id', ids);
  } else {
    await query;
  }
}
