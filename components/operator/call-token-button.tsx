'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callToken } from '@/services/procurement/operator-service';
import { Button } from '@/components/ui/button';

export function CallTokenButton({ queueEntryId }: { queueEntryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="accent"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await callToken(queueEntryId);
          setBusy(false);
          if (!result.ok) setError(result.error);
          else router.refresh();
        }}
      >
        {busy ? 'Calling…' : 'Call'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
