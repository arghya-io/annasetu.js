import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  highlighted = false,
  demo = false,
  tone = 'default',
}: {
  label: string;
  value: string;
  /** Glass treatment — reserve for the one or two metrics that matter most on a screen. */
  highlighted?: boolean;
  /** Marks illustrative/seeded numbers so they're never mistaken for live data. */
  demo?: boolean;
  tone?: 'default' | 'accent' | 'destructive';
}) {
  return (
    <div
      className={cn(
        'rounded-lg p-4',
        highlighted ? 'glass' : 'border border-border/70 bg-card shadow-soft',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {demo && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Demo data
          </span>
        )}
      </div>
      <p
        className={cn(
          'font-heading text-2xl font-semibold',
          tone === 'accent' && 'text-accent',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  );
}
