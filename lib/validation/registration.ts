import { z } from 'zod';
import { todayInAppTimezone } from '@/lib/constants';

export const farmerCategoryEnum = z.enum([
  'owner_cultivator',
  'tenant_farmer',
  'sharecropper',
  'joint_co_owner',
  'other_eligible_cultivator',
]);
export type FarmerCategoryValue = z.infer<typeof farmerCategoryEnum>;

/** 'YYYY-MM-DD' — dates travel as plain strings so no timezone can shift them. */
export const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date');

/** True when `dob` (YYYY-MM-DD) is at least `years` years before today (IST). */
export function isAtLeastYearsOld(dob: string, years: number, today: string = todayInAppTimezone()): boolean {
  const cutoff = `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;
  return dob <= cutoff;
}

export const adultDateOfBirth = isoDateString.refine((d) => isAtLeastYearsOld(d, 18), {
  message: 'The farmer must be at least 18 years old',
});

/** A date input that may be left blank ('' -> undefined). */
export const optionalIsoDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  isoDateString.optional(),
);

/** A uuid select that may be left unselected ('' -> undefined). */
export const optionalUuid = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().uuid().optional(),
);

/** A number input that may be left blank ('' -> undefined). */
function optionalNumber(min: number, max: number) {
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(min).max(max).optional(),
  );
}

const genderEnum = z.enum(['male', 'female', 'other', 'prefer_not_to_say']);

// ---- STEP 1: Personal & farmer details ----
export const step1Schema = z.object({
  farmerCategory: farmerCategoryEnum,
  firstName: z.string().trim().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().trim().min(1, 'Last name is required'),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  spouseName: z.string().optional(),
  dateOfBirth: adultDateOfBirth,
  gender: genderEnum,
  mobileNumber: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  addressLine: z.string().trim().min(3, 'Address is required'),
  stateId: z.string().uuid('Select a state'),
  districtId: z.string().uuid('Select a district'),
  subDistrictId: z.string().uuid('Select a sub-district'),
  villageOrTownId: z.string().uuid('Select a village or town'),
  villageOrTownKind: z.enum(['village', 'town'], { errorMap: () => ({ message: 'Select a village or town' }) }),
});
export type Step1Input = z.infer<typeof step1Schema>;

// ---- STEP 2: Identity + land/cultivation (fields vary by category) ----

const landOwnerDetailSchema = z.object({
  ownerName: z.string().optional(),
  relationshipToFarmer: z.string().optional(),
  mobileNumber: z.string().optional(),
  address: z.string().optional(),
  ownershipSharePercent: optionalNumber(0, 100),
});

const landRecordSchema = z.object({
  recordReference: z.string().trim().min(1, 'Land record / RoR / Khatian number is required'),
  plotOrDag: z.string().optional(),
  areaValue: z.coerce.number().positive('Enter the plot area'),
  areaUnit: z.enum(['acre', 'hectare', 'bigha']).default('acre'),
});

const cultivationSchema = z.object({
  cultivatedArea: z.coerce.number().positive('Enter cultivated area'),
  cultivatedAreaUnit: z.enum(['acre', 'hectare', 'bigha']).default('acre'),
  season: z.string().optional(),
  tenancyOrShareDetails: z.string().optional(),
});

export const step2Schema = z.object({
  farmerIdIfAvailable: z.string().optional(),
  landOwner: landOwnerDetailSchema.optional(),
  landRecord: landRecordSchema,
  cultivation: cultivationSchema,
});
export type Step2Input = z.infer<typeof step2Schema>;

/** Which Step-2 sub-sections are required, keyed by farmer category (spec §2). */
export const STEP2_FIELDS_BY_CATEGORY: Record<
  FarmerCategoryValue,
  { needsLandOwner: boolean; ownerRequired: boolean; landOwnerLabel: string }
> = {
  owner_cultivator: { needsLandOwner: false, ownerRequired: false, landOwnerLabel: '' },
  joint_co_owner: { needsLandOwner: true, ownerRequired: true, landOwnerLabel: 'Co-owner details' },
  tenant_farmer: { needsLandOwner: true, ownerRequired: true, landOwnerLabel: 'Land owner / provider details' },
  sharecropper: { needsLandOwner: true, ownerRequired: true, landOwnerLabel: 'Land owner / provider details' },
  other_eligible_cultivator: { needsLandOwner: true, ownerRequired: false, landOwnerLabel: 'Land provider details (if applicable)' },
};

// ---- STEP 3: Procurement details ----
export const step3CropSchema = z.object({
  cropId: z.string().uuid('Select a crop'),
  expectedQuantity: z.coerce.number().positive('Enter expected quantity'),
});
export const step3Schema = z
  .object({
    procurementCrops: z.array(step3CropSchema).min(1, 'Select at least one crop to sell through AnnaSetu'),
  })
  .refine((d) => new Set(d.procurementCrops.map((c) => c.cropId)).size === d.procurementCrops.length, {
    message: 'Each crop can only be selected once',
    path: ['procurementCrops'],
  });
export type Step3Input = z.infer<typeof step3Schema>;

// ---- STEP 4: Acknowledgement ----
const mustBeTrue = { errorMap: () => ({ message: 'Required' }) };
export const step4Schema = z.object({
  accuracyConfirmed: z.literal(true, mustBeTrue),
  verificationConsent: z.literal(true, mustBeTrue),
  policyAccepted: z.literal(true, mustBeTrue),
  declarationsAccepted: z.literal(true, mustBeTrue),
});
export type Step4Input = z.infer<typeof step4Schema>;

/**
 * The whole registration, validated once more on the server (the client
 * wizard only keeps steps in memory; nothing is saved until final submit).
 */
export const registrationSubmissionSchema = z
  .object({ step1: step1Schema, step2: step2Schema, step3: step3Schema, step4: step4Schema })
  .superRefine((data, ctx) => {
    const cfg = STEP2_FIELDS_BY_CATEGORY[data.step1.farmerCategory];
    if (cfg.ownerRequired && !data.step2.landOwner?.ownerName?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['step2', 'landOwner', 'ownerName'],
        message: 'Land owner / co-owner name is required for this farmer category',
      });
    }
  });
export type RegistrationSubmission = z.infer<typeof registrationSubmissionSchema>;
