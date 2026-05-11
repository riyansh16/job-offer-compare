/**
 * Gemini-grounded rating fetcher for Glassdoor + Indeed.
 *
 * Why Gemini-with-grounding instead of direct scraping:
 *  - Glassdoor and Indeed return HTTP 403 to any direct fetch (Cloudflare).
 *  - Google's search index has cached "Glassdoor: 4.4★" snippets for most
 *    indexed companies. Gemini's grounded search retrieves those.
 *  - Source URLs come back in groundingMetadata so we can show citations.
 *
 * Hard rules to avoid hallucinated numbers:
 *  - Reject any rating outside 0..5.
 *  - Reject any review count outside 0..10_000_000.
 *  - Reject sub-ratings if no overall rating was found (likely confabulation).
 *  - Always store the source URLs Gemini cited; if none cited, drop the value.
 */
import { GoogleGenAI, type GroundingChunk } from '@google/genai';

export interface LlmRatingResult {
  /** Overall Glassdoor rating, 0..5. null if not found. */
  glassdoorRating: number | null;
  glassdoorReviewCount: number | null;
  glassdoorCompBenefits: number | null;
  glassdoorWLB: number | null;
  glassdoorCareerOpps: number | null;
  glassdoorCulture: number | null;
  glassdoorSrMgmt: number | null;
  glassdoorRecommendPct: number | null;
  glassdoorCeoApprovalPct: number | null;
  glassdoorUrl: string | null;

  /** Overall Indeed rating, 0..5. null if not found. */
  indeedRating: number | null;
  indeedReviewCount: number | null;
  indeedUrl: string | null;

  /** Raw URLs Gemini grounded against, for audit/debug. */
  sourceUrls: string[];
  /** Set when Gemini explicitly says it could not find the company. */
  notFound: boolean;
}

const MODEL_ID = 'gemini-2.5-flash-lite';

const SYSTEM_PROMPT = `You are a precise data extractor.
Given a company name, you search the web for its current Glassdoor and Indeed
ratings and return them as STRICT JSON only — no prose, no markdown.

Rules:
- Numbers must be the exact published values, never estimates or averages.
- If a field is unavailable or you are not confident, return null. Do NOT guess.
- Sub-ratings like "Compensation & Benefits" only count if they are listed
  separately on the company's Glassdoor profile, not derived.
- Recommend% and CEO approval% are integers 0-100.
- Review counts are integers (e.g. 41123, not "41k").
- Always include glassdoorUrl and indeedUrl when you find data, pointing to
  the exact Glassdoor/Indeed company page (NOT a search result page).
- If the company has no Glassdoor or Indeed presence at all, set notFound=true
  and return null for every numeric field.

Output schema (return EXACTLY this shape, all keys present):
{
  "glassdoorRating": number|null,
  "glassdoorReviewCount": number|null,
  "glassdoorCompBenefits": number|null,
  "glassdoorWLB": number|null,
  "glassdoorCareerOpps": number|null,
  "glassdoorCulture": number|null,
  "glassdoorSrMgmt": number|null,
  "glassdoorRecommendPct": number|null,
  "glassdoorCeoApprovalPct": number|null,
  "glassdoorUrl": string|null,
  "indeedRating": number|null,
  "indeedReviewCount": number|null,
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
 * Fetch Glassdoor + Indeed ratings for a single company via Gemini grounded search.
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

  const prompt = `Find the current Glassdoor and Indeed ratings for "${companyName}" ${disambiguator}.

Search the web and return STRICT JSON matching the schema in the system prompt.
Make sure the URLs you return are the exact Glassdoor / Indeed company-overview pages.`;

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
  const validPct = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (v < 0 || v > 100) return null;
    return Math.round(v);
  };
  const validUrl = (v: unknown, mustContain: string): string | null => {
    if (typeof v !== 'string' || !v.startsWith('http')) return null;
    if (!v.toLowerCase().includes(mustContain)) return null;
    return v;
  };

  const result: LlmRatingResult = {
    glassdoorRating: validRating(parsed.glassdoorRating),
    glassdoorReviewCount: validCount(parsed.glassdoorReviewCount),
    glassdoorCompBenefits: validRating(parsed.glassdoorCompBenefits),
    glassdoorWLB: validRating(parsed.glassdoorWLB),
    glassdoorCareerOpps: validRating(parsed.glassdoorCareerOpps),
    glassdoorCulture: validRating(parsed.glassdoorCulture),
    glassdoorSrMgmt: validRating(parsed.glassdoorSrMgmt),
    glassdoorRecommendPct: validPct(parsed.glassdoorRecommendPct),
    glassdoorCeoApprovalPct: validPct(parsed.glassdoorCeoApprovalPct),
    glassdoorUrl: validUrl(parsed.glassdoorUrl, 'glassdoor.com'),
    indeedRating: validRating(parsed.indeedRating),
    indeedReviewCount: validCount(parsed.indeedReviewCount),
    indeedUrl: validUrl(parsed.indeedUrl, 'indeed.com'),
    sourceUrls,
    notFound: parsed.notFound === true,
  };

  // Anti-hallucination guard: if there's no glassdoorUrl, drop ALL Glassdoor
  // numbers — they were likely invented. Same for Indeed.
  if (!result.glassdoorUrl) {
    result.glassdoorRating = null;
    result.glassdoorReviewCount = null;
    result.glassdoorCompBenefits = null;
    result.glassdoorWLB = null;
    result.glassdoorCareerOpps = null;
    result.glassdoorCulture = null;
    result.glassdoorSrMgmt = null;
    result.glassdoorRecommendPct = null;
    result.glassdoorCeoApprovalPct = null;
  }
  if (!result.indeedUrl) {
    result.indeedRating = null;
    result.indeedReviewCount = null;
  }

  // Anti-hallucination guard: sub-ratings without overall = drop sub-ratings.
  if (result.glassdoorRating == null) {
    result.glassdoorCompBenefits = null;
    result.glassdoorWLB = null;
    result.glassdoorCareerOpps = null;
    result.glassdoorCulture = null;
    result.glassdoorSrMgmt = null;
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
