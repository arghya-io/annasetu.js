import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const LINKS = [
  { href: '/gov-admin/account-provisioning/farmer', title: 'Create Farmer Account', desc: 'Register a farmer directly and issue credentials.' },
  { href: '/gov-admin/account-provisioning/csc', title: 'Add CSC Operator', desc: 'Provision a CSC operator account for your jurisdiction.' },
  { href: '/gov-admin/account-provisioning/centre', title: 'Add Procurement Centre', desc: 'Create a new procurement centre in your jurisdiction.' },
  { href: '/gov-admin/account-provisioning/centre-operator', title: 'Create Centre Operator', desc: 'Provision an operator account assigned to a centre.' },
];

export default async function AccountProvisioningHubPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold">Account provisioning</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Accounts created here are scoped to your administrative jurisdiction and issued a
        one-time initial password for printing.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle className="text-lg">{l.title}</CardTitle>
                <CardDescription>{l.desc}</CardDescription>
              </CardHeader>
            </Card>
          </a>
        ))}
      </div>
    </main>
  );
}
