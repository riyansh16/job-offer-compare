/**
 * One-off debug script: call Gemini for ONE company and dump full response.
 *
 * Usage: npx tsx --env-file=.env.local scripts/testRatingsFetch.ts [company-name]
 * Defaults to "Microsoft" if no name given.
 *
 * Prints:
 *  - Raw Gemini response text (before our parser touches it)
 *  - Parsed JSON
 *  - Validated/filtered result our DB would actually receive
 *  - Source URLs Gemini grounded against
 *
 * Useful for:
 *  - Comparing model quality (flash vs flash-lite vs pro)
 *  - Diagnosing why Glassdoor data is sparse
 *  - Tuning the prompt / validation rules
 *
 * Note: each call uses 1 of today's free-tier quota (20 RPD on flash variants,
 * 50 RPD on pro). Don't run this in a loop.
 */
import 'dotenv/config';
import { GoogleGenAI, type GroundingChunk } from '@google/genai';
import { fetchLlmRatings } from '../src/lib/providers/llmRatings';

const MODEL_ID = process.env.TEST_MODEL ?? 'gemini-2.5-flash-lite';

const SYSTEM_PROMPT = `You are a precise data extractor.
Given a company name, you search the web for its current Glassdoor and Indeed
ratings and return them as STRICT JSON only — no prose, no markdown.

Rules:
- Numbers must be the exact published values, never estimates or averages.
- If a field is unavailable or you are not confident, return null. Do NOT guess.
- Sub-ratings only count if listed separately on the company's Glassdoor profile.
- Recommend% and CEO approval% are integers 0-100.
- Review counts are integers (e.g. 41123, not "41k").
- Always include glassdoorUrl and indeedUrl when you find data, pointing to
  the exact Glassdoor/Indeed company page (NOT a search result page).
- If the company has no Glassdoor or Indeed presence, set notFound=true.

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

async function main() {
  const companyName = process.argv[2] ?? 'Microsoft';
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY required in .env.local');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Testing: ${companyName}`);
  console.log(`Model:   ${MODEL_ID}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ─────── PART 1: Raw Gemini call (so we see EVERYTHING) ───────
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const prompt = `Find the current Glassdoor and Indeed ratings for "${companyName}".

Search the web and return STRICT JSON matching the schema in the system prompt.
Make sure the URLs you return are the exact Glassdoor / Indeed company-overview pages.`;

  console.log('--- PROMPT SENT ---');
  console.log(prompt);
  console.log();

  const start = Date.now();
  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
      temperature: 0.1,
    },
  });
  const elapsed = Date.now() - start;

  console.log(`--- RAW GEMINI RESPONSE (took ${elapsed}ms) ---`);
  console.log(response.text ?? '(empty)');
  console.log();

  // ─────── PART 2: Grounding sources Gemini cited ───────
  const candidate = response.candidates?.[0];
  const groundingChunks: GroundingChunk[] | undefined =
    candidate?.groundingMetadata?.groundingChunks;
  const sourceUrls: string[] =
    groundingChunks?.map((c) => c.web?.uri).filter((u): u is string => !!u) ?? [];

  console.log('--- GROUNDING SOURCES ---');
  if (sourceUrls.length === 0) {
    console.log('(none — Gemini did not cite any web sources)');
  } else {
    sourceUrls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`));
  }
  console.log();

  // ─────── PART 3: Token usage (if available) ───────
  const usage = response.usageMetadata;
  if (usage) {
    console.log('--- TOKEN USAGE ---');
    console.log(`  Input:  ${usage.promptTokenCount ?? '?'}`);
    console.log(`  Output: ${usage.candidatesTokenCount ?? '?'}`);
    console.log(`  Total:  ${usage.totalTokenCount ?? '?'}`);
    console.log();
  }

  // ─────── PART 4: What our actual provider returns (after validation) ───────
  console.log('--- WHAT THE PROVIDER ACTUALLY RETURNS ---');
  console.log('(After JSON parse + range validation + URL validation + anti-hallucination guards)\n');
  const validated = await fetchLlmRatings(companyName);
  if (!validated) {
    console.log('(null — provider rejected the response)');
  } else {
    console.log(JSON.stringify(validated, null, 2));
  }
  console.log();

  // ─────── PART 5: What WOULD be written to DB ───────
  console.log('--- DB UPDATE THAT WOULD HAPPEN ---');
  if (!validated) {
    console.log('(only lastFetchAttemptAt; no rating fields)');
  } else {
    const fields: Record<string, unknown> = {};
    const setIfNotNull = (key: string, v: unknown) => {
      if (v != null) fields[key] = v;
    };
    setIfNotNull('indeedRating', validated.indeedRating);
    setIfNotNull('indeedReviewCount', validated.indeedReviewCount);
    setIfNotNull('indeedCompBenefits', validated.indeedCompBenefits);
    setIfNotNull('indeedWLB', validated.indeedWLB);
    setIfNotNull('indeedJobSecurity', validated.indeedJobSecurity);
    setIfNotNull('indeedMgmt', validated.indeedMgmt);
    setIfNotNull('indeedCulture', validated.indeedCulture);
    setIfNotNull('indeedUrl', validated.indeedUrl);
    console.log(JSON.stringify(fields, null, 2));
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
