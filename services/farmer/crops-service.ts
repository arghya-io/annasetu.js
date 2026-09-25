'use server';

import { createClient } from '@/lib/supabase/server';
import { rows } from '@/lib/supabase/helpers';

export interface ProcurableCrop {
  id: string;
  name: string;
  unit: string;
  msp_per_quintal: number | null;
}

export async function getProcurableCrops(): Promise<ProcurableCrop[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('crops')
    .select('id, name, unit, msp_per_quintal')
    .eq('is_procurable', true)
    .order('name');
  return rows<ProcurableCrop>(data);
}
