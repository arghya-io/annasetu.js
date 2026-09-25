'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getOwnDocumentUrl } from '@/services/farmer/documents-service';
import { getDocumentUrl } from '@/services/gov-admin/review-service';

/** Opens a short-lived signed URL in a new tab. `as` picks the farmer or admin signer. */
export function ViewDocumentButton({ documentId, as }: { documentId: string; as: 'farmer' | 'admin' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const result = as === 'admin' ? await getDocumentUrl(documentId) : await getOwnDocumentUrl(documentId);
    setBusy(false);
    if (!result.ok || !result.url) {
      setError(result.ok ? 'The file could not be opened' : result.error);
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={open} disabled={busy}>
        {busy ? 'Opening…' : 'View'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
