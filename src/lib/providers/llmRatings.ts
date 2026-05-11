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

const MODEL_ID = 'gemini-2.5-flash-lite';

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Don't throw; let the batch keep running and skip companies cleanly.
    console.warn('[llmRatings] GEMINI_API_KEY not set; skipping fetch');
    return null;
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

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        // Grounding via Google Search — gets us cached Glassdoor/Indeed snippets.
        tools: [{ googleSearch: {} }],
        // Low temperature: we want extraction, not creativity.
        temperature: 0.1,
      },
    });
  } catch (err) {
    console.warn(`[llmRatings] Gemini call failed for "${companyName}":`, err);
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
