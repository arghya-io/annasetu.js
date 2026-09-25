'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewCropChangeRequest } from '@/services/gov-admin/review-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CropChangeReview({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'rejected' | 'correction_required') {
    if (decision !== 'approved' && !notes.trim()) {
      setError('Add a note explaining your decision.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await reviewCropChangeRequest(requestId, decision, notes);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Input value={notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} placeholder="Note to the farmer (required unless approving)" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => decide('approved')}>Approve</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('correction_required')}>Ask for correction</Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide('rejected')}>Reject</Button>
      </div>
    </div>
  );
}
