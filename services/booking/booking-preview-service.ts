'use server';

import { createClient } from '@/lib/supabase/server';
import { rows } from '@/lib/supabase/helpers';
import { BOOKING_WINDOW_DAYS, addDaysToDateString, todayInAppTimezone } from '@/lib/constants';

export interface EligibleCentre {
  centreId: string;
  name: string;
  code: string;
  address: string | null;
  opensAt: string;
  closesAt: string;
  openDays: string[];
  dailyCapacity: number;
  counters: number;
}

export interface SlotInfo {
  start: string;
  used: number;
  capacity: number;
  past: boolean;
}

export interface SlotPreview {
  totalCapacity: number;
  bookedCapacity: number;
  remainingCapacity: number;
  queueLength: number;
  counters: number;
  avgProcessingSeconds: number;
  estimatedWaitSeconds: number;
  opensAt: string;
  closesAt: string;
  isOpenDay: boolean;
  slots: SlotInfo[];
}

interface EligibleCentreRow {
  centre_id: string;
  centre_name: string;
  centre_code: string;
  centre_address: string | null;
  opens_at: string;
  closes_at: string;
  open_days: string[];
  daily_capacity: number;
  counters: number;
}

/** Centres this farmer may book at (same district, or same state when their district has none). */
export async function listEligibleCentres(): Promise<EligibleCentre[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc('list_eligible_centres');
  return rows<EligibleCentreRow>(data).map((c) => ({
    centreId: c.centre_id,
    name: c.centre_name,
    code: c.centre_code,
    address: c.centre_address,
    opensAt: String(c.opens_at).slice(0, 5),
    closesAt: String(c.closes_at).slice(0, 5),
    openDays: c.open_days ?? [],
    dailyCapacity: Number(c.daily_capacity),
    counters: c.counters,
  }));
}

/**
 * Read-only preview for the booking flow: capacity left, live queue length,
 * ETA and per-slot availability. Informational only — create_booking() is the
 * sole authority and re-checks everything under a row lock.
 *
 * (The previous version counted queue_entries through the FARMER's RLS, which
 * only ever exposes the farmer's own rows, so "people ahead of you" was always
 * ~0. get_slot_preview() is SECURITY DEFINER and returns aggregates only.)
 */
export async function getSlotPreview(centreId: string, procurementDate: string): Promise<SlotPreview | null> {
  if (!centreId || !/^\d{4}-\d{2}-\d{2}$/.test(procurementDate)) return null;
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_slot_preview', {
    p_centre_id: centreId,
    p_date: procurementDate,
  });
  if (error || !data) return null;

  const d = data as {
    total_capacity_quintal: number;
    booked_quintal: number;
    remaining_quintal: number;
    queue_length: number;
    counters: number;
    avg_processing_seconds: number;
    estimated_wait_seconds: number;
    opens_at: string;
    closes_at: string;
    is_open_day: boolean;
    slots: SlotInfo[];
  };

  return {
    totalCapacity: Number(d.total_capacity_quintal),
    bookedCapacity: Number(d.booked_quintal),
    remainingCapacity: Number(d.remaining_quintal),
    queueLength: d.queue_length,
    counters: d.counters,
    avgProcessingSeconds: Number(d.avg_processing_seconds),
    estimatedWaitSeconds: Number(d.estimated_wait_seconds),
    opensAt: d.opens_at,
    closesAt: d.closes_at,
    isOpenDay: d.is_open_day,
    slots: d.slots ?? [],
  };
}

export interface AlternativeOptions {
  dates: { date: string; remainingCapacity: number }[];
  centres: { centreId: string; name: string; remainingCapacity: number }[];
}

function hasRoom(preview: SlotPreview | null, quantity: number): boolean {
  return (
    !!preview &&
    preview.isOpenDay &&
    preview.remainingCapacity >= quantity &&
    preview.slots.some((s) => !s.past && s.used < s.capacity)
  );
}

/**
 * When the chosen centre/date is full (spec §8): other bookable dates at the
 * same centre inside the 14-day window, and other eligible centres that have
 * room on the chosen date. Read-only; create_booking still decides.
 */
export async function findAlternatives(
  centreId: string,
  procurementDate: string,
  quantity: number,
): Promise<AlternativeOptions> {
  const today = todayInAppTimezone();
  const candidates: string[] = [];
  for (let i = 0; i <= BOOKING_WINDOW_DAYS && candidates.length < 14; i += 1) {
    const day = addDaysToDateString(today, i);
    if (day !== procurementDate) candidates.push(day);
  }

  const [datePreviews, centres] = await Promise.all([
    Promise.all(candidates.map(async (day) => ({ day, preview: await getSlotPreview(centreId, day) }))),
    listEligibleCentres(),
  ]);

  const dates = datePreviews
    .filter((d) => hasRoom(d.preview, quantity))
    .slice(0, 5)
    .map((d) => ({ date: d.day, remainingCapacity: d.preview?.remainingCapacity ?? 0 }));

  const otherCentres = centres.filter((c) => c.centreId !== centreId).slice(0, 6);
  const centrePreviews = await Promise.all(
    otherCentres.map(async (c) => ({ c, preview: await getSlotPreview(c.centreId, procurementDate) })),
  );
  const alternativeCentres = centrePreviews
    .filter((x) => hasRoom(x.preview, quantity))
    .map((x) => ({ centreId: x.c.centreId, name: x.c.name, remainingCapacity: x.preview?.remainingCapacity ?? 0 }));

  return { dates, centres: alternativeCentres };
}
