import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { rows } from '@/lib/supabase/helpers';
import { AdminCreateCentreOperatorForm } from '@/components/admin/create-centre-operator-form';
import { QueryError } from '@/components/shared/query-error';

export default async function AdminCreateCentreOperatorPage() {
  await requirePageUser('government_admin');
  const supabase = createClient();

  // Only centres inside this admin's jurisdiction can be assigned an operator.
  const { data, error } = await supabase.rpc('admin_list_centres');
  const centres = rows<{ centre_id: string; centre_name: string; centre_code: string }>(data).map((c) => ({
    id: c.centre_id,
    name: c.centre_name,
    code: c.centre_code,
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Create centre operator</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        An operator is permanently scoped to their assigned centre unless a BDO/SDO changes the
        assignment.
      </p>
      {error && <QueryError message={`Couldn't load your centres — the operator form below will have nothing to assign to. ${error.message}`} />}
      <AdminCreateCentreOperatorForm centres={centres} />
    </main>
  );
}
