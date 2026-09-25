import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { rows } from '@/lib/supabase/helpers';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { HelpRequestActions } from '@/components/csc/help-request-actions';
import { formatDateTime } from '@/lib/utils';
import type { HelpRequestRow } from '@/types/rows';

export default async function CscHelpRequestsPage() {
  const session = await requirePageUser('csc_operator');
  const supabase = createClient();

  // RLS: open requests from this operator's district, plus anything they handle.
  const { data } = await supabase
    .from('help_requests')
    .select('id, subject, description, status, farmer_id_user, handled_by, resolution_note, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const requests = rows<HelpRequestRow>(data);
  const active = requests.filter((r) => r.status === 'open' || r.status === 'in_progress');
  const done = requests.filter((r) => r.status === 'resolved' || r.status === 'closed');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Help requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Requests from farmers in your district. You assist with forms and guidance — government officers make every approval decision.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {active.length === 0 && <p className="text-sm text-muted-foreground">No open requests right now.</p>}
        {active.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{r.subject}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
              {r.description && <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>}
              <HelpRequestActions requestId={r.id} status={r.status} mine={r.handled_by === session.id} />
            </CardContent>
          </Card>
        ))}
      </div>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="font-heading text-xl font-semibold">Resolved</h2>
          <div className="mt-3 flex flex-col gap-2">
            {done.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm">
                <span>{r.subject}</span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
