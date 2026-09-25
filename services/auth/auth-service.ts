'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { one } from '@/lib/supabase/helpers';
import { loginSchema, signupSchema, type LoginInput, type SignupInput } from '@/lib/validation/auth';
import { mobileLoginSchema, type MobileLoginInput } from '@/lib/validation/admin';
import type { AppRole } from '@/types/database';

export type AuthResult = { ok: true } | { ok: false; error: string };
export type SignUpResult = { ok: true; needsEmailConfirmation: boolean } | { ok: false; error: string };

/**
 * Farmer self-signup. The role is NOT an input — it is always 'farmer'.
 * Government admins, centre operators and CSC operators are provisioned by an
 * existing government admin (services/admin/provisioning-service.ts).
 */
export async function signUp(input: SignupInput): Promise<SignUpResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const { fullName, email, phone, password } = parsed.data;

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Sign up failed' };
  }
  // Supabase returns an obfuscated user with no identities for an email that
  // is already registered.
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, error: 'An account with this email may already exist. Try signing in instead.' };
  }

  // The `users` row cannot be inserted by the client (no insert policy, by
  // design), so the server creates it with the service role for the identity
  // we just created ourselves.
  const admin = createAdminClient();
  const { error: userInsertError } = await admin.from('users').insert({
    id: data.user.id,
    role: 'farmer',
    full_name: fullName,
    email,
    phone,
  });
  if (userInsertError) {
    // Do not leave an orphan auth identity behind.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: 'Could not create your account. Please try again.' };
  }

  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function logIn(input: LoginInput): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: 'Incorrect email or password' };
  }
  return { ok: true };
}

/**
 * Mobile + password login (spec §9) — no OTP in this phase. The mobile
 * number is normalized server-side via normalize_mobile_number() before
 * being handed to Supabase Auth; the client's country-code/number split is
 * never trusted as already-canonical.
 */
export async function logInWithMobile(input: MobileLoginInput): Promise<AuthResult> {
  const parsed = mobileLoginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createClient();

  const { data: normalized, error: normalizeError } = await supabase.rpc('normalize_mobile_number', {
    p_country_code: parsed.data.countryCode,
    p_raw_number: parsed.data.mobileNumber,
  });
  if (normalizeError || typeof normalized !== 'string') {
    return { ok: false, error: 'Enter a valid mobile number for the selected country' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    phone: normalized,
    password: parsed.data.password,
  });
  if (error) {
    return { ok: false, error: 'Incorrect mobile number or password' };
  }
  return { ok: true };
}

export async function logOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

/** Resolves the signed-in user's role for redirect/layout decisions. */
export async function getCurrentUserRole(): Promise<AppRole | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  return one<{ role: AppRole }>(data)?.role ?? null;
}
