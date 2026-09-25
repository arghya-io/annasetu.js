export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="font-heading text-2xl">You don&apos;t have access to this page</h1>
      <p className="text-sm text-muted-foreground">
        This section is restricted to a different role. If you believe this is a mistake,
        contact your centre administrator.
      </p>
      <a href="/" className="mt-4 text-sm font-medium text-primary underline underline-offset-4">
        Go back
      </a>
    </main>
  );
}
