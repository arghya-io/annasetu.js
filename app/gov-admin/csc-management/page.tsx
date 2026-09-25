import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { first, rows } from '@/lib/supabase/helpers';
import { AccountStatusActions } from '@/components/admin/account-status-actions';
import { StatusBadge } from '@/components/shared/status-badge';
import { QueryError } from '@/components/shared/query-error';
import { Card, CardContent } from '@/components/ui/card';

interface CscRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  centre_name: string | null;
  csc_id: string | null;
  designation: string | null;
  users:
    | { account_status: string; mobile_country_code: string | null; mobile_number_normalized: string | null }
    | { account_status: string; mobile_country_code: string | null; mobile_number_normalized: string | null }[]
    | null;
}

export default async function CscManagementPage() {
  await requirePageUser('government_admin');
  const supabase = createClient();

  // RLS scopes csc_operators to this admin's jurisdiction.
  const { data, error } = await supabase
    .from('csc_operators')
    .select('user_id, first_name, last_name, centre_name, csc_id, designation, users:user_id (account_status, mobile_country_code, mobile_number_normalized)')
    .order('user_id');
  const cscRows = rows<CscRow>(data);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-semibold">CSC management</h1>
        <a href="/gov-admin/account-provisioning/csc" className="text-sm font-medium text-primary underline underline-offset-4">
          Add CSC operator →
        </a>
      </div>

      {error && <QueryError message={error.message} />}

      <div className="mt-6 flex flex-col gap-2">
        {cscRows.map((c) => {
          const u = first(c.users);
          const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'CSC operator';
          return (
            <Card key={c.user_id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{name}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.centre_name}{c.csc_id ? ` · ${c.csc_id}` : ''}{c.designation ? ` · ${c.designation}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">{u?.mobile_country_code} {u?.mobile_number_normalized}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={u?.account_status ?? 'pending'} />
                  <AccountStatusActions userId={c.user_id} status={u?.account_status ?? 'pending'} holderName={name} />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!error && cscRows.length === 0 && <p className="text-sm text-muted-foreground">No CSC operators in your jurisdiction yet.</p>}
      </div>
    </main>
  );
}
