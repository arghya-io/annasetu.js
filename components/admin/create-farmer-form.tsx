'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import { adminCreateFarmerSchema, type AdminCreateFarmerInput } from '@/lib/validation/admin';
import { createFarmerAccountByAdmin } from '@/services/admin/provisioning-service';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/constants';
import { LocationPicker, syncLocationToForm, type LocationValue } from '@/components/farmer/registration/location-picker';
import { FormErrorSummary } from '@/components/shared/form-error-summary';
import { CredentialPrintSheet, type CredentialSheetData } from '@/components/admin/credential-print-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function AdminCreateFarmerForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [credential, setCredential] = useState<CredentialSheetData | null>(null);
  const [location, setLocation] = useState<LocationValue>({
    stateId: '', districtId: '', subDistrictId: '', villageOrTownId: '', villageOrTownKind: '',
  });

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting, isSubmitted } } = useForm<AdminCreateFarmerInput>({
    resolver: resolverFor<AdminCreateFarmerInput>(adminCreateFarmerSchema),
    defaultValues: { countryCode: DEFAULT_COUNTRY_CODE },
  });

  async function onSubmit(values: AdminCreateFarmerInput) {
    setServerError(null);
    const merged = { ...values, ...location, villageOrTownKind: location.villageOrTownKind || undefined } as AdminCreateFarmerInput;
    const result = await createFarmerAccountByAdmin(merged);
    if (!result.ok) return setServerError(result.error);
    setCredential({
      accountType: 'Farmer',
      accountHolderName: `${values.firstName} ${values.lastName}`,
      mobileNumber: result.mobileNumber,
      accountId: result.accountId,
      initialPassword: result.initialPassword,
      issueDate: new Date().toLocaleDateString(),
    });
  }

  if (credential) {
    return (
      <div className="mt-6">
        <CredentialPrintSheet data={credential} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Farmer category</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm" {...register('farmerCategory')}>
              <option value="">Select category</option>
              <option value="owner_cultivator">Owner cultivator</option>
              <option value="tenant_farmer">Tenant farmer</option>
              <option value="sharecropper">Sharecropper</option>
              <option value="joint_co_owner">Joint / co-owner</option>
              <option value="other_eligible_cultivator">Other eligible cultivator</option>
            </select>
            {errors.farmerCategory && <p className="text-sm text-destructive">{errors.farmerCategory.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label>First name</Label><Input {...register('firstName')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Middle name</Label><Input {...register('middleName')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Last name</Label><Input {...register('lastName')} /></div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label>Father&apos;s name</Label><Input {...register('fatherName')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Mother&apos;s name</Label><Input {...register('motherName')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Spouse&apos;s name</Label><Input {...register('spouseName')} /></div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label>Date of birth</Label><Input type="date" {...register('dateOfBirth')} /></div>
            <div className="flex flex-col gap-1.5">
              <Label>Gender</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm" {...register('gender')}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Mobile number</Label>
            <div className="flex gap-2">
              <select className="h-10 w-28 rounded-md border border-input bg-card px-2 text-sm" {...register('countryCode')}>
                {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
              <Input className="flex-1" {...register('mobileNumber')} />
            </div>
            {errors.mobileNumber && <p className="text-sm text-destructive">{errors.mobileNumber.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5"><Label>Email (optional)</Label><Input type="email" {...register('email')} /></div>
          <div className="flex flex-col gap-1.5"><Label>Full address</Label><Input {...register('addressLine')} /></div>
          <LocationPicker
            value={location}
            onChange={(v) => {
              setLocation(v);
              syncLocationToForm((n, val, o) => setValue(n as never, val as never, o), v, isSubmitted);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Farmer &amp; land information</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Farmer ID / Registry ID (if available)</Label>
            <Input {...register('farmerIdIfAvailable')} placeholder="Optional" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Land record reference</Label>
            <Input {...register('landRecordReference')} />
            {errors.landRecordReference && <p className="text-sm text-destructive">{errors.landRecordReference.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cultivated area (acres)</Label>
            <Input type="number" step="0.01" {...register('cultivatedArea')} />
            {errors.cultivatedArea && <p className="text-sm text-destructive">{errors.cultivatedArea.message}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Identity document</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Document type</Label>
            <Input {...register('identityDocumentType')} placeholder="e.g. Voter ID, Ration Card" />
            {errors.identityDocumentType && <p className="text-sm text-destructive">{errors.identityDocumentType.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Document reference / number (optional)</Label>
            <Input {...register('identityDocumentReference')} />
          </div>
        </CardContent>
      </Card>

      <FormErrorSummary errors={errors} />
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create farmer account'}
      </Button>
    </form>
  );
}
