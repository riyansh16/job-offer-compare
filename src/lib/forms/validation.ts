import { z } from 'zod';

/**
 * Field-level validation schemas. These mirror the server-side validation in
 * `src/lib/actions.ts` but are run client-side so users see feedback before
 * submission. Keep them aligned — divergence here only causes friendlier
 * client errors, never bypassed server checks.
 */

const positiveNumber = z.coerce
  .number({ message: 'Must be a number' })
  .nonnegative('Cannot be negative')
  .finite('Invalid number');

const optionalPositive = z.union([z.literal(''), positiveNumber]).optional();

export const offerSchema = z.object({
  companyId: z.string().min(1, 'Pick a company'),
  title: z.string().trim().min(1, 'Job title is required'),
  location: z.string().trim().min(1, 'Location is required'),
  level: z.string().optional(),
  workMode: z.string().optional(),
  baseSalary: optionalPositive,
  targetBonusPct: z
    .union([z.literal(''), z.coerce.number().min(0, 'Cannot be negative').max(200, 'Likely a typo (over 200%)')])
    .optional(),
  signOnBonus: optionalPositive,
  equityTotal: optionalPositive,
  benefitsValueAnnual: optionalPositive,
  ptoDays: optionalPositive,
  commuteCostMonthly: optionalPositive,
  qualitativeScore: z
    .union([
      z.literal(''),
      z.coerce.number().min(0, '0 minimum').max(100, '100 maximum'),
    ])
    .optional(),
  yearsExperience: z
    .union([z.literal(''), z.coerce.number().min(0, 'Cannot be negative').max(60, 'Likely a typo')])
    .optional(),
});

export type OfferFormValues = z.infer<typeof offerSchema>;

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const signUpSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

/**
 * Validate a FormData against a zod schema; returns either parsed data or a
 * record of fieldName → first error message.
 */
export function validateFormData<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.infer<T> } | { ok: false; errors: Record<string, string> } {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) raw[k] = v;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path[0];
    if (typeof path === 'string' && !errors[path]) {
      errors[path] = issue.message;
    }
  }
  return { ok: false, errors };
}
