'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateHelpRequest } from '@/services/csc/help-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function HelpRequestActions({ requestId, status, mine }: { requestId: string; status: string; mine: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(next: 'in_progress' | 'resolved' | 'closed') {
    setBusy(true);
    setError(null);
    const result = await updateHelpRequest(requestId, next, note);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setNote('');
    router.refresh();
  }

  if (status === 'resolved' || status === 'closed') return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {status === 'open' ? (
        <Button size="sm" disabled={busy} onClick={() => run('in_progress')} className="w-fit">Take this request</Button>
      ) : mine ? (
        <>
          <Input value={note} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)} placeholder="Note to the farmer (what you did / what they should do)" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => run('resolved')}>Mark resolved</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run('closed')}>Close</Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Being handled by another operator.</p>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
