export function QueryError({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">Couldn&apos;t load this data.</p>
      <p className="mt-1 text-destructive/80">{message}</p>
    </div>
  );
}
