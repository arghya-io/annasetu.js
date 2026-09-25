import { PROCUREMENT_STAGES, STAGE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

/** Horizontal/wrapping progress of a procurement through its stages. */
export function StageTimeline({ stage }: { stage: string | null | undefined }) {
  const currentIndex = stage ? (PROCUREMENT_STAGES as readonly string[]).indexOf(stage) : -1;
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs">
      {PROCUREMENT_STAGES.filter((s) => s !== 'scheduled').map((s) => {
        const idx = (PROCUREMENT_STAGES as readonly string[]).indexOf(s);
        const done = idx < currentIndex || stage === 'completed';
        const active = idx === currentIndex && stage !== 'completed';
        return (
          <li
            key={s}
            className={cn(
              'rounded-full border px-2.5 py-1',
              done && 'border-primary/30 bg-primary/10 text-primary',
              active && 'border-accent/40 bg-accent/15 font-medium text-accent',
              !done && !active && 'border-border text-muted-foreground',
            )}
          >
            {STAGE_LABELS[s]}
          </li>
        );
      })}
    </ol>
  );
}
