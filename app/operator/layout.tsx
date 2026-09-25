import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one } from '@/lib/supabase/helpers';
import { AppShell } from '@/components/shared/app-shell';

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageUser('centre_operator');
  const supabase = createClient();
  const [{ data: profile }, { data: assignment }] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', session.id).maybeSingle(),
    supabase.from('centre_operators').select('procurement_centres(name)').eq('user_id', session.id).maybeSingle(),
  ]);
  const centre = one<{ procurement_centres: { name: string } | { name: string }[] | null }>(assignment)?.procurement_centres;
  const centreName = Array.isArray(centre) ? centre[0]?.name : centre?.name;

  return (
    <AppShell
      role="centre_operator"
      roleLabel={centreName ? `Operator · ${centreName}` : 'Centre Operator'}
      userName={one<{ full_name: string }>(profile)?.full_name ?? ''}
    >
      {children}
    </AppShell>
  );
}
