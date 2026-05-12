'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { signIn } from '@/lib/auth';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

export async function signupAction(formData: FormData) {
  // Phase 2.4: email/password signup is dev-only. The form is hidden in prod,
  // but enforce here too so a direct POST can't bypass the UI.
  if (process.env.OPEN_SIGNUP !== 'true') {
    return { error: 'Sign-up is disabled. Please continue with Google.' };
  }
  const data = signupSchema.parse(Object.fromEntries(formData.entries()));
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return { error: 'An account with that email already exists.' };
  }
  const hashed = await bcrypt.hash(data.password, 12);
  await prisma.user.create({
    data: { email: data.email, name: data.name, hashedPassword: hashed },
  });
  await signIn('credentials', {
    email: data.email,
    password: data.password,
    redirectTo: '/dashboard',
  });
  return { ok: true };
}

export async function signInWithCredentials(formData: FormData) {
  await signIn('credentials', {
    email: formData.get('email'),
    password: formData.get('password'),
    redirectTo: '/dashboard',
  });
}

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/dashboard' });
}
