'use client';

import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface QueueSnapshot {
  id: string;
  tokenNumber: string;
  status: string;
  queuePosition: number | null;
  assignedCounter: number | null;
  estimatedWaitSeconds: number | null;
  qrPayloadHash?: string;
}

/**
 * Subscribes to realtime updates for a single farmer's queue entry (spec §9,
 * §23). Scoped to one appointment's queue row — never the whole centre feed —
 * and Realtime applies the caller's RLS, so a farmer only ever receives their
 * own row. Queue positions are re-ranked in the database on every booking,
 * cancellation, check-in, call and completion, so this fires for all of them.
 */
export function subscribeToQueueEntry(
  appointmentId: string,
  onUpdate: (snapshot: QueueSnapshot) => void,
): RealtimeChannel {
  const supabase = createClient();

  const channel = supabase
    .channel(`queue-entry-${appointmentId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'queue_entries',
        filter: `appointment_id=eq.${appointmentId}`,
      },
      // `unknown` keeps this compatible with whatever payload type the installed
      // supabase-js declares; we only read the changed row.
      (payload: unknown) => {
        const row = (payload as { new: Record<string, unknown> }).new;
        onUpdate({
          id: row.id as string,
          tokenNumber: row.token_number as string,
          status: row.status as string,
          queuePosition: (row.queue_position as number | null) ?? null,
          assignedCounter: (row.assigned_counter as number | null) ?? null,
          estimatedWaitSeconds: (row.estimated_wait_seconds as number | null) ?? null,
          qrPayloadHash: row.qr_payload_hash as string | undefined,
        });
      },
    )
    .subscribe();

  return channel;
}

export function unsubscribe(channel: RealtimeChannel) {
  const supabase = createClient();
  supabase.removeChannel(channel);
}
