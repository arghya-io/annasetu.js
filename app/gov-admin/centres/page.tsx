import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { rows } from '@/lib/supabase/helpers';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { CentreControls } from '@/components/gov-admin/centre-controls';
import { QueryError } from '@/components/shared/query-error';
import { formatDuration, formatQuantity } from '@/lib/utils';

interface CentreListRow {
  centre_id: string;
  centre_name: string;
  centre_code: string;
  centre_active: boolean;
  daily_capacity: number;
  counters: number;
  avg_processing_seconds: number | null;
  district_name: string;
  centre_kind: string | null;
  booked_today: number;
  capacity_today: number;
}

export default async function CentresPage() {
  await requirePageUser('government_admin');
  const supabase = createClient();
  const { data, error } = await supabase.rpc('admin_list_centres');
  const centres = rows<CentreListRow>(data);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-semibold">Procurement centres</h1>
        <a href="/gov-admin/account-provisioning/centre" className="text-sm font-medium text-primary underline underline-offset-4">Add centre →</a>
      </div>

      {error && <QueryError message={error.message} />}

      <div className="mt-6 flex flex-col gap-3">
        {!error && centres.length === 0 && <p className="text-sm text-muted-foreground">No centres in your jurisdiction yet.</p>}
        {centres.map((c) => {
          const pct = c.capacity_today > 0 ? Math.min(100, Math.round((Number(c.booked_today) / Number(c.capacity_today)) * 100)) : 0;
          return (
            <Card key={c.centre_id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.centre_name} <span className="text-sm text-muted-foreground">({c.centre_code})</span></p>
                    <p className="text-sm text-muted-foreground">
                      {c.district_name}{c.centre_kind ? ` · ${c.centre_kind}` : ''} · {c.counters} counter{c.counters === 1 ? '' : 's'} · avg {formatDuration(c.avg_processing_seconds)}
                    </p>
                  </div>
                  <StatusBadge status={c.centre_active ? 'active' : 'suspended'} />
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Today: {formatQuantity(c.booked_today)} of {formatQuantity(c.capacity_today)} booked</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <CentreControls centreId={c.centre_id} isActive={c.centre_active} dailyCapacity={Number(c.daily_capacity)} counters={c.counters} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
