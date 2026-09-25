import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/lib/auth/session';
import { one, rows } from '@/lib/supabase/helpers';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { DocumentUploader } from '@/components/farmer/documents/document-uploader';
import { ViewDocumentButton } from '@/components/farmer/documents/view-document-button';
import { formatDateTime } from '@/lib/utils';
import type { FarmerDocumentRow } from '@/types/rows';

export default async function DocumentsPage() {
  const session = await requirePageUser('farmer');
  const supabase = createClient();

  const [{ data: profileData }, { data: docData }] = await Promise.all([
    supabase.from('farmer_profiles').select('user_id').eq('user_id', session.id).maybeSingle(),
    supabase
      .from('farmer_documents')
      .select('id, kind, file_name, mime_type, file_size_bytes, status, rejection_reason, uploaded_at')
      .eq('farmer_id_user', session.id)
      .order('uploaded_at', { ascending: false }),
  ]);
  const hasProfile = !!one<{ user_id: string }>(profileData);
  const docs = rows<FarmerDocumentRow>(docData);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Documents</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Upload a document</CardTitle>
          <CardDescription>
            Documents are stored privately and only shown to the officer who verifies your application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasProfile ? (
            <DocumentUploader userId={session.id} />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Submit your registration first, then you can upload documents.</p>
              <Button asChild variant="outline" className="w-fit"><a href="/farmer/registration">Go to registration</a></Button>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-semibold">My documents</h2>
        {docs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {docs.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.kind.replace(/_/g, ' ')} · {formatDateTime(d.uploaded_at)}
                    </p>
                    {d.rejection_reason && <p className="mt-1 text-sm text-destructive">{d.rejection_reason}</p>}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <StatusBadge status={d.status} />
                    <ViewDocumentButton documentId={d.id} as="farmer" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
