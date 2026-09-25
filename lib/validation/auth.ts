import { z } from 'zod';
import { PASSWORD_POLICY_PATTERN, PASSWORD_POLICY_DESCRIPTION } from '@/lib/constants';

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  // No length rule on login: never lock out an existing password because the
  // policy tightened later. The policy applies where passwords are CREATED.
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Self-signup is FARMER-ONLY. There is deliberately no `role` field: the role
 * is fixed server-side. (A client-supplied role used to let anyone register as
 * a CSC operator and read farmer PII.) CSC operators, centre operators and
 * government admins are provisioned by a government administrator.
 */
export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name'),
    email: z.string().email('Enter a valid email address'),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
    password: z.string().regex(PASSWORD_POLICY_PATTERN, PASSWORD_POLICY_DESCRIPTION),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type SignupInput = z.infer<typeof signupSchema>;
