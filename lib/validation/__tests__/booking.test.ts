import { describe, it, expect } from 'vitest';
import { bookingSchema } from '../booking';
import { addDaysToDateString, todayInAppTimezone } from '../../constants';

/**
 * These test the CLIENT-SIDE mirror only (immediate form feedback). The
 * database (create_booking() / enforce_booking_window() in
 * supabase/migrations/008) is the authoritative check — see
 * supabase/tests/database/booking_and_procurement.test.sql for the server-side
 * boundary tests.
 *
 * Dates are 'YYYY-MM-DD' strings relative to "today in IST", exactly as the
 * schema itself computes them, so these tests are stable in any timezone.
 */
describe('bookingSchema', () => {
  const today = todayInAppTimezone();
  const day = (n: number) => addDaysToDateString(today, n);

  const base = {
    procurementCropId: '11111111-1111-4111-8111-111111111111',
    centreId: '22222222-2222-4222-8222-222222222222',
    quantityQuintal: 10,
    procurementTime: '10:00',
  };

  it('accepts a booking exactly 14 days before the procurement date', () => {
    const result = bookingSchema.safeParse({ ...base, harvestDate: day(0), procurementDate: day(14) });
    expect(result.success).toBe(true);
  });

  it('accepts a same-day booking', () => {
    const result = bookingSchema.safeParse({ ...base, harvestDate: day(0), procurementDate: day(0) });
    expect(result.success).toBe(true);
  });

  it('rejects a procurement date more than 14 days ahead (window not open yet)', () => {
    const result = bookingSchema.safeParse({ ...base, harvestDate: day(0), procurementDate: day(15) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'procurementDate')).toBe(true);
    }
  });

  it('rejects a procurement date in the past', () => {
    const result = bookingSchema.safeParse({ ...base, harvestDate: day(-10), procurementDate: day(-1) });
    expect(result.success).toBe(false);
  });

  it('rejects a procurement date before the harvest date', () => {
    const result = bookingSchema.safeParse({ ...base, harvestDate: day(0), procurementDate: day(0) });
    expect(result.success).toBe(true); // equal is allowed…
    const before = bookingSchema.safeParse({ ...base, harvestDate: day(-1), procurementDate: day(-2) });
    expect(before.success).toBe(false); // …earlier is not
  });

  it('rejects a harvest date in the future', () => {
    const result = bookingSchema.safeParse({ ...base, harvestDate: day(3), procurementDate: day(7) });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive quantity', () => {
    const result = bookingSchema.safeParse({ ...base, quantityQuintal: 0, harvestDate: day(0), procurementDate: day(7) });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid centre id', () => {
    const result = bookingSchema.safeParse({ ...base, centreId: 'not-a-uuid', harvestDate: day(0), procurementDate: day(7) });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed time', () => {
    const result = bookingSchema.safeParse({ ...base, procurementTime: '9am', harvestDate: day(0), procurementDate: day(7) });
    expect(result.success).toBe(false);
  });
});
