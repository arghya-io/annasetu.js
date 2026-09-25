import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodTypeAny } from 'zod';

/**
 * Builds a react-hook-form resolver from a zod schema with the form's value
 * type stated explicitly. @hookform/resolvers has changed how it derives the
 * resolver's input/output generics between minor versions; schemas here use
 * z.coerce / z.preprocess / .default(), so input ≠ output, and letting the
 * library infer it made `next build` depend on whichever version npm resolved.
 * The cast is safe: the schema is still what actually validates at runtime.
 */
export function resolverFor<T extends FieldValues>(schema: ZodTypeAny): Resolver<T> {
  return zodResolver(schema) as unknown as Resolver<T>;
}
