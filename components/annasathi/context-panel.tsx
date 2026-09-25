import { StatusBadge } from '@/components/shared/status-badge';
import { formatDuration } from '@/lib/utils';
import type { AnnaSathiLanguage } from '@/lib/annasathi/languages';

export interface AnnaSathiContextData {
  verificationStatus: string | null;
  activeBooking: {
    token: string | null;
    centreName: string;
    queuePosition: number | null;
    estimatedWaitSeconds: number | null;
  } | null;
}

/**
 * A quiet summary of where the farmer stands — not a dashboard. Values come
 * from the same server-side query the page itself made on load, so they're
 * real, just not live-updating inside the chat (the dedicated queue page
 * subscribes to Realtime for that).
 */
export function AnnaSathiContextPanel({
  language,
  data,
}: {
  language: AnnaSathiLanguage;
  data: AnnaSathiContextData;
}) {
  return (
    <aside className="hidden w-80 flex-shrink-0 flex-col gap-4 lg:flex">
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
        <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <h3 className="font-heading text-sm font-semibold">AnnaSathi context</h3>
        </div>

        <div className="flex flex-col gap-2.5 text-xs">
          <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-2.5 py-2">
            <span className="text-muted-foreground">Language</span>
            <span className="font-medium">{language.nativeName}</span>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-2.5 py-2">
            <span className="text-muted-foreground">Section</span>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Procurement &amp; booking</span>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-2.5 py-2">
            <span className="text-muted-foreground">Verification</span>
            {data.verificationStatus ? (
              <StatusBadge status={data.verificationStatus} />
            ) : (
              <span className="text-[11px] text-muted-foreground">Not started</span>
            )}
          </div>

          {data.activeBooking && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-primary">Active booking</span>
                <span className="font-mono text-[10px] text-primary">{data.activeBooking.token ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{data.activeBooking.centreName}</span>
                <span className="font-medium text-foreground">
                  {data.activeBooking.queuePosition != null
                    ? `#${data.activeBooking.queuePosition} · ${formatDuration(data.activeBooking.estimatedWaitSeconds)}`
                    : 'Not queued yet'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-4 text-primary-foreground shadow-soft">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-foreground/90">
          <span aria-hidden>💬</span> Try asking by voice
        </p>
        <p className="mt-1 font-heading text-sm font-semibold">&ldquo;What&rsquo;s my token number?&rdquo;</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-primary-foreground/80">
          Ask about MSP rates, centre timings, or how to request a crop change — in your own language.
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-3 text-[11px] leading-normal text-muted-foreground">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
          <span aria-hidden>🌾</span> AnnaSetu AI Assistant — Prototype
        </p>
        AnnaSathi answers using AnnaSetu&rsquo;s own data and guidance. Voice recognition and multilingual
        replies are being connected; today the conversation runs on built-in demo responses.
      </div>
    </aside>
  );
}
