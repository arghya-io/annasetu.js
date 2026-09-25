'use server';

import { createClient } from '@/lib/supabase/server';
import { rpcErrorMessage } from '@/lib/rpc-errors';
import { cropChangeRequestSchema, type CropChangeRequestInput } from '@/lib/validation/crop-change';

export type CropChangeResult = { ok: true } | { ok: false; error: string };

export async function submitCropChangeRequest(input: CropChangeRequestInput): Promise<CropChangeResult> {
  const parsed = cropChangeRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.rpc('submit_crop_change_request', {
    p_type: d.changeType,
    p_existing_crop_id: d.existingProcurementCropId ?? null,
    p_requested_crop_id: d.requestedCropId ?? null,
    p_quantity: d.requestedQuantity ?? null,
    p_reason: d.reason,
    p_document_id: d.supportingDocumentId ?? null,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not submit the request') };
  return { ok: true };
}
