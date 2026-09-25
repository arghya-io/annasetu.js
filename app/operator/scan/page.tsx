import { requirePageUser } from '@/lib/auth/session';
import { ScanClient } from '@/components/operator/scan-client';

export default async function ScanPage() {
  await requirePageUser('centre_operator');
  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Check in a farmer</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Point the camera at the farmer&apos;s token QR code. Every check-in is verified against the booking on the server.
      </p>
      <ScanClient />
    </main>
  );
}
