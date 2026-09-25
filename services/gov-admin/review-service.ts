'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rpcErrorMessage } from '@/lib/rpc-errors';

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every review below is ONE SECURITY DEFINER RPC (migration 009). The RPC
 * identifies the reviewer from auth.uid(), verifies they are an active
 * government admin whose jurisdiction covers the farmer, applies the change,
 * notifies the farmer and writes the audit row — atomically. (The previous
 * crop-change review did these as separate client-orchestrated writes, took the
 * acting admin's id as a parameter, and ignored failures of the later steps.)
 */

export async function reviewFarmerVerification(
  farmerId: string,
  decision: 'approved' | 'rejected' | 'correction_required',
  notes: string,
): Promise<AdminActionResult> {
  if (!UUID_RE.test(farmerId)) return { ok: false, error: 'Invalid farmer' };
  const supabase = createClient();
  const { error } = await supabase.rpc('review_farmer_verification_admin', {
    p_farmer_id: farmerId,
    p_decision: decision,
    p_notes: notes.trim() || null,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not save the review') };
  return { ok: true };
}

export async function reviewFarmerDocument(
  documentId: string,
  status: 'under_review' | 'verified' | 'rejected' | 'correction_required',
  reason: string,
): Promise<AdminActionResult> {
  if (!UUID_RE.test(documentId)) return { ok: false, error: 'Invalid document' };
  const supabase = createClient();
  const { error } = await supabase.rpc('review_farmer_document_admin', {
    p_document_id: documentId,
    p_status: status,
    p_reason: reason.trim() || null,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not save the document review') };
  return { ok: true };
}

export async function reviewCropChangeRequest(
  requestId: string,
  decision: 'approved' | 'rejected' | 'correction_required',
  notes: string,
): Promise<AdminActionResult> {
  if (!UUID_RE.test(requestId)) return { ok: false, error: 'Invalid request' };
  const supabase = createClient();
  const { error } = await supabase.rpc('review_crop_change_request_admin', {
    p_request_id: requestId,
    p_decision: decision,
    p_notes: notes.trim() || null,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not save the review') };
  return { ok: true };
}

/**
 * Short-lived signed URL for a farmer's document. The RPC proves the caller is
 * an admin whose jurisdiction covers that farmer before any URL is minted; the
 * service role is used only for the signing itself.
 */
export async function getDocumentUrl(
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!UUID_RE.test(documentId)) return { ok: false, error: 'Invalid document' };
  const supabase = createClient();
  const { data: path, error } = await supabase.rpc('admin_document_storage_path', { p_document_id: documentId });
  if (error || typeof path !== 'string') {
    return { ok: false, error: rpcErrorMessage(error?.message, 'You cannot view this document') };
  }

  const { data, error: signError } = await createAdminClient().storage.from('farmer-documents').createSignedUrl(path, 300);
  if (signError || !data?.signedUrl) return { ok: false, error: 'The file could not be opened' };
  return { ok: true, url: data.signedUrl };
}

export async function updateCentre(
  centreId: string,
  changes: { isActive?: boolean; dailyCapacityQuintal?: number; countersCount?: number },
): Promise<AdminActionResult> {
  if (!UUID_RE.test(centreId)) return { ok: false, error: 'Invalid centre' };
  const supabase = createClient();
  const { error } = await supabase.rpc('update_centre_admin', {
    p_centre_id: centreId,
    p_is_active: changes.isActive ?? null,
    p_daily_capacity_quintal: changes.dailyCapacityQuintal ?? null,
    p_counters_count: changes.countersCount ?? null,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not update the centre') };
  return { ok: true };
}
