import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { AppShell } from '@/components/shared/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { MarkAllReadButton } from '@/components/shared/mark-all-read-button';
import { formatDateTime } from '@/lib/utils';
import type { NotificationRow } from '@/types/rows';

export default async function NotificationsPage() {
  const session = await requirePageUser();
  const supabase = createClient();

  const [{ data: profile }, { data }] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', session.id).maybeSingle(),
    supabase
      .from('notifications')
      .select('id, type, title, body, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const notifications = rows<NotificationRow>(data);
  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <AppShell role={session.role} userName={one<{ full_name: string }>(profile)?.full_name ?? ''}>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-heading text-3xl font-semibold">Notifications</h1>
          {hasUnread && <MarkAllReadButton />}
        </div>

        {notifications.length === 0 ? (
          <p className="mt-6 text-muted-foreground">You have no notifications yet.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {notifications.map((n) => (
              <Card key={n.id} className={n.is_read ? '' : 'border-primary/40 bg-primary/5'}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{n.title}</p>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
