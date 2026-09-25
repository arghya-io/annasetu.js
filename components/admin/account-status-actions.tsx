'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  suspendAccount, activateAccount, regenerateInitialPassword,
} from '@/services/admin/account-lifecycle-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Suspend / activate / reset-password for a farmer, CSC operator or centre
 * operator. The server re-checks jurisdiction and refuses administrator and
 * self-targeted actions regardless of what this UI shows.
 */
export function AccountStatusActions({
  userId,
  status,
  holderName,
}: {
  userId: string;
  status: string;
  holderName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');
  const [newPassword, setNewPassword] = useState<string | null>(null);

  async function handleSuspend() {
    setBusy(true);
    setError(null);
    const result = await suspendAccount(userId, reason);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSuspending(false);
    setReason('');
    router.refresh();
  }

  async function handleActivate() {
    setBusy(true);
    setError(null);
    const result = await activateAccount(userId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function handleRegenerate() {
    if (!window.confirm(`Generate a new initial password for ${holderName}? Their old password stops working immediately.`)) return;
    setBusy(true);
    setError(null);
    const result = await regenerateInitialPassword(userId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setNewPassword(result.initialPassword);
    router.refresh();
  }

  if (newPassword) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="font-medium">New initial password for {holderName}</p>
        <p className="mt-1 font-mono text-lg tracking-widest">{newPassword}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Shown once. Give it to the account holder — they must change it at first sign-in.
        </p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setNewPassword(null)}>Done</Button>
      </div>
    );
  }

  if (suspending) {
    return (
      <div className="flex flex-col gap-2">
        <Input
          value={reason}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
          placeholder="Reason for suspension (required)"
        />
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" onClick={handleSuspend} disabled={busy || reason.trim().length === 0}>
            {busy ? 'Suspending…' : 'Confirm suspend'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSuspending(false)} disabled={busy}>Cancel</Button>
        </div>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'active' ? (
        <Button size="sm" variant="outline" onClick={() => setSuspending(true)} disabled={busy}>Suspend</Button>
      ) : (
        <Button size="sm" onClick={handleActivate} disabled={busy}>Activate</Button>
      )}
      <Button size="sm" variant="ghost" onClick={handleRegenerate} disabled={busy}>Reset password</Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
