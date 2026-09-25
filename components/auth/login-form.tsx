'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import { loginSchema, type LoginInput } from '@/lib/validation/auth';
import { mobileLoginSchema, type MobileLoginInput } from '@/lib/validation/admin';
import { logIn, logInWithMobile } from '@/services/auth/auth-service';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AmbientBackground } from '@/components/shared/ambient-background';

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'mobile' | 'email'>('mobile');
  const [serverError, setServerError] = useState<string | null>(null);

  const mobileForm = useForm<MobileLoginInput>({
    resolver: resolverFor<MobileLoginInput>(mobileLoginSchema),
    defaultValues: { countryCode: DEFAULT_COUNTRY_CODE },
  });
  const emailForm = useForm<LoginInput>({ resolver: resolverFor<LoginInput>(loginSchema) });

  function goToDestination() {
    router.push(redirectTo);
    router.refresh();
  }

  async function onMobileSubmit(values: MobileLoginInput) {
    setServerError(null);
    const result = await logInWithMobile(values);
    if (!result.ok) return setServerError(result.error);
    goToDestination();
  }

  async function onEmailSubmit(values: LoginInput) {
    setServerError(null);
    const result = await logIn(values);
    if (!result.ok) return setServerError(result.error);
    goToDestination();
  }

  return (
    <main className="page-enter relative flex min-h-screen items-center justify-center px-4 py-8 sm:py-10">
      <AmbientBackground />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to AnnaSetu</CardTitle>
          <CardDescription>Book your procurement slot and track your queue.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex rounded-lg border border-border/70 bg-background/30 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode('mobile')}
              className={`flex-1 rounded-md px-2 py-1.5 transition-[transform,background-color,color] duration-200 active:scale-[0.98] ${mode === 'mobile' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary'}`}
            >
              Mobile number
            </button>
            <button
              type="button"
              onClick={() => setMode('email')}
              className={`flex-1 rounded-md px-2 py-1.5 transition-[transform,background-color,color] duration-200 active:scale-[0.98] ${mode === 'email' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary'}`}
            >
              Email
            </button>
          </div>

          {mode === 'mobile' ? (
            <form onSubmit={mobileForm.handleSubmit(onMobileSubmit)} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mobileNumber">Mobile number</Label>
                <div className="flex gap-2">
                  <select
                    className="h-10 w-28 rounded-md border border-input bg-card px-2 text-sm"
                    {...mobileForm.register('countryCode')}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} {c.country}</option>
                    ))}
                  </select>
                  <Input
                    id="mobileNumber"
                    type="tel"
                    autoComplete="tel-national"
                    placeholder="9876543210"
                    className="flex-1"
                    {...mobileForm.register('mobileNumber')}
                  />
                </div>
                {mobileForm.formState.errors.mobileNumber && (
                  <p className="text-sm text-destructive">{mobileForm.formState.errors.mobileNumber.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mobilePassword">Password</Label>
                <Input id="mobilePassword" type="password" autoComplete="current-password" {...mobileForm.register('password')} />
                {mobileForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{mobileForm.formState.errors.password.message}</p>
                )}
              </div>

              {serverError && <p className="text-sm text-destructive">{serverError}</p>}

              <Button type="submit" disabled={mobileForm.formState.isSubmitting} className="mt-2">
                {mobileForm.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          ) : (
            <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" {...emailForm.register('email')} />
                {emailForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{emailForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" {...emailForm.register('password')} />
                {emailForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{emailForm.formState.errors.password.message}</p>
                )}
              </div>

              {serverError && <p className="text-sm text-destructive">{serverError}</p>}

              <Button type="submit" disabled={emailForm.formState.isSubmitting} className="mt-2">
                {emailForm.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            New to AnnaSetu?{' '}
            <a href="/register" className="text-primary underline underline-offset-4">
              Register as a farmer
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
