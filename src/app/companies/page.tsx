import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function CompaniesIndexPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/signin');
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Companies</h1>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">
          {companies.length} curated companies. Catalog is read-only.
        </p>
      </header>
      {companies.length === 0 ? (
        <div className="card text-center text-sm text-[rgb(var(--muted-foreground))]">No companies yet.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {companies.map((c) => (
            <Link key={c.id} href={`/companies/${c.slug}`} className="card block transition-shadow hover:shadow-md">
              <div className="font-semibold">{c.name}</div>
              <div className="text-xs text-[rgb(var(--muted-foreground))]">
                {[c.industry, c.size, c.hqLocation].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                {c.glassdoorRating != null && <span className="badge">Glassdoor {c.glassdoorRating}</span>}
                {c.indeedRating != null && <span className="badge">Indeed {c.indeedRating}</span>}
                {c.blindRating != null && <span className="badge">Blind {c.blindRating}</span>}
                {c.tickerSymbol && <span className="badge">{c.tickerSymbol}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
