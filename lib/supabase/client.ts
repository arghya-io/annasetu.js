'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Uses the anon key only — every read/write
 * made through this client is subject to RLS as the signed-in user. Never
 * import lib/supabase/admin.ts from a "use client" file.
 *
 * The client is intentionally untyped; narrow results with rows()/one() from
 * lib/supabase/helpers.ts (see types/database.ts for why).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
