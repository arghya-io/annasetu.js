'use client';

import { useRouter, usePathname } from 'next/navigation';
import { logOut } from '@/services/auth/auth-service';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/shared/notification-bell';

export interface TopBarNavItem {
  href: string;
  label: string;
}

export function GlassTopBar({
  roleLabel,
  userName,
  navItems,
}: {
  roleLabel: string;
  userName: string;
  navItems: TopBarNavItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    await logOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="glass sticky top-0 z-30 mx-3 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 sm:mx-6 sm:mt-4 sm:flex-nowrap">
      <div className="order-1 flex items-center gap-3 min-w-0">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-sm font-semibold text-primary-foreground">
          A
        </span>
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold leading-tight">AnnaSetu</p>
          <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
        </div>
      </div>

      <div className="order-2 flex flex-shrink-0 items-center gap-2 sm:order-3">
        <NotificationBell />
        <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
        <button
          onClick={handleSignOut}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-[transform,background-color,color] duration-200 hover:-translate-y-0.5 hover:bg-secondary hover:text-foreground active:scale-95"
        >
          Sign out
        </button>
      </div>

      {/* Full-width row on narrow screens so nav links always have room to
          show instead of being squeezed into whatever's left over between the
          brand block and the icons block (which could be ~0px on a phone). */}
      <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-2 sm:w-auto sm:flex-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-[transform,background-color,color] duration-200',
                active ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:-translate-y-0.5 hover:bg-secondary hover:text-foreground',
              )}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    </header>
  );
}
