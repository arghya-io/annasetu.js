import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { KpiCard } from '@/components/shared/kpi-card';
import { QueryError } from '@/components/shared/query-error';
import { Card, CardContent } from '@/components/ui/card';
import { todayInAppTimezone } from '@/lib/constants';
import { formatDate, formatQuantity } from '@/lib/utils';

interface CentreListRow {
  centre_id: string;
  centre_name: string;
  centre_active: boolean;
  counters: number;
  booked_today: number;
  capacity_today: number;
}

export default async function GovAdminDashboardPage() {
  const session = await requirePageUser('government_admin');
  const supabase = createClient();
  const today = todayInAppTimezone();

  // All counts run through RLS, so they only ever include this admin's jurisdiction.
  const head = { count: 'exact' as const, head: true };
  const [pendingRes, approvedRes, cropChangeRes, docsRes, bookingsRes, completedRes, centresRes, adminRes] = await Promise.all([
    supabase.from('farmer_profiles').select('*', head).in('verification_status', ['submitted', 'under_verification']),
    supabase.from('farmer_profiles').select('*', head).eq('verification_status', 'approved'),
    supabase.from('crop_change_requests').select('*', head).in('status', ['pending', 'under_review']),
    supabase.from('farmer_documents').select('*', head).in('status', ['uploaded', 'under_review']),
    supabase.from('appointments').select('*', head).eq('procurement_date', today).neq('status', 'cancelled'),
    supabase.from('appointments').select('*', head).eq('procurement_date', today).eq('status', 'completed'),
    supabase.rpc('admin_list_centres'),
    supabase.from('government_admins').select('admin_role, designation').eq('user_id', session.id).maybeSingle(),
  ]);
  const pending = (pendingRes.count as number | null) ?? 0;
  const approved = (approvedRes.count as number | null) ?? 0;
  const cropChanges = (cropChangeRes.count as number | null) ?? 0;
  const docsWaiting = (docsRes.count as number | null) ?? 0;
  const bookingsToday = (bookingsRes.count as number | null) ?? 0;
  const completedToday = (completedRes.count as number | null) ?? 0;
  const centres = rows<CentreListRow>(centresRes.data);
  const admin = one<{ admin_role: string; designation: string | null }>(adminRes.data);
  const firstError = [pendingRes, approvedRes, cropChangeRes, docsRes, bookingsRes, completedRes, centresRes, adminRes].find(
    (r) => r.error,
  )?.error;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(today)} · figures cover your administrative jurisdiction{admin?.admin_role ? ` (${admin.admin_role.toUpperCase()})` : ''} only.
        </p>
      </div>

      {firstError && <QueryError message={`${firstError.message} (some figures below may be incomplete or zero)`} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <a href="/gov-admin/farmer-verification?status=pending"><KpiCard label="Applications awaiting review" value={String(pending)} highlighted tone={pending > 0 ? 'accent' : 'default'} /></a>
        <KpiCard label="Approved farmers" value={String(approved)} />
        <a href="/gov-admin/crop-change-requests"><KpiCard label="Crop change requests" value={String(cropChanges)} tone={cropChanges > 0 ? 'accent' : 'default'} /></a>
        <KpiCard label="Documents to verify" value={String(docsWaiting)} />
        <KpiCard label="Bookings today" value={String(bookingsToday)} />
        <KpiCard label="Completed today" value={String(completedToday)} />
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-semibold">Centre capacity today</h2>
          <a href="/gov-admin/centres" className="text-sm text-primary underline underline-offset-4">Manage centres</a>
        </div>
        {centres.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No centres in your jurisdiction yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {centres.slice(0, 8).map((c) => {
              const pct = Number(c.capacity_today) > 0 ? Math.min(100, Math.round((Number(c.booked_today) / Number(c.capacity_today)) * 100)) : 0;
              return (
                <Card key={c.centre_id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{c.centre_name}</p>
                      <span className="text-xs text-muted-foreground">{c.centre_active ? `${c.counters} counter(s)` : 'Inactive'}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatQuantity(c.booked_today)} of {formatQuantity(c.capacity_today)} booked · {pct}%
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
