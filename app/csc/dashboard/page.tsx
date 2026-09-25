import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';

/**
 * Assisted-service workflow: one primary action, one number that matters.
 * CSC operators help farmers; government verification is always the final decision.
 */
export default async function CscDashboardPage() {
  const session = await requirePageUser('csc_operator');
  const supabase = createClient();

  // RLS limits help_requests to this operator's district and their own claimed requests.
  const [{ count: openRequests }, { count: mine }] = await Promise.all([
    supabase.from('help_requests').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('help_requests').select('*', { count: 'exact', head: true }).eq('status', 'in_progress').eq('handled_by', session.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">How can you help today?</h1>
      <p className="mt-2 text-muted-foreground">
        Assist farmers with Farmer ID, registration, and document guidance. Government
        verification is always the final decision — CSC never approves eligibility directly.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button asChild size="lg" className="h-auto justify-start px-5 py-4 text-left">
          <a href="/csc/help-requests">
            <span className="flex flex-col items-start">
              <span className="font-heading text-base">Help requests</span>
              <span className="text-sm font-normal text-primary-foreground/80">
                {(openRequests as number | null) ?? 0} waiting · {(mine as number | null) ?? 0} yours in progress
              </span>
            </span>
          </a>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-auto justify-start px-5 py-4 text-left">
          <a href="/csc/csc-locator">
            <span className="flex flex-col items-start">
              <span className="font-heading text-base">Find a CSC centre</span>
              <span className="text-sm font-normal text-muted-foreground">Quick locator for farmers nearby</span>
            </span>
          </a>
        </Button>
      </div>
    </main>
  );
}
