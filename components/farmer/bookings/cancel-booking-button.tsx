'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelBooking } from '@/services/booking/booking-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CancelBookingButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await cancelBooking({ appointmentId, reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-border p-3">
      <label className="text-sm" htmlFor={`reason-${appointmentId}`}>Reason for cancelling</label>
      <Input
        id={`reason-${appointmentId}`}
        value={reason}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
        placeholder="e.g. harvest delayed"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" onClick={confirm} disabled={busy || reason.trim().length < 3}>
          {busy ? 'Cancelling…' : 'Confirm cancellation'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Keep booking
        </Button>
      </div>
    </div>
  );
}
