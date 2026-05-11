/**
 * One-off debug: same prompt as Gemini test, but routed through Azure OpenAI.
 *
 * Honest caveat: Azure OpenAI gpt-4.1-mini does NOT have built-in web search.
 * It will answer from training data only (knowledge cutoff ~early 2024).
 * Use this purely to compare quality vs Gemini-grounded.
 *
 * Usage: npx tsx --env-file=.env.local scripts/testAzureRatings.ts [company-name]
 */
import 'dotenv/config';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are a precise data extractor.
Given a company name, return its Glassdoor and Indeed ratings as STRICT JSON only — no prose, no markdown.

Rules:
- Numbers must be values you are CONFIDENT about from your training data.
- If a field is unavailable or you are not confident, return null. Do NOT guess.
- Sub-ratings only count if you know they are listed separately on Glassdoor.
- Recommend% and CEO approval% are integers 0-100.
- Review counts are integers (e.g. 41123, not "41k").
- Always include glassdoorUrl and indeedUrl when you have data, pointing to
  the exact Glassdoor/Indeed company-overview page (not search results).
- If the company has no Glassdoor or Indeed presence, set notFound=true.
- IMPORTANT: Your training data has a cutoff. If you're unsure whether the
  numbers are still current, set them to null and explain in a "warning" field.

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
  "notFound": boolean,
  "warning": string|null
}`;

async function main() {
  const companyName = process.argv[2] ?? 'Microsoft';
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-04-01-preview';
  if (!endpoint || !apiKey || !deployment) {
    console.error('Azure OpenAI env vars required: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Testing: ${companyName}`);
  console.log(`Provider: Azure OpenAI`);
  console.log(`Deployment: ${deployment}`);
  console.log(`API Version: ${apiVersion}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const client = new OpenAI({
    apiKey,
    baseURL: `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': apiKey },
  });

  const userPrompt = `Return the current Glassdoor and Indeed ratings for "${companyName}" as JSON matching the system schema.`;

  console.log('--- USER PROMPT ---');
  console.log(userPrompt);
  console.log();

  const start = Date.now();
  const response = await client.chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 600,
    response_format: { type: 'json_object' },
  });
  const elapsed = Date.now() - start;

  const text = response.choices[0]?.message?.content ?? '';

  console.log(`--- RAW RESPONSE (took ${elapsed}ms) ---`);
  console.log(text);
  console.log();

  console.log('--- TOKEN USAGE ---');
  console.log(`  Input:  ${response.usage?.prompt_tokens ?? '?'}`);
  console.log(`  Output: ${response.usage?.completion_tokens ?? '?'}`);
  console.log(`  Total:  ${response.usage?.total_tokens ?? '?'}`);
  console.log();

  console.log('--- ANALYSIS ---');
  try {
    const parsed = JSON.parse(text);
    const checks = [
      ['Has Glassdoor rating', parsed.glassdoorRating != null],
      ['Has Glassdoor URL', !!parsed.glassdoorUrl],
      ['Has Indeed rating', parsed.indeedRating != null],
      ['Has Indeed URL', !!parsed.indeedUrl],
      ['Reports a warning', !!parsed.warning],
    ];
    for (const [label, val] of checks) {
      console.log(`  ${val ? '✓' : '✗'} ${label}${typeof val === 'string' ? ` (${val})` : ''}`);
    }
    if (parsed.warning) {
      console.log(`  Model's own warning: "${parsed.warning}"`);
    }

    console.log('\n--- HONEST ASSESSMENT ---');
    console.log('Without web search, Azure OpenAI is answering from training data');
    console.log('(knowledge cutoff ~early 2024). The numbers may be stale or guessed.');
    console.log('There is NO source URL grounding to verify the values.');
    console.log('\nFor reliable rating extraction, web search grounding is required.');
    console.log('Azure does not provide this for OpenAI models. Options:');
    console.log('  1. Stick with Gemini (free, has grounding)');
    console.log('  2. Pay for Bing Search API + pass results to Azure OpenAI');
    console.log('  3. Manually curate ratings from consumer Gemini app');
  } catch (err) {
    console.log('  Failed to parse JSON:', err);
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
