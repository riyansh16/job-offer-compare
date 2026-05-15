'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { upsertOffer } from '@/lib/actions';
import { offerSchema, validateFormData } from '@/lib/forms/validation';
import { Spinner } from './ui/Spinner';
import { Combobox } from './ui/Combobox';

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
  baseSalary?: number;
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
  /** Total years of professional experience. Only collected on the current
   *  role form; persists to User.yearsExperience for use on comparison pages. */
  yearsExperience?: number;
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [companyId, setCompanyId] = useState<string>(initial?.companyId ?? '');
  const isCurrentMode = mode === 'current';

  function clearFieldError(name: string) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  return (
    <form
      className="space-y-6"
      noValidate
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          if (isCurrentMode) {
            // Current role is stored as a JobOffer with isCurrent=true.
            formData.set('isCurrent', 'on');
          }
          const validation = validateFormData(offerSchema, formData);
          if (!validation.ok) {
            setFieldErrors(validation.errors);
            toast.error('Please fix the highlighted fields');
            // Focus the first invalid field for keyboard users.
            const firstKey = Object.keys(validation.errors)[0];
            if (firstKey) {
              const el = document.getElementById(firstKey);
              if (el && typeof (el as HTMLElement).focus === 'function') {
                (el as HTMLElement).focus();
              }
            }
            return;
          }
          setFieldErrors({});
          try {
            await upsertOffer(initial?.id ?? null, formData);
            toast.success(
              initial?.id
                ? 'Changes saved'
                : isCurrentMode
                  ? 'Current role saved'
                  : 'Offer created',
            );
            router.push('/dashboard');
            router.refresh();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to save';
            setError(msg);
            toast.error(msg);
          }
        })
      }
    >
      <fieldset className="grid gap-4 card sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">{isCurrentMode ? 'Current role' : 'Role'}</legend>
        <div>
          <label htmlFor="companyId" className="label">Company</label>
          <Combobox
            id="companyId"
            name="companyId"
            required
            value={companyId}
            onChange={(v) => {
              setCompanyId(v);
              clearFieldError('companyId');
            }}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Search companies…"
            error={!!fieldErrors.companyId}
            describedBy={fieldErrors.companyId ? 'companyId-error' : undefined}
          />
          {fieldErrors.companyId && (
            <p id="companyId-error" className="field-error" role="alert">
              {fieldErrors.companyId}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="title" className="label">Job title</label>
          <input
            id="title"
            name="title"
            required
            defaultValue={initial?.title}
            className={`input ${fieldErrors.title ? 'input-error' : ''}`}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? 'title-error' : undefined}
            onChange={() => clearFieldError('title')}
          />
          {fieldErrors.title && (
            <p id="title-error" className="field-error" role="alert">
              {fieldErrors.title}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="level" className="label">Level (optional)</label>
          <input id="level" name="level" defaultValue={initial?.level} className="input" placeholder="L5, Senior, etc." />
        </div>
        <div>
          <label htmlFor="location" className="label">Location (city)</label>
          <input
            id="location"
            name="location"
            required
            defaultValue={initial?.location}
            className={`input ${fieldErrors.location ? 'input-error' : ''}`}
            aria-invalid={fieldErrors.location ? true : undefined}
            aria-describedby={fieldErrors.location ? 'location-error' : undefined}
            onChange={() => clearFieldError('location')}
            placeholder="Seattle, WA or Remote"
          />
          {fieldErrors.location && (
            <p id="location-error" className="field-error" role="alert">
              {fieldErrors.location}
            </p>
          )}
        </div>
        {isCurrentMode && (
          <div>
            <label htmlFor="yearsExperience" className="label">Years of experience</label>
            <input
              id="yearsExperience"
              name="yearsExperience"
              type="number"
              min={0}
              max={50}
              step={1}
              defaultValue={initial?.yearsExperience ?? ''}
              className={`input ${fieldErrors.yearsExperience ? 'input-error' : ''}`}
              aria-invalid={fieldErrors.yearsExperience ? true : undefined}
              aria-describedby={fieldErrors.yearsExperience ? 'yearsExperience-error' : undefined}
              onChange={() => clearFieldError('yearsExperience')}
              placeholder="e.g. 5"
            />
            {fieldErrors.yearsExperience && (
              <p id="yearsExperience-error" className="field-error" role="alert">
                {fieldErrors.yearsExperience}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-4 card sm:grid-cols-2 lg:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Compensation (INR)</legend>
        <NumField
          label="Base salary"
          name="baseSalary"
          defaultValue={initial?.baseSalary ?? 0}
          error={fieldErrors.baseSalary}
          onChange={() => clearFieldError('baseSalary')}
        />
        <NumField
          label="Target bonus %"
          name="targetBonusPct"
          defaultValue={initial?.targetBonusPct ?? 0}
          step="0.1"
          hint="On-target percentage of base. E.g. 15 means 15% of base."
          error={fieldErrors.targetBonusPct}
          onChange={() => clearFieldError('targetBonusPct')}
        />
        <NumField
          label="Sign-on bonus"
          name="signOnBonus"
          defaultValue={initial?.signOnBonus ?? 0}
          hint={isCurrentMode ? 'Usually 0 for your current job.' : 'One-time, paid in year 1. Counts fully toward year-1 total comp.'}
          error={fieldErrors.signOnBonus}
          onChange={() => clearFieldError('signOnBonus')}
        />
        <NumField
          label="Equity vesting per year"
          name="equityTotal"
          defaultValue={initial?.equityTotal ?? 0}
          hint="$ value of equity that vests in the next 12 months. New offer: typically total grant ÷ vesting years (e.g. ₹60L grant over 4 years = ₹15L/yr). Current role: what's actually vesting this year."
          error={fieldErrors.equityTotal}
          onChange={() => clearFieldError('equityTotal')}
        />
        <NumField
          label="Benefits value (annual)"
          name="benefitsValueAnnual"
          defaultValue={initial?.benefitsValueAnnual ?? 0}
          hint="Annualized value of health insurance, retirement contributions, gratuity, perks. Skip if unknown."
          error={fieldErrors.benefitsValueAnnual}
          onChange={() => clearFieldError('benefitsValueAnnual')}
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
          error={fieldErrors.commuteCostMonthly}
          onChange={() => clearFieldError('commuteCostMonthly')}
        />
        <NumField
          label="Qualitative growth/fit (0-100)"
          name="qualitativeScore"
          defaultValue={initial?.qualitativeScore ?? 50}
          step="1"
          hint="Subjective: tech stack, manager, promo path, learning, brand. 50 = neutral, 80+ = strong fit."
          error={fieldErrors.qualitativeScore}
          onChange={() => clearFieldError('qualitativeScore')}
        />
      </fieldset>

      {error && (
        <p className="text-sm text-[rgb(var(--danger))]" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending && <Spinner size={14} label="Saving" />}
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
  error,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue: number;
  step?: string;
  hint?: string;
  error?: string;
  onChange?: () => void;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input
        id={name}
        name={name}
        type="number"
        step={step ?? '0.01'}
        min={0}
        defaultValue={defaultValue}
        className={`input ${error ? 'input-error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={onChange}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-[11px] leading-tight text-[rgb(var(--muted-foreground))]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
