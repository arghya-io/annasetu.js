import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function FarmerSettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Settings</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Biometric login</CardTitle>
          <CardDescription>Local, on-device face verification as an optional sign-in method.</CardDescription>
        </CardHeader>
        <CardContent>
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Disabled — future phase
          </span>
          <p className="mt-2 text-sm text-muted-foreground">
            This prototype does not yet process biometric data. When available, it will run
            entirely on your device and will require its own consent, privacy, and security
            review before going live.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
