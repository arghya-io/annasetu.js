'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import { signupSchema, type SignupInput } from '@/lib/validation/auth';
import { signUp } from '@/services/auth/auth-service';
import { PASSWORD_POLICY_DESCRIPTION } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { AmbientBackground } from '@/components/shared/ambient-background';

/**
 * This page creates an ACCOUNT ONLY — "is this person the owner of this
 * AnnaSetu account?" Farmer eligibility ("is this person an eligible
 * farmer/cultivator?") is established separately by the 4-step registration
 * wizard + government verification (spec §3–4), reached right after this.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: resolverFor<SignupInput>(signupSchema),
  });

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    const result = await signUp(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) {
      setConfirmationSent(true);
      return;
    }
    router.push('/farmer/registration');
    router.refresh();
  }

  if (confirmationSent) {
    return (
      <main className="page-enter relative flex min-h-screen items-center justify-center px-4 py-10">
        <AmbientBackground />
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a confirmation link to your email address. Open it, then sign in to
              continue with your farmer registration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/login" className="text-sm font-medium text-primary underline underline-offset-4">
              Go to sign in
            </a>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="page-enter relative flex min-h-screen items-center justify-center px-4 py-10">
      <AmbientBackground />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your AnnaSetu account</CardTitle>
          <CardDescription>
            This creates your login only. You&apos;ll complete farmer registration and
            government verification next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" autoComplete="name" {...register('fullName')} />
              {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Mobile number</Label>
              <Input id="phone" type="tel" autoComplete="tel" {...register('phone')} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
              <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_DESCRIPTION}</p>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            {serverError && <p className="text-sm text-destructive">{serverError}</p>}

            <Button type="submit" disabled={isSubmitting} className="mt-2">
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <a href="/login" className="text-primary underline underline-offset-4">
                Sign in
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
