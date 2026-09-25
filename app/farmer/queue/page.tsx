import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { first, rows } from '@/lib/supabase/helpers';
import { QueueLiveCard } from '@/components/farmer/queue/queue-live-card';

interface QueueRow {
  id: string;
  token_number: string;
  status: string;
  queue_position: number | null;
  assigned_counter: number | null;
  estimated_wait_seconds: number | null;
  qr_payload_hash: string;
  appointment_id: string;
  appointments: {
    procurement_date: string;
    procurement_time: string;
    procurement_centres: { name: string } | { name: string }[] | null;
    procurement_records: { stage: string } | { stage: string }[] | null;
  } | null;
}

export default async function QueuePage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  // RLS already limits queue_entries to the farmer's own rows.
  const { data } = await supabase
    .from('queue_entries')
    .select(
      `id, token_number, status, queue_position, assigned_counter, estimated_wait_seconds, qr_payload_hash, appointment_id,
       appointments!inner (farmer_id_user, procurement_date, procurement_time,
         procurement_centres (name), procurement_records (stage))`,
    )
    .eq('appointments.farmer_id_user', session.id)
    .in('status', ['waiting', 'called', 'checked_in', 'in_progress'])
    .order('queue_date', { ascending: true });
  const entries = rows<QueueRow>(data);

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Your queue</h1>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No active queue entries. Once you book a procurement slot, your token and live position
          will appear here.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {entries.map((e) => (
            <QueueLiveCard
              key={e.id}
              appointmentId={e.appointment_id}
              initial={{
                id: e.id,
                tokenNumber: e.token_number,
                status: e.status,
                queuePosition: e.queue_position,
                assignedCounter: e.assigned_counter,
                estimatedWaitSeconds: e.estimated_wait_seconds,
                qrPayloadHash: e.qr_payload_hash,
              }}
              centreName={first(e.appointments?.procurement_centres)?.name ?? ''}
              procurementDate={e.appointments?.procurement_date ?? ''}
              procurementTime={e.appointments?.procurement_time ?? ''}
              stage={first(e.appointments?.procurement_records)?.stage ?? null}
            />
          ))}
        </div>
      )}
    </main>
  );
}
