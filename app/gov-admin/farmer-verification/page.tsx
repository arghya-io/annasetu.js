import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { rows } from '@/lib/supabase/helpers';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { QueryError } from '@/components/shared/query-error';
import { formatDateTime } from '@/lib/utils';
import type { FarmerProfileRow } from '@/types/rows';

const FILTERS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: 'pending', label: 'Awaiting review', statuses: ['submitted', 'under_verification'] },
  { key: 'correction', label: 'Correction requested', statuses: ['correction_required'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected'] },
  { key: 'draft', label: 'Not submitted', statuses: ['draft'] },
  { key: 'all', label: 'All', statuses: null },
];

export default async function FarmerVerificationPage({ searchParams }: { searchParams: { status?: string } }) {
  await requirePageUser('government_admin');
  const filter = FILTERS.find((f) => f.key === searchParams.status) ?? FILTERS[0]!;

  const supabase = createClient();
  // RLS limits farmer_profiles to farmers inside this admin's jurisdiction.
  let query = supabase
    .from('farmer_profiles')
    .select('user_id, application_id, first_name, last_name, farmer_category, verification_status, submitted_at')
    .order('submitted_at', { ascending: true, nullsFirst: false })
    .limit(200);
  if (filter.statuses) query = query.in('verification_status', filter.statuses);
  const { data, error } = await query;
  const farmers = rows<FarmerProfileRow>(data);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Farmer verification</h1>
      <p className="mt-1 text-sm text-muted-foreground">Farmers in your jurisdiction, oldest submission first.</p>

      <nav className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={`/gov-admin/farmer-verification?status=${f.key}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              f.key === filter.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-secondary'
            }`}
          >
            {f.label}
          </a>
        ))}
      </nav>

      {error && <QueryError message={error.message} />}

      <div className="mt-6 flex flex-col gap-2">
        {!error && farmers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          farmers.map((f) => (
            <a key={f.user_id} href={`/gov-admin/farmer-verification/${f.user_id}`}>
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{f.first_name} {f.last_name}</p>
                    <p className="text-sm capitalize text-muted-foreground">
                      {f.farmer_category.replace(/_/g, ' ')}
                      {f.application_id ? ` · ${f.application_id}` : ''}
                      {f.submitted_at ? ` · submitted ${formatDateTime(f.submitted_at)}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={f.verification_status} />
                </CardContent>
              </Card>
            </a>
          ))
        )}
      </div>
    </main>
  );
}
