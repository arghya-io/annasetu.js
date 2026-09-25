'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import { adminCreateCentreSchema, type AdminCreateCentreInput } from '@/lib/validation/admin';
import { createProcurementCentreByAdmin } from '@/services/admin/provisioning-service';
import { LocationPicker, syncLocationToForm, type LocationValue } from '@/components/farmer/registration/location-picker';
import { FormErrorSummary } from '@/components/shared/form-error-summary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function AdminCreateCentreForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationValue>({
    stateId: '', districtId: '', subDistrictId: '', villageOrTownId: '', villageOrTownKind: '',
  });

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting, isSubmitted } } = useForm<AdminCreateCentreInput>({
    resolver: resolverFor<AdminCreateCentreInput>(adminCreateCentreSchema),
    defaultValues: { countersCount: 1 },
  });

  async function onSubmit(values: AdminCreateCentreInput) {
    setServerError(null);
    const merged = { ...values, stateId: location.stateId, districtId: location.districtId, subDistrictId: location.subDistrictId };
    const result = await createProcurementCentreByAdmin(merged);
    if (!result.ok) return setServerError(result.error);
    router.push('/gov-admin/account-provisioning/centre-operator');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Centre details</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label>Centre name</Label><Input {...register('name')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Centre code</Label><Input {...register('code')} /></div>
          </div>
          <div className="flex flex-col gap-1.5"><Label>Centre type</Label><Input {...register('centreType')} placeholder="e.g. Mandi, Warehouse" /></div>
          <div className="flex flex-col gap-1.5"><Label>Address</Label><Input {...register('address')} /></div>
          <LocationPicker
            value={location}
            onChange={(v) => {
              setLocation(v);
              syncLocationToForm((n, val, o) => setValue(n as never, val as never, o), v, isSubmitted);
            }} level="subDistrict"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Capacity</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Daily capacity (quintal)</Label>
            <Input type="number" step="0.01" {...register('dailyCapacityQuintal')} />
            {errors.dailyCapacityQuintal && <p className="text-sm text-destructive">{errors.dailyCapacityQuintal.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Number of counters</Label>
            <Input type="number" {...register('countersCount')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Official details</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5"><Label>Controlling authority</Label><Input {...register('controllingAuthority')} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><Label>Contact number</Label><Input {...register('contactNumber')} /></div>
            <div className="flex flex-col gap-1.5"><Label>Official email</Label><Input type="email" {...register('officialEmail')} /></div>
          </div>
        </CardContent>
      </Card>

      <FormErrorSummary errors={errors} />
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating centre…' : 'Create procurement centre'}</Button>
    </form>
  );
}
