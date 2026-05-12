/**
 * layoffs.fyi provider — fetches the public Airtable embed behind layoffs.fyi
 * and exposes a "did this company have layoffs in the last 12 months?" lookup.
 *
 * Why this works:
 *  - layoffs.fyi homepage embeds an Airtable shared view (4,397+ records).
 *  - Airtable's shared-view embeds hydrate via a public JSON endpoint:
 *      /v0.3/view/{viewId}/readSharedViewData
 *  - The endpoint needs a per-page `accessPolicy` token + `pageLoadId` that
 *    we scrape from the embed HTML on each refresh. No API key.
 *
 * Refresh cadence: monthly is enough — layoff events are rare per company and
 * the column is informational only. See scripts/refreshLayoffs.ts.
 *
 * Stability risk: Airtable could change the embed shell or rotate the share
 * URL. If that happens, all the `[layoffs]` log lines will say
 * "could not extract accessPolicy" — re-scrape from layoffs.fyi at that point.
 */

const EMBED_URL = 'https://airtable.com/embed/app1PaujS9zxVGUZ4/shroKsHx3SdYYOzeh';
const VIEW_ID = 'viwN3RMGptp84mfag';
const APP_ID = 'app1PaujS9zxVGUZ4';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** Known column IDs on the layoffs.fyi shared Airtable view. */
const COL = {
  company: 'fld9AHA9YDoNhrVFQ', // text
  locationHQ: 'fldeoYEol1GhizODE', // multiSelect
  laidOff: 'fldH1FcSF7DAaS1EB', // number
  date: 'fldaRiRVH3vaD9DRC', // date (ISO)
  percent: 'fldZRD6CwpFopYqqv', // number (0..1, e.g. 0.15 = 15%)
  industry: 'fldZxgn3xoVqoHWuj', // select id
  source: 'fldpt9Gt8PewUC1Sh', // text (URL)
  stage: 'fldoYp88YU5yEaK2P', // select id
  raised: 'fldiT8WOrVKce4LDj', // number (millions USD)
  country: 'fldATTnRRO0iX7jr0', // select id
} as const;

/** One layoff event for a company. */
export interface LayoffEvent {
  company: string;
  date: Date;
  laidOff: number | null;
  /** Percent of headcount, 0..100. null when the row didn't include % */
  percentOfHeadcount: number | null;
  /** Original article / press release URL from the layoffs.fyi row. */
  sourceUrl: string | null;
  country: string | null;
}

/** Aggregated rollup for one company over a time window. */
export interface CompanyLayoffSummary {
  /** Sum of percentage points across all events in window. */
  totalPctLast12m: number | null;
  /** Date of the most recent event in window. */
  mostRecentDate: Date | null;
  /** Source URL of the most recent event in window (for citation). */
  mostRecentSourceUrl: string | null;
  /** Underlying events that contributed, newest-first. */
  events: LayoffEvent[];
}

/**
 * Fetch the full layoffs.fyi dataset and return it parsed into LayoffEvent[].
 *
 * This is one HTTP call to the embed page (for tokens) + one to the data
 * endpoint (returns ~2.6 MB JSON). Callers should cache the result and avoid
 * calling more than once per refresh cycle.
 */
export async function fetchAllLayoffs(): Promise<LayoffEvent[]> {
  // 1. Scrape accessPolicy + pageLoadId from the embed HTML.
  const embedRes = await fetch(EMBED_URL, { headers: { 'User-Agent': UA } });
  if (!embedRes.ok) {
    throw new Error(`[layoffs] embed page returned ${embedRes.status}`);
  }
  const html = await embedRes.text();

  const apMatch = html.match(/"accessPolicy"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!apMatch) {
    throw new Error('[layoffs] could not extract accessPolicy from embed HTML');
  }
  // The value is JSON-escaped inside a JSON string. Unescape once.
  const accessPolicy = apMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

  const plMatch = html.match(/"pageLoadId"\s*:\s*"([^"]+)"/);
  const pageLoadId = plMatch?.[1] ?? `pgl${Math.random().toString(36).slice(2, 14)}`;

  // 2. Hit the readSharedViewData endpoint.
  const dataUrl =
    `https://airtable.com/v0.3/view/${VIEW_ID}/readSharedViewData` +
    `?stringifiedObjectParams=${encodeURIComponent('{}')}` +
    `&requestId=req${Math.random().toString(36).slice(2, 12)}` +
    `&accessPolicy=${encodeURIComponent(accessPolicy)}`;

  const dataRes = await fetch(dataUrl, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: EMBED_URL,
      'X-Time-Zone': 'UTC',
      'X-User-Locale': 'en',
      'X-Airtable-Application-Id': APP_ID,
      'X-Airtable-Page-Load-Id': pageLoadId,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  if (!dataRes.ok) {
    throw new Error(`[layoffs] readSharedViewData returned ${dataRes.status}`);
  }
  const json = (await dataRes.json()) as AirtableResponse;
  const rows = json?.data?.rows;
  if (!Array.isArray(rows)) {
    throw new Error('[layoffs] response did not contain data.rows');
  }

  // 3. Look up select choices once so we can resolve "country" labels.
  const countryChoices = extractChoiceMap(json.data, COL.country);

  // 4. Map rows -> LayoffEvent[].
  const events: LayoffEvent[] = [];
  for (const row of rows) {
    const cv = row.cellValuesByColumnId ?? {};
    const company = stringOrNull(cv[COL.company]);
    const dateRaw = stringOrNull(cv[COL.date]);
    if (!company || !dateRaw) continue;
    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) continue;

    const pct = numberOrNull(cv[COL.percent]);
    const countryId = stringOrNull(cv[COL.country]);
    events.push({
      company,
      date,
      laidOff: numberOrNull(cv[COL.laidOff]),
      // Airtable stores the % column as a 0..1 fraction; convert to 0..100 for storage.
      percentOfHeadcount: pct == null ? null : Math.round(pct * 1000) / 10,
      sourceUrl: stringOrNull(cv[COL.source]),
      country: countryId ? (countryChoices.get(countryId) ?? null) : null,
    });
  }
  return events;
}

/**
 * Index a flat event list by normalized company name so callers can do O(1)
 * lookups against their own catalog. Keys are lowercase + stripped of common
 * suffixes ("Inc", "Ltd", "Pvt", "Limited", etc.) so "Meta Platforms" and
 * "Meta" both match.
 */
export function indexEventsByCompany(events: LayoffEvent[]): Map<string, LayoffEvent[]> {
  const idx = new Map<string, LayoffEvent[]>();
  for (const e of events) {
    const key = normalizeCompanyName(e.company);
    if (!key) continue;
    const list = idx.get(key);
    if (list) list.push(e);
    else idx.set(key, [e]);
  }
  return idx;
}

/**
 * Roll up matched events into a single CompanyLayoffSummary for the
 * window of `windowDays` days ending now.
 *
 * Aggregation:
 *  - `totalPctLast12m` = sum of `percentOfHeadcount` across events in window.
 *    (Cumulative: two separate 5% layoffs in a year = 10% total signal.)
 *  - `mostRecentDate` / `mostRecentSourceUrl` come from the latest event so
 *    the UI can cite something specific.
 *
 * Returns null if no in-window events exist.
 */
export function summarizeCompanyLayoffs(
  events: LayoffEvent[],
  windowDays = 365,
): CompanyLayoffSummary | null {
  if (events.length === 0) return null;
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  const inWindow = events
    .filter((e) => e.date.getTime() >= cutoff)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  if (inWindow.length === 0) return null;

  const pctEvents = inWindow.filter((e) => e.percentOfHeadcount != null);
  const totalPct = pctEvents.length
    ? Math.round(
        pctEvents.reduce((s, e) => s + (e.percentOfHeadcount as number), 0) * 10,
      ) / 10
    : null;

  return {
    totalPctLast12m: totalPct,
    mostRecentDate: inWindow[0].date,
    mostRecentSourceUrl: inWindow[0].sourceUrl,
    events: inWindow,
  };
}

/**
 * Normalize a company name to a lookup key. Lowercases, trims, strips common
 * corporate suffixes and trailing punctuation, and collapses whitespace.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(
      /\b(inc|incorporated|corp|corporation|ltd|limited|llc|plc|pvt|private|gmbh|sa|ag|co|company|technologies|technology|tech|solutions|holdings|group)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

interface AirtableColumnChoice {
  id: string;
  name: string;
}
interface AirtableColumn {
  id: string;
  name: string;
  type: string;
  typeOptions?: { choices?: Record<string, AirtableColumnChoice> };
}
interface AirtableRow {
  id: string;
  createdTime: string;
  cellValuesByColumnId?: Record<string, unknown>;
}
interface AirtableResponse {
  msg?: string;
  data?: {
    columns?: AirtableColumn[];
    rows?: AirtableRow[];
  };
}

function extractChoiceMap(
  data: AirtableResponse['data'],
  columnId: string,
): Map<string, string> {
  const col = data?.columns?.find((c) => c.id === columnId);
  const out = new Map<string, string>();
  const choices = col?.typeOptions?.choices;
  if (!choices) return out;
  for (const [id, choice] of Object.entries(choices)) {
    if (choice?.name) out.set(id, choice.name);
  }
  return out;
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}
