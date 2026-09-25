import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Never cache; this must run every time it is invoked.
export const dynamic = 'force-dynamic';

/**
 * Daily close-out (00:00 IST, see vercel.json): bookings for past dates that
 * were never checked in become `no_show`, their queue entries are cleared and
 * the farmers notified. Vercel invokes cron routes with
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused. The RPC
 * behind it (mark_no_shows) is executable by the service role only.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization');
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('mark_no_shows');
  if (error) {
    return NextResponse.json({ error: 'close-day failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, markedNoShow: data });
}
