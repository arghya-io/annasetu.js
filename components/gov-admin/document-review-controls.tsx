'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewFarmerDocument } from '@/services/gov-admin/review-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DocumentReviewControls({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function run(status: 'verified' | 'rejected' | 'correction_required', why = '') {
    setBusy(true);
    setError(null);
    const result = await reviewFarmerDocument(documentId, status, why);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setRejecting(false);
    setReason('');
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2">
        <Input value={reason} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)} placeholder="Reason (shown to the farmer)" />
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={() => run('rejected', reason)}>Reject</Button>
          <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => run('correction_required', reason)}>Ask for new file</Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
        </div>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={busy} onClick={() => run('verified')}>Verify</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>Reject…</Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
