import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { getProcurableCrops } from '@/services/farmer/crops-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { CropChangeForm } from '@/components/farmer/crops/crop-change-form';
import { formatDateTime, formatQuantity } from '@/lib/utils';
import type { CropChangeRequestRow, FarmerDocumentRow, FarmerProfileRow, ProcurementCropRow } from '@/types/rows';

export default async function CropsPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const [{ data: profileData }, { data: cropData }, { data: requestData }, { data: docData }, procurable] = await Promise.all([
    supabase.from('farmer_profiles').select('verification_status').eq('user_id', session.id).maybeSingle(),
    supabase
      .from('procurement_crops')
      .select('id, crop_id, expected_quantity, status, crops(name, unit)')
      .eq('farmer_id_user', session.id)
      .neq('status', 'removed')
      .order('created_at', { ascending: true }),
    supabase
      .from('crop_change_requests')
      .select('id, farmer_id_user, existing_procurement_crop_id, requested_crop_id, requested_change_type, requested_quantity, reason, status, review_notes, submitted_at')
      .eq('farmer_id_user', session.id)
      .order('submitted_at', { ascending: false })
      .limit(20),
    supabase.from('farmer_documents').select('id, file_name').eq('farmer_id_user', session.id).order('uploaded_at', { ascending: false }),
    getProcurableCrops(),
  ]);
  const profile = one<Pick<FarmerProfileRow, 'verification_status'>>(profileData);
  const crops = rows<ProcurementCropRow>(cropData);
  const requests = rows<CropChangeRequestRow>(requestData);
  const docs = rows<Pick<FarmerDocumentRow, 'id'> & { file_name: string }>(docData);
  const approved = profile?.verification_status === 'approved';
  const cropName = new Map(procurable.map((c) => [c.id, c.name]));

  const CHANGE_LABEL: Record<string, string> = { add: 'Add crop', remove: 'Remove crop', modify_quantity: 'Change quantity' };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">My crops</h1>

      <section className="mt-6 flex flex-col gap-3">
        {crops.length === 0 ? (
          <p className="text-sm text-muted-foreground">No crops declared yet.</p>
        ) : (
          crops.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{c.crops?.name ?? 'Crop'}</p>
                  <p className="text-sm text-muted-foreground">Approved quantity {formatQuantity(c.expected_quantity)}</p>
                </div>
                <StatusBadge status={c.status === 'locked' ? 'approved' : c.status} />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Request a crop change</CardTitle>
          <CardDescription>
            Approved crops are locked. To add a crop, change a quantity or remove a crop, send a request for a
            government officer to review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approved ? (
            <CropChangeForm
              myCrops={crops.filter((c) => c.status === 'approved' || c.status === 'locked').map((c) => ({ id: c.id, name: c.crops?.name ?? 'Crop' }))}
              procurableCrops={procurable.map((c) => ({ id: c.id, name: c.name }))}
              documents={docs.map((d) => ({ id: d.id, fileName: d.file_name }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Crop changes are available once your registration is approved.</p>
          )}
        </CardContent>
      </Card>

      {requests.length > 0 && (
        <section className="mt-8">
          <h2 className="font-heading text-xl font-semibold">My requests</h2>
          <div className="mt-3 flex flex-col gap-3">
            {requests.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">
                      {CHANGE_LABEL[r.requested_change_type] ?? r.requested_change_type}
                      {r.requested_crop_id ? ` · ${cropName.get(r.requested_crop_id) ?? ''}` : ''}
                      {r.requested_quantity != null ? ` · ${formatQuantity(r.requested_quantity)}` : ''}
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.submitted_at)}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{r.reason}</p>
                  {r.review_notes && <p className="mt-2 text-sm">Reviewer: {r.review_notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
