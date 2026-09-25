/**
 * Narrowing helpers for untyped Supabase results. Use these instead of
 * `as` casts scattered through pages so the trust boundary is in one place.
 */

/** Coerces a query result into a typed array ([] when null/error). */
export function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Coerces a single-row query result into `T | null`. */
export function one<T>(data: unknown): T | null {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return data as T;
}

/** Postgres error messages carry our machine codes ("CAPACITY_FULL: ..."). */
export function errorCode(message: string | undefined | null): string | null {
  if (!message) return null;
  const match = /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(message);
  return match?.[1] ?? null;
}

/**
 * PostgREST returns an embedded relation as an object (many-to-one / unique FK)
 * or an array (one-to-many). Normalises either to the first item.
 */
export function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
