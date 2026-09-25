'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { markNotificationsRead } from '@/services/notifications/notification-service';

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await markNotificationsRead();
        setBusy(false);
        router.refresh();
      }}
    >
      Mark all read
    </Button>
  );
}
