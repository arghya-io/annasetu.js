const MESSAGES: Record<string, string> = {
  pending: 'Your account is pending activation. Contact your BDO/SDO office for assistance.',
  suspended: 'Your account has been suspended. Contact your BDO/SDO office to resolve this.',
  disabled: 'Your account has been disabled. Contact your BDO/SDO office for assistance.',
  deactivated: 'Your account is deactivated. Contact your BDO/SDO office for assistance.',
};

export default function AccountInactivePage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams.status ?? 'suspended';
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="font-heading text-2xl">Account not active</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {MESSAGES[status] ?? MESSAGES.suspended}
      </p>
      <a href="/login" className="mt-4 text-sm font-medium text-primary underline underline-offset-4">
        Back to login
      </a>
    </main>
  );
}
