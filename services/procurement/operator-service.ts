'use server';

import { createClient } from '@/lib/supabase/server';
import { rpcErrorMessage } from '@/lib/rpc-errors';
import { PROCUREMENT_STAGES } from '@/lib/constants';
import { stageDataSchema, type StageData } from '@/lib/validation/procurement';

export type OperatorActionResult = { ok: true; appointmentId?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{32,128}$/i;

/**
 * Scans a QR payload ({id, hash}) and checks the farmer in (spec §13).
 * The operator's centre is resolved inside the RPC from centre_operators via
 * auth.uid(); nothing centre-related is ever sent by the client.
 */
export async function scanAndCheckIn(scannedPayload: string): Promise<OperatorActionResult> {
  let parsed: { id?: unknown; hash?: unknown };
  try {
    parsed = JSON.parse(scannedPayload) as { id?: unknown; hash?: unknown };
  } catch {
    return { ok: false, error: 'Unreadable QR code' };
  }
  if (typeof parsed.id !== 'string' || typeof parsed.hash !== 'string' || !UUID_RE.test(parsed.id) || !HASH_RE.test(parsed.hash)) {
    return { ok: false, error: 'This is not an AnnaSetu token QR code' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('validate_and_checkin_token', {
    p_queue_entry_id: parsed.id,
    p_scanned_hash: parsed.hash,
  });

  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Check-in failed') };
  return { ok: true, appointmentId: String(data) };
}

/** Operator calls a checked-in farmer to a counter (notifies the farmer). */
export async function callToken(queueEntryId: string): Promise<OperatorActionResult> {
  if (!UUID_RE.test(queueEntryId)) return { ok: false, error: 'Invalid token' };
  const supabase = createClient();
  const { error } = await supabase.rpc('call_queue_token', { p_queue_entry_id: queueEntryId });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not call this token') };
  return { ok: true };
}

/**
 * Advances a procurement_record to the next stage via
 * transition_procurement_stage() — never a direct table update. The RPC
 * enforces the exact stage sequence, validates the data each stage requires
 * (weight, grade, accepted quantity), issues the receipt number and the
 * (mock) payment, and re-ranks the queue.
 */
export async function advanceProcurementStage(
  procurementRecordId: string,
  nextStage: string,
  data: StageData = {},
): Promise<OperatorActionResult> {
  if (!UUID_RE.test(procurementRecordId)) return { ok: false, error: 'Invalid record' };
  if (!(PROCUREMENT_STAGES as readonly string[]).includes(nextStage)) {
    return { ok: false, error: 'Unknown stage' };
  }
  const parsedData = stageDataSchema.safeParse(data);
  if (!parsedData.success) {
    return { ok: false, error: parsedData.error.issues[0]?.message ?? 'Invalid details' };
  }

  const supabase = createClient();
  const { data: result, error } = await supabase.rpc('transition_procurement_stage', {
    p_procurement_record_id: procurementRecordId,
    p_next_stage: nextStage,
    p_data: parsedData.data,
  });

  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'That step could not be completed') };
  return { ok: true, appointmentId: String(result) };
}
