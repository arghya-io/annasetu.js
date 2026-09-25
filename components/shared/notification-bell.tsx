'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Unread-notification badge. Counts through the caller's own RLS scope, then
 * keeps itself fresh via a realtime INSERT subscription (and a slow poll as a
 * fallback if the realtime connection drops).
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function refresh() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);
      if (!cancelled) setUnread(typeof count === 'number' ? count : 0);
    }

    refresh();
    const timer = setInterval(refresh, 60000);
    const channel = supabase
      .channel('notification-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        refresh();
      })
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [pathname]);

  return (
    <a
      href="/notifications"
      className="relative rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
      aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
    >
      <span aria-hidden>🔔</span>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </a>
  );
}
