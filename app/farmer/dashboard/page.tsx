import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatTime, formatQuantity } from '@/lib/utils';
import type { AppointmentRow, FarmerProfileRow } from '@/types/rows';

export default async function FarmerDashboardPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const { data: profileData } = await supabase
    .from('farmer_profiles')
    .select('first_name, last_name, verification_status, application_id')
    .eq('user_id', session.id)
    .maybeSingle();
  const profile = one<Pick<FarmerProfileRow, 'first_name' | 'last_name' | 'verification_status' | 'application_id'>>(profileData);

  const { data: bookingData } = await supabase
    .from('appointments')
    .select('id, procurement_date, procurement_time, quantity_quintal, status, procurement_centres(name), procurement_crops(crops(name, unit))')
    .eq('farmer_id_user', session.id)
    .in('status', ['booked', 'confirmed', 'checked_in', 'in_progress'])
    .order('procurement_date', { ascending: true })
    .order('procurement_time', { ascending: true })
    .limit(5);
  const upcoming = rows<AppointmentRow>(bookingData);

  const status = profile?.verification_status;
  const needsRegistration = !profile || status === 'draft' || status === 'correction_required';

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">
        {profile ? `Welcome, ${profile.first_name}` : 'Welcome to AnnaSetu'}
      </h1>

      {profile && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
          Verification status <StatusBadge status={profile.verification_status} />
          {profile.application_id && <span className="text-xs">· Application {profile.application_id}</span>}
        </p>
      )}

      {needsRegistration && (
        <Card className="mt-6 border-accent/30 bg-accent/5">
          <CardHeader>
            <CardTitle className="text-lg">
              {status === 'correction_required' ? 'Correction requested' : profile ? 'Finish your registration' : 'Complete your farmer registration'}
            </CardTitle>
            <CardDescription>
              {status === 'correction_required'
                ? 'The reviewer asked for changes. Update your details and resubmit.'
                : 'Finish the four-step registration to become eligible for procurement booking.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg">
              <a href="/farmer/registration">{profile ? 'Continue registration' : 'Start registration'}</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {(status === 'under_verification' || status === 'submitted') && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Your application is being reviewed</CardTitle>
            <CardDescription>
              A government officer is verifying your details. You can upload supporting documents while you wait.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="outline"><a href="/farmer/verification-status">View status</a></Button>
            <Button asChild variant="outline"><a href="/farmer/documents">Upload documents</a></Button>
          </CardContent>
        </Card>
      )}

      {status === 'rejected' && (
        <Card className="mt-6 border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg">Application rejected</CardTitle>
            <CardDescription>See the reviewer&apos;s reason, or ask a CSC operator for help.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button asChild variant="outline"><a href="/farmer/verification-status">View reason</a></Button>
            <Button asChild variant="outline"><a href="/farmer/help">Get help</a></Button>
          </CardContent>
        </Card>
      )}

      {status === 'approved' && (
        <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
          <a href="/farmer/book">Book procurement</a>
        </Button>
      )}

      <section className="mt-10">
        <h2 className="font-heading text-xl font-semibold">Upcoming bookings</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-muted-foreground">
            No upcoming bookings. Once your procurement crops are approved you can book a slot.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {upcoming.map((b) => (
              <Card key={b.id}>
                <CardContent className="flex items-center justify-between gap-3 p-5">
                  <div>
                    <p className="font-medium">{formatDate(b.procurement_date)} · {formatTime(b.procurement_time)}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.procurement_crops?.crops?.name ?? 'Crop'} · {formatQuantity(b.quantity_quintal)} · {b.procurement_centres?.name ?? 'Centre'}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </CardContent>
              </Card>
            ))}
            <a href="/farmer/bookings" className="text-sm text-primary underline underline-offset-4">All bookings</a>
          </div>
        )}
      </section>
    </main>
  );
}
