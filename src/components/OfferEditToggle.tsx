'use client';

import { useState, type ReactNode } from 'react';
import { Pencil, X } from 'lucide-react';

/**
 * Local toggle between a read-only summary and an editable form on the offer
 * detail page. Defaults to the summary view; "Edit" opens the form, "Cancel"
 * collapses it again. Server-action submissions still navigate away on
 * success, so there's no need for a controlled "exit edit mode" callback.
 */
export function OfferEditToggle({
  summary,
  edit,
}: {
  summary: ReactNode;
  edit: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="btn-outline text-xs"
          aria-expanded={editing}
        >
          {editing ? <X size={14} aria-hidden /> : <Pencil size={14} aria-hidden />}
          {editing ? 'Cancel edit' : 'Edit offer'}
        </button>
      </div>
      {editing ? edit : summary}
    </div>
  );
}
