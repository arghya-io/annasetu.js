'use server';

import { createClient } from '@/lib/supabase/server';
import { rows } from '@/lib/supabase/helpers';
import type { NameOption } from '@/types/rows';

// Reference data (states/districts/...) is world-readable by design (RLS
// `using (true)`), so these run with the caller's own session.

export async function getStates(): Promise<(NameOption & { code: string | null })[]> {
  const supabase = createClient();
  const { data } = await supabase.from('states').select('id, name, code').order('name');
  return rows<NameOption & { code: string | null }>(data);
}

export async function getDistricts(stateId: string): Promise<NameOption[]> {
  const supabase = createClient();
  const { data } = await supabase.from('districts').select('id, name').eq('state_id', stateId).order('name');
  return rows<NameOption>(data);
}

export async function getSubDistricts(districtId: string): Promise<NameOption[]> {
  const supabase = createClient();
  const { data } = await supabase.from('sub_districts').select('id, name').eq('district_id', districtId).order('name');
  return rows<NameOption>(data);
}

export async function getVillagesAndTowns(
  subDistrictId: string,
): Promise<{ id: string; name: string; kind: 'village' | 'town' }[]> {
  const supabase = createClient();
  const [villages, towns] = await Promise.all([
    supabase.from('villages').select('id, name').eq('sub_district_id', subDistrictId).order('name'),
    supabase.from('towns').select('id, name').eq('sub_district_id', subDistrictId).order('name'),
  ]);
  return [
    ...rows<NameOption>(villages.data).map((v) => ({ id: v.id, name: v.name, kind: 'village' as const })),
    ...rows<NameOption>(towns.data).map((t) => ({ id: t.id, name: t.name, kind: 'town' as const })),
  ];
}
