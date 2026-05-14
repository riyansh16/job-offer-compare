'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState, useTransition, type ReactNode } from 'react';
import { Spinner } from './Spinner';

interface ConfirmDialogProps {
  /** Trigger element. Should be focusable (button or link). */
  trigger: ReactNode;
  /** Modal title — short, action-oriented. */
  title: string;
  /** Body text explaining the consequences. */
  description?: ReactNode;
  /** Label for the destructive/primary action button. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual treatment of the confirm action. */
  tone?: 'danger' | 'primary';
  /** Async handler — dialog stays open and shows a spinner until it resolves. */
  onConfirm: () => Promise<void> | void;
}

/**
 * Styled confirmation dialog backed by Radix Dialog. Replaces window.confirm().
 * Focus is trapped, ESC closes, overlay click closes, ARIA roles are wired by Radix.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await onConfirm();
        setOpen(false);
      } catch {
        // Caller is responsible for surfacing errors (e.g. via toast); keep
        // the dialog open so the user can retry or cancel.
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (pending ? null : setOpen(o))}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-[rgb(var(--card))] p-6 shadow-xl focus:outline-none"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="mt-2 text-sm text-[rgb(var(--muted-foreground))]">
              {description}
            </Dialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className="btn-outline" disabled={pending}>
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            >
              {pending && <Spinner size={14} />}
              {pending ? 'Working…' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
