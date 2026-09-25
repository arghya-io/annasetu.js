import { describe, it, expect } from 'vitest';
import {
  addDaysToDateString, canCancelBooking, scheduledAtIst, todayInAppTimezone,
} from '../constants';
import { isAtLeastYearsOld } from '../validation/registration';

describe('date helpers (IST)', () => {
  it('adds days with calendar arithmetic across month/year boundaries', () => {
    expect(addDaysToDateString('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateString('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToDateString('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('computes today in IST, not the machine timezone', () => {
    // 20:00 UTC on 20 Sep is already 01:30 on 21 Sep in IST.
    expect(todayInAppTimezone(new Date('2026-09-20T20:00:00Z'))).toBe('2026-09-21');
    // 18:00 UTC is 23:30 IST the same day.
    expect(todayInAppTimezone(new Date('2026-09-20T18:00:00Z'))).toBe('2026-09-20');
  });

  it('interprets a slot as IST (UTC+5:30)', () => {
    expect(scheduledAtIst('2026-09-25', '09:00').toISOString()).toBe('2026-09-25T03:30:00.000Z');
  });

  it('applies the 48-hour cancellation rule in IST', () => {
    const slotDate = '2026-09-25';
    const slotTime = '09:00'; // 2026-09-25T03:30Z
    // Exactly 48h before is still allowed; one minute later is not.
    expect(canCancelBooking(slotDate, slotTime, new Date('2026-09-23T03:30:00Z'))).toBe(true);
    expect(canCancelBooking(slotDate, slotTime, new Date('2026-09-23T03:31:00Z'))).toBe(false);
    // A naive UTC reading of "09:00" would wrongly allow this (5.5h too late).
    expect(canCancelBooking(slotDate, slotTime, new Date('2026-09-23T08:00:00Z'))).toBe(false);
  });

  it('checks the 18-year minimum age by date string', () => {
    expect(isAtLeastYearsOld('2008-09-21', 18, '2026-09-21')).toBe(true);
    expect(isAtLeastYearsOld('2008-09-22', 18, '2026-09-21')).toBe(false);
    expect(isAtLeastYearsOld('1990-01-01', 18, '2026-09-21')).toBe(true);
  });
});
