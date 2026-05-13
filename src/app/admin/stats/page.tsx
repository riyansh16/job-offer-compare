import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getAdminEmail } from '@/lib/admin';

/**
 * Private admin stats page. Returns 404 to anyone whose email isn't in
 * ADMIN_EMAIL — the page may as well not exist for non-admins.
 *
 * Metrics today:
 *  - New signups (today / 7d / all-time): from User.createdAt
 *  - Distinct users active today: from User.lastSignInAt (bumped by the
 *    events.signIn hook in src/lib/auth.ts)
 *  - Comparisons created (today / 7d / all-time): from Comparison.createdAt
 *
 * Caveat: lastSignInAt only stores the LATEST login per user, so "users active
 * in last 24h" is exact (each unique user counted once) but a single user
 * logging in 5 times still shows as 1 active. Add a UsageEvent table if we
 * ever need session-level counts.
 */
export default async function AdminStatsPage() {
  // Defence in depth: even if someone discovers the URL, gate at the page.
  const adminEmail = await getAdminEmail();
  if (!adminEmail) notFound();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    signupsToday,
    signups7d,
    activeToday,
    active7d,
    totalComparisons,
    comparisonsToday,
    comparisons7d,
    topActive,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { lastSignInAt: { gte: startOfToday } } }),
    prisma.user.count({ where: { lastSignInAt: { gte: sevenDaysAgo } } }),
    prisma.comparison.count(),
    prisma.comparison.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.comparison.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.findMany({
      orderBy: [{ signInCount: 'desc' }, { lastSignInAt: 'desc' }],
      take: 10,
      select: { email: true, name: true, signInCount: true, lastSignInAt: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin · Usage stats</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          Signed in as {adminEmail}. Refresh the page to update.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Card title="Today">
          <Stat label="New signups" value={signupsToday} />
          <Stat label="Distinct users signed in" value={activeToday} />
          <Stat label="Comparisons created" value={comparisonsToday} />
        </Card>
        <Card title="Last 7 days">
          <Stat label="New signups" value={signups7d} />
          <Stat label="Distinct users signed in" value={active7d} />
          <Stat label="Comparisons created" value={comparisons7d} />
        </Card>
        <Card title="All-time">
          <Stat label="Total users" value={totalUsers} />
          <Stat label="Total comparisons" value={totalComparisons} />
        </Card>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Top 10 most-active users</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[rgb(var(--muted-foreground))]">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3 text-right">Sign-ins</th>
                <th className="py-2 pr-3">Last seen</th>
                <th className="py-2 pr-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {topActive.map((u) => (
                <tr key={u.email} className="border-t">
                  <td className="py-2 pr-3">{u.name ?? u.email}</td>
                  <td className="py-2 pr-3 text-right font-mono">{u.signInCount}</td>
                  <td className="py-2 pr-3 text-[rgb(var(--muted-foreground))]">
                    {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 pr-3 text-[rgb(var(--muted-foreground))]">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {topActive.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-[rgb(var(--muted-foreground))]">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[rgb(var(--muted-foreground))]">
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm">{label}</span>
      <span className="font-mono text-lg font-semibold">{value}</span>
    </div>
  );
}
