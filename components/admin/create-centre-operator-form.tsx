'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import { adminCreateCentreOperatorSchema, type AdminCreateCentreOperatorInput } from '@/lib/validation/admin';
import { createCentreOperatorAccountByAdmin } from '@/services/admin/provisioning-service';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/constants';
import { CredentialPrintSheet, type CredentialSheetData } from '@/components/admin/credential-print-sheet';
import { FormErrorSummary } from '@/components/shared/form-error-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function AdminCreateCentreOperatorForm({ centres }: { centres: { id: string; name: string; code: string }[] }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [credential, setCredential] = useState<CredentialSheetData | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AdminCreateCentreOperatorInput>({
    resolver: resolverFor<AdminCreateCentreOperatorInput>(adminCreateCentreOperatorSchema),
    defaultValues: { countryCode: DEFAULT_COUNTRY_CODE },
  });

  async function onSubmit(values: AdminCreateCentreOperatorInput) {
    setServerError(null);
    const result = await createCentreOperatorAccountByAdmin(values);
    if (!result.ok) return setServerError(result.error);
    setCredential({
      accountType: 'Centre Operator',
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
          <div className="flex flex-col gap-1.5">
            <Label>Assigned procurement centre</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm" {...register('centreId')}>
              <option value="">Select centre</option>
              {centres.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
            {errors.centreId && <p className="text-sm text-destructive">{errors.centreId.message}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5"><Label>Designation</Label><Input {...register('designation')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Employee ID</Label><Input {...register('employeeCode')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Joining date</Label><Input type="date" {...register('joiningDate')} /></div>
          </div>
        </CardContent>
      </Card>

      <FormErrorSummary errors={errors} />
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : 'Create centre operator'}</Button>
    </form>
  );
}
