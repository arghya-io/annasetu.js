import { cn } from '@/lib/utils';

const STAGES = ['Date', 'Crop & quantity', 'Eligible centre', 'Capacity & ETA', 'Smart slot', 'Confirm'] as const;

export function BookingStepper({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
      {STAGES.map((stage, i) => (
        <li key={stage} className="flex items-center gap-1">
          <span
            className={cn(
              'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-medium',
              i < activeIndex && 'bg-primary/15 text-primary',
              i === activeIndex && 'bg-primary text-primary-foreground',
              i > activeIndex && 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}
          </span>
          <span className={cn('mr-2 font-medium', i === activeIndex ? 'text-foreground' : 'text-muted-foreground')}>
            {stage}
          </span>
          {i < STAGES.length - 1 && <span className="mr-2 h-px w-4 bg-border" />}
        </li>
      ))}
    </ol>
  );
}
