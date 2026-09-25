import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { first, rows } from '@/lib/supabase/helpers';
import { AccountStatusActions } from '@/components/admin/account-status-actions';
import { StatusBadge } from '@/components/shared/status-badge';
import { QueryError } from '@/components/shared/query-error';
import { Card, CardContent } from '@/components/ui/card';

interface OperatorRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  employee_code: string | null;
  designation: string | null;
  procurement_centres: { name: string } | { name: string }[] | null;
  users: { account_status: string; mobile_number_normalized: string | null; must_change_password: boolean } | { account_status: string; mobile_number_normalized: string | null; must_change_password: boolean }[] | null;
}

export default async function OperatorsPage() {
  await requirePageUser('government_admin');
  const supabase = createClient();

  const { data, error } = await supabase
    .from('centre_operators')
    .select('user_id, first_name, last_name, employee_code, designation, procurement_centres (name), users:user_id (account_status, mobile_number_normalized, must_change_password)')
    .order('user_id');
  const operators = rows<OperatorRow>(data);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-semibold">Centre operators</h1>
        <a href="/gov-admin/account-provisioning/centre-operator" className="text-sm font-medium text-primary underline underline-offset-4">
          Add operator →
        </a>
      </div>

      {error && <QueryError message={error.message} />}

      <div className="mt-6 flex flex-col gap-2">
        {operators.map((o) => {
          const u = first(o.users);
          const name = `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || 'Operator';
          return (
            <Card key={o.user_id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{name}</p>
                  <p className="text-sm text-muted-foreground">
                    {first(o.procurement_centres)?.name ?? 'Unassigned'}
                    {o.employee_code ? ` · ${o.employee_code}` : ''}{o.designation ? ` · ${o.designation}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u?.mobile_number_normalized}{u?.must_change_password ? ' · has not changed the initial password yet' : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={u?.account_status ?? 'pending'} />
                  <AccountStatusActions userId={o.user_id} status={u?.account_status ?? 'pending'} holderName={name} />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!error && operators.length === 0 && <p className="text-sm text-muted-foreground">No centre operators in your jurisdiction yet.</p>}
      </div>
    </main>
  );
}
