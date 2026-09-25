'use server';

import { createClient } from '@/lib/supabase/server';
import { rpcErrorMessage } from '@/lib/rpc-errors';

export type HelpResult = { ok: true } | { ok: false; error: string };

export async function createHelpRequest(input: {
  subject: string;
  description: string;
  districtId?: string;
}): Promise<HelpResult> {
  const subject = input.subject.trim();
  if (subject.length < 3) return { ok: false, error: 'Enter a short subject' };

  const supabase = createClient();
  const { error } = await supabase.rpc('create_help_request', {
    p_subject: subject,
    p_description: input.description.trim() || null,
    p_district_id: input.districtId || null,
  });
  if (error) return { ok: false, error: rpcErrorMessage(error.message, 'Could not send your request') };
  return { ok: true };
}
