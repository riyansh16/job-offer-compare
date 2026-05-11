import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';

export async function TopNav() {
  const session = await auth();
  const user = session?.user;

  return (
    <nav className="sticky top-0 z-30 border-b bg-[rgb(var(--card))]/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href={user ? '/dashboard' : '/'} className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-6 w-6 rounded bg-[rgb(var(--primary))]" />
          Job Offer Compare
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <Link href="/dashboard" className="btn-ghost">
                Dashboard
              </Link>
              <Link href="/current" className="btn-ghost">
                Current role
              </Link>
              <Link href="/companies" className="btn-ghost">
                Companies
              </Link>
              <span className="hidden text-[rgb(var(--muted-foreground))] md:inline">
                {user.email}
              </span>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button type="submit" className="btn-outline">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/auth/signin" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/auth/signup" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
