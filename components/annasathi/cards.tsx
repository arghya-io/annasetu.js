import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatDuration, formatQuantity, formatTime } from '@/lib/utils';

/**
 * A contextual card an assistant reply can attach — the same shape a real
 * tool call would return. `slotSuggestion` is illustrative (no live capacity
 * engine is wired into the chat yet, unlike the real booking page) and is
 * always labelled as demo data; `booking` and `centreList` carry the values
 * the page loaded from Supabase for this farmer, so they're shown as-is.
 */
export type AnnaSathiCard =
  | { kind: 'slotSuggestion'; centreName: string; distanceKm: number; date: string; time: string; queueAhead: number; estimatedWaitSeconds: number; capacityPercent: number }
  | {
      kind: 'booking';
      bookingRef: string;
      cropName: string;
      quantityQuintal: number;
      centreName: string;
      token: string | null;
      queuePosition: number | null;
      estimatedWaitSeconds: number | null;
      status: string;
    }
  | { kind: 'centreList'; centres: { name: string; code: string; address: string | null }[] };

function DemoTag() {
  return (
    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
      Demo data
    </span>
  );
}

export function AnnaSathiCardView({ card }: { card: AnnaSathiCard }) {
  if (card.kind === 'slotSuggestion') {
    return (
      <div className="rounded-2xl border-2 border-primary/25 bg-card p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="font-heading text-sm font-semibold">{card.centreName}</h4>
            <p className="text-[11px] text-muted-foreground">{card.distanceKm.toFixed(1)} km away (illustrative)</p>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
            Suggested
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl bg-secondary/60 p-2.5 text-xs sm:grid-cols-4">
          <div><p className="text-[10px] uppercase text-muted-foreground">Date</p><p className="font-medium">{formatDate(card.date)}</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Time</p><p className="font-medium">{formatTime(card.time)}</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Queue ahead</p><p className="font-medium">{card.queueAhead} farmers</p></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Est. wait</p><p className="font-medium">{formatDuration(card.estimatedWaitSeconds)}</p></div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" /> Capacity open: <strong className="text-foreground">{card.capacityPercent}%</strong>
            <DemoTag />
          </p>
          <Button asChild size="sm">
            <a href="/farmer/book">Go to booking</a>
          </Button>
        </div>
      </div>
    );
  }

  if (card.kind === 'booking') {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2.5">
          <div>
            <h4 className="font-heading text-sm font-semibold">Your booking</h4>
            <p className="font-mono text-[11px] text-muted-foreground">{card.bookingRef}</p>
          </div>
          <StatusBadge status={card.status} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-secondary/60 p-2"><p className="text-[10px] text-muted-foreground">Crop &amp; qty</p><p className="font-medium">{card.cropName} · {formatQuantity(card.quantityQuintal)}</p></div>
          <div className="rounded-lg bg-secondary/60 p-2"><p className="text-[10px] text-muted-foreground">Centre</p><p className="font-medium">{card.centreName}</p></div>
          <div className="rounded-lg bg-secondary/60 p-2"><p className="text-[10px] text-muted-foreground">Token</p><p className="font-mono font-semibold text-primary">{card.token ?? '—'}</p></div>
          <div className="rounded-lg bg-secondary/60 p-2"><p className="text-[10px] text-muted-foreground">Position / wait</p><p className="font-medium">{card.queuePosition != null ? `#${card.queuePosition} · ${formatDuration(card.estimatedWaitSeconds)}` : '—'}</p></div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">As of your last page load</span>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline"><a href="/farmer/bookings">Booking details</a></Button>
            <Button asChild size="sm"><a href="/farmer/queue">Track live queue</a></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
      <h4 className="font-heading text-sm font-semibold">Centres near you</h4>
      <div className="mt-2 flex flex-col gap-2">
        {card.centres.length === 0 && <p className="text-xs text-muted-foreground">No eligible centres found for your area yet.</p>}
        {card.centres.map((c) => (
          <div key={c.code} className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-xs">
            <span>
              <span className="font-medium">{c.name}</span>
              {c.address && <span className="text-muted-foreground"> · {c.address}</span>}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{c.code}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button asChild size="sm"><a href="/farmer/book">Book at one of these</a></Button>
      </div>
    </div>
  );
}
