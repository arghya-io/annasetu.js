import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { rows } from '@/lib/supabase/helpers';
import { formatDateTime } from '@/lib/utils';
import type { AuditLogRow } from '@/types/rows';
import { QueryError } from '@/components/shared/query-error';
import { Card, CardContent } from '@/components/ui/card';

const ACTION_LABELS: Record<string, string> = {
  'account.created': 'Account created',
  'account.suspended': 'Account suspended',
  'account.activated': 'Account activated',
  'account.password_regenerated': 'Password regenerated',
  'account.first_login_password_changed': 'First-login password changed',
  'farmer.review': 'Farmer verification reviewed',
  'document.review': 'Document reviewed',
  'centre.created': 'Centre created',
  'crop_change_request.review': 'Crop change request reviewed',
  'centre.updated': 'Centre updated',
  'farmer.submitted': 'Farmer application submitted',
};

export default async function AuditLogsPage() {
  await requirePageUser('government_admin');
  const supabase = createClient();

  // RLS: entries this admin performed, plus entries inside their jurisdiction.
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, created_at, after_data')
    .order('created_at', { ascending: false })
    .limit(100);
  const logs = rows<AuditLogRow>(data);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Audit logs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every sensitive administrative action, most recent first. Passwords are never recorded here.
      </p>

      {error && <QueryError message={error.message} />}

      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="divide-y divide-border/70">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{ACTION_LABELS[log.action] ?? log.action}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {log.entity_type} · {log.entity_id}
                  </p>
                </div>
                <p className="flex-shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(log.created_at)}
                </p>
              </div>
            ))}
            {!error && logs.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">No audit entries yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
