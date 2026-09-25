import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { KpiCard } from '@/components/shared/kpi-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { AutoRefresh } from '@/components/shared/auto-refresh';
import { CallTokenButton } from '@/components/operator/call-token-button';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { todayInAppTimezone } from '@/lib/constants';
import { formatDate, formatDuration, formatQuantity, formatTime } from '@/lib/utils';
import type { CentreRow } from '@/types/rows';

interface QueueItem {
  queue_entry_id: string;
  appointment_id: string;
  token: string;
  entry_status: string;
  queue_pos: number | null;
  counter: number | null;
  eta_seconds: number | null;
  scheduled_time: string;
  farmer_name: string;
  crop_name: string;
  quantity: number;
  record_id: string | null;
  record_stage: string | null;
}

export default async function OperatorDashboardPage() {
  const session = await requirePageUser('centre_operator');
  const supabase = createClient();
  const today = todayInAppTimezone();

  const { data: assignment } = await supabase
    .from('centre_operators')
    .select('centre_id')
    .eq('user_id', session.id)
    .maybeSingle();
  const centreId = one<{ centre_id: string }>(assignment)?.centre_id;

  if (!centreId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold">Centre queue</h1>
        <p className="mt-4 text-muted-foreground">Your account is not assigned to a procurement centre yet. Contact your BDO/SDO office.</p>
      </main>
    );
  }

  const [{ data: centreData }, { data: capData }, { data: queueData }] = await Promise.all([
    supabase
      .from('procurement_centres')
      .select('id, name, code, is_active, daily_capacity_quintal, counters_count, avg_processing_time_seconds')
      .eq('id', centreId)
      .maybeSingle(),
    supabase
      .from('centre_daily_capacity')
      .select('total_capacity_quintal, booked_quantity_quintal')
      .eq('centre_id', centreId)
      .eq('capacity_date', today)
      .maybeSingle(),
    supabase.rpc('operator_queue', { p_date: today }),
  ]);
  const centre = one<CentreRow>(centreData);
  const cap = one<{ total_capacity_quintal: number; booked_quantity_quintal: number }>(capData);
  const queue = rows<QueueItem>(queueData);

  const count = (...statuses: string[]) => queue.filter((q) => statuses.includes(q.entry_status)).length;
  const active = queue.filter((q) => !['completed', 'cancelled', 'no_show'].includes(q.entry_status));
  const finished = queue.filter((q) => ['completed', 'cancelled', 'no_show'].includes(q.entry_status));

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <AutoRefresh seconds={20} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold">{centre?.name ?? 'Centre'} — today&apos;s queue</h1>
          <p className="text-sm text-muted-foreground">{formatDate(today)} · {centre?.counters_count ?? 1} counter(s) · refreshes automatically</p>
        </div>
        <Button asChild><a href="/operator/scan">Scan QR to check in</a></Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Waiting to arrive" value={String(count('waiting'))} />
        <KpiCard label="Checked in / called" value={String(count('checked_in', 'called'))} highlighted />
        <KpiCard label="In progress" value={String(count('in_progress'))} />
        <KpiCard label="Completed" value={String(count('completed'))} />
        <KpiCard label="Capacity booked" value={cap ? `${formatQuantity(cap.booked_quantity_quintal)} / ${formatQuantity(cap.total_capacity_quintal)}` : 'No bookings yet'} />
        <KpiCard label="Avg. handling time" value={formatDuration(centre?.avg_processing_time_seconds ?? null)} />
      </div>

      <section>
        <h2 className="font-heading text-xl font-semibold">Queue</h2>
        {active.length === 0 ? (
          <p className="mt-3 text-muted-foreground">Nobody is waiting right now.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {active.map((q) => (
              <Card key={q.queue_entry_id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-md bg-primary/10 text-primary">
                      <span className="text-[10px] leading-none">Token</span>
                      <span className="font-heading text-lg leading-tight">{q.token}</span>
                    </div>
                    <div>
                      <p className="font-medium">{q.farmer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {q.crop_name} · {formatQuantity(q.quantity)} · slot {formatTime(q.scheduled_time)}
                        {q.queue_pos != null ? ` · #${q.queue_pos}` : ''}
                        {q.counter != null ? ` · counter ${q.counter}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={q.entry_status} />
                    {q.entry_status === 'checked_in' && <CallTokenButton queueEntryId={q.queue_entry_id} />}
                    {['checked_in', 'called', 'in_progress'].includes(q.entry_status) && (
                      <Button asChild size="sm" variant="outline">
                        <a href={`/operator/processing/${q.appointment_id}`}>Open</a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {finished.length > 0 && (
        <section>
          <h2 className="font-heading text-xl font-semibold">Done today</h2>
          <div className="mt-3 flex flex-col gap-2">
            {finished.map((q) => (
              <div key={q.queue_entry_id} className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm">
                <span>
                  Token {q.token} · {q.farmer_name} · {q.crop_name}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={q.entry_status} />
                  {q.entry_status === 'completed' && (
                    <a className="text-primary underline underline-offset-4" href={`/operator/processing/${q.appointment_id}`}>View</a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
