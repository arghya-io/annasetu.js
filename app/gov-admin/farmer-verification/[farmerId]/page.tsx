import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { first, one, rows } from '@/lib/supabase/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { ReviewPanel } from '@/components/gov-admin/review-panel';
import { DocumentReviewControls } from '@/components/gov-admin/document-review-controls';
import { ViewDocumentButton } from '@/components/farmer/documents/view-document-button';
import { AccountStatusActions } from '@/components/admin/account-status-actions';
import { formatDate, formatDateTime, formatQuantity } from '@/lib/utils';
import type {
  CultivationRow, FarmerDocumentRow, FarmerProfileRow, LandOwnerRow, LandRecordRow, ProcurementCropRow,
} from '@/types/rows';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '—'}</dd>
    </div>
  );
}

export default async function FarmerReviewPage({ params }: { params: { farmerId: string } }) {
  await requirePageUser('government_admin');
  if (!UUID_RE.test(params.farmerId)) notFound();
  const id = params.farmerId;
  const supabase = createClient();

  // Every query below is RLS-scoped to this admin's jurisdiction; a farmer
  // outside it simply returns no profile row (-> 404).
  const { data: profileData } = await supabase.from('farmer_profiles').select('*').eq('user_id', id).maybeSingle();
  const profile = one<FarmerProfileRow>(profileData);
  if (!profile) notFound();

  const [ownerRes, landRes, cultRes, cropRes, docRes, reviewRes, userRes, idRes, ackRes] = await Promise.all([
    supabase.from('land_owner_details').select('*').eq('farmer_id_user', id).limit(1),
    supabase.from('land_records').select('*').eq('farmer_id_user', id).limit(1),
    supabase.from('cultivation_records').select('*').eq('farmer_id_user', id).limit(1),
    supabase.from('procurement_crops').select('id, crop_id, expected_quantity, status, crops(name, unit, msp_per_quintal)').eq('farmer_id_user', id),
    supabase.from('farmer_documents').select('id, kind, file_name, mime_type, file_size_bytes, status, rejection_reason, uploaded_at').eq('farmer_id_user', id).order('uploaded_at', { ascending: false }),
    supabase.from('farmer_verification').select('id, status, review_notes, reviewed_at, created_at').eq('farmer_id_user', id).order('created_at', { ascending: false }),
    supabase.from('users').select('account_status, must_change_password').eq('id', id).maybeSingle(),
    supabase.from('farmer_id_records').select('farmer_registry_id, identity_document_note').eq('farmer_id_user', id).limit(1),
    supabase.from('acknowledgements').select('id, acknowledged_at').eq('farmer_id_user', id).order('acknowledged_at', { ascending: false }).limit(1),
  ]);
  const owner = one<LandOwnerRow>(ownerRes.data);
  const land = one<LandRecordRow>(landRes.data);
  const cult = one<CultivationRow>(cultRes.data);
  const crops = rows<ProcurementCropRow>(cropRes.data);
  const docs = rows<FarmerDocumentRow>(docRes.data);
  const reviews = rows<{ id: string; status: string; review_notes: string | null; reviewed_at: string | null; created_at: string }>(reviewRes.data);
  const account = one<{ account_status: string; must_change_password: boolean }>(userRes.data);
  const idRecord = one<{ farmer_registry_id: string | null; identity_document_note: string | null }>(idRes.data);
  const ack = one<{ acknowledged_at: string }>(ackRes.data);
  const pendingCrops = crops.filter((c) => c.status === 'pending_approval').length;
  const reviewable = profile.verification_status === 'submitted' || profile.verification_status === 'under_verification';
  const name = `${profile.first_name} ${profile.last_name}`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <Button asChild variant="outline" size="sm"><a href="/gov-admin/farmer-verification">← All farmers</a></Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{name}</CardTitle>
              <p className="mt-1 text-sm capitalize text-muted-foreground">
                {profile.farmer_category.replace(/_/g, ' ')}
                {profile.application_id ? ` · ${profile.application_id}` : ''}
              </p>
            </div>
            <StatusBadge status={profile.verification_status} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Row label="Date of birth" value={formatDate(profile.date_of_birth)} />
            <Row label="Gender" value={<span className="capitalize">{profile.gender.replace(/_/g, ' ')}</span>} />
            <Row label="Mobile" value={profile.mobile_number} />
            <Row label="Father" value={profile.father_name} />
            <Row label="Mother" value={profile.mother_name} />
            <Row label="Spouse" value={profile.spouse_name} />
            <div className="sm:col-span-3"><Row label="Address" value={profile.address_line} /></div>
            <Row label="Farmer ID" value={idRecord?.farmer_registry_id} />
            <div className="sm:col-span-2"><Row label="Identity document (officer note)" value={idRecord?.identity_document_note} /></div>
            <Row label="Submitted" value={profile.submitted_at ? formatDateTime(profile.submitted_at) : 'Not yet'} />
            <Row label="Declarations accepted" value={ack ? formatDateTime(ack.acknowledged_at) : 'No'} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Land & cultivation</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Row label="Land record" value={land?.record_reference} />
            <Row label="Plot / Dag" value={land?.plot_or_dag} />
            <Row label="Plot area" value={land ? `${land.area_value} ${land.area_unit}` : null} />
            <Row label="Cultivated area" value={cult ? `${cult.cultivated_area} ${cult.cultivated_area_unit}` : null} />
            <Row label="Season" value={cult?.season} />
            <Row label="Tenancy / share" value={cult?.tenancy_or_share_details} />
            {owner && (
              <div className="sm:col-span-3 rounded-md bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground">Land owner / co-owner</p>
                <p className="text-sm">
                  {owner.owner_name}
                  {owner.relationship_to_farmer ? ` (${owner.relationship_to_farmer})` : ''}
                  {owner.ownership_share_percent != null ? ` · ${owner.ownership_share_percent}% share` : ''}
                  {owner.mobile_number ? ` · ${owner.mobile_number}` : ''}
                </p>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Procurement crops</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {crops.length === 0 ? <p className="text-sm text-muted-foreground">None declared.</p> : crops.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>{c.crops?.name ?? 'Crop'} · {formatQuantity(c.expected_quantity)}
                {c.crops?.msp_per_quintal != null ? ` · MSP ₹${c.crops.msp_per_quintal}/qtl` : ''}</span>
              <StatusBadge status={c.status === 'locked' ? 'approved' : c.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Documents</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {docs.length === 0 ? <p className="text-sm text-muted-foreground">No documents uploaded.</p> : docs.map((d) => (
            <div key={d.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.file_name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{d.kind.replace(/_/g, ' ')} · {formatDateTime(d.uploaded_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={d.status} />
                  <ViewDocumentButton documentId={d.id} as="admin" />
                </div>
              </div>
              {d.rejection_reason && <p className="mt-1 text-xs text-destructive">{d.rejection_reason}</p>}
              {(d.status === 'uploaded' || d.status === 'under_review' || d.status === 'pending') && (
                <div className="mt-3"><DocumentReviewControls documentId={d.id} /></div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {reviewable && <ReviewPanel farmerId={id} pendingCropCount={pendingCrops} />}

      {reviews.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Review history</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between"><StatusBadge status={r.status} /><span className="text-xs text-muted-foreground">{formatDateTime(r.reviewed_at ?? r.created_at)}</span></div>
                {r.review_notes && <p className="mt-2 text-muted-foreground">{r.review_notes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {account && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Account</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <StatusBadge status={account.account_status} />
              {account.must_change_password && <span className="text-xs text-muted-foreground">has not changed the initial password yet</span>}
            </div>
            <AccountStatusActions userId={id} status={account.account_status} holderName={name} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
