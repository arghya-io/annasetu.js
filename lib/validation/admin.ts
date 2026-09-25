import { z } from 'zod';
import { PASSWORD_POLICY_PATTERN, PASSWORD_POLICY_DESCRIPTION } from '@/lib/constants';
import { adultDateOfBirth, farmerCategoryEnum, optionalIsoDate, optionalUuid } from '@/lib/validation/registration';

/** Client-side mirror only — normalize_mobile_number() in the DB is authoritative. */
export const mobileSchema = z.object({
  countryCode: z.string().min(2).default('+91'),
  mobileNumber: z.string().min(4, 'Enter a mobile number'),
});

export const mobileLoginSchema = z.object({
  countryCode: z.string().min(2),
  mobileNumber: z.string().min(4, 'Enter a mobile number'),
  password: z.string().min(1, 'Enter your password'),
});
export type MobileLoginInput = z.infer<typeof mobileLoginSchema>;

/** New-password policy for the mandatory first-login change (spec §14). */
export const newPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().regex(PASSWORD_POLICY_PATTERN, PASSWORD_POLICY_DESCRIPTION),
    confirmNewPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'New password must be different from your current password',
    path: ['newPassword'],
  });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

const locationFields = {
  stateId: z.string().uuid('Select a state'),
  districtId: z.string().uuid('Select a district'),
  subDistrictId: z.string().uuid('Select a sub-district'),
  villageOrTownId: optionalUuid,
  villageOrTownKind: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['village', 'town']).optional()),
};

/** Admin "Create Farmer Account" (spec §3). */
export const adminCreateFarmerSchema = z.object({
  farmerCategory: farmerCategoryEnum,
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  spouseName: z.string().optional(),
  dateOfBirth: adultDateOfBirth,
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  countryCode: z.string().min(2).default('+91'),
  mobileNumber: z.string().min(4, 'Enter a mobile number'),
  email: z.string().email().optional().or(z.literal('')),
  addressLine: z.string().min(3, 'Address is required'),
  ...locationFields,
  farmerIdIfAvailable: z.string().optional(),
  landRecordReference: z.string().min(1, 'Land record reference is required'),
  cultivatedArea: z.coerce.number().positive('Enter cultivated area'),
  identityDocumentType: z.string().optional(),
  identityDocumentReference: z.string().optional(),
});
export type AdminCreateFarmerInput = z.infer<typeof adminCreateFarmerSchema>;

/** "Add CSC Operator" (spec §6). */
export const adminCreateCscSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: adultDateOfBirth,
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  countryCode: z.string().min(2).default('+91'),
  mobileNumber: z.string().min(4, 'Enter a mobile number'),
  email: z.string().email().optional().or(z.literal('')),
  cscName: z.string().min(1, 'CSC / centre name is required'),
  cscId: z.string().optional(),
  workAddress: z.string().min(1, 'Work address is required'),
  ...locationFields,
  designation: z.string().optional(),
  joiningDate: optionalIsoDate,
});
export type AdminCreateCscInput = z.infer<typeof adminCreateCscSchema>;

/** "Add Procurement Centre" (spec §7). */
export const adminCreateCentreSchema = z.object({
  name: z.string().min(1, 'Centre name is required'),
  code: z.string().min(1, 'Centre code is required'),
  centreType: z.string().optional(),
  address: z.string().min(1, 'Address is required'),
  stateId: z.string().uuid('Select a state'),
  districtId: z.string().uuid('Select a district'),
  subDistrictId: z.string().uuid('Select a sub-district'),
  dailyCapacityQuintal: z.coerce.number().positive('Enter daily capacity'),
  countersCount: z.coerce.number().int().positive().default(1),
  controllingAuthority: z.string().optional(),
  contactNumber: z.string().optional(),
  officialEmail: z.string().email().optional().or(z.literal('')),
});
export type AdminCreateCentreInput = z.infer<typeof adminCreateCentreSchema>;

/** "Create Centre Operator" (spec §8). */
export const adminCreateCentreOperatorSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().optional(),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: adultDateOfBirth,
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  countryCode: z.string().min(2).default('+91'),
  mobileNumber: z.string().min(4, 'Enter a mobile number'),
  email: z.string().email().optional().or(z.literal('')),
  centreId: z.string().uuid('Select a procurement centre'),
  designation: z.string().optional(),
  employeeCode: z.string().optional(),
  joiningDate: optionalIsoDate,
});
export type AdminCreateCentreOperatorInput = z.infer<typeof adminCreateCentreOperatorSchema>;
