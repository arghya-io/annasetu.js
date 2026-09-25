import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route gate + session refresh.
 *
 * This is a UX convenience (send people to the right place before a page
 * renders) and the place Supabase auth cookies are refreshed. It is NOT the
 * authorization boundary: RLS and the SECURITY DEFINER RPCs in
 * supabase/migrations/*.sql enforce access — including account state
 * (suspended / must-change-password), which the database checks on every
 * query and RPC independently of this file.
 */
const ROLE_FOR_SEGMENT: Record<string, string> = {
  farmer: 'farmer',
  operator: 'centre_operator',
  'gov-admin': 'government_admin',
  csc: 'csc_operator',
};

/** Signed-in-only pages that are not tied to one role. */
const ANY_ROLE_PATHS = ['/notifications', '/change-password'];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  // Always resolve the user: this is what refreshes an expiring session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const segment = path.split('/')[1] ?? '';
  const requiredRole = ROLE_FOR_SEGMENT[segment];
  const isAnyRolePath = ANY_ROLE_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  if (!requiredRole && !isAnyRolePath) {
    return response;
  }

  // Redirects must carry the (possibly refreshed) auth cookies along.
  const redirectTo = (target: string, params?: Record<string, string>) => {
    const url = new URL(target, request.url);
    Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user) {
    return redirectTo('/login', { redirectTo: path });
  }

  const { data } = await supabase
    .from('users')
    .select('role, account_status, must_change_password')
    .eq('id', user.id)
    .maybeSingle();
  const profile = data as { role: string; account_status: string; must_change_password: boolean } | null;

  if (!profile) {
    return redirectTo('/unauthorized');
  }

  // Account lifecycle gates (spec §13, §15). Non-active is blocked outright;
  // a must-change-password account may only reach /change-password.
  if (profile.account_status !== 'active') {
    return redirectTo('/account-inactive', { status: profile.account_status });
  }

  if (profile.must_change_password) {
    if (path === '/change-password') return response;
    return redirectTo('/change-password');
  }

  if (requiredRole && profile.role !== requiredRole) {
    return redirectTo('/unauthorized');
  }

  return response;
}

export const config = {
  matcher: [
    '/farmer/:path*',
    '/operator/:path*',
    '/gov-admin/:path*',
    '/csc/:path*',
    '/notifications/:path*',
    '/change-password',
  ],
};
