'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createHelpRequest } from '@/services/farmer/help-service';
import { LocationPicker, EMPTY_LOCATION, type LocationValue } from '@/components/farmer/registration/location-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function HelpForm({ needsDistrict }: { needsDistrict: boolean }) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<LocationValue>(EMPTY_LOCATION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    if (needsDistrict && !location.districtId) {
      setError('Choose your district so a nearby CSC can help.');
      return;
    }
    setBusy(true);
    const result = await createHelpRequest({ subject, description, districtId: location.districtId || undefined });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    setSubject('');
    setDescription('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {needsDistrict && (
        <div className="flex flex-col gap-1.5">
          <Label>Your district</Label>
          <LocationPicker value={location} onChange={setLocation} level="district" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" value={subject} maxLength={200} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">What do you need help with?</Label>
        <Textarea id="description" value={description} maxLength={2000} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {sent && <p className="text-sm text-primary">Sent. A CSC operator in your district will pick this up.</p>}
      <Button type="submit" disabled={busy} className="w-fit">{busy ? 'Sending…' : 'Ask for help'}</Button>
    </form>
  );
}
