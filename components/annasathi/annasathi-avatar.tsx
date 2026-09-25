import { cn } from '@/lib/utils';

/**
 * AnnaSathi's mark. The project has no shipped avatar asset, and a
 * photorealistic face is unnecessary and best avoided here — this is a
 * simple abstract sprout emblem in the app's own palette, sized and ringed
 * by the caller. Swap the SVG body for a real illustration later without
 * touching any call site.
 */
export function AnnaSathiAvatar({
  size = 40,
  ring = true,
  online = false,
  className,
}: {
  size?: number;
  ring?: boolean;
  online?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn('relative inline-flex flex-shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          'flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground',
          ring && 'ring-2 ring-primary/25',
        )}
      >
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" aria-hidden="true">
          <path
            d="M12 21c-4.5 0-7-3-7-7 0-4 3-8 7-11 4 3 7 7 7 11 0 4-2.5 7-7 7Z"
            fill="currentColor"
            fillOpacity="0.9"
          />
          <path d="M12 21V10" stroke="hsl(var(--primary))" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-card bg-primary"
          style={{ width: size * 0.28, height: size * 0.28 }}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
