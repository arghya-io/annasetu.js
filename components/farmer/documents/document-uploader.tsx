'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { registerDocument } from '@/services/farmer/documents-service';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const KIND_LABELS: Record<string, string> = {
  identity_proof: 'Identity proof',
  land_record: 'Land record / RoR',
  farmer_id_proof: 'Farmer ID proof',
  tenancy_proof: 'Tenancy proof',
  sharecropper_proof: 'Sharecropper proof',
  joint_ownership_proof: 'Joint ownership proof',
  other: 'Other',
};

export function DocumentUploader({ userId }: { userId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState('identity_proof');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function upload() {
    setError(null);
    setDone(false);
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setError('Only PDF, JPEG and PNG files are accepted.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('The file must be smaller than 5 MB.');
      return;
    }

    setBusy(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    // Object path is <user id>/<random>-<name>: storage RLS only allows the
    // caller's own folder, and the RPC below re-checks the same prefix.
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from('farmer-documents')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setBusy(false);
      setError('The upload failed. Please try again.');
      return;
    }

    const result = await registerDocument({
      kind,
      storagePath: path,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!result.ok) {
      // Do not leave an unregistered file behind.
      await supabase.storage.from('farmer-documents').remove([path]);
      setBusy(false);
      setError(result.error);
      return;
    }

    setBusy(false);
    setDone(true);
    setFile(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="docKind">Document type</Label>
        <Select id="docKind" value={kind} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setKind(e.target.value)}>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="docFile">File (PDF, JPEG or PNG, max 5 MB)</Label>
        <input
          id="docFile"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-primary">Uploaded. A reviewer will check it.</p>}

      <Button onClick={upload} disabled={busy || !file} className="w-fit">
        {busy ? 'Uploading…' : 'Upload document'}
      </Button>
    </div>
  );
}
