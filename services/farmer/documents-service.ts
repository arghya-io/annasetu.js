'use server';

import { createClient } from '@/lib/supabase/server';
import { rpcErrorMessage } from '@/lib/rpc-errors';

export type DocumentActionResult = { ok: true; id?: string; url?: string } | { ok: false; error: string };

const DOCUMENT_KINDS = [
  'identity_proof', 'land_record', 'farmer_id_proof', 'tenancy_proof',
  'sharecropper_proof', 'joint_ownership_proof', 'other',
] as const;
type Kind = (typeof DOCUMENT_KINDS)[number];

/**
 * Step 2 of an upload. The browser has ALREADY put the file in the private
 * `farmer-documents` bucket under `<user id>/...` (storage RLS only allows the
 * caller's own folder); this records the metadata. The RPC re-checks the
 * path, type, size and that the object really exists.
 */
export async function registerDocument(input: {
  kind: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<DocumentActionResult> {
  if (!(DOCUMENT_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: 'Choose a document type' };
  const supabase = createClient();
  const { data, error } = await supabase.rpc('register_farmer_document', {
    p_kind: input.kind as Kind,
    p_storage_path: input.storagePath,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType,
    p_size_bytes: Math.round(input.sizeBytes),
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not save the document') };
  return { ok: true, id: String(data) };
}

/** Signed URL for the farmer's OWN document (storage RLS scopes to their folder). */
export async function getOwnDocumentUrl(documentId: string): Promise<DocumentActionResult> {
  const supabase = createClient();
  const { data: doc } = await supabase.from('farmer_documents').select('storage_path').eq('id', documentId).maybeSingle();
  const path = (doc as { storage_path?: string } | null)?.storage_path;
  if (!path) return { ok: false, error: 'Document not found' };
  const { data, error } = await supabase.storage.from('farmer-documents').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return { ok: false, error: 'The file could not be opened' };
  return { ok: true, url: data.signedUrl };
}
