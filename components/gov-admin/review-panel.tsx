'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewFarmerVerification } from '@/services/gov-admin/review-service';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

/**
 * Approve / request correction / reject. Approving also approves the farmer's
 * pending procurement crops (server-side, atomically). A note is required for
 * anything other than approval — the farmer sees it verbatim.
 */
export function ReviewPanel({ farmerId, pendingCropCount }: { farmerId: string; pendingCropCount: number }) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'rejected' | 'correction_required') {
    if (decision !== 'approved' && notes.trim().length === 0) {
      setError('Add a note explaining your decision — the farmer will see it.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await reviewFarmerVerification(farmerId, decision, notes);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Decision</CardTitle>
        <CardDescription>
          Approving will also approve {pendingCropCount} pending procurement crop{pendingCropCount === 1 ? '' : 's'}, letting the farmer book slots.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          placeholder="Review notes (visible to the farmer; required unless approving)"
          value={notes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
        />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => decide('approved')} disabled={busy}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => decide('correction_required')} disabled={busy}>
            Request correction
          </Button>
          <Button size="sm" variant="destructive" onClick={() => decide('rejected')} disabled={busy}>
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
