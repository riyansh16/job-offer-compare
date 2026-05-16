/**
 * Gemini-grounded rating fetcher for Indeed (India-focused tool).
 *
 * Why Indeed-only:
 *  - Higher India usage than Glassdoor; better signal for our audience.
 *  - Glassdoor's Cloudflare protection makes grounded search unreliable
 *    (~5% URL extraction success vs ~22% for Indeed).
 *  - Single-source story is cleaner: one platform, one freshness story,
 *    one verifiable URL per company.
 *
 * Hard rules to avoid hallucinated numbers:
 *  - Reject any rating outside 0..5.
 *  - Reject any review count outside 0..10_000_000.
 *  - Reject sub-ratings if no overall rating was found (likely confabulation).
 *  - Always store the source URL Gemini cited; if missing, drop the value.
 */
import { GoogleGenAI, type GroundingChunk } from '@google/genai';

export interface LlmRatingResult {
  /** Overall Indeed rating, 0..5. null if not found. */
  indeedRating: number | null;
  indeedReviewCount: number | null;
  indeedCompBenefits: number | null;
  indeedWLB: number | null;
  indeedJobSecurity: number | null;
  indeedMgmt: number | null;
  indeedCulture: number | null;
  indeedUrl: string | null;

  /** Raw URLs Gemini grounded against, for audit/debug. */
  sourceUrls: string[];
  /** Set when Gemini explicitly says it could not find the company. */
  notFound: boolean;
}

// Default to flash-lite (fastest, smallest); override with GEMINI_RATINGS_MODEL
// env var when its daily quota is exhausted (each model has a separate 20 RPD
// bucket on the free tier). Tried-and-tested options:
//   - gemini-2.5-flash-lite (default, fast)
//   - gemini-2.5-flash      (smarter, slower)
//   - gemini-2.5-pro        (smartest, ~50 RPD on free tier)
//   - gemini-2.0-flash      (older, separate quota)
const MODEL_ID = process.env.GEMINI_RATINGS_MODEL ?? 'gemini-2.5-flash-lite';

// Per-process record of API keys that hit their daily quota. Resets on cold
// start, which is what we want — quota resets ~24h on Gemini's free tier and
// the worst case is one wasted call to re-confirm exhaustion. We only mark a
// key exhausted on a 429 with a long server-suggested retryDelay (> 60s);
// short delays are per-minute throttling and handled in-place.
const EXHAUSTED_KEYS = new Set<string>();

/**
 * Collect every configured Gemini API key, in priority order, skipping any
 * marked exhausted in this process. Supports `GEMINI_API_KEY` (primary) plus
 * numbered fallbacks `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, ... up to _10.
 */
function collectGeminiKeys(): string[] {
  const raw: (string | undefined)[] = [process.env.GEMINI_API_KEY];
  for (let i = 2; i <= 10; i++) raw.push(process.env[`GEMINI_API_KEY_${i}`]);
  const keys = raw
    .map((k) => k?.trim())
    .filter((k): k is string => !!k && k.length > 0);
  // Dedupe (someone might paste the same key in two slots) and drop exhausted.
  return [...new Set(keys)].filter((k) => !EXHAUSTED_KEYS.has(k));
}

/** Tag value to distinguish daily-quota exhaustion from other failures. */
const QUOTA_EXHAUSTED = Symbol('gemini-quota-exhausted');
type CallOutcome =
  | { ok: true; response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>> }
  | { ok: false; reason: typeof QUOTA_EXHAUSTED | 'failed' };

/**
 * Thrown when fetchLlmRatings could not make a single Gemini call because
 * either (a) no API keys are configured, or (b) every configured key has
 * exhausted its daily quota for this process. The caller (batch processor)
 * must NOT stamp ratingsLastFetchAttemptAt for the company — we never actually
 * tried, so the company should remain in the "never attempted" bucket and
 * be picked up by the next run after the daily quota resets.
 */
export class GeminiQuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiQuotaExhaustedError';
  }
}

/**
 * One attempt against one API key, with the per-minute 429 retry kept inline.
 * Returns:
 *   - { ok: true }                                  → success
 *   - { ok: false, reason: QUOTA_EXHAUSTED }        → caller should try next key
 *   - { ok: false, reason: 'failed' }               → unrelated error, give up
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  companyName: string,
): Promise<CallOutcome> {
  const ai = new GoogleGenAI({ apiKey });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          // Grounding via Google Search — gets us cached Indeed snippets.
          tools: [{ googleSearch: {} }],
          // Low temperature: we want extraction, not creativity.
          temperature: 0.1,
        },
      });
      return { ok: true, response };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status !== 429) {
        console.warn(`[llmRatings] Gemini call failed for "${companyName}":`, err);
        return { ok: false, reason: 'failed' };
      }
      const delayMs = extractRetryDelayMs(err);
      // Long retryDelay (or none) → daily quota, OR a near-minute backoff that
      // almost always precedes RPD exhaustion. Surface as exhausted so the
      // outer loop rotates to the next API key instead of idling 30–60s here.
      if (delayMs === 0 || delayMs > 30_000) {
        console.warn(
          `[llmRatings] daily quota hit for "${companyName}" on key …${apiKey.slice(-6)}`,
        );
        return { ok: false, reason: QUOTA_EXHAUSTED };
      }
      // Short retry → per-minute throttle. Wait it out once, then retry.
      if (attempt === 0) {
        console.warn(
          `[llmRatings] 429 for "${companyName}"; retrying in ${(delayMs / 1000).toFixed(1)}s`,
        );
        await new Promise((r) => setTimeout(r, delayMs + 250));
        continue;
      }
      // Second 429 in a row → treat as exhausted to avoid hammering.
      return { ok: false, reason: QUOTA_EXHAUSTED };
    }
  }
  return { ok: false, reason: 'failed' };
}

const SYSTEM_PROMPT = `You are a precise data extractor.
Given a company name, you search the web for its current Indeed (indeed.com) ratings
and return them as STRICT JSON only — no prose, no markdown.

Rules:
- Numbers must be the exact published values, never estimates or averages.
- If a field is unavailable or you are not confident, return null. Do NOT guess.
- Sub-ratings only count if they are listed separately on the Indeed company page.
- Review counts are integers (e.g. 8923, not "8.9k").
- Always include indeedUrl pointing to the exact Indeed company-overview page
  (e.g. https://www.indeed.com/cmp/Microsoft — NOT a search URL).
- Look up the India-specific page when possible (https://in.indeed.com/cmp/...);
  fall back to the global page if no India page exists.
- If the company has no Indeed presence at all, set notFound=true and return
  null for every numeric field.

PRIORITY — the overall rating and review count:
- The "Overall rating" appears at the TOP of every Indeed company page,
  displayed as a big number (e.g. "4.2") next to a star icon, with text
  like "Based on 3,072 reviews" directly below it.
- This number is REQUIRED whenever the page exists. If you can see ANY
  sub-ratings (Work-Life Balance, Pay, Management, etc.), the overall
  rating is ALSO on that same page — find it and include it.
- Do NOT return only sub-ratings. If you cannot find the overall rating
  but found sub-ratings, search the page again specifically for the
  large headline number next to the star icon at the top.
- The same applies to indeedReviewCount: it is shown as "Based on N reviews"
  right below the overall rating. Extract that integer.

Output schema (return EXACTLY this shape, all keys present):
{
  "indeedRating": number|null,
  "indeedReviewCount": number|null,
  "indeedCompBenefits": number|null,
  "indeedWLB": number|null,
  "indeedJobSecurity": number|null,
  "indeedMgmt": number|null,
  "indeedCulture": number|null,
  "indeedUrl": string|null,
  "notFound": boolean
}`;

export interface FetchOptions {
  /** Optional ticker symbol to disambiguate (e.g. "AAPL" for Apple). */
  ticker?: string | null;
  /** Optional HQ to disambiguate companies with same name. */
  hqLocation?: string | null;
}

/**
 * Fetch Indeed ratings for a single company via Gemini grounded search.
 * Returns null if the API call itself fails (network, quota, missing key).
 */
export async function fetchLlmRatings(
  companyName: string,
  opts: FetchOptions = {},
): Promise<LlmRatingResult | null> {
  const keys = collectGeminiKeys();
  if (keys.length === 0) {
    // Either no key configured at all, or every key is exhausted today.
    // Throw a distinct error so the batch processor knows NOT to mark the
    // company as attempted (we never made a real call).
    const anyConfigured =
      !!process.env.GEMINI_API_KEY ||
      Array.from({ length: 9 }, (_, i) => process.env[`GEMINI_API_KEY_${i + 2}`]).some(
        (v) => !!v,
      );
    if (!anyConfigured) {
      throw new GeminiQuotaExhaustedError('No GEMINI_API_KEY* env var set');
    }
    throw new GeminiQuotaExhaustedError('All Gemini API keys are quota-exhausted');
  }

  const disambiguator = [
    opts.ticker ? `(stock ticker ${opts.ticker})` : '',
    opts.hqLocation ? `headquartered in ${opts.hqLocation}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const prompt = `Find the current Indeed (indeed.com) ratings for "${companyName}" ${disambiguator}.

Search the web and return STRICT JSON matching the schema in the system prompt.
Make sure indeedUrl is the exact Indeed company-overview page (e.g. /cmp/CompanyName).`;

  // Try keys in order. On daily-quota exhaustion, mark the key dead for this
  // process and rotate to the next. On any other failure, give up — those are
  // not key-specific and burning more keys won't help.
  let response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>> | null = null;
  let allExhausted = true;
  for (const key of keys) {
    const outcome = await callGemini(key, prompt, companyName);
    if (outcome.ok) {
      response = outcome.response;
      allExhausted = false;
      break;
    }
    if (outcome.reason === QUOTA_EXHAUSTED) {
      EXHAUSTED_KEYS.add(key);
      continue;
    }
    // Real failure (non-quota): we DID make a call, just failed. Caller can
    // legitimately mark the company as attempted.
    return null;
  }
  if (!response) {
    if (allExhausted) {
      throw new GeminiQuotaExhaustedError(
        `All Gemini API keys exhausted while fetching "${companyName}"`,
      );
    }
    return null;
  }

  const text = response.text ?? '';
  const candidate = response.candidates?.[0];
  const groundingChunks: GroundingChunk[] | undefined =
    candidate?.groundingMetadata?.groundingChunks;
  const sourceUrls: string[] =
    groundingChunks?.map((c) => c.web?.uri).filter((u): u is string => !!u) ?? [];

  // Extract JSON robustly. Gemini sometimes returns:
  //  - Pure JSON                                       → use as-is
  //  - JSON wrapped in ```json ... ``` fences          → strip fences
  //  - Prose followed by JSON ("Here's the data: {…}") → find first {…} block
  //  - Prose with no JSON                              → unparseable, skip
  const parsed = extractJson(text);
  if (!parsed) {
    console.warn(
      `[llmRatings] Could not parse JSON for "${companyName}". Raw:`,
      text.slice(0, 300),
    );
    return null;
  }

  // Validate every numeric field. Reject hallucinated values.
  const validRating = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (v < 0 || v > 5) return null;
    return Math.round(v * 10) / 10; // 1 decimal place
  };
  const validCount = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (v < 0 || v > 10_000_000) return null;
    return Math.round(v);
  };
  const validUrl = (v: unknown, mustContain: string): string | null => {
    if (typeof v !== 'string' || !v.startsWith('http')) return null;
    if (!v.toLowerCase().includes(mustContain)) return null;
    return v;
  };

  const result: LlmRatingResult = {
    indeedRating: validRating(parsed.indeedRating),
    indeedReviewCount: validCount(parsed.indeedReviewCount),
    indeedCompBenefits: validRating(parsed.indeedCompBenefits),
    indeedWLB: validRating(parsed.indeedWLB),
    indeedJobSecurity: validRating(parsed.indeedJobSecurity),
    indeedMgmt: validRating(parsed.indeedMgmt),
    indeedCulture: validRating(parsed.indeedCulture),
    indeedUrl: validUrl(parsed.indeedUrl, 'indeed.com'),
    sourceUrls,
    notFound: parsed.notFound === true,
  };

  // Debug logging: explain WHY a company ends up with no usable rating.
  // Enable with LLM_RATINGS_DEBUG=1 in env. Quiet by default to keep batch
  // output clean for daily-cron runs.
  if (process.env.LLM_RATINGS_DEBUG === '1') {
    const reasons: string[] = [];
    if (result.notFound) reasons.push('model:notFound');
    if (!result.indeedUrl) {
      reasons.push(
        typeof parsed.indeedUrl === 'string'
          ? `bad-url:${String(parsed.indeedUrl).slice(0, 80)}`
          : 'no-url',
      );
    }
    if (result.indeedRating == null) {
      reasons.push(
        typeof parsed.indeedRating === 'number'
          ? `rating-out-of-range:${parsed.indeedRating}`
          : 'no-rating',
      );
    }
    if (reasons.length > 0) {
      console.warn(
        `[llmRatings:debug] "${companyName}" → ${reasons.join(', ')} (groundingUrls=${sourceUrls.length})`,
      );
    }
  }

  // Anti-hallucination guard: if there's no indeedUrl, drop ALL Indeed numbers.
  // The model invented them without a verifiable source.
  if (!result.indeedUrl) {
    result.indeedRating = null;
    result.indeedReviewCount = null;
    result.indeedCompBenefits = null;
    result.indeedWLB = null;
    result.indeedJobSecurity = null;
    result.indeedMgmt = null;
    result.indeedCulture = null;
  }

  // Anti-hallucination guard: sub-ratings without overall = drop sub-ratings.
  if (result.indeedRating == null) {
    result.indeedCompBenefits = null;
    result.indeedWLB = null;
    result.indeedJobSecurity = null;
    result.indeedMgmt = null;
    result.indeedCulture = null;
  }

  return result;
}

/**
 * Pull a JSON object out of arbitrary LLM text. Handles:
 *  - Pure JSON
 *  - JSON inside ```json ... ``` fences
 *  - JSON embedded after prose ("Here is the data: { ... }")
 *
 * Strategy: find the FIRST balanced {...} block, parse it. Robust against
 * the model adding a "I have now gathered..." preamble before the JSON.
 */
function extractJson(
  raw: string,
): (Partial<LlmRatingResult> & { notFound?: boolean }) | null {
  if (!raw) return null;

  // 1. Code-fenced JSON.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }

  // 2. Try the whole string.
  try {
    return JSON.parse(raw.trim());
  } catch {
    /* fall through */
  }

  // 3. Find the first balanced {...} block. Walks one char at a time tracking
  //    brace depth so we don't get confused by nested objects.
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Pull the server-suggested `retryDelay` out of a Gemini 429 ApiError.
 * The error body is a JSON string with shape:
 *   { error: { details: [ ..., { @type: "...RetryInfo", retryDelay: "36s" } ] } }
 * Returns 0 if not present or unparseable.
 */
function extractRetryDelayMs(err: unknown): number {
  const message = (err as { message?: string })?.message;
  if (!message) return 0;
  // Cheap path: regex the duration string out without parsing the whole body.
  const m = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (!m) return 0;
  const seconds = parseFloat(m[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.ceil(seconds * 1000);
}
