import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminCreateCscForm } from '@/components/admin/create-csc-form';

export default async function AdminCreateCscPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Add CSC operator</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        CSC accounts cannot approve farmers, land records, procurement eligibility, MSP, payments,
        or create government administrators.
      </p>
      <AdminCreateCscForm />
    </main>
  );
}
