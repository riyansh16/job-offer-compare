'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { signInWithCredentials, signInWithGoogle } from '@/lib/auth-actions';
import { signInSchema, signUpSchema, validateFormData } from '@/lib/forms/validation';
import { Spinner } from './ui/Spinner';

/**
 * Standalone "Continue with Google" button. Used on both sign-in and sign-up
 * pages so the Google-first CTA is consistent.
 */
export function GoogleSignInButton({ label = 'Continue with Google' }: { label?: string }) {
  return (
    <form action={signInWithGoogle}>
      <button type="submit" className="btn-outline w-full">
        {label}
      </button>
    </form>
  );
}

export function SignInForm({
  googleEnabled,
  credentialsEnabled,
  callbackUrl,
}: {
  googleEnabled: boolean;
  credentialsEnabled: boolean;
  callbackUrl?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function clearFieldError(name: string) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Google is the primary CTA. Renders above email/password when available. */}
      {googleEnabled && <GoogleSignInButton />}

      {googleEnabled && credentialsEnabled && (
        <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
          <span className="flex-1 border-t" />
          or
          <span className="flex-1 border-t" />
        </div>
      )}

      {credentialsEnabled && (
        <form
          noValidate
          action={(formData) =>
            startTransition(async () => {
              setError(null);
              const validation = validateFormData(signInSchema, formData);
              if (!validation.ok) {
                setFieldErrors(validation.errors);
                return;
              }
              setFieldErrors({});
              try {
                if (callbackUrl) formData.set('callbackUrl', callbackUrl);
                await signInWithCredentials(formData);
              } catch (e) {
                const msg = e instanceof Error ? e.message : 'Sign-in failed';
                if (msg.includes('NEXT_REDIRECT')) return;
                setError(msg);
                toast.error(msg);
              }
            })
          }
          className="space-y-3"
        >
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className={`input ${fieldErrors.email ? 'input-error' : ''}`}
              autoComplete="email"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'signin-email-error' : undefined}
              onChange={() => clearFieldError('email')}
            />
            {fieldErrors.email && (
              <p id="signin-email-error" className="field-error" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className={`input ${fieldErrors.password ? 'input-error' : ''}`}
              autoComplete="current-password"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? 'signin-password-error' : undefined}
              onChange={() => clearFieldError('password')}
            />
            {fieldErrors.password && (
              <p id="signin-password-error" className="field-error" role="alert">
                {fieldErrors.password}
              </p>
            )}
          </div>
          {error && (
            <p className="text-sm text-[rgb(var(--danger))]" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={isPending} className="btn-primary w-full">
            {isPending && <Spinner size={14} label="Signing in" />}
            {isPending ? 'Signing in…' : 'Sign in with email'}
          </button>
        </form>
      )}

      {!googleEnabled && !credentialsEnabled && (
        <p className="text-sm text-[rgb(var(--danger))]">
          No sign-in method is configured. Please contact the admin.
        </p>
      )}
    </div>
  );
}

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function clearFieldError(name: string) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  return (
    <form
      noValidate
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          const validation = validateFormData(signUpSchema, formData);
          if (!validation.ok) {
            setFieldErrors(validation.errors);
            return;
          }
          setFieldErrors({});
          try {
            const { signupAction } = await import('@/lib/auth-actions');
            const res = await signupAction(formData);
            if (res && 'error' in res && res.error) {
              setError(res.error);
              toast.error(res.error);
            } else {
              toast.success('Account created');
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) return;
            const msg = e instanceof Error ? e.message : 'Sign-up failed';
            setError(msg);
            toast.error(msg);
          }
        })
      }
      className="space-y-3"
    >
      <div>
        <label htmlFor="name" className="label">Name</label>
        <input id="name" name="name" className="input" autoComplete="name" />
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={`input ${fieldErrors.email ? 'input-error' : ''}`}
          autoComplete="email"
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
          onChange={() => clearFieldError('email')}
        />
        {fieldErrors.email && (
          <p id="signup-email-error" className="field-error" role="alert">
            {fieldErrors.email}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="label">Password (min 8 chars)</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className={`input ${fieldErrors.password ? 'input-error' : ''}`}
          autoComplete="new-password"
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'signup-password-error' : undefined}
          onChange={() => clearFieldError('password')}
        />
        {fieldErrors.password && (
          <p id="signup-password-error" className="field-error" role="alert">
            {fieldErrors.password}
          </p>
        )}
      </div>
      {error && (
        <p className="text-sm text-[rgb(var(--danger))]" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending && <Spinner size={14} label="Creating account" />}
        {isPending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
