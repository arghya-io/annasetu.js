'use client';

import { useState } from 'react';
import { scanAndCheckIn } from '@/services/procurement/operator-service';
import { QrScanner } from '@/components/operator/qr-scanner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';

type Outcome = { kind: 'success'; appointmentId: string } | { kind: 'error'; message: string } | null;

export function ScanClient() {
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [manual, setManual] = useState('');

  async function handle(text: string) {
    if (busy) return;
    setBusy(true);
    setScanning(false);
    const result = await scanAndCheckIn(text);
    setBusy(false);
    if (result.ok && result.appointmentId) {
      setOutcome({ kind: 'success', appointmentId: result.appointmentId });
    } else {
      setOutcome({ kind: 'error', message: result.ok ? 'Check-in failed' : result.error });
    }
  }

  function scanNext() {
    setOutcome(null);
    setManual('');
    setScanning(true);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {outcome?.kind === 'success' && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-5">
            <p className="font-medium text-primary">Checked in successfully.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild><a href={`/operator/processing/${outcome.appointmentId}`}>Start processing</a></Button>
              <Button variant="outline" onClick={scanNext}>Scan next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {outcome?.kind === 'error' && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 p-5">
            <p role="alert" className="font-medium text-destructive">{outcome.message}</p>
            <Button variant="outline" className="w-fit" onClick={scanNext}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {!outcome && (
        <>
          <QrScanner active={scanning} onScan={handle} />
          {busy && <p className="text-sm text-muted-foreground">Verifying…</p>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual">Camera not working? Paste the QR text</Label>
            <Textarea id="manual" value={manual} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setManual(e.target.value)} placeholder='{"id":"…","hash":"…"}' />
            <Button variant="outline" className="w-fit" disabled={busy || !manual.trim()} onClick={() => handle(manual.trim())}>
              Check in
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
