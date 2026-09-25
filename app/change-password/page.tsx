import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { one } from '@/lib/supabase/helpers';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { AmbientBackground } from '@/components/shared/ambient-background';

export default async function ChangePasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('users')
    .select('must_change_password, role')
    .eq('id', user.id)
    .maybeSingle();
  const profile = one<{ must_change_password: boolean; role: string }>(data);

  // Already changed — nothing to do here (avoids a dead-end if someone
  // bookmarks this page or the back button lands them here after success).
  if (profile && !profile.must_change_password) {
    const dashboardByRole: Record<string, string> = {
      farmer: '/farmer/dashboard',
      government_admin: '/gov-admin/dashboard',
      centre_operator: '/operator/dashboard',
      csc_operator: '/csc/dashboard',
    };
    redirect(dashboardByRole[profile.role] ?? '/');
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <AmbientBackground />
      <ChangePasswordForm />
    </main>
  );
}
