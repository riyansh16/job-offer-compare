/**
 * Canonical public URL for the site. Reads NEXT_PUBLIC_SITE_URL when set
 * (production / preview), otherwise falls back to localhost for dev. Trailing
 * slashes are stripped so callers can safely concatenate paths.
 */
export const siteUrl: string = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
).replace(/\/$/, '');
