import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { getProcurableCrops } from '@/services/farmer/crops-service';
import { RegistrationWizard, type RegistrationInitial } from '@/components/farmer/registration/registration-wizard';
import type {
  CultivationRow, FarmerProfileRow, LandOwnerRow, LandRecordRow,
} from '@/types/rows';

/**
 * Loads any existing draft (admin-provisioned farmers start with one) or a
 * correction-required application so the wizard is pre-filled. Applications
 * already in review / approved go to the status page instead.
 */
export default async function RegistrationPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const { data: profileData } = await supabase.from('farmer_profiles').select('*').eq('user_id', session.id).maybeSingle();
  const profile = one<FarmerProfileRow>(profileData);

  if (profile && profile.verification_status !== 'draft' && profile.verification_status !== 'correction_required') {
    redirect('/farmer/verification-status');
  }

  const initial: RegistrationInitial = {};

  if (profile) {
    const [ownerRes, landRes, cultRes, cropsRes, idRes, reviewRes] = await Promise.all([
      supabase.from('land_owner_details').select('*').eq('farmer_id_user', session.id).limit(1),
      supabase.from('land_records').select('*').eq('farmer_id_user', session.id).limit(1),
      supabase.from('cultivation_records').select('*').eq('farmer_id_user', session.id).limit(1),
      supabase.from('procurement_crops').select('crop_id, expected_quantity, status').eq('farmer_id_user', session.id).eq('status', 'pending_approval'),
      supabase.from('farmer_id_records').select('farmer_registry_id').eq('farmer_id_user', session.id).limit(1),
      supabase
        .from('farmer_verification')
        .select('review_notes, status')
        .eq('farmer_id_user', session.id)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    const owner = one<LandOwnerRow>(ownerRes.data);
    const land = one<LandRecordRow>(landRes.data);
    const cult = one<CultivationRow>(cultRes.data);
    const idRecord = one<{ farmer_registry_id: string | null }>(idRes.data);
    const review = one<{ review_notes: string | null; status: string }>(reviewRes.data);

    initial.step1 = {
      farmerCategory: profile.farmer_category,
      firstName: profile.first_name,
      middleName: profile.middle_name ?? '',
      lastName: profile.last_name,
      fatherName: profile.father_name ?? '',
      motherName: profile.mother_name ?? '',
      spouseName: profile.spouse_name ?? '',
      dateOfBirth: profile.date_of_birth,
      gender: profile.gender as 'male' | 'female' | 'other' | 'prefer_not_to_say',
      mobileNumber: profile.mobile_number,
      email: profile.email ?? '',
      addressLine: profile.address_line,
      stateId: profile.state_id,
      districtId: profile.district_id,
      subDistrictId: profile.sub_district_id,
      villageOrTownId: profile.village_or_town_id ?? '',
      villageOrTownKind: profile.village_or_town_kind ?? undefined,
    };
    initial.step2 = {
      farmerIdIfAvailable: idRecord?.farmer_registry_id ?? '',
      landOwner: owner
        ? {
            ownerName: owner.owner_name,
            relationshipToFarmer: owner.relationship_to_farmer ?? '',
            mobileNumber: owner.mobile_number ?? '',
            address: owner.address ?? '',
            ownershipSharePercent: owner.ownership_share_percent ?? undefined,
          }
        : undefined,
      landRecord: land
        ? {
            recordReference: land.record_reference,
            plotOrDag: land.plot_or_dag ?? '',
            areaValue: Number(land.area_value),
            areaUnit: land.area_unit as 'acre' | 'hectare' | 'bigha',
          }
        : undefined,
      cultivation: cult
        ? {
            cultivatedArea: Number(cult.cultivated_area),
            cultivatedAreaUnit: cult.cultivated_area_unit as 'acre' | 'hectare' | 'bigha',
            season: cult.season ?? '',
            tenancyOrShareDetails: cult.tenancy_or_share_details ?? '',
          }
        : land
          ? {
              // Admin-provisioned drafts recorded only the land area.
              cultivatedArea: Number(land.area_value),
              cultivatedAreaUnit: land.area_unit as 'acre' | 'hectare' | 'bigha',
            }
          : undefined,
    };
    initial.crops = rows<{ crop_id: string; expected_quantity: number }>(cropsRes.data).map((c) => ({
      cropId: c.crop_id,
      expectedQuantity: Number(c.expected_quantity),
    }));
    initial.reviewNote = profile.verification_status === 'correction_required' ? (review?.review_notes ?? null) : null;
  }

  const crops = await getProcurableCrops();
  return <RegistrationWizard crops={crops} initial={initial} />;
}
