import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { OfferForm } from '@/components/OfferForm';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';

export default async function NewOfferPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/auth/signin');
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'New offer' },
        ]}
      />
      <header>
        <h1 className="text-2xl font-semibold">New offer</h1>
        <p className="text-sm text-[rgb(var(--muted-foreground))]">
          {companies.length} companies in the catalog. Start typing to search.
        </p>
      </header>
      <OfferForm companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
