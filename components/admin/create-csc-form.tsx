'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import { adminCreateCscSchema, type AdminCreateCscInput } from '@/lib/validation/admin';
import { createCscAccountByAdmin } from '@/services/admin/provisioning-service';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/constants';
import { LocationPicker, syncLocationToForm, type LocationValue } from '@/components/farmer/registration/location-picker';
import { FormErrorSummary } from '@/components/shared/form-error-summary';
import { CredentialPrintSheet, type CredentialSheetData } from '@/components/admin/credential-print-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function AdminCreateCscForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [credential, setCredential] = useState<CredentialSheetData | null>(null);
  const [location, setLocation] = useState<LocationValue>({
    stateId: '', districtId: '', subDistrictId: '', villageOrTownId: '', villageOrTownKind: '',
  });

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting, isSubmitted } } = useForm<AdminCreateCscInput>({
    resolver: resolverFor<AdminCreateCscInput>(adminCreateCscSchema),
    defaultValues: { countryCode: DEFAULT_COUNTRY_CODE },
  });

  async function onSubmit(values: AdminCreateCscInput) {
    setServerError(null);
    const merged = { ...values, ...location, villageOrTownKind: location.villageOrTownKind || undefined } as AdminCreateCscInput;
    const result = await createCscAccountByAdmin(merged);
    if (!result.ok) return setServerError(result.error);
    setCredential({
      accountType: 'CSC Operator',
      accountHolderName: `${values.firstName} ${values.lastName}`,
      mobileNumber: result.mobileNumber,
      accountId: result.accountId,
      initialPassword: result.initialPassword,
      issueDate: new Date().toLocaleDateString(),
    });
  }

  if (credential) {
    return <div className="mt-6"><CredentialPrintSheet data={credential} /></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label>First name</Label><Input {...register('firstName')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Middle name</Label><Input {...register('middleName')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Last name</Label><Input {...register('lastName')} /></div>
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
          <div className="flex flex-col gap-1.5"><Label>Email</Label><Input type="email" {...register('email')} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Work details</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label>CSC / centre name</Label><Input {...register('cscName')} /></div>
            <div className="flex flex-col gap-1.5"><Label>CSC ID (if applicable)</Label><Input {...register('cscId')} /></div>
          </div>
          <div className="flex flex-col gap-1.5"><Label>Work address</Label><Input {...register('workAddress')} /></div>
          <LocationPicker
            value={location}
            onChange={(v) => {
              setLocation(v);
              syncLocationToForm((n, val, o) => setValue(n as never, val as never, o), v, isSubmitted);
            }}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label>Designation</Label><Input {...register('designation')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Joining date</Label><Input type="date" {...register('joiningDate')} /></div>
          </div>
        </CardContent>
      </Card>

      <FormErrorSummary errors={errors} />
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create CSC account'}</Button>
    </form>
  );
}
