import { describe, it, expect } from 'vitest';
import { signupSchema } from '../auth';
import { registrationSubmissionSchema, step2Schema } from '../registration';
import { adminCreateCscSchema } from '../admin';
import { stageDataSchema } from '../procurement';
import { cropChangeRequestSchema } from '../crop-change';

const UUID = '33333333-3333-4333-8333-333333333333';

describe('signupSchema', () => {
  const valid = { fullName: 'Ravi Kumar', email: 'ravi@example.com', phone: '9876543210', password: 'Str0ng!Passw0rd', confirmPassword: 'Str0ng!Passw0rd' };

  it('accepts a valid farmer signup', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it('has no role field: a client-supplied role is stripped, never honoured', () => {
    const parsed = signupSchema.safeParse({ ...valid, role: 'government_admin' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect('role' in parsed.data).toBe(false);
  });

  it('rejects weak passwords and mismatched confirmation', () => {
    expect(signupSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, confirmPassword: 'Different1!Passw0rd' }).success).toBe(false);
  });
});

describe('registration schemas', () => {
  const step1 = {
    farmerCategory: 'tenant_farmer',
    firstName: 'Asha', lastName: 'Devi',
    dateOfBirth: '1985-04-12', gender: 'female', mobileNumber: '9876543210',
    addressLine: 'Ward 4', stateId: UUID, districtId: UUID, subDistrictId: UUID,
    villageOrTownId: UUID, villageOrTownKind: 'village',
  };
  const step2 = {
    landRecord: { recordReference: 'KH-12', areaValue: 2.5, areaUnit: 'acre' },
    cultivation: { cultivatedArea: 2, cultivatedAreaUnit: 'acre' },
  };
  const step3 = { procurementCrops: [{ cropId: UUID, expectedQuantity: 20 }] };
  const step4 = { accuracyConfirmed: true, verificationConsent: true, policyAccepted: true, declarationsAccepted: true };

  it('requires land owner details for a tenant farmer', () => {
    const r = registrationSubmissionSchema.safeParse({ step1, step2, step3, step4 });
    expect(r.success).toBe(false);
    const ok = registrationSubmissionSchema.safeParse({
      step1, step2: { ...step2, landOwner: { ownerName: 'Mohan Lal' } }, step3, step4,
    });
    expect(ok.success).toBe(true);
  });

  it('does not require a land owner for an owner-cultivator', () => {
    const r = registrationSubmissionSchema.safeParse({ step1: { ...step1, farmerCategory: 'owner_cultivator' }, step2, step3, step4 });
    expect(r.success).toBe(true);
  });

  it('rejects a farmer under 18 and a duplicate crop', () => {
    expect(registrationSubmissionSchema.safeParse({ step1: { ...step1, dateOfBirth: '2020-01-01' }, step2, step3, step4 }).success).toBe(false);
    const dup = { procurementCrops: [{ cropId: UUID, expectedQuantity: 1 }, { cropId: UUID, expectedQuantity: 2 }] };
    expect(registrationSubmissionSchema.safeParse({ step1, step2, step3: dup, step4 }).success).toBe(false);
  });

  it('treats a blank ownership share as "not provided", not zero', () => {
    const r = step2Schema.safeParse({ ...step2, landOwner: { ownerName: 'X', ownershipSharePercent: '' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.landOwner?.ownershipSharePercent).toBeUndefined();
  });

  it('requires every declaration to be true', () => {
    const r = registrationSubmissionSchema.safeParse({ step1, step2: { ...step2, landOwner: { ownerName: 'X' } }, step3, step4: { ...step4, policyAccepted: false } });
    expect(r.success).toBe(false);
  });
});

describe('admin provisioning schema (optional blanks used to block submit)', () => {
  it('accepts an empty joining date and empty optional selects', () => {
    const r = adminCreateCscSchema.safeParse({
      firstName: 'A', lastName: 'B', dateOfBirth: '1990-01-01', gender: 'male',
      countryCode: '+91', mobileNumber: '9876543210', email: '',
      cscName: 'Village CSC', workAddress: 'Main road',
      stateId: UUID, districtId: UUID, subDistrictId: UUID,
      villageOrTownId: '', villageOrTownKind: '', joiningDate: '',
    });
    expect(r.success).toBe(true);
  });
});

describe('stage data + crop change schemas', () => {
  it('accepts valid weighing / grading data and rejects nonsense', () => {
    expect(stageDataSchema.safeParse({ weighed_quantity_quintal: 12.5 }).success).toBe(true);
    expect(stageDataSchema.safeParse({ quality_grade: 'A', accepted_quantity_quintal: 10 }).success).toBe(true);
    expect(stageDataSchema.safeParse({ quality_grade: 'Z' }).success).toBe(false);
    expect(stageDataSchema.safeParse({ weighed_quantity_quintal: -1 }).success).toBe(false);
  });

  it('crop change: add needs a crop + quantity; remove needs an existing crop', () => {
    expect(cropChangeRequestSchema.safeParse({ changeType: 'add', requestedCropId: UUID, requestedQuantity: 5, reason: 'Started a new crop' }).success).toBe(true);
    expect(cropChangeRequestSchema.safeParse({ changeType: 'add', reason: 'Started a new crop' }).success).toBe(false);
    expect(cropChangeRequestSchema.safeParse({ changeType: 'remove', existingProcurementCropId: UUID, reason: 'No longer growing' }).success).toBe(true);
    expect(cropChangeRequestSchema.safeParse({ changeType: 'remove', reason: 'No longer growing' }).success).toBe(false);
  });
});
