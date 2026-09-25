'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import { cropChangeRequestSchema, type CropChangeRequestInput } from '@/lib/validation/crop-change';
import { submitCropChangeRequest } from '@/services/farmer/crop-change-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormErrorSummary } from '@/components/shared/form-error-summary';

export function CropChangeForm({
  myCrops,
  procurableCrops,
  documents,
}: {
  myCrops: { id: string; name: string }[];
  procurableCrops: { id: string; name: string }[];
  documents: { id: string; fileName: string }[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CropChangeRequestInput>({
    resolver: resolverFor<CropChangeRequestInput>(cropChangeRequestSchema),
    defaultValues: { changeType: 'add' },
  });
  const changeType = watch('changeType');

  async function onSubmit(values: CropChangeRequestInput) {
    setServerError(null);
    setSent(false);
    const result = await submitCropChangeRequest(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    setSent(true);
    reset({ changeType: 'add' });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="changeType">What would you like to do?</Label>
        <Select id="changeType" {...register('changeType')}>
          <option value="add">Add a new crop</option>
          <option value="modify_quantity">Change the expected quantity of a crop</option>
          <option value="remove">Remove a crop</option>
        </Select>
      </div>

      {changeType === 'add' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requestedCropId">Crop to add</Label>
          <Select id="requestedCropId" {...register('requestedCropId')}>
            <option value="">Select crop</option>
            {procurableCrops.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="existingProcurementCropId">Your crop</Label>
          <Select id="existingProcurementCropId" {...register('existingProcurementCropId')}>
            <option value="">Select crop</option>
            {myCrops.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
      )}

      {changeType !== 'remove' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requestedQuantity">{changeType === 'add' ? 'Expected quantity (quintal)' : 'New expected quantity (quintal)'}</Label>
          <Input id="requestedQuantity" type="number" step="any" min="0" {...register('requestedQuantity')} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Reason</Label>
        <Textarea id="reason" {...register('reason')} placeholder="Why do you need this change?" />
      </div>

      {documents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supportingDocumentId">Supporting document (optional)</Label>
          <Select id="supportingDocumentId" {...register('supportingDocumentId')}>
            <option value="">None</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>{d.fileName}</option>
            ))}
          </Select>
        </div>
      )}

      <FormErrorSummary errors={errors} />
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
      {sent && <p className="text-sm text-primary">Request sent. A government officer will review it.</p>}

      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {isSubmitting ? 'Sending…' : 'Submit request'}
      </Button>
    </form>
  );
}
