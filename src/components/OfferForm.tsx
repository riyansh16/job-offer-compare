'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertOffer } from '@/lib/actions';
import { SUPPORTED_CURRENCIES } from '@/lib/providers/currency';

export interface CompanyOption {
  id: string;
  name: string;
}

export interface OfferInitial {
  id?: string;
  companyId?: string;
  title?: string;
  level?: string;
  location?: string;
  isCurrent?: boolean;
  status?: string;
  notes?: string;
  baseSalary?: number;
  currency?: string;
  targetBonusPct?: number;
  signOnBonus?: number;
  equityTotal?: number;
  benefitsValueAnnual?: number;
  ptoDays?: number;
  workMode?: string;
  commuteCostMonthly?: number;
  qualitativeScore?: number;
  vestYears?: number;
  vestCliffMonths?: number;
  vestCadence?: string;
  vestBackloaded?: boolean;
}

export function OfferForm({
  companies,
  initial,
  mode = 'offer',
}: {
  companies: CompanyOption[];
  initial?: OfferInitial;
  /** 'current' renders the streamlined form for the user's current role/baseline. */
  mode?: 'offer' | 'current';
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isCurrentMode = mode === 'current';

  return (
    <form
      className="space-y-6"
      action={(formData) =>
        startTransition(async () => {
          try {
            setError(null);
            if (isCurrentMode) {
              // Current role is stored as a JobOffer with isCurrent=true and status=Active.
              formData.set('isCurrent', 'on');
              formData.set('status', 'Active');
            }
            await upsertOffer(initial?.id ?? null, formData);
            router.push('/dashboard');
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save');
          }
        })
      }
    >
      <fieldset className="grid gap-4 md:grid-cols-2 card">
        <legend className="px-1 text-sm font-semibold">{isCurrentMode ? 'Current role' : 'Role'}</legend>
        <div>
          <label htmlFor="companyId" className="label">Company</label>
          <select id="companyId" name="companyId" required defaultValue={initial?.companyId} className="input">
            <option value="">Select company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="title" className="label">Job title</label>
          <input id="title" name="title" required defaultValue={initial?.title} className="input" />
        </div>
        <div>
          <label htmlFor="level" className="label">Level (optional)</label>
          <input id="level" name="level" defaultValue={initial?.level} className="input" placeholder="L5, Senior, etc." />
        </div>
        <div>
          <label htmlFor="location" className="label">Location (city)</label>
          <input id="location" name="location" required defaultValue={initial?.location} className="input" placeholder="Seattle, WA or Remote" />
        </div>
        {!isCurrentMode && (
          <>
            <div>
              <label htmlFor="status" className="label">Status</label>
              <select id="status" name="status" defaultValue={initial?.status ?? 'Active'} className="input">
                <option>Active</option>
                <option>Accepted</option>
                <option>Rejected</option>
                <option>Archived</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isCurrent" defaultChecked={initial?.isCurrent} />
                Also mark as my current job (baseline)
              </label>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-3 card">
        <legend className="px-1 text-sm font-semibold">Compensation</legend>
        <div>
          <label htmlFor="currency" className="label">Currency</label>
          <select id="currency" name="currency" defaultValue={initial?.currency ?? 'INR'} className="input">
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <NumField label="Base salary" name="baseSalary" defaultValue={initial?.baseSalary ?? 0} />
        <NumField
          label="Target bonus %"
          name="targetBonusPct"
          defaultValue={initial?.targetBonusPct ?? 0}
          step="0.1"
          hint="On-target percentage of base. E.g. 15 means 15% of base."
        />
        <NumField
          label="Sign-on bonus"
          name="signOnBonus"
          defaultValue={initial?.signOnBonus ?? 0}
          hint={isCurrentMode ? 'Usually 0 for your current job.' : 'One-time, total. Engine amortizes over 4 years for scoring.'}
        />
        <NumField
          label="Equity vesting per year"
          name="equityTotal"
          defaultValue={initial?.equityTotal ?? 0}
          hint="$ value of equity that vests in the next 12 months. New offer: typically total grant ÷ vesting years (e.g. ₹60L grant over 4 years = ₹15L/yr). Current role: what's actually vesting this year."
        />
        <NumField
          label="Benefits value (annual)"
          name="benefitsValueAnnual"
          defaultValue={initial?.benefitsValueAnnual ?? 0}
          hint="Annualized $ value of health, 401k match, perks etc. Skip if unknown."
        />
        <div>
          <label htmlFor="workMode" className="label">Work mode</label>
          <select id="workMode" name="workMode" defaultValue={initial?.workMode ?? 'Onsite'} className="input">
            <option>Remote</option>
            <option>Hybrid</option>
            <option>Onsite</option>
          </select>
        </div>
        <NumField
          label="Commute cost / mo"
          name="commuteCostMonthly"
          defaultValue={initial?.commuteCostMonthly ?? 0}
          hint="Monthly out-of-pocket for transit/gas. 0 if remote."
        />
        <NumField
          label="Qualitative growth/fit (0-100)"
          name="qualitativeScore"
          defaultValue={initial?.qualitativeScore ?? 50}
          step="1"
          hint="Subjective: tech stack, manager, promo path, learning, brand. 50 = neutral, 80+ = strong fit."
        />
        <p className="md:col-span-3 -mt-2 text-xs text-[rgb(var(--muted-foreground))]">
          All money fields use the currency selected above. Comparisons auto-convert via
          live ECB rates (Frankfurter API, free).
        </p>
      </fieldset>

      <fieldset className="card">
        <legend className="px-1 text-sm font-semibold">Notes (optional)</legend>
        <textarea name="notes" defaultValue={initial?.notes} className="input min-h-32" />
      </fieldset>

      {error && <p className="text-sm text-[rgb(var(--danger))]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending
            ? 'Saving…'
            : initial?.id
              ? 'Save changes'
              : isCurrentMode
                ? 'Save current role'
                : 'Create offer'}
        </button>
      </div>
    </form>
  );
}

function NumField({
  label,
  name,
  defaultValue,
  step,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: number;
  step?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} type="number" step={step ?? '0.01'} min={0} defaultValue={defaultValue} className="input" />
      {hint && <p className="mt-1 text-[11px] leading-tight text-[rgb(var(--muted-foreground))]">{hint}</p>}
    </div>
  );
}
