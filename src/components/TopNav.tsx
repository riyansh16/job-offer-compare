import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { NavLinks, type NavItem } from './NavLinks';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';

export async function TopNav() {
  const session = await auth();
  const user = session?.user;
  const isAdmin = isAdminEmail(user?.email);

  const navItems: NavItem[] = user
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/current', label: 'Current role' },
        { href: '/offers', label: 'Offers' },
        { href: '/comparisons', label: 'Comparisons' },
        { href: '/companies', label: 'Companies' },
        ...(isAdmin ? [{ href: '/admin/stats', label: 'Admin' }] : []),
      ]
    : [];

  return (
    <nav className="sticky top-0 z-30 border-b bg-[rgb(var(--card))]/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold" aria-label="OfferLens home">
          <Logo className="h-6 w-6 text-[rgb(var(--primary))]" />
          <span>OfferLens</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <NavLinks items={navItems} />
              <UserBadge name={user.name ?? null} email={user.email ?? null} image={user.image ?? null} />
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
              <Link href="/companies" className="btn-ghost hidden sm:inline-flex">
                Companies
              </Link>
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

/**
 * Shows the user's avatar (Google profile picture if available, otherwise a
 * coloured circle with their initial). Display name shown next to it on `lg+`
 * only (falls back to email when the account has no name); the full email is
 * available on hover via the title attribute.
 * Plain `<img>` keeps `next.config.mjs` simpler — no remotePatterns needed
 * for a 28px image hosted on Google's CDN.
 */
function UserBadge({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string | null;
  image: string | null;
}) {
  const displayName = name?.trim() || email?.trim() || 'Account';
  const initial = (displayName[0] ?? '?').toUpperCase();
  return (
    <span className="flex items-center gap-2" title={email ?? displayName}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="h-7 w-7 rounded-full border border-[rgb(var(--border))]"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--primary))] text-xs font-semibold text-[rgb(var(--primary-foreground))]"
        >
          {initial}
        </span>
      )}
      <span className="sr-only">Signed in as {displayName}</span>
      <span className="hidden text-[rgb(var(--muted-foreground))] lg:inline">{displayName}</span>
    </span>
  );
}
