import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one } from '@/lib/supabase/helpers';
import { AppShell } from '@/components/shared/app-shell';

export default async function GovAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageUser('government_admin');
  const supabase = createClient();
  const [{ data: profile }, { data: admin }] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', session.id).maybeSingle(),
    supabase.from('government_admins').select('admin_role').eq('user_id', session.id).maybeSingle(),
  ]);
  const adminRole = one<{ admin_role: string }>(admin)?.admin_role;

  return (
    <AppShell
      role="government_admin"
      roleLabel={adminRole ? `${adminRole.toUpperCase()} · Government Admin` : 'Government Admin'}
      userName={one<{ full_name: string }>(profile)?.full_name ?? ''}
    >
      {children}
    </AppShell>
  );
}
