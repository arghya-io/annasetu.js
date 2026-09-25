import { cn } from '@/lib/utils';

export type VoiceState = 'idle' | 'requesting' | 'listening' | 'denied';

/**
 * The primary voice button. Purely presentational — the parent owns the
 * getUserMedia call and the (currently simulated) recognition timer, so this
 * component only ever reflects state, never decides it.
 */
export function MicButton({
  state,
  onClick,
  size = 56,
}: {
  state: VoiceState;
  onClick: () => void;
  size?: number;
}) {
  const listening = state === 'listening';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={listening}
      aria-label={listening ? 'Stop listening' : 'Speak to AnnaSathi'}
      title={listening ? 'Stop listening' : 'Speak to AnnaSathi'}
      className={cn(
        'relative flex flex-shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-soft transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
        listening ? 'bg-accent' : 'bg-gradient-to-br from-primary to-primary/80',
      )}
      style={{ width: size, height: size }}
    >
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" aria-hidden />}
      <svg viewBox="0 0 24 24" width={size * 0.45} height={size * 0.45} fill="none" className="relative" aria-hidden="true">
        <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Shown above the input bar while `state === 'listening'`. */
export function ListeningPanel({ onStop }: { onStop: () => void }) {
  const delays = [0, 150, 300, 200, 400, 100, 250];
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-3">
      <div className="flex items-center gap-3">
        <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" aria-hidden />
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" className="relative" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="2" />
            <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <p className="font-heading text-xs font-semibold text-accent">Listening…</p>
          <p className="text-[11px] text-muted-foreground">Speak your question — tap Stop when you&rsquo;re done.</p>
        </div>
      </div>

      <div className="flex h-6 items-end gap-1" aria-hidden="true">
        {delays.map((delay, i) => (
          <span
            key={i}
            className="annasathi-wave-bar w-1 rounded-full bg-accent"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onStop}
        className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
      >
        <span className="h-2 w-2 rounded-sm bg-destructive" /> Stop
      </button>
    </div>
  );
}

/** Shown once, after a denied getUserMedia() call, until dismissed. */
export function MicPermissionBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-accent/25 bg-accent/5 px-4 py-3 text-xs sm:items-center">
      <div className="flex items-start gap-2.5 sm:items-center">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" aria-hidden="true">
            <path d="M19 11a7 7 0 0 1-14 0M12 18v3M12 18a3 3 0 0 0 3-3v-1M9 6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <p className="text-accent">
          <span className="font-semibold">Microphone access is needed for voice assistance.</span>{' '}
          <span className="text-foreground/80">You can enable it in your browser settings, or just type your request below.</span>
        </p>
      </div>
      <button onClick={onDismiss} className="flex-shrink-0 text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
