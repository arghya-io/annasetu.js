import { LoginForm } from '@/components/auth/login-form';
import { safeRedirectPath } from '@/lib/security/redirect';

// Server component: the redirect target is sanitised HERE (same-origin paths
// only), so a crafted /login?redirectTo=https://evil.example link can never
// bounce a freshly signed-in user off-site. Reading searchParams on the server
// also avoids the client-side useSearchParams() Suspense requirement that
// fails `next build`.
export default function LoginPage({ searchParams }: { searchParams: { redirectTo?: string } }) {
  return <LoginForm redirectTo={safeRedirectPath(searchParams.redirectTo, '/')} />;
}
