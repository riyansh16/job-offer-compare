import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { OfferForm } from '@/components/OfferForm';

export default async function NewOfferPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="text-sm text-[rgb(var(--muted-foreground))] hover:underline">
        ← Back to dashboard
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">New offer</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          {companies.length} companies in the catalog. If you don&apos;t see yours, the seed
          file ([prisma/seed.ts](../../../prisma/seed.ts)) curates the list.
        </p>
      </header>
      <OfferForm companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
