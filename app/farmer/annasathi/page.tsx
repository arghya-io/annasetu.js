import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, first, rows } from '@/lib/supabase/helpers';
import { listEligibleCentres } from '@/services/booking/booking-preview-service';
import { AnnaSathiChat } from '@/components/annasathi/annasathi-chat';
import type { AnnaSathiContextData } from '@/components/annasathi/context-panel';

interface ActiveQueueRow {
  token_number: string;
  queue_position: number | null;
  estimated_wait_seconds: number | null;
  appointments: { procurement_centres: { name: string } | { name: string }[] | null } | { procurement_centres: { name: string } | { name: string }[] | null }[] | null;
}

/**
 * AnnaSathi is a conversational front door onto the same data the rest of
 * AnnaSetu already exposes — nothing here is a new source of truth. The
 * conversation logic itself is a placeholder (see response-engine.ts) until
 * a real ASR/RAG backend is wired in.
 */
export default async function AnnaSathiPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const [{ data: profileData }, { data: queueData }, eligibleCentres] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', session.id).maybeSingle(),
    supabase
      .from('queue_entries')
      .select(
        `token_number, queue_position, estimated_wait_seconds,
         appointments!inner (farmer_id_user, procurement_centres (name))`,
      )
      .eq('appointments.farmer_id_user', session.id)
      .in('status', ['waiting', 'called', 'checked_in', 'in_progress'])
      .order('queue_date', { ascending: true })
      .limit(1),
    listEligibleCentres(),
  ]);
  const { data: farmerData } = await supabase
    .from('farmer_profiles')
    .select('verification_status')
    .eq('user_id', session.id)
    .maybeSingle();

  const farmerName = one<{ full_name: string }>(profileData)?.full_name ?? 'there';
  const verificationStatus = one<{ verification_status: string }>(farmerData)?.verification_status ?? null;
  const activeQueueEntry = first(rows<ActiveQueueRow>(queueData));
  const activeCentreName = activeQueueEntry ? first(first(activeQueueEntry.appointments)?.procurement_centres ?? null)?.name : undefined;

  const contextData: AnnaSathiContextData = {
    verificationStatus,
    activeBooking: activeQueueEntry
      ? {
          token: activeQueueEntry.token_number,
          centreName: activeCentreName ?? 'your centre',
          queuePosition: activeQueueEntry.queue_position,
          estimatedWaitSeconds: activeQueueEntry.estimated_wait_seconds,
        }
      : null,
  };

  return (
    <AnnaSathiChat
      farmerName={farmerName.split(' ')[0] ?? farmerName}
      contextData={contextData}
      eligibleCentres={eligibleCentres.map((c) => ({ name: c.name, code: c.code, address: c.address }))}
    />
  );
}
