import { z } from 'zod';
import { optionalUuid } from '@/lib/validation/registration';

export const cropChangeRequestSchema = z
  .object({
    changeType: z.enum(['add', 'remove', 'modify_quantity']),
    existingProcurementCropId: optionalUuid,
    requestedCropId: optionalUuid,
    requestedQuantity: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      z.coerce.number().positive('Enter a quantity greater than 0').optional(),
    ),
    reason: z.string().trim().min(5, 'Please explain the reason for this change').max(1000),
    supportingDocumentId: optionalUuid,
  })
  .superRefine((d, ctx) => {
    if (d.changeType === 'add') {
      if (!d.requestedCropId) ctx.addIssue({ code: 'custom', path: ['requestedCropId'], message: 'Choose the crop to add' });
      if (d.requestedQuantity === undefined) ctx.addIssue({ code: 'custom', path: ['requestedQuantity'], message: 'Enter the expected quantity' });
    } else {
      if (!d.existingProcurementCropId) ctx.addIssue({ code: 'custom', path: ['existingProcurementCropId'], message: 'Choose one of your crops' });
      if (d.changeType === 'modify_quantity' && d.requestedQuantity === undefined) {
        ctx.addIssue({ code: 'custom', path: ['requestedQuantity'], message: 'Enter the new quantity' });
      }
    }
  });
export type CropChangeRequestInput = z.infer<typeof cropChangeRequestSchema>;
