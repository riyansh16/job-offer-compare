'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { upsertOffer } from '@/lib/actions';
import { offerSchema, validateFormData } from '@/lib/forms/validation';
import { Spinner } from './ui/Spinner';
import { Combobox } from './ui/Combobox';

const PARSE_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
const PARSE_MAX_BYTES = 10 * 1024 * 1024;
type ParsedFields = Partial<Omit<OfferInitial, 'id' | 'isCurrent' | 'yearsExperience'>> & {
  companyName?: string;
  currency?: string;
  note?: string;
};

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

  // Parsed values from an uploaded offer letter override `initial` defaults.
  // We bump `formKey` after each parse to remount the inputs so their
  // `defaultValue`s pick up the new data without converting to controlled.
  const [parsed, setParsed] = useState<ParsedFields>({});
  const [formKey, setFormKey] = useState(0);
  const [parseHint, setParseHint] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Effective defaults: parsed wins over initial, both can be undefined.
  const v = <K extends keyof ParsedFields>(key: K): ParsedFields[K] | undefined => {
    const p = parsed[key];
    if (p !== undefined && p !== '') return p;
    const i = (initial as Record<string, unknown> | undefined)?.[key as string];
    return i as ParsedFields[K] | undefined;
  };

  async function handleParseFile(file: File) {
    if (!file) return;
    if (file.size > PARSE_MAX_BYTES) {
      toast.error('File too large (max 10 MB).');
      return;
    }
    setIsParsing(true);
    setParseHint(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/offers/parse', { method: 'POST', body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: ParsedFields;
        matchedCompanyId?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.error ?? 'Could not read that file.');
        return;
      }
      const data = json.data;

      // Keep money fields only when currency is INR or unspecified — the form
      // is INR-only, so foreign-currency amounts would mislead the user.
      const currency = data.currency?.toUpperCase();
      const moneyFieldsSafe = !currency || currency === 'INR';
      const next: ParsedFields = { ...data };
      const hints: string[] = [];
      if (!moneyFieldsSafe) {
        delete next.baseSalary;
        delete next.signOnBonus;
        delete next.equityTotal;
        delete next.benefitsValueAnnual;
        hints.push(
          `Detected ${currency} amounts — please convert to INR manually before saving.`,
        );
      }
      if (data.note) hints.push(data.note);
      setParseHint(hints.length ? hints.join(' ') : null);
      setParsed(next);
      setFormKey((k) => k + 1);
      if (json.matchedCompanyId) {
        setCompanyId(json.matchedCompanyId);
        clearFieldError('companyId');
      } else if (data.companyName) {
        hints.push(`Company "${data.companyName}" not in catalog — pick the closest match.`);
        setParseHint(hints.join(' '));
      }
      const filledCount = Object.values(next).filter(
        (x) => x !== undefined && x !== '' && x !== null,
      ).length;
      toast.success(`Filled ${filledCount} field${filledCount === 1 ? '' : 's'} from upload.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

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
      {!isCurrentMode && (
        <div className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Upload offer letter (optional)</p>
            <p className="text-[11px] leading-tight text-[rgb(var(--muted-foreground))]">
              PDF or screenshot — we'll extract the fields with AI. You can edit anything before saving.
            </p>
            {parseHint && (
              <p className="mt-1 text-[11px] leading-tight text-[rgb(var(--warning,234_179_8))]">
                {parseHint}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={PARSE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleParseFile(f);
              }}
            />
            <button
              type="button"
              className="btn-outline"
              disabled={isParsing}
              onClick={() => fileInputRef.current?.click()}
            >
              {isParsing && <Spinner size={14} label="Parsing" />}
              {isParsing ? 'Reading…' : 'Upload & auto-fill'}
            </button>
          </div>
        </div>
      )}

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
            key={`title-${formKey}`}
            id="title"
            name="title"
            required
            defaultValue={v('title') ?? ''}
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
          <input key={`level-${formKey}`} id="level" name="level" defaultValue={v('level') ?? ''} className="input" placeholder="L5, Senior, etc." />
        </div>
        <div>
          <label htmlFor="location" className="label">Location (city)</label>
          <input
            key={`location-${formKey}`}
            id="location"
            name="location"
            required
            defaultValue={v('location') ?? ''}
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
          key={`baseSalary-${formKey}`}
          label="Base salary"
          name="baseSalary"
          defaultValue={v('baseSalary') ?? 0}
          error={fieldErrors.baseSalary}
          onChange={() => clearFieldError('baseSalary')}
        />
        <NumField
          key={`targetBonusPct-${formKey}`}
          label="Target bonus %"
          name="targetBonusPct"
          defaultValue={v('targetBonusPct') ?? 0}
          step="0.1"
          hint="On-target percentage of base. E.g. 15 means 15% of base."
          error={fieldErrors.targetBonusPct}
          onChange={() => clearFieldError('targetBonusPct')}
        />
        <NumField
          key={`signOnBonus-${formKey}`}
          label="Sign-on bonus"
          name="signOnBonus"
          defaultValue={v('signOnBonus') ?? 0}
          hint={isCurrentMode ? 'Usually 0 for your current job.' : 'One-time, paid in year 1. Counts fully toward year-1 total comp.'}
          error={fieldErrors.signOnBonus}
          onChange={() => clearFieldError('signOnBonus')}
        />
        <NumField
          key={`equityTotal-${formKey}`}
          label="Equity vesting per year"
          name="equityTotal"
          defaultValue={v('equityTotal') ?? 0}
          hint="$ value of equity that vests in the next 12 months. New offer: typically total grant ÷ vesting years (e.g. ₹60L grant over 4 years = ₹15L/yr). Current role: what's actually vesting this year."
          error={fieldErrors.equityTotal}
          onChange={() => clearFieldError('equityTotal')}
        />
        <NumField
          key={`benefitsValueAnnual-${formKey}`}
          label="Benefits value (annual)"
          name="benefitsValueAnnual"
          defaultValue={v('benefitsValueAnnual') ?? 0}
          hint="Annualized value of health insurance, retirement contributions, gratuity, perks. Skip if unknown."
          error={fieldErrors.benefitsValueAnnual}
          onChange={() => clearFieldError('benefitsValueAnnual')}
        />
        <div>
          <label htmlFor="workMode" className="label">Work mode</label>
          <select key={`workMode-${formKey}`} id="workMode" name="workMode" defaultValue={v('workMode') ?? 'Onsite'} className="input">
            <option>Remote</option>
            <option>Hybrid</option>
            <option>Onsite</option>
          </select>
        </div>
        <NumField
          key={`commuteCostMonthly-${formKey}`}
          label="Commute cost / mo"
          name="commuteCostMonthly"
          defaultValue={v('commuteCostMonthly') ?? 0}
          hint="Monthly out-of-pocket for transit/gas. 0 if remote."
          error={fieldErrors.commuteCostMonthly}
          onChange={() => clearFieldError('commuteCostMonthly')}
        />
        <NumField
          key={`qualitativeScore-${formKey}`}
          label="Qualitative growth/fit (0-100)"
          name="qualitativeScore"
          defaultValue={v('qualitativeScore') ?? 50}
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
