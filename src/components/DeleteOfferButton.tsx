'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteOffer, setOfferAsCurrent } from '@/lib/actions';

export function DeleteOfferButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn-danger"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Delete this offer? This cannot be undone.')) return;
        startTransition(async () => {
          await deleteOffer(offerId);
          router.push('/dashboard');
          router.refresh();
        });
      }}
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  );
}

export function SetAsCurrentButton({ offerId, isCurrent }: { offerId: string; isCurrent: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  if (isCurrent) {
    return (
      <span className="badge bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">
        Current role
      </span>
    );
  }
  return (
    <button
      type="button"
      className="btn-outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await setOfferAsCurrent(offerId);
          router.refresh();
        });
      }}
    >
      {isPending ? 'Setting…' : 'Set as current role'}
    </button>
  );
}

export function DeleteComparisonButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn-danger"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Delete this comparison?')) return;
        startTransition(async () => {
          const { deleteComparison } = await import('@/lib/actions');
          await deleteComparison(id);
          router.push('/dashboard');
          router.refresh();
        });
      }}
    >
      {isPending ? 'Deleting…' : 'Delete comparison'}
    </button>
  );
}
