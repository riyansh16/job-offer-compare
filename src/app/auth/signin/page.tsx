import Link from 'next/link';
import { SignInForm } from '@/components/AuthForms';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="card space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <SignInForm googleEnabled={googleEnabled} callbackUrl={sp.callbackUrl} />
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
