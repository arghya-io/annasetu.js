import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { first, rows } from '@/lib/supabase/helpers';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { CropChangeReview } from '@/components/gov-admin/crop-change-review';
import { QueryError } from '@/components/shared/query-error';
import { formatDateTime, formatQuantity } from '@/lib/utils';

interface RequestRow {
  id: string;
  farmer_id_user: string;
  existing_procurement_crop_id: string | null;
  requested_crop_id: string | null;
  requested_change_type: 'add' | 'remove' | 'modify_quantity';
  requested_quantity: number | null;
  reason: string;
  status: string;
  review_notes: string | null;
  submitted_at: string;
  farmer_profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

const LABEL: Record<string, string> = { add: 'Add crop', remove: 'Remove crop', modify_quantity: 'Change quantity' };

export default async function CropChangeRequestsPage() {
  await requirePageUser('government_admin');
  const supabase = createClient();

  const [{ data, error }, { data: cropData }, { data: pcData }] = await Promise.all([
    supabase
      .from('crop_change_requests')
      .select('id, farmer_id_user, existing_procurement_crop_id, requested_crop_id, requested_change_type, requested_quantity, reason, status, review_notes, submitted_at, farmer_profiles(first_name, last_name)')
      .order('submitted_at', { ascending: false })
      .limit(100),
    supabase.from('crops').select('id, name'),
    supabase.from('procurement_crops').select('id, expected_quantity, crops(name)'),
  ]);
  const requests = rows<RequestRow>(data);
  const cropName = new Map(rows<{ id: string; name: string }>(cropData).map((c) => [c.id, c.name]));
  const existing = new Map(
    rows<{ id: string; expected_quantity: number; crops: { name: string } | { name: string }[] | null }>(pcData).map((p) => [
      p.id,
      { name: first(p.crops)?.name ?? 'Crop', qty: Number(p.expected_quantity) },
    ]),
  );

  const open = requests.filter((r) => r.status === 'pending' || r.status === 'under_review');
  const done = requests.filter((r) => !(r.status === 'pending' || r.status === 'under_review'));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Crop change requests</h1>
      <p className="mt-1 text-sm text-muted-foreground">From approved farmers in your jurisdiction.</p>

      {error && <QueryError message={error.message} />}

      <h2 className="mt-6 font-heading text-xl font-semibold">Awaiting review ({open.length})</h2>
      <div className="mt-3 flex flex-col gap-3">
        {!error && open.length === 0 && <p className="text-sm text-muted-foreground">Nothing to review.</p>}
        {open.map((r) => {
          const farmer = first(r.farmer_profiles);
          const current = r.existing_procurement_crop_id ? existing.get(r.existing_procurement_crop_id) : null;
          return (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{farmer ? `${farmer.first_name} ${farmer.last_name}` : 'Farmer'} · {LABEL[r.requested_change_type]}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.requested_change_type === 'add' && `${cropName.get(r.requested_crop_id ?? '') ?? 'Crop'} · ${formatQuantity(r.requested_quantity)}`}
                      {r.requested_change_type === 'modify_quantity' && `${current?.name ?? 'Crop'}: ${formatQuantity(current?.qty)} → ${formatQuantity(r.requested_quantity)}`}
                      {r.requested_change_type === 'remove' && `${current?.name ?? 'Crop'} (${formatQuantity(current?.qty)})`}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(r.submitted_at)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-2 text-sm">{r.reason}</p>
                <CropChangeReview requestId={r.id} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {done.length > 0 && (
        <>
          <h2 className="mt-8 font-heading text-xl font-semibold">Reviewed</h2>
          <div className="mt-3 flex flex-col gap-2">
            {done.map((r) => {
              const farmer = first(r.farmer_profiles);
              return (
                <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm">
                  <span>{farmer ? `${farmer.first_name} ${farmer.last_name}` : 'Farmer'} · {LABEL[r.requested_change_type]}</span>
                  <StatusBadge status={r.status} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
