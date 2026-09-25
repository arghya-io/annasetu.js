/**
 * Centralized business rules. These values MUST match the constants baked
 * into the SQL functions (enforce_booking_window, create_booking,
 * cancel_appointment in supabase/migrations/002 + 007).
 * The database is the authoritative enforcement point — these exist so the
 * UI can show correct affordances (disabled buttons, helper text, etc.)
 * without a round trip, never as the actual security boundary.
 */

export const BOOKING_WINDOW_DAYS = 14;

export const CANCELLATION_WINDOW_HOURS = 48;

export const ROLLING_PROCESSING_COUNT = 15;

export const DEFAULT_PROCESSING_TIME_SECONDS = 900; // 15 min, used until a centre has history

/**
 * All business dates/times (booking window, "today", slot times, the 48h
 * cancellation window) are evaluated in Indian Standard Time — in the DB via
 * app_today()/app_local_ts(), and in the UI via the helpers below. Never use
 * the server's or DB's ambient timezone (UTC on Vercel/Supabase) for these.
 */
export const APP_TIMEZONE = 'Asia/Kolkata';

/** Booking slots are 30-minute windows; throughput per window is derived from counters and average processing time. */
export const SLOT_MINUTES = 30;

export const SUPPORTED_LOCALES = [
  'en', 'hi', 'bn', 'as', 'or', 'mr', 'te', 'ta', 'kn', 'ml', 'gu',
] as const;

export const FARMER_CATEGORIES = [
  'owner_cultivator',
  'tenant_farmer',
  'sharecropper',
  'joint_co_owner',
  'other_eligible_cultivator',
] as const;

export const BOOKING_STATUSES = [
  'draft', 'booked', 'confirmed', 'checked_in', 'in_progress',
  'completed', 'cancelled', 'no_show', 'expired',
] as const;

export const PROCUREMENT_STAGES = [
  'scheduled', 'checked_in', 'document_verified', 'weighing', 'quality_check',
  'accepted', 'unloading', 'receipt_generated', 'payment_initiated', 'completed',
] as const;

export const STAGE_LABELS: Record<(typeof PROCUREMENT_STAGES)[number], string> = {
  scheduled: 'Scheduled',
  checked_in: 'Checked in',
  document_verified: 'Documents verified',
  weighing: 'Weighing',
  quality_check: 'Quality check',
  accepted: 'Accepted',
  unloading: 'Unloading',
  receipt_generated: 'Receipt generated',
  payment_initiated: 'Payment initiated',
  completed: 'Completed',
};

export const QUALITY_GRADES = ['A', 'B', 'C'] as const;

export const CROP_CHANGE_STATUSES = [
  'pending', 'under_review', 'approved', 'rejected', 'correction_required',
] as const;

export const PAYMENT_STATUSES = [
  'payment_pending', 'payment_initiated', 'payment_processing',
  'payment_completed', 'payment_failed',
] as const;

/** Today's calendar date (YYYY-MM-DD) in the application timezone (IST). */
export function todayInAppTimezone(now: Date = new Date()): string {
  // 'en-CA' formats as YYYY-MM-DD.
  return now.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

/** Adds whole days to a YYYY-MM-DD string (calendar arithmetic, no timezone drift). */
export function addDaysToDateString(date: string, days: number): string {
  const parts = date.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Helper mirrored client-side for immediate UI feedback (server RPC is authoritative). */
export function earliestBookingDate(procurementDate: Date): Date {
  const d = new Date(procurementDate);
  d.setDate(d.getDate() - BOOKING_WINDOW_DAYS);
  return d;
}

export function cancellationDeadline(procurementDateTime: Date): Date {
  const d = new Date(procurementDateTime);
  d.setHours(d.getHours() - CANCELLATION_WINDOW_HOURS);
  return d;
}

/** The instant a booking's slot starts: 'YYYY-MM-DD' + 'HH:MM' interpreted in IST (UTC+05:30, no DST). */
export function scheduledAtIst(date: string, time: string): Date {
  return new Date(`${date.slice(0, 10)}T${time.slice(0, 5)}:00+05:30`);
}

/** Mirrors cancel_appointment(): at least 48h must remain before the slot. */
export function canCancelBooking(date: string, time: string, now: Date = new Date()): boolean {
  return now.getTime() <= cancellationDeadline(scheduledAtIst(date, time)).getTime();
}

/**
 * Country codes for the login/account-creation mobile field (spec §9, §27).
 * This list is for the UI selector only — normalize_mobile_number() in
 * Supabase/Migrations/005_admin_provisioning_functions.sql is the
 * authoritative validator/formatter; a client-side mismatch here never
 * results in a bad number being stored, only a form error being shown late
 * (at the server round trip) instead of immediately.
 */
export const COUNTRY_CODES = [
  { code: '+91', country: 'India' },
  { code: '+1', country: 'United States / Canada' },
  { code: '+44', country: 'United Kingdom' },
  { code: '+61', country: 'Australia' },
  { code: '+971', country: 'United Arab Emirates' },
  { code: '+966', country: 'Saudi Arabia' },
  { code: '+65', country: 'Singapore' },
  { code: '+94', country: 'Sri Lanka' },
  { code: '+977', country: 'Nepal' },
  { code: '+880', country: 'Bangladesh' },
] as const;
export const DEFAULT_COUNTRY_CODE = '+91';

export const ACCOUNT_STATUSES = ['pending', 'active', 'suspended', 'disabled', 'deactivated'] as const;
export const GOV_ADMIN_ROLES = ['bdo', 'sdo'] as const;
export const DOCUMENT_STATUSES = [
  'pending', 'uploaded', 'under_review', 'verified', 'rejected', 'correction_required', 'expired',
] as const;

/**
 * User-chosen password policy (spec §14) — deliberately stronger than the
 * initial generated format (8 uppercase alphanumeric — see
 * generate_initial_password() in migration 005). Enforced client-side here
 * for immediate feedback; Supabase Auth itself is the actual hashing/storage
 * authority (spec §29), so this only shapes what gets submitted to it.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_POLICY_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
export const PASSWORD_POLICY_DESCRIPTION =
  'At least 10 characters, with an uppercase letter, a lowercase letter, a number, and a special character.';

