import { AmbientBackground } from '@/components/shared/ambient-background';
import { GlassTopBar } from '@/components/shared/glass-topbar';
import { NAV_BY_ROLE, ROLE_LABEL } from '@/lib/navigation';
import type { AppRole } from '@/types/database';

export function AppShell({
  role,
  userName,
  roleLabel,
  children,
}: {
  role: AppRole;
  userName: string;
  roleLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-enter min-h-screen">
      <AmbientBackground />
      <GlassTopBar roleLabel={roleLabel ?? ROLE_LABEL[role]} userName={userName} navItems={NAV_BY_ROLE[role]} />
      {children}
    </div>
  );
}
