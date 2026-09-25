import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { StageTimeline } from '@/components/shared/stage-timeline';
import { StatusBadge } from '@/components/shared/status-badge';
import { ProcessingActions } from '@/components/operator/processing-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { rpcErrorMessage } from '@/lib/rpc-errors';
import { STAGE_LABELS } from '@/lib/constants';
import { formatDate, formatInr, formatQuantity } from '@/lib/utils';

interface Details {
  appointment_id: string;
  token: string;
  queue_status: string;
  procurement_date: string;
  procurement_time: string;
  farmer_name: string;
  farmer_category: string;
  crop_name: string;
  msp_per_quintal: number | null;
  booked_quantity_quintal: number;
  record_id: string | null;
  stage: string | null;
  weighed_quantity_quintal: number | null;
  accepted_quantity_quintal: number | null;
  quality_grade: string | null;
  receipt_number: string | null;
  payment_status: string | null;
  payment_amount: number | null;
  payment_reference: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProcessingPage({ params }: { params: { appointmentId: string } }) {
  await requirePageUser('centre_operator');
  const back = (
    <Button asChild variant="outline" size="sm"><a href="/operator/dashboard">← Back to queue</a></Button>
  );

  if (!UUID_RE.test(params.appointmentId)) {
    return <main className="mx-auto max-w-2xl px-4 py-8">{back}<p className="mt-4 text-destructive">Invalid booking link.</p></main>;
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('operator_booking_details', { p_appointment_id: params.appointmentId });

  if (error || !data) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {back}
        <p className="mt-4 text-destructive">{rpcErrorMessage(error?.message, 'This booking could not be loaded.')}</p>
      </main>
    );
  }
  const d = data as Details;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      {back}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Token {d.token} · {d.farmer_name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {d.crop_name} · booked {formatQuantity(d.booked_quantity_quintal)} · {formatDate(d.procurement_date)} {d.procurement_time}
              </p>
              <p className="text-xs capitalize text-muted-foreground">{d.farmer_category.replace(/_/g, ' ')}</p>
            </div>
            <StatusBadge status={d.queue_status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {d.stage ? (
            <>
              <p className="text-sm">Current stage: <span className="font-medium">{STAGE_LABELS[d.stage as keyof typeof STAGE_LABELS] ?? d.stage}</span></p>
              <StageTimeline stage={d.stage} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This farmer has not been checked in yet. Scan their QR code first.
            </p>
          )}
        </CardContent>
      </Card>

      {d.record_id && d.stage && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Next step</CardTitle></CardHeader>
          <CardContent>
            <ProcessingActions
              key={d.stage}
              recordId={d.record_id}
              stage={d.stage}
              bookedQuantity={Number(d.booked_quantity_quintal)}
              weighedQuantity={d.weighed_quantity_quintal != null ? Number(d.weighed_quantity_quintal) : null}
              acceptedQuantity={d.accepted_quantity_quintal != null ? Number(d.accepted_quantity_quintal) : null}
              msp={d.msp_per_quintal != null ? Number(d.msp_per_quintal) : null}
            />
          </CardContent>
        </Card>
      )}

      {(d.weighed_quantity_quintal != null || d.receipt_number || d.payment_status) && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Recorded so far</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Weighed</dt><dd>{formatQuantity(d.weighed_quantity_quintal)}</dd></div>
              <div><dt className="text-muted-foreground">Accepted</dt><dd>{formatQuantity(d.accepted_quantity_quintal)}</dd></div>
              <div><dt className="text-muted-foreground">Grade</dt><dd>{d.quality_grade ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">Receipt</dt><dd className="break-all">{d.receipt_number ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">Payment</dt><dd>{d.payment_status ? `${formatInr(d.payment_amount)} · ${d.payment_status.replace(/_/g, ' ')}` : '—'}</dd></div>
              <div><dt className="text-muted-foreground">Reference</dt><dd className="break-all">{d.payment_reference ?? '—'}</dd></div>
            </dl>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
