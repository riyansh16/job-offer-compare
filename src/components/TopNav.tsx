import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { NavLinks, type NavItem } from './NavLinks';
import { ThemeToggle } from './ThemeToggle';

export async function TopNav() {
  const session = await auth();
  const user = session?.user;
  const isAdmin = isAdminEmail(user?.email);

  const navItems: NavItem[] = user
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/current', label: 'Current role' },
        { href: '/companies', label: 'Companies' },
        ...(isAdmin ? [{ href: '/admin/stats', label: 'Admin' }] : []),
      ]
    : [];

  return (
    <nav className="sticky top-0 z-30 border-b bg-[rgb(var(--card))]/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link href={user ? '/dashboard' : '/'} className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-6 w-6 rounded bg-[rgb(var(--primary))]" />
          <span className="hidden sm:inline">Job Offer Compare</span>
          <span className="sm:hidden">JOC</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <NavLinks items={navItems} />
              <span className="hidden text-[rgb(var(--muted-foreground))] lg:inline">
                {user.email}
              </span>
              <ThemeToggle />
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
              <ThemeToggle />
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
