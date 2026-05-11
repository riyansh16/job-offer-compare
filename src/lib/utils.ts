import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(value: number, opts: { compact?: boolean } = {}): string {
  return formatMoney(value, 'USD', opts);
}

/**
 * South Asian currencies that use the Lakh / Crore numbering convention.
 * 1 Lakh = 100,000  (1L = 1,00,000)
 * 1 Crore = 10,000,000 = 100 Lakhs  (1Cr = 1,00,00,000)
 */
const INDIAN_CURRENCIES = new Set(['INR', 'PKR', 'BDT', 'NPR', 'LKR']);

const CURRENCY_SYMBOL: Record<string, string> = {
  INR: '₹',
  PKR: '₨',
  BDT: '৳',
  NPR: '₨',
  LKR: '₨',
};

/**
 * Compact-format using Indian Lakh/Crore convention.
 *   500       → ₹500
 *   45_000    → ₹45,000
 *   450_000   → ₹4.5L
 *   4_500_000 → ₹45L
 *   45_000_000 → ₹4.5Cr
 */
function formatIndianCompact(value: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? currency + ' ';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v < 1_000) return `${sign}${symbol}${Math.round(v)}`;
  if (v < 100_000) {
    // Use Indian grouping (xx,xxx).
    return `${sign}${symbol}${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)}`;
  }
  if (v < 10_000_000) {
    const lakhs = v / 100_000;
    const formatted = lakhs >= 100 ? Math.round(lakhs).toString() : lakhs.toFixed(lakhs >= 10 ? 0 : 1);
    return `${sign}${symbol}${formatted}L`;
  }
  const crores = v / 10_000_000;
  const formatted = crores >= 100 ? Math.round(crores).toString() : crores.toFixed(crores >= 10 ? 1 : 2);
  return `${sign}${symbol}${formatted}Cr`;
}

export function formatMoney(
  value: number,
  currency = 'USD',
  opts: { compact?: boolean } = {},
): string {
  if (!Number.isFinite(value)) return '—';
  const cur = (currency || 'USD').toUpperCase();

  // Indian-numbering currencies use Lakh/Crore in compact mode.
  if (opts.compact && INDIAN_CURRENCIES.has(cur)) {
    return formatIndianCompact(value, cur);
  }
  // Indian-numbering currencies still get Indian grouping (xx,xx,xxx) in non-compact mode.
  if (INDIAN_CURRENCIES.has(cur)) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (opts.compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(fractionDigits)}%`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
