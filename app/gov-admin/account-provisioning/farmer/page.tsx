import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminCreateFarmerForm } from '@/components/admin/create-farmer-form';

export default async function AdminCreateFarmerPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Create farmer account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This creates the account only — farmer eligibility still requires government
        verification of the submitted details.
      </p>
      <AdminCreateFarmerForm />
    </main>
  );
}
