import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { listEligibleCentres } from '@/services/booking/booking-preview-service';
import { BookingForm, type BookableCrop } from '@/components/farmer/booking/booking-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BOOKING_WINDOW_DAYS, addDaysToDateString, todayInAppTimezone } from '@/lib/constants';
import type { FarmerProfileRow, ProcurementCropRow } from '@/types/rows';

export default async function BookPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const { data: profileData } = await supabase
    .from('farmer_profiles')
    .select('verification_status')
    .eq('user_id', session.id)
    .maybeSingle();
  const profile = one<Pick<FarmerProfileRow, 'verification_status'>>(profileData);

  if (profile?.verification_status !== 'approved') {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-3xl font-semibold">Book procurement</h1>
        <Card className="mt-6">
          <CardContent className="flex flex-col gap-3 p-6">
            <p className="text-muted-foreground">
              You can book a procurement slot once your registration has been approved by the government.
            </p>
            <Button asChild variant="outline" className="w-fit">
              <a href="/farmer/verification-status">Check verification status</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const [{ data: cropData }, { data: apptData }, centres] = await Promise.all([
    supabase
      .from('procurement_crops')
      .select('id, crop_id, expected_quantity, status, crops(name, unit)')
      .eq('farmer_id_user', session.id)
      .in('status', ['approved', 'locked'])
      .order('created_at', { ascending: true }),
    supabase
      .from('appointments')
      .select('procurement_crop_id, quantity_quintal, status')
      .eq('farmer_id_user', session.id)
      .in('status', ['booked', 'confirmed', 'checked_in', 'in_progress', 'completed']),
    listEligibleCentres(),
  ]);

  const used = new Map<string, number>();
  rows<{ procurement_crop_id: string; quantity_quintal: number }>(apptData).forEach((a) => {
    used.set(a.procurement_crop_id, (used.get(a.procurement_crop_id) ?? 0) + Number(a.quantity_quintal));
  });

  const crops: BookableCrop[] = rows<ProcurementCropRow>(cropData).map((c) => ({
    id: c.id,
    name: c.crops?.name ?? 'Crop',
    approvedQuantity: Number(c.expected_quantity),
    remainingQuantity: Math.max(Number(c.expected_quantity) - (used.get(c.id) ?? 0), 0),
  }));

  const today = todayInAppTimezone();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Book procurement</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bookings open {BOOKING_WINDOW_DAYS} days before the procurement date. Cancellation is possible up to 48 hours before your slot.
      </p>
      {crops.length === 0 ? (
        <p className="mt-6 text-muted-foreground">You have no approved crops yet. Request a crop change from the Crops page.</p>
      ) : centres.length === 0 ? (
        <p className="mt-6 text-muted-foreground">No active procurement centre serves your area yet.</p>
      ) : (
        <BookingForm
          crops={crops}
          centres={centres}
          today={today}
          maxDate={addDaysToDateString(today, BOOKING_WINDOW_DAYS)}
        />
      )}
    </main>
  );
}
