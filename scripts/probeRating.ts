/**
 * One-shot debug probe: call Gemini for a single company and print the
 * RAW response + parsed JSON + final validated result. Helps diagnose why
 * a company ends up in the "no data" bucket (no URL, hallucinated URL,
 * model said notFound, JSON parse failure, etc.).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/probeRating.ts "Wiz"
 *   npx tsx --env-file=.env.local scripts/probeRating.ts "xAI" --model=gemini-2.5-pro
 *
 * Cycles through every configured GEMINI_API_KEY* until one isn't quota-locked.
 */
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

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

function collectKeys(): string[] {
  const raw: (string | undefined)[] = [process.env.GEMINI_API_KEY];
  for (let i = 2; i <= 10; i++) raw.push(process.env[`GEMINI_API_KEY_${i}`]);
  return [...new Set(raw.map((k) => k?.trim()).filter((k): k is string => !!k))];
}

async function main() {
  const args = process.argv.slice(2);
  const modelArg = args.find((a) => a.startsWith('--model='));
  const model = modelArg ? modelArg.split('=')[1] : 'gemini-2.5-flash-lite';
  const companyName = args.filter((a) => !a.startsWith('--')).join(' ').trim() || 'Wiz';

  const keys = collectKeys();
  if (keys.length === 0) {
    console.error('No GEMINI_API_KEY* set.');
    process.exit(1);
  }

  console.log(`\n=== Probing "${companyName}" with model=${model} ===`);
  console.log(`Found ${keys.length} key(s). Trying each in order...\n`);

  const prompt = `Find the current Indeed (indeed.com) ratings for "${companyName}".

Search the web and return STRICT JSON matching the schema in the system prompt.
Make sure indeedUrl is the exact Indeed company-overview page (e.g. /cmp/CompanyName).`;

  for (const key of keys) {
    const tag = `…${key.slice(-6)}`;
    console.log(`--- key ${tag} ---`);
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ googleSearch: {} }],
          temperature: 0.1,
        },
      });

      const text = response.text ?? '';
      const candidate = response.candidates?.[0];
      const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? [];
      const sourceUrls = groundingChunks
        .map((c) => c.web?.uri)
        .filter((u): u is string => !!u);

      console.log(`\n[RAW MODEL TEXT]\n${text}\n`);
      console.log(`[GROUNDING URLS] (${sourceUrls.length})`);
      for (const u of sourceUrls.slice(0, 20)) console.log(`  - ${u}`);

      // Try to parse JSON.
      let parsed: Record<string, unknown> | null = null;
      const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const jsonSrc = fenced ? fenced[1].trim() : text.trim();
      try {
        parsed = JSON.parse(jsonSrc);
      } catch {
        const start = jsonSrc.indexOf('{');
        const end = jsonSrc.lastIndexOf('}');
        if (start >= 0 && end > start) {
          try {
            parsed = JSON.parse(jsonSrc.slice(start, end + 1));
          } catch {
            /* unparseable */
          }
        }
      }

      console.log(`\n[PARSED JSON]`);
      console.log(parsed ? JSON.stringify(parsed, null, 2) : '  (could not parse)');

      if (parsed) {
        const url = typeof parsed.indeedUrl === 'string' ? parsed.indeedUrl : null;
        const hasUrl = !!url && url.toLowerCase().includes('indeed.com');
        const overall =
          typeof parsed.indeedRating === 'number' &&
          parsed.indeedRating >= 0 &&
          parsed.indeedRating <= 5;
        console.log(`\n[DIAGNOSIS]`);
        console.log(`  notFound:        ${parsed.notFound === true}`);
        console.log(`  has indeedUrl:   ${hasUrl}  (${url ?? '—'})`);
        console.log(`  valid rating:    ${overall}  (${parsed.indeedRating ?? '—'})`);
        if (!hasUrl) {
          console.log(`  → Anti-hallucination guard would NULL all numbers (no valid URL).`);
        } else if (!overall) {
          console.log(`  → Anti-hallucination guard would drop sub-ratings (no overall).`);
        } else {
          console.log(`  → Would be stored as a real rating.`);
        }
      }
      return; // success on this key — done.
    } catch (err) {
      const status = (err as { status?: number })?.status;
      console.log(`  call failed (status=${status ?? '?'}): ${(err as Error).message?.slice(0, 200)}`);
      // try next key
    }
  }
  console.log('\nAll keys exhausted or failed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
