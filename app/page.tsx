import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const DASHBOARD_FOR_ROLE: Record<string, string> = {
  farmer: '/farmer/dashboard',
  government_admin: '/gov-admin/dashboard',
  centre_operator: '/operator/dashboard',
  csc_operator: '/csc/dashboard',
};

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
  redirect(DASHBOARD_FOR_ROLE[data?.role ?? ''] ?? '/login');
}
