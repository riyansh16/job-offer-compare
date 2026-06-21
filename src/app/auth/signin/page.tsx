import Link from 'next/link';
import { GoogleSignInButton } from '@/components/AuthForms';

// Must render at request time: googleEnabled reads AUTH_GOOGLE_ID /
// AUTH_GOOGLE_SECRET, which on Azure SWA are runtime Application Settings
// and are NOT present in the GitHub Actions build container. If this page
// is statically prerendered it bakes googleEnabled=false and shows the
// "not configured" error in production. force-dynamic keeps the env read
// at runtime. (This page was implicitly dynamic until the layout stopped
// calling auth() on the server in the client-navbar refactor.)
export const dynamic = 'force-dynamic';

export default function SignInPage() {
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        {googleEnabled ? (
          <GoogleSignInButton />
        ) : (
          <p className="text-sm text-[rgb(var(--danger))]">
            Google sign-in isn&apos;t configured. Please contact the admin.
          </p>
        )}
        <p className="text-center text-sm text-[rgb(var(--muted-foreground))]">
          New here?{' '}
          <Link href="/auth/signup" className="text-[rgb(var(--primary))] underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
