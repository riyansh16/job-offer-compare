'use client';

import { useState, useTransition } from 'react';
import { signInWithCredentials, signInWithGoogle } from '@/lib/auth-actions';

export function SignInForm({ googleEnabled, callbackUrl }: { googleEnabled: boolean; callbackUrl?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        action={(formData) =>
          startTransition(async () => {
            try {
              setError(null);
              if (callbackUrl) formData.set('callbackUrl', callbackUrl);
              await signInWithCredentials(formData);
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Sign-in failed';
              if (msg.includes('NEXT_REDIRECT')) return;
              setError(msg);
            }
          })
        }
        className="space-y-3"
      >
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
        </div>
        {error && <p className="text-sm text-[rgb(var(--danger))]">{error}</p>}
        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
            <span className="flex-1 border-t" />
            or
            <span className="flex-1 border-t" />
          </div>
          <form action={signInWithGoogle}>
            <button type="submit" className="btn-outline w-full">
              Continue with Google
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          try {
            setError(null);
            const { signupAction } = await import('@/lib/auth-actions');
            const res = await signupAction(formData);
            if (res && 'error' in res && res.error) setError(res.error);
          } catch (e) {
            if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) return;
            setError(e instanceof Error ? e.message : 'Sign-up failed');
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
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password (min 8 chars)</label>
        <input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </div>
      {error && <p className="text-sm text-[rgb(var(--danger))]">{error}</p>}
      <button type="submit" disabled={isPending} className="btn-primary w-full">
        {isPending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
