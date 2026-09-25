'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCentre } from '@/services/gov-admin/review-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CentreControls({
  centreId,
  isActive,
  dailyCapacity,
  counters,
}: {
  centreId: string;
  isActive: boolean;
  dailyCapacity: number;
  counters: number;
}) {
  const router = useRouter();
  const [capacity, setCapacity] = useState(String(dailyCapacity));
  const [counterCount, setCounterCount] = useState(String(counters));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(changes: { isActive?: boolean }) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await updateCentre(centreId, {
      ...changes,
      dailyCapacityQuintal: Number(capacity),
      countersCount: Number(counterCount),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`cap-${centreId}`} className="text-xs">Daily capacity (qtl)</Label>
        <Input id={`cap-${centreId}`} className="w-32" type="number" min="1" step="any" value={capacity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCapacity(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`cnt-${centreId}`} className="text-xs">Counters</Label>
        <Input id={`cnt-${centreId}`} className="w-24" type="number" min="1" step="1" value={counterCount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCounterCount(e.target.value)} />
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => save({})}>Save</Button>
      <Button size="sm" variant={isActive ? 'ghost' : 'default'} disabled={busy} onClick={() => save({ isActive: !isActive })}>
        {isActive ? 'Deactivate' : 'Activate'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {saved && <span className="text-xs text-primary">Saved</span>}
    </div>
  );
}
