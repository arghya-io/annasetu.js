'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { advanceProcurementStage } from '@/services/procurement/operator-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatInr, formatQuantity } from '@/lib/utils';
import type { StageData } from '@/lib/validation/procurement';

interface Props {
  recordId: string;
  stage: string;
  bookedQuantity: number;
  weighedQuantity: number | null;
  acceptedQuantity: number | null;
  msp: number | null;
}

/** The single action available at each stage, with the data that stage must capture. */
const NEXT: Record<string, { next: string; label: string; help?: string }> = {
  checked_in: { next: 'document_verified', label: 'Confirm documents verified', help: 'Check the farmer\'s identity and land records match the booking.' },
  document_verified: { next: 'weighing', label: 'Start weighing' },
  weighing: { next: 'quality_check', label: 'Record weight & start quality check' },
  quality_check: { next: 'accepted', label: 'Accept produce' },
  accepted: { next: 'unloading', label: 'Start unloading' },
  unloading: { next: 'receipt_generated', label: 'Generate receipt', help: 'Unloading is finished.' },
  receipt_generated: { next: 'payment_initiated', label: 'Initiate payment (simulated)' },
  payment_initiated: { next: 'completed', label: 'Complete procurement' },
};

export function ProcessingActions({ recordId, stage, bookedQuantity, weighedQuantity, acceptedQuantity, msp }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weight, setWeight] = useState(String(bookedQuantity));
  const [grade, setGrade] = useState('A');
  const [accepted, setAccepted] = useState(String(Math.min(weighedQuantity ?? bookedQuantity, bookedQuantity)));
  const [remarks, setRemarks] = useState('');

  const step = NEXT[stage];
  if (!step) {
    return <p className="text-sm text-muted-foreground">{stage === 'completed' ? 'This procurement is complete.' : 'Nothing to do at this stage.'}</p>;
  }

  async function run() {
    if (!step) return;
    setError(null);

    const data: StageData = {};
    if (step.next === 'quality_check') {
      const w = Number(weight);
      if (!(w > 0)) return setError('Enter the weighed quantity in quintal.');
      data.weighed_quantity_quintal = w;
    }
    if (step.next === 'accepted') {
      const a = Number(accepted);
      if (!(a > 0)) return setError('Enter the accepted quantity in quintal.');
      data.quality_grade = grade as 'A' | 'B' | 'C';
      data.accepted_quantity_quintal = a;
    }
    if (remarks.trim()) data.remarks = remarks.trim();

    setBusy(true);
    const result = await advanceProcurementStage(recordId, step.next, data);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRemarks('');
    router.refresh();
  }

  const estimatedAmount = msp != null && acceptedQuantity != null ? acceptedQuantity * msp : null;

  return (
    <div className="flex flex-col gap-4">
      {step.help && <p className="text-sm text-muted-foreground">{step.help}</p>}

      {step.next === 'quality_check' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weight">Weighed quantity (quintal)</Label>
          <Input id="weight" type="number" step="any" min="0" value={weight} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWeight(e.target.value)} />
          <p className="text-xs text-muted-foreground">Booked: {formatQuantity(bookedQuantity)}</p>
        </div>
      )}

      {step.next === 'accepted' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grade">Quality grade</Label>
            <Select id="grade" value={grade} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setGrade(e.target.value)}>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accepted">Accepted quantity (quintal)</Label>
            <Input id="accepted" type="number" step="any" min="0" value={accepted} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccepted(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Weighed {formatQuantity(weighedQuantity)} · booked {formatQuantity(bookedQuantity)} (cannot exceed either)
            </p>
          </div>
        </div>
      )}

      {step.next === 'payment_initiated' && (
        <p className="rounded-md bg-secondary/60 p-3 text-sm">
          Accepted {formatQuantity(acceptedQuantity)}
          {msp != null ? ` × MSP ${formatInr(msp)}/qtl = ` : ''}
          <span className="font-medium">{estimatedAmount != null ? formatInr(estimatedAmount) : ''}</span>
          <span className="block text-xs text-muted-foreground">Simulated payment — no real money moves in this prototype.</span>
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="remarks">Remarks (optional)</Label>
        <Input id="remarks" value={remarks} maxLength={500} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRemarks(e.target.value)} />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button onClick={run} disabled={busy} size="lg" className="w-full sm:w-fit">
        {busy ? 'Saving…' : step.label}
      </Button>
    </div>
  );
}
