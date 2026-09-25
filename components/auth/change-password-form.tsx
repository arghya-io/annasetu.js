'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { resolverFor } from '@/lib/forms';
import { newPasswordSchema, type NewPasswordInput } from '@/lib/validation/admin';
import { changeInitialPassword } from '@/services/auth/first-login-service';
import { PASSWORD_POLICY_DESCRIPTION } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export function ChangePasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordInput>({ resolver: resolverFor<NewPasswordInput>(newPasswordSchema) });

  async function onSubmit(values: NewPasswordInput) {
    setServerError(null);
    const result = await changeInitialPassword(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <Card className="glass w-full max-w-sm">
      <CardHeader>
        <CardTitle>First login</CardTitle>
        <CardDescription>
          For security, you must change your initial password before continuing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Current / initial password</Label>
            <Input id="currentPassword" type="password" {...register('currentPassword')} />
            {errors.currentPassword && (
              <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input id="newPassword" type="password" {...register('newPassword')} />
            <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_DESCRIPTION}</p>
            {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmNewPassword">Confirm new password</Label>
            <Input id="confirmNewPassword" type="password" {...register('confirmNewPassword')} />
            {errors.confirmNewPassword && (
              <p className="text-sm text-destructive">{errors.confirmNewPassword.message}</p>
            )}
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <Button type="submit" disabled={isSubmitting} className="mt-2">
            {isSubmitting ? 'Setting password…' : 'Set new password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
