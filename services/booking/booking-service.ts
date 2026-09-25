'use server';

import { createClient } from '@/lib/supabase/server';
import { rpcErrorMessage } from '@/lib/rpc-errors';
import { bookingSchema, cancellationSchema, type BookingInput, type CancellationInput } from '@/lib/validation/booking';

export type BookingResult =
  | { ok: true; appointmentId: string }
  | { ok: false; error: string };

/**
 * Creates a booking through create_booking() (migration 008), which
 * atomically checks + reserves centre capacity, enforces the 14-day window,
 * operating hours, slot throughput, per-crop quantity limits and eligibility,
 * and issues the queue token in a single transaction. No capacity or window
 * math is duplicated here.
 *
 * The farmer is identified inside the RPC from the session (auth.uid()); the
 * p_farmer_id we pass is only asserted equal to it, never trusted.
 */
export async function createBooking(input: BookingInput): Promise<BookingResult> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid booking details' };
  }
  const b = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const { data, error } = await supabase.rpc('create_booking', {
    p_farmer_id: user.id,
    p_centre_id: b.centreId,
    p_procurement_crop_id: b.procurementCropId,
    p_quantity: b.quantityQuintal,
    p_harvest_date: b.harvestDate,
    p_procurement_date: b.procurementDate,
    p_procurement_time: b.procurementTime,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error.message, 'Could not complete the booking. Please try again.') };
  }
  return { ok: true, appointmentId: String(data) };
}

export async function cancelBooking(input: CancellationInput): Promise<BookingResult> {
  const parsed = cancellationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('cancel_appointment', {
    p_appointment_id: parsed.data.appointmentId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error.message, 'Could not cancel the booking. Please try again.') };
  }
  return { ok: true, appointmentId: parsed.data.appointmentId };
}
