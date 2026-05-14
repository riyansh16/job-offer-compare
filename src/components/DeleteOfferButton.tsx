'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash } from 'lucide-react';
import { deleteOffer, setOfferAsCurrent } from '@/lib/actions';
import { ConfirmDialog } from './ui/ConfirmDialog';

export function DeleteOfferButton({ offerId }: { offerId: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      title="Delete this offer?"
      description="This permanently removes the offer. Any comparison that included it will keep working from its saved snapshot, but you won't be able to re-score against it. This cannot be undone."
      confirmLabel="Delete offer"
      tone="danger"
      trigger={
        <button type="button" className="btn-danger">
          <Trash size={14} aria-hidden /> Delete
        </button>
      }
      onConfirm={async () => {
        try {
          await deleteOffer(offerId);
          toast.success('Offer deleted');
          router.push('/dashboard');
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Failed to delete offer');
          throw e;
        }
      }}
    />
  );
}

export function SetAsCurrentButton({ offerId, isCurrent }: { offerId: string; isCurrent: boolean }) {
  const router = useRouter();
  if (isCurrent) {
    return (
      <span className="badge bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))]">
        Current role
      </span>
    );
  }
  return (
    <ConfirmDialog
      title="Set this offer as your current role?"
      description="This replaces whatever offer is currently marked as your baseline. You can change it again later."
      confirmLabel="Set as current"
      tone="primary"
      trigger={
        <button type="button" className="btn-outline">
          Set as current role
        </button>
      }
      onConfirm={async () => {
        try {
          await setOfferAsCurrent(offerId);
          toast.success('Current role updated');
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Failed to update');
          throw e;
        }
      }}
    />
  );
}

export function DeleteComparisonButton({ id }: { id: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      title="Delete this comparison?"
      description="The saved scoring snapshot will be removed. Your offers are not affected."
      confirmLabel="Delete comparison"
      tone="danger"
      trigger={
        <button type="button" className="btn-danger">
          <Trash size={14} aria-hidden /> Delete comparison
        </button>
      }
      onConfirm={async () => {
        try {
          const { deleteComparison } = await import('@/lib/actions');
          await deleteComparison(id);
          toast.success('Comparison deleted');
          router.push('/dashboard');
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Failed to delete comparison');
          throw e;
        }
      }}
    />
  );
}
