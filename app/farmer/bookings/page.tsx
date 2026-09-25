import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { first, rows } from '@/lib/supabase/helpers';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { StageTimeline } from '@/components/shared/stage-timeline';
import { CancelBookingButton } from '@/components/farmer/bookings/cancel-booking-button';
import { Button } from '@/components/ui/button';
import { canCancelBooking } from '@/lib/constants';
import { formatDate, formatInr, formatQuantity, formatTime } from '@/lib/utils';

interface RecordShape {
  stage: string;
  receipt_number: string | null;
  accepted_quantity_quintal: number | null;
  weighed_quantity_quintal: number | null;
  quality_grade: string | null;
  payment_records: { amount: number; status: string; reference_code: string | null; is_mock: boolean }[] | null;
}

interface BookingRow {
  id: string;
  procurement_date: string;
  procurement_time: string;
  quantity_quintal: number;
  status: string;
  cancellation_reason: string | null;
  procurement_centres: { name: string } | { name: string }[] | null;
  procurement_crops: { crops: { name: string } | { name: string }[] | null } | { crops: { name: string } | { name: string }[] | null }[] | null;
  queue_entries: { token_number: string } | { token_number: string }[] | null;
  procurement_records: RecordShape | RecordShape[] | null;
}

export default async function BookingsPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const { data } = await supabase
    .from('appointments')
    .select(
      `id, procurement_date, procurement_time, quantity_quintal, status, cancellation_reason,
       procurement_centres (name), procurement_crops (crops (name)), queue_entries (token_number),
       procurement_records (stage, receipt_number, accepted_quantity_quintal, weighed_quantity_quintal, quality_grade,
         payment_records (amount, status, reference_code, is_mock))`,
    )
    .eq('farmer_id_user', session.id)
    .order('procurement_date', { ascending: false })
    .order('procurement_time', { ascending: false })
    .limit(50);
  const bookings = rows<BookingRow>(data);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-semibold">My bookings</h1>
        <Button asChild size="sm"><a href="/farmer/book">New booking</a></Button>
      </div>

      {bookings.length === 0 ? (
        <p className="mt-6 text-muted-foreground">You have not made any bookings yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {bookings.map((b) => {
            const centre = first(b.procurement_centres)?.name ?? 'Centre';
            const cropRel = first(b.procurement_crops);
            const crop = first(cropRel?.crops)?.name ?? 'Crop';
            const token = first(b.queue_entries)?.token_number;
            const record = first(b.procurement_records);
            const payment = first(record?.payment_records ?? null);
            const cancellable = (b.status === 'booked' || b.status === 'confirmed') && canCancelBooking(b.procurement_date, b.procurement_time);

            return (
              <Card key={b.id}>
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{formatDate(b.procurement_date)} · {formatTime(b.procurement_time)}</p>
                      <p className="text-sm text-muted-foreground">
                        {crop} · {formatQuantity(b.quantity_quintal)} · {centre}
                        {token ? ` · Token ${token}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>

                  {record && record.stage !== 'scheduled' && <StageTimeline stage={record.stage} />}

                  {record?.accepted_quantity_quintal != null && (
                    <dl className="grid grid-cols-2 gap-3 rounded-md bg-secondary/50 p-3 text-sm sm:grid-cols-4">
                      <div><dt className="text-muted-foreground">Weighed</dt><dd>{formatQuantity(record.weighed_quantity_quintal)}</dd></div>
                      <div><dt className="text-muted-foreground">Accepted</dt><dd>{formatQuantity(record.accepted_quantity_quintal)}</dd></div>
                      <div><dt className="text-muted-foreground">Grade</dt><dd>{record.quality_grade ?? '—'}</dd></div>
                      <div><dt className="text-muted-foreground">Receipt</dt><dd className="break-all">{record.receipt_number ?? 'Pending'}</dd></div>
                    </dl>
                  )}

                  {payment && (
                    <p className="text-sm">
                      Payment {formatInr(payment.amount)} · <StatusBadge status={payment.status} />
                      {payment.is_mock && <span className="ml-2 text-xs text-muted-foreground">(simulated — no real money moves in this prototype)</span>}
                    </p>
                  )}

                  {b.status === 'cancelled' && b.cancellation_reason && (
                    <p className="text-sm text-muted-foreground">Reason: {b.cancellation_reason}</p>
                  )}

                  {cancellable && <CancelBookingButton appointmentId={b.id} />}
                  {(b.status === 'booked' || b.status === 'confirmed') && !cancellable && (
                    <p className="text-xs text-muted-foreground">
                      This booking is within 48 hours of the slot and can no longer be cancelled.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
