'use server';

import { createClient } from '@/lib/supabase/server';
import { rpcErrorMessage } from '@/lib/rpc-errors';
import {
  registrationSubmissionSchema,
  STEP2_FIELDS_BY_CATEGORY,
  type RegistrationSubmission,
} from '@/lib/validation/registration';

export type RegistrationResult = { ok: true; applicationId: string } | { ok: false; error: string };

/**
 * Submits the whole registration in ONE database call
 * (submit_farmer_registration, migration 009). The wizard keeps steps 1–4 in
 * memory and nothing is written until now, so there is no half-saved state,
 * a retry can never create duplicate rows, and farmers need no direct write
 * access to any table. Identity comes from the session inside the RPC —
 * there is deliberately no userId parameter.
 */
export async function submitRegistration(input: RegistrationSubmission): Promise<RegistrationResult> {
  const parsed = registrationSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Please check the highlighted fields' };
  }
  const { step1: s1, step2: s2, step3: s3, step4: s4 } = parsed.data;

  const cfg = STEP2_FIELDS_BY_CATEGORY[s1.farmerCategory];
  const owner = s2.landOwner;
  const includeOwner = cfg.needsLandOwner && !!owner?.ownerName?.trim();

  const payload = {
    profile: {
      farmer_category: s1.farmerCategory,
      first_name: s1.firstName,
      middle_name: s1.middleName || null,
      last_name: s1.lastName,
      father_name: s1.fatherName || null,
      mother_name: s1.motherName || null,
      spouse_name: s1.spouseName || null,
      date_of_birth: s1.dateOfBirth,
      gender: s1.gender,
      mobile_number: s1.mobileNumber,
      email: s1.email || null,
      address_line: s1.addressLine,
      state_id: s1.stateId,
      district_id: s1.districtId,
      sub_district_id: s1.subDistrictId,
      village_or_town_id: s1.villageOrTownId,
      village_or_town_kind: s1.villageOrTownKind,
    },
    farmer_id: s2.farmerIdIfAvailable?.trim() || null,
    land_owner: includeOwner
      ? {
          owner_name: owner?.ownerName?.trim(),
          relationship_to_farmer: owner?.relationshipToFarmer || null,
          mobile_number: owner?.mobileNumber || null,
          address: owner?.address || null,
          ownership_share_percent: owner?.ownershipSharePercent ?? null,
        }
      : null,
    land_record: {
      record_reference: s2.landRecord.recordReference,
      plot_or_dag: s2.landRecord.plotOrDag || null,
      area_value: s2.landRecord.areaValue,
      area_unit: s2.landRecord.areaUnit,
    },
    cultivation: {
      cultivated_area: s2.cultivation.cultivatedArea,
      cultivated_area_unit: s2.cultivation.cultivatedAreaUnit,
      season: s2.cultivation.season || null,
      tenancy_or_share_details: s2.cultivation.tenancyOrShareDetails || null,
    },
    crops: s3.procurementCrops.map((c) => ({ crop_id: c.cropId, expected_quantity: c.expectedQuantity })),
    acknowledgement: {
      accuracy_confirmed: s4.accuracyConfirmed,
      verification_consent: s4.verificationConsent,
      policy_accepted: s4.policyAccepted,
      declarations_accepted: s4.declarationsAccepted,
    },
  };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('submit_farmer_registration', { p_payload: payload });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error.message, 'Could not submit your registration. Please try again.') };
  }
  return { ok: true, applicationId: String(data) };
}
