import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { HelpForm } from '@/components/farmer/help/help-form';
import { formatDateTime } from '@/lib/utils';
import type { HelpRequestRow } from '@/types/rows';

export default async function FarmerHelpPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const [{ data: profileData }, { data: requestData }] = await Promise.all([
    supabase.from('farmer_profiles').select('user_id').eq('user_id', session.id).maybeSingle(),
    supabase
      .from('help_requests')
      .select('id, subject, description, status, farmer_id_user, handled_by, resolution_note, created_at')
      .eq('raised_by', session.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  const hasProfile = !!one<{ user_id: string }>(profileData);
  const requests = rows<HelpRequestRow>(requestData);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Help</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask a Common Service Centre (CSC) operator in your district to help with registration or booking.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">New help request</CardTitle>
          <CardDescription>CSC operators help you fill in forms; they cannot approve applications.</CardDescription>
        </CardHeader>
        <CardContent>
          <HelpForm needsDistrict={!hasProfile} />
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button asChild variant="outline" size="sm"><a href={'https://www.google.com/search?q=Common+Service+Centre+CSC+near+me'} target="_blank" rel="noopener noreferrer">Find a CSC near me (external search)</a></Button>
      </div>

      {requests.length > 0 && (
        <section className="mt-8">
          <h2 className="font-heading text-xl font-semibold">My requests</h2>
          <div className="mt-3 flex flex-col gap-3">
            {requests.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{r.subject}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
                  {r.description && <p className="mt-2 text-sm text-muted-foreground">{r.description}</p>}
                  {r.resolution_note && <p className="mt-2 text-sm">CSC: {r.resolution_note}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
