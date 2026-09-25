import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one } from '@/lib/supabase/helpers';
import { AppShell } from '@/components/shared/app-shell';

export default async function FarmerLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageUser('farmer');
  const supabase = createClient();
  const { data } = await supabase.from('users').select('full_name').eq('id', session.id).maybeSingle();

  return (
    <AppShell role="farmer" userName={one<{ full_name: string }>(data)?.full_name ?? ''}>
      {children}
    </AppShell>
  );
}
