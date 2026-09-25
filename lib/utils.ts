import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { APP_TIMEZONE } from '@/lib/constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** '2026-09-21' -> '21 Sep 2026' (calendar date, timezone-independent). */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const parts = date.slice(0, 10).split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** '09:30:00' -> '09:30'. */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '—';
  return time.slice(0, 5);
}

/** Timestamp -> '21 Sep 2026, 3:04 pm' in IST. */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: APP_TIMEZONE,
  });
}

/** 900 -> '15 min', 45 -> '<1 min'. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatQuantity(q: number | null | undefined, unit = 'qtl'): string {
  if (q === null || q === undefined) return '—';
  return `${Number(q).toFixed(2).replace(/\.00$/, '')} ${unit}`;
}

export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}
