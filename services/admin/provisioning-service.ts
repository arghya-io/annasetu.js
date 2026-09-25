'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { one } from '@/lib/supabase/helpers';
import { requireRole } from '@/lib/auth/session';
import { generateInitialPassword } from '@/lib/password';
import { rpcErrorMessage } from '@/lib/rpc-errors';
import {
  adminCreateFarmerSchema, adminCreateCscSchema, adminCreateCentreSchema, adminCreateCentreOperatorSchema,
  type AdminCreateFarmerInput, type AdminCreateCscInput, type AdminCreateCentreInput, type AdminCreateCentreOperatorInput,
} from '@/lib/validation/admin';

export type ProvisioningResult =
  | { ok: true; accountId: string; mobileNumber: string; initialPassword: string }
  | { ok: false; error: string };

export type CentreProvisioningResult = { ok: true; centreId: string } | { ok: false; error: string };

/**
 * Every account-creating action follows the same order, and the ORDER is the
 * security property (previously the "is this caller an admin, and does their
 * jurisdiction cover this location?" check ran last and its result was
 * ignored, so any signed-in user could create staff accounts anywhere):
 *
 *   1. Caller must be an ACTIVE government admin (session + users row).
 *   2. authorize_provisioning() — derives the state from the district,
 *      validates the location chain and checks the caller's jurisdiction.
 *      Nothing has been created yet; failure stops here.
 *   3. Normalize the mobile number; refuse duplicates.
 *   4. Generate the initial password from Node's CSPRNG.
 *   5. Create the Auth identity, then the users + role rows (service role).
 *      Any failure deletes the Auth identity, which cascades to every row.
 *   6. log_account_provisioned() writes the audit row; if it fails the
 *      account is rolled back — no un-audited accounts.
 *   7. The plaintext password is returned exactly once and never stored.
 */

interface Authorized {
  actorId: string;
  stateId: string;
  normalizedMobile: string;
  initialPassword: string;
}

type PreCheck = { ok: true; value: Authorized } | { ok: false; error: string };

async function preCheck(
  districtId: string,
  subDistrictId: string | null,
  countryCode: string,
  mobileNumber: string,
): Promise<PreCheck> {
  const session = await requireRole('government_admin');
  if (!session) return { ok: false, error: 'Only an active government administrator can create accounts.' };

  const supabase = createClient();

  const { data: stateId, error: authzError } = await supabase.rpc('authorize_provisioning', {
    p_district_id: districtId,
    p_sub_district_id: subDistrictId,
  });
  if (authzError || typeof stateId !== 'string') {
    return { ok: false, error: rpcErrorMessage(authzError?.message, 'You are not authorized to create accounts in this location.') };
  }

  const { data: normalized, error: normalizeError } = await supabase.rpc('normalize_mobile_number', {
    p_country_code: countryCode,
    p_raw_number: mobileNumber,
  });
  if (normalizeError || typeof normalized !== 'string') {
    return { ok: false, error: 'Invalid mobile number for the selected country' };
  }

  const { data: inUse, error: inUseError } = await supabase.rpc('mobile_number_in_use', { p_normalized: normalized });
  if (inUseError) return { ok: false, error: 'Could not verify the mobile number. Please try again.' };
  if (inUse === true) return { ok: false, error: 'This mobile number is already registered to another account' };

  return {
    ok: true,
    value: { actorId: session.id, stateId, normalizedMobile: normalized, initialPassword: generateInitialPassword() },
  };
}

interface NewAccount {
  role: 'farmer' | 'csc_operator' | 'centre_operator';
  fullName: string;
  email: string | null;
  countryCode: string;
}

/** Creates the Auth identity + `users` row; returns the new id or an error (already rolled back). */
async function createIdentity(
  pre: Authorized,
  account: NewAccount,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    phone: pre.normalizedMobile,
    password: pre.initialPassword,
    phone_confirm: true,
    ...(account.email ? { email: account.email, email_confirm: true } : {}),
    user_metadata: { full_name: account.fullName },
  });
  if (authError || !authUser.user) {
    return { ok: false, error: 'Could not create the account. The mobile number or email may already be in use.' };
  }
  const userId = authUser.user.id;

  const { error: usersError } = await admin.from('users').insert({
    id: userId,
    role: account.role,
    full_name: account.fullName,
    email: account.email,
    phone: pre.normalizedMobile,
    mobile_country_code: account.countryCode,
    mobile_number_normalized: pre.normalizedMobile,
    must_change_password: true,
    account_status: 'active',
    created_by: pre.actorId,
  });
  if (usersError) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: 'Could not save account details. Please try again.' };
  }
  return { ok: true, userId };
}

/** Removes the Auth identity (cascades to users + role rows). */
async function rollback(userId: string) {
  await createAdminClient().auth.admin.deleteUser(userId);
}

/** Audit + return. If auditing fails the account is rolled back. */
async function finish(
  pre: Authorized,
  userId: string,
  accountType: string,
  location: { districtId: string; subDistrictId: string | null },
): Promise<ProvisioningResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('log_account_provisioned', {
    p_account_type: accountType,
    p_account_id: userId,
    p_state_id: pre.stateId,
    p_district_id: location.districtId,
    p_sub_district_id: location.subDistrictId,
  });
  if (error) {
    await rollback(userId);
    return { ok: false, error: 'The account could not be recorded in the audit log, so it was not created.' };
  }
  return { ok: true, accountId: userId, mobileNumber: pre.normalizedMobile, initialPassword: pre.initialPassword };
}

export async function createFarmerAccountByAdmin(input: AdminCreateFarmerInput): Promise<ProvisioningResult> {
  const parsed = adminCreateFarmerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;

  const pre = await preCheck(d.districtId, d.subDistrictId, d.countryCode, d.mobileNumber);
  if (!pre.ok) return pre;

  const identity = await createIdentity(pre.value, {
    role: 'farmer',
    fullName: `${d.firstName} ${d.lastName}`,
    email: d.email || null,
    countryCode: d.countryCode,
  });
  if (!identity.ok) return identity;
  const userId = identity.userId;

  const admin = createAdminClient();

  // Created as a DRAFT: the farmer (or a CSC operator helping them) completes
  // the crop declaration and submits, which moves it to government review.
  // Admin creation never auto-approves — account and eligibility are separate.
  const { error: profileError } = await admin.from('farmer_profiles').insert({
    user_id: userId,
    farmer_category: d.farmerCategory,
    first_name: d.firstName,
    middle_name: d.middleName || null,
    last_name: d.lastName,
    father_name: d.fatherName || null,
    mother_name: d.motherName || null,
    spouse_name: d.spouseName || null,
    date_of_birth: d.dateOfBirth,
    gender: d.gender,
    mobile_number: d.mobileNumber.replace(/\D/g, '').slice(-10),
    email: d.email || null,
    address_line: d.addressLine,
    state_id: pre.value.stateId,
    district_id: d.districtId,
    sub_district_id: d.subDistrictId,
    village_or_town_id: d.villageOrTownId ?? null,
    village_or_town_kind: d.villageOrTownKind ?? null,
    verification_status: 'draft',
  });
  if (profileError) {
    await rollback(userId);
    return { ok: false, error: 'Could not save the farmer profile. Nothing was created — please try again.' };
  }

  const { error: landError } = await admin.from('land_records').insert({
    farmer_id_user: userId,
    record_reference: d.landRecordReference,
    village_id: d.villageOrTownKind === 'village' ? (d.villageOrTownId ?? null) : null,
    district_id: d.districtId,
    area_value: d.cultivatedArea,
    area_unit: 'acre',
  });
  const identityNote = [d.identityDocumentType, d.identityDocumentReference].filter(Boolean).join(': ') || null;
  const { error: idError } = await admin.from('farmer_id_records').insert({
    farmer_id_user: userId,
    has_farmer_id: Boolean(d.farmerIdIfAvailable),
    farmer_registry_id: d.farmerIdIfAvailable || null,
    source: 'self_declared',
    identity_document_note: identityNote,
  });
  if (landError || idError) {
    await rollback(userId);
    return { ok: false, error: 'Could not save the land / identity details. Nothing was created — please try again.' };
  }

  return finish(pre.value, userId, 'farmer', { districtId: d.districtId, subDistrictId: d.subDistrictId });
}

export async function createCscAccountByAdmin(input: AdminCreateCscInput): Promise<ProvisioningResult> {
  const parsed = adminCreateCscSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;

  const pre = await preCheck(d.districtId, d.subDistrictId, d.countryCode, d.mobileNumber);
  if (!pre.ok) return pre;

  const identity = await createIdentity(pre.value, {
    role: 'csc_operator',
    fullName: `${d.firstName} ${d.lastName}`,
    email: d.email || null,
    countryCode: d.countryCode,
  });
  if (!identity.ok) return identity;
  const userId = identity.userId;

  const admin = createAdminClient();
  const { error: cscError } = await admin.from('csc_operators').insert({
    user_id: userId,
    first_name: d.firstName,
    last_name: d.lastName,
    centre_name: d.cscName,
    csc_id: d.cscId || null,
    work_address: d.workAddress,
    district_id: d.districtId,
    sub_district_id: d.subDistrictId,
    village_or_town_id: d.villageOrTownId ?? null,
    designation: d.designation || null,
    joining_date: d.joiningDate ?? null,
    jurisdiction_district_id: d.districtId,
  });
  if (cscError) {
    await rollback(userId);
    return { ok: false, error: 'Could not save the CSC work details (is the CSC ID already used?). Nothing was created.' };
  }

  return finish(pre.value, userId, 'csc_operator', { districtId: d.districtId, subDistrictId: d.subDistrictId });
}

export async function createProcurementCentreByAdmin(input: AdminCreateCentreInput): Promise<CentreProvisioningResult> {
  const parsed = adminCreateCentreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;

  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_procurement_centre_admin', {
    p_name: d.name,
    p_code: d.code,
    p_state_id: d.stateId,
    p_district_id: d.districtId,
    p_sub_district_id: d.subDistrictId,
    p_address: d.address,
    p_centre_type: d.centreType || null,
    p_daily_capacity_quintal: d.dailyCapacityQuintal,
    p_counters_count: d.countersCount,
    p_controlling_authority: d.controllingAuthority || null,
    p_contact_number: d.contactNumber || null,
    p_official_email: d.officialEmail || null,
  });

  if (error) {
    const duplicate = error.code === '23505' || /duplicate key|unique/i.test(error.message);
    return {
      ok: false,
      error: duplicate ? 'A centre with this code already exists' : rpcErrorMessage(error.message, 'Could not create the procurement centre'),
    };
  }
  return { ok: true, centreId: String(data) };
}

export async function createCentreOperatorAccountByAdmin(
  input: AdminCreateCentreOperatorInput,
): Promise<ProvisioningResult> {
  const parsed = adminCreateCentreOperatorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const d = parsed.data;

  // Jurisdiction is enforced against the CENTRE's own location, resolved
  // server-side — never a location typed in for the operator.
  const supabase = createClient();
  const { data: centreData } = await supabase
    .from('procurement_centres')
    .select('state_id, district_id, sub_district_id')
    .eq('id', d.centreId)
    .maybeSingle();
  const centre = one<{ state_id: string; district_id: string; sub_district_id: string | null }>(centreData);
  if (!centre) return { ok: false, error: 'Procurement centre not found' };

  const pre = await preCheck(centre.district_id, centre.sub_district_id, d.countryCode, d.mobileNumber);
  if (!pre.ok) return pre;

  const identity = await createIdentity(pre.value, {
    role: 'centre_operator',
    fullName: `${d.firstName} ${d.lastName}`,
    email: d.email || null,
    countryCode: d.countryCode,
  });
  if (!identity.ok) return identity;
  const userId = identity.userId;

  const admin = createAdminClient();
  const { error: operatorError } = await admin.from('centre_operators').insert({
    user_id: userId,
    centre_id: d.centreId,
    first_name: d.firstName,
    last_name: d.lastName,
    designation: d.designation || null,
    employee_code: d.employeeCode || null,
    joining_date: d.joiningDate ?? null,
  });
  if (operatorError) {
    await rollback(userId);
    return { ok: false, error: 'Could not assign the operator to the centre. Nothing was created.' };
  }

  return finish(pre.value, userId, 'centre_operator', { districtId: centre.district_id, subDistrictId: centre.sub_district_id });
}
