import Link from 'next/link';
import { SignUpForm, GoogleSignInButton } from '@/components/AuthForms';

export default function SignUpPage() {
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  const openSignup = process.env.OPEN_SIGNUP === 'true';

  // When email/password signup is disabled (i.e. prod), show only the Google button.
  if (!openSignup) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="card space-y-4">
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="text-sm text-[rgb(var(--muted-foreground))]">
            Sign-up is via Google only. Use your Google account to get started — we&apos;ll
            create your profile automatically.
          </p>
          {googleEnabled ? (
            <GoogleSignInButton />
          ) : (
            <p className="text-sm text-[rgb(var(--danger))]">
              Google sign-in isn&apos;t configured. Please contact the admin.
            </p>
          )}
          <p className="text-center text-sm text-[rgb(var(--muted-foreground))]">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-[rgb(var(--primary))] underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Create your account</h1>
        {googleEnabled && (
          <>
            <GoogleSignInButton />
            <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
              <span className="flex-1 border-t" />
              or
              <span className="flex-1 border-t" />
            </div>
          </>
        )}
        <SignUpForm />
        <p className="text-center text-sm text-[rgb(var(--muted-foreground))]">
          Already have an account?{' '}
          <Link href="/auth/signin" className="text-[rgb(var(--primary))] underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
