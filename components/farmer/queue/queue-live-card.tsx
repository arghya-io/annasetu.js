'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { subscribeToQueueEntry, unsubscribe, type QueueSnapshot } from '@/services/queue/queue-client';
import { StatusBadge } from '@/components/shared/status-badge';
import { StageTimeline } from '@/components/shared/stage-timeline';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, formatDuration, formatTime } from '@/lib/utils';

export function QueueLiveCard({
  appointmentId,
  initial,
  centreName,
  procurementDate,
  procurementTime,
  stage,
}: {
  appointmentId: string;
  initial: QueueSnapshot;
  centreName: string;
  procurementDate: string;
  procurementTime: string;
  stage: string | null;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<QueueSnapshot>(initial);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const lastStatus = useRef(initial.status);

  // The QR carries {queueEntryId, secret}. The operator's scan is re-validated
  // in the database on every condition (validate_and_checkin_token) — the QR is
  // only a lookup key + bearer secret, never the source of truth.
  useEffect(() => {
    if (!snapshot.qrPayloadHash) return;
    const payload = JSON.stringify({ id: snapshot.id, hash: snapshot.qrPayloadHash });
    QRCode.toDataURL(payload, { margin: 1, width: 220 }).then(setQrDataUrl);
  }, [snapshot.id, snapshot.qrPayloadHash]);

  useEffect(() => {
    const channel = subscribeToQueueEntry(appointmentId, (next) => {
      // Realtime UPDATE payloads carry the full row, but keep the QR secret we already have.
      setSnapshot((prev) => ({ ...next, qrPayloadHash: next.qrPayloadHash ?? prev.qrPayloadHash }));
    });
    return () => unsubscribe(channel);
  }, [appointmentId]);

  // When the status changes (checked in / called / in progress / done), re-fetch
  // the server data so the processing stage and receipt update too.
  useEffect(() => {
    if (lastStatus.current !== snapshot.status) {
      lastStatus.current = snapshot.status;
      router.refresh();
    }
  }, [snapshot.status, router]);

  const showQr = snapshot.status === 'waiting' || snapshot.status === 'called';
  const waitLabel = snapshot.estimatedWaitSeconds == null ? 'Calculating…' : `~${formatDuration(snapshot.estimatedWaitSeconds)}`;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="flex w-full items-center justify-between">
          <div className="text-left">
            <p className="font-heading text-2xl">Token {snapshot.tokenNumber}</p>
            <p className="text-sm text-muted-foreground">{centreName}</p>
            <p className="text-sm text-muted-foreground">{formatDate(procurementDate)} · {formatTime(procurementTime)}</p>
          </div>
          <StatusBadge status={snapshot.status} />
        </div>

        {showQr && qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL generated in the browser; next/image cannot optimise it
          <img src={qrDataUrl} alt="Queue token QR code" width={180} height={180} />
        )}
        {showQr && <p className="text-xs text-muted-foreground">Show this QR code to the operator when you arrive.</p>}

        {snapshot.status === 'called' && (
          <p className="w-full rounded-md bg-accent/10 p-3 text-sm font-medium text-accent">
            Your token was called — please go to counter {snapshot.assignedCounter ?? 1}.
          </p>
        )}

        <div className="grid w-full grid-cols-2 gap-4 border-t border-border pt-4 text-left">
          <div>
            <p className="text-xs text-muted-foreground">Position in queue</p>
            <p className="font-heading text-xl">{snapshot.queuePosition ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estimated wait</p>
            <p className="font-heading text-xl">{snapshot.queuePosition == null ? '—' : waitLabel}</p>
          </div>
        </div>

        {stage && stage !== 'scheduled' && (
          <div className="w-full border-t border-border pt-4 text-left">
            <p className="mb-2 text-xs text-muted-foreground">Progress at the centre</p>
            <StageTimeline stage={stage} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
