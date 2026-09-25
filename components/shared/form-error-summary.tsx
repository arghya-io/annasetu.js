/** Flattens react-hook-form errors (nested objects/arrays) into messages. */
export function collectErrorMessages(errors: unknown, out: string[] = []): string[] {
  if (!errors || typeof errors !== 'object') return out;
  const record = errors as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message) {
    out.push(record.message);
    return out;
  }
  Object.values(record).forEach((value) => collectErrorMessages(value, out));
  return out;
}

/**
 * Shown above a form's submit button. Without it a failed validation on a
 * field the user cannot see (or that has no inline message) makes the submit
 * button look dead.
 */
export function FormErrorSummary({ errors }: { errors: unknown }) {
  const messages = Array.from(new Set(collectErrorMessages(errors)));
  if (messages.length === 0) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <p className="font-medium">Please fix the following:</p>
      <ul className="mt-1 list-disc pl-5">
        {messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
