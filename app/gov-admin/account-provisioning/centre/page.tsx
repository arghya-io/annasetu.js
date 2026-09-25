import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminCreateCentreForm } from '@/components/admin/create-centre-form';

export default async function AdminCreateCentrePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Add procurement centre</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The centre is created within your administrative jurisdiction. Add a centre operator
        afterward from the Centre Operators page.
      </p>
      <AdminCreateCentreForm />
    </main>
  );
}
