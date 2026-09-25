import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Still uses the ANON key — requests run as the caller's
 * session and are subject to RLS. This is the client to use for every read
 * or write that should be scoped to "the current signed-in user", which is
 * almost everything. Reach for admin.ts only for the narrow set of
 * operations that must legitimately bypass RLS (see that file's docstring).
 *
 * The client is intentionally untyped (see types/database.ts): typing it
 * with a `Database` generic made every query collapse to `never` whenever
 * the hand-written schema type drifted from supabase-js/postgrest-js.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component render — the middleware handles
            // session refresh in that case, so this can be safely ignored.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // See note above.
          }
        },
      },
    },
  );
}
