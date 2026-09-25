import { z } from 'zod';
import { BOOKING_WINDOW_DAYS, addDaysToDateString, todayInAppTimezone } from '@/lib/constants';
import { isoDateString } from '@/lib/validation/registration';

/**
 * Client-side mirror of the rules enforced authoritatively by
 * enforce_booking_window() and create_booking() (migrations 002/008). It exists
 * so the booking form can show a clear inline error immediately — the RPC is
 * still what actually decides.
 *
 * Dates are 'YYYY-MM-DD' strings compared lexicographically against "today in
 * IST" (never the browser's or server's local zone), matching the database.
 */
export const bookingSchema = z
  .object({
    procurementCropId: z.string().uuid('Select a crop'),
    centreId: z.string().uuid('Select a procurement centre'),
    quantityQuintal: z.coerce.number().positive('Enter a quantity greater than 0'),
    harvestDate: isoDateString,
    procurementDate: isoDateString,
    procurementTime: z.string().regex(/^\d{2}:\d{2}$/, 'Select a time slot'),
  })
  .superRefine((data, ctx) => {
    const today = todayInAppTimezone();

    if (data.procurementDate < today) {
      ctx.addIssue({
        code: 'custom',
        path: ['procurementDate'],
        message: 'Procurement date cannot be in the past',
      });
    }

    if (data.procurementDate < data.harvestDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['procurementDate'],
        message: 'Procurement date cannot be before the harvest date',
      });
    }

    if (data.harvestDate > today) {
      ctx.addIssue({
        code: 'custom',
        path: ['harvestDate'],
        message: 'Harvest date cannot be in the future',
      });
    }

    if (today < addDaysToDateString(data.procurementDate, -BOOKING_WINDOW_DAYS)) {
      ctx.addIssue({
        code: 'custom',
        path: ['procurementDate'],
        message: `Booking opens ${BOOKING_WINDOW_DAYS} days before the procurement date`,
      });
    }
  });
export type BookingInput = z.infer<typeof bookingSchema>;

export const cancellationSchema = z.object({
  appointmentId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Enter a reason for cancellation').max(500),
});
export type CancellationInput = z.infer<typeof cancellationSchema>;
