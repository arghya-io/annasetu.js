import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatQuantity } from '@/lib/utils';
import type { FarmerDocumentRow, FarmerProfileRow, ProcurementCropRow } from '@/types/rows';

const HEADLINES: Record<string, string> = {
  draft: 'Your registration is not submitted yet',
  submitted: 'Submitted — waiting for a reviewer',
  under_verification: 'Under verification',
  approved: 'Approved — you can book procurement slots',
  correction_required: 'Corrections needed',
  rejected: 'Application rejected',
  suspended: 'Account suspended',
};

export default async function VerificationStatusPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const { data: profileData } = await supabase.from('farmer_profiles').select('*').eq('user_id', session.id).maybeSingle();
  const profile = one<FarmerProfileRow>(profileData);

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold">Verification status</h1>
        <p className="mt-4 text-muted-foreground">You have not started your registration yet.</p>
        <Button asChild className="mt-4"><a href="/farmer/registration">Start registration</a></Button>
      </main>
    );
  }

  const [{ data: reviewData }, { data: cropData }, { data: docData }] = await Promise.all([
    supabase
      .from('farmer_verification')
      .select('id, status, review_notes, reviewed_at, created_at')
      .eq('farmer_id_user', session.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('procurement_crops')
      .select('id, crop_id, expected_quantity, status, crops(name, unit)')
      .eq('farmer_id_user', session.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('farmer_documents')
      .select('id, kind, file_name, mime_type, file_size_bytes, status, rejection_reason, uploaded_at')
      .eq('farmer_id_user', session.id)
      .order('uploaded_at', { ascending: false }),
  ]);
  const reviews = rows<{ id: string; status: string; review_notes: string | null; reviewed_at: string | null; created_at: string }>(reviewData);
  const crops = rows<ProcurementCropRow>(cropData);
  const docs = rows<FarmerDocumentRow>(docData);
  const canEdit = profile.verification_status === 'draft' || profile.verification_status === 'correction_required';

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Verification status</h1>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-lg">{HEADLINES[profile.verification_status] ?? profile.verification_status}</CardTitle>
            <StatusBadge status={profile.verification_status} />
          </div>
          <CardDescription>
            {profile.application_id ? `Application ${profile.application_id}` : 'Not yet submitted'}
            {profile.submitted_at ? ` · submitted ${formatDateTime(profile.submitted_at)}` : ''}
          </CardDescription>
        </CardHeader>
        {(canEdit || profile.verification_status === 'approved') && (
          <CardContent className="flex flex-wrap gap-3">
            {canEdit && <Button asChild><a href="/farmer/registration">Edit &amp; resubmit</a></Button>}
            {profile.verification_status === 'approved' && <Button asChild><a href="/farmer/book">Book procurement</a></Button>}
          </CardContent>
        )}
      </Card>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-semibold">Your procurement crops</h2>
        {crops.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No crops declared yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {crops.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{c.crops?.name ?? 'Crop'}</p>
                    <p className="text-sm text-muted-foreground">Expected {formatQuantity(c.expected_quantity)}</p>
                  </div>
                  <StatusBadge status={c.status === 'locked' ? 'approved' : c.status} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-semibold">Documents</h2>
          <a href="/farmer/documents" className="text-sm text-primary underline underline-offset-4">Manage</a>
        </div>
        {docs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {docs.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{d.file_name}</p>
                    <StatusBadge status={d.status} />
                  </div>
                  {d.rejection_reason && <p className="mt-1 text-sm text-destructive">{d.rejection_reason}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-semibold">Review history</h2>
        {reviews.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No reviewer decisions yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={r.status} />
                  <span className="text-xs text-muted-foreground">{formatDateTime(r.reviewed_at ?? r.created_at)}</span>
                </div>
                {r.review_notes && <p className="mt-2 text-muted-foreground">{r.review_notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
