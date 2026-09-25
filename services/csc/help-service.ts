'use server';

import { createClient } from '@/lib/supabase/server';
import { rpcErrorMessage } from '@/lib/rpc-errors';

export type CscActionResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Claim / progress / resolve a help request. CSC never touches eligibility decisions. */
export async function updateHelpRequest(
  requestId: string,
  status: 'in_progress' | 'resolved' | 'closed',
  note: string,
): Promise<CscActionResult> {
  if (!UUID_RE.test(requestId)) return { ok: false, error: 'Invalid request' };
  const supabase = createClient();
  const { error } = await supabase.rpc('update_help_request_csc', {
    p_request_id: requestId,
    p_status: status,
    p_note: note.trim() || null,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not update the request') };
  return { ok: true };
}
