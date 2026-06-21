import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Fields we attempt to pull out of an uploaded offer letter.
 * Every field is optional — the extractor reports only what it is confident
 * about; the user verifies / fills the rest in the form.
 *
 * Money values are returned in their detected `currency`. The caller decides
 * whether to use them as-is (when `currency === 'INR'`) or only suggest them
 * to the user with a warning (when the form is INR-only and the letter is in
 * a foreign currency).
 */
export interface ExtractedOffer {
  companyName?: string;
  title?: string;
  level?: string;
  location?: string;
  workMode?: 'Remote' | 'Hybrid' | 'Onsite';
  baseSalary?: number;
  targetBonusPct?: number;
  /** One-time joining/relocation/sign-on amount, in `currency`. */
  signOnBonus?: number;
  /** Annualized vesting value (one year), in `equityCurrency` if set, else `currency`. */
  equityTotal?: number;
  /** Vesting horizon in years (typically 4). Used for the per-year math. */
  equityVestingYears?: number;
  /**
   * Currency for `equityTotal` when it differs from base salary currency
   * (very common: India base in INR + RSUs in USD). ISO 4217.
   */
  equityCurrency?: string;
  benefitsValueAnnual?: number;
  /** ISO 4217 currency code as detected in the document, e.g. 'INR', 'USD'. */
  currency?: string;
  /** Free-form note about anything ambiguous (cliff, refresh, etc.). */
  note?: string;
}

const SYSTEM_PROMPT = `You are a precise data extractor. The user uploads a job
offer letter (PDF or image). You return STRICT JSON describing the offer — no
prose, no markdown, no code fences.

Schema (every field optional, omit what you cannot find with high confidence):
{
  "companyName":        string,                 // employer name as written
  "title":              string,                 // job title
  "level":              string,                 // e.g. "L5", "Senior", "SDE II", "61"
  "location":           string,                 // "City, State/Country" or "Remote"
  "workMode":           "Remote"|"Hybrid"|"Onsite",
  "baseSalary":         number,                 // ANNUAL base, in "currency"
  "targetBonusPct":     number,                 // % of base, e.g. 15 means 15%
  "signOnBonus":        number,                 // one-time joining/sign-on/RELOCATION bonus, in "currency". Sum joining + relocation if both exist.
  "equityTotal":        number,                 // ANNUALIZED vesting value (total grant ÷ vesting years), in "equityCurrency" if set, else "currency"
  "equityVestingYears": number,                 // vesting horizon in years; default 4 if document says "vesting per company policy" without a number
  "equityCurrency":     string,                 // ISO 4217 — set ONLY when equity is in a different currency than base (e.g. India offer with USD RSUs)
  "benefitsValueAnnual": number,                // optional, only if document states a $/₹ value
  "currency":           string,                 // ISO 4217 of base salary
  "note":               string                  // 1-line caveat (cliff, refresh, RSU vs option, components rolled together, etc.)
}

Rules:
- Output ONE JSON object and nothing else. No markdown.
- Only include a field if the document clearly states it. Never guess.

BASE SALARY — read carefully, Indian offers trip up extractors:
- "baseSalary" means the headline ANNUAL FIXED PAY the offer promises (what
  the recruiter / job site would quote). Synonyms used in offer letters:
  "Annual salary", "Annual base salary", "Total annual remuneration",
  "Annual compensation", "Annual CTC", "Gross Annual Salary", "Fixed Annual
  Compensation", "Cost To Company (CTC)". Use that single headline number.
- In Indian offers, the CTC table usually has a line item literally called
  "Basic Salary" or "Basic Pay" that is roughly 40-50% of the CTC. This is
  a STATUTORY sub-component used to compute PF/gratuity. DO NOT use it as
  baseSalary. Use the CTC total / "Annual salary" / "Total remuneration"
  figure instead — even if the breakdown shows "Basic Salary 18,50,000",
  baseSalary should be the 37,00,000 CTC total.
- Exclude one-time sign-on/joining/relocation bonuses and equity from base.
  Variable/performance pay listed inside the CTC (e.g. "Variable Allowance",
  "Bonus-Basic", "Performance Pay") IS part of the CTC headline and stays
  inside baseSalary — do NOT subtract it.
- US/EU offers: use the explicit "Base Salary" or "Annual Base Salary"
  number from the letter or appendix; do not add bonus/equity.

EQUITY / STOCK — equityTotal must be the PER-YEAR vesting value:
- Sections titled "On-Hire Stock Award", "Stock Award", "RSU Grant", "Equity",
  "Restricted Stock Units", "Long Term Incentive", "LTI", "ESPP grant",
  "shares of [Company] common stock" all describe equity.
- If the letter says "X (USD/INR) divided by closing stock price" or "shares
  worth X", that X is the stated grant amount.
- FIRST decide if the grant is ONE-TIME or ANNUAL — this determines the math:
  • ONE-TIME (default assumption): titled "On-Hire", "Sign-on", "Joining",
    "New-Hire", "Initial", "One-time", or "Welcome" Stock Award, OR a plain
    "Stock Award / RSU Grant" with no "annual/yearly/refresh" wording. These
    are a single lump grant that vests over MULTIPLE years.
  • ANNUAL (only when explicit): the letter literally calls it an "Annual
    Stock Award", "annual refresh", "yearly grant", or "per-year" award.
- Convert the stated grant to equityTotal (per-year) by these cases:
  (a) Vesting period EXPLICITLY stated ("vests over 4 years", "16 quarterly
      installments", "3-year cliff vest"): set equityVestingYears to that
      number and equityTotal = stated_grant / equityVestingYears.
  (b) ONE-TIME grant with NO explicit period — including when the schedule is
      deferred to a "stock plan", "company policy", "plan terms and
      conditions", or just says "vests"/"subject to vesting": DEFAULT to
      equityVestingYears = 4 and equityTotal = stated_grant / 4. Add
      "assumed 4yr vesting (schedule per stock plan)" to note. Do NOT treat a
      one-time grant as a per-year amount.
  (c) ANNUAL/refresh grant (per the explicit wording above): treat the stated
      grant as already PER-YEAR. Set equityTotal = stated_grant and OMIT
      equityVestingYears. Mention "annual grant" in note.
- A "one year cliff" or "starts vesting after one year" is NOT a vesting
  period — it's just a cliff before the first vest. Do not infer 1yr vest.
- If grant currency differs from base, set "equityCurrency" (don't convert).
- If letter mentions stock but value is missing, omit equityTotal and
  describe in "note".

ONE-TIME BONUSES — combine into signOnBonus:
- "Joining bonus", "Sign-on bonus", "Relocation bonus", "Relocation allowance",
  "Welcome bonus" are all one-time payments. SUM them into signOnBonus and
  list the components in "note" (e.g. "₹2L joining + ₹1L relocation").

NOTE STYLE — write notes for a non-expert audience:
- Plain English, no legal jargon. Say "stock grant" not "common stock".
  Say "RSUs" only if you also explain ("RSUs/restricted shares").
- When components are merged into Sign-on, prefix with "Sign-on →" so the
  user knows where it ended up. Example:
    "Sign-on → ₹1.18L relocation cash + ₹3L grossed-up payout (combined).
     Stock grant: assumed 4yr vesting."
- Keep the whole note under 200 chars; one or two clauses.

OTHER:
- Convert monthly figures to annual (× 12). Do not convert across currencies.
- If currency is ambiguous, omit "currency" and money fields.
- If the document is not an offer letter, return {}.`;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/**
 * Collect every configured Gemini API key in priority order.
 * Supports `GEMINI_API_KEY` (primary) plus numbered fallbacks
 * `GEMINI_API_KEY_2`..`GEMINI_API_KEY_10`. Mirrors the rotation pattern in
 * src/lib/providers/llmRatings.ts so a per-minute throttle or daily-quota hit
 * on the primary key falls through cleanly to a backup key.
 */
function collectGeminiKeys(): string[] {
  const raw: (string | undefined)[] = [process.env.GEMINI_API_KEY];
  for (let i = 2; i <= 10; i++) raw.push(process.env[`GEMINI_API_KEY_${i}`]);
  const keys = raw
    .map((k) => k?.trim())
    .filter((k): k is string => !!k && k.length > 0);
  // Dedupe — someone might paste the same key in two slots.
  return [...new Set(keys)];
}

export interface ExtractError {
  ok: false;
  status: number;
  message: string;
}

export interface ExtractSuccess {
  ok: true;
  data: ExtractedOffer;
}

export type ExtractResult = ExtractSuccess | ExtractError;

/**
 * Extract structured offer fields from an uploaded file.
 * Prefers Gemini (handles PDF + images natively); falls back to Azure OpenAI
 * / GitHub Models vision for images only.
 */
export async function extractOfferFromFile(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractResult> {
  if (!ALLOWED_MIME.has(mimeType)) {
    return {
      ok: false,
      status: 415,
      message: `Unsupported file type: ${mimeType}. Use PDF, PNG, JPG, or WebP.`,
    };
  }
  if (buffer.byteLength > MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `File too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`,
    };
  }

  // Build the candidate provider chain.
  //  - Images: Gemini (native) then Azure OpenAI vision.
  //  - PDFs: Gemini handles them natively, BUT the free Gemini API geo-blocks
  //    some server regions ("User location is not supported"), which is the
  //    case for our Azure host. So for PDFs we FIRST try a region-independent
  //    path — extract the text locally (unpdf) and send it to Azure OpenAI —
  //    then fall back to Gemini's native PDF handling (works in dev / other
  //    regions, and for the rare text-less scanned PDF where local extraction
  //    yields nothing).
  // Multiple Gemini API keys (GEMINI_API_KEY + _2.._10) let one upload survive
  // per-minute rate limits / daily-quota exhaustion. Same pattern as
  // src/lib/providers/llmRatings.ts.
  const isPdf = mimeType === 'application/pdf';
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const azureKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const azureConfigured = Boolean(azureEndpoint && azureKey);
  const candidates: Array<() => Promise<ExtractResult | null> | null> = [];

  // PDF → text → Azure OpenAI, tried first so prod doesn't wait on every
  // geo-blocked Gemini key before falling through.
  if (isPdf && azureConfigured) {
    candidates.push(() => extractPdfTextThenAzure(buffer, azureEndpoint!, azureKey!));
  }

  for (const key of collectGeminiKeys()) {
    candidates.push(() => extractWithGemini(buffer, mimeType, key));
  }

  if (!isPdf && azureConfigured) {
    candidates.push(() => extractWithAzureOpenAI(buffer, mimeType, azureEndpoint!, azureKey!));
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 503,
      message: isPdf
        ? 'PDF parsing requires an AI provider. Set GEMINI_API_KEY or AZURE_OPENAI_* in your environment, or upload a screenshot/photo of the offer instead.'
        : 'No AI provider configured. Set GEMINI_API_KEY (recommended) or AZURE_OPENAI_* for image uploads.',
    };
  }

  let lastError: unknown = null;
  let allRateLimited = true;
  for (const tryProvider of candidates) {
    try {
      const result = await tryProvider();
      if (result) return result;
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if (status !== 429) {
        allRateLimited = false;
        console.warn('[extract] provider failed, trying next:', err);
      } else {
        // 429 is expected on free-tier rate limits / daily quotas — don't
        // log as a scary warning, just rotate to the next key/provider.
        console.info('[extract] provider rate-limited, rotating');
      }
    }
  }

  if (lastError) {
    // Log the real provider error (e.g. Gemini "User location is not
    // supported", Azure deployment issues) for diagnostics — never surface
    // raw provider/JSON messages to the end user.
    console.error('[extract] all providers failed:', lastError);
  }

  return {
    ok: false,
    status: allRateLimited ? 429 : 502,
    message: allRateLimited
      ? 'AI is busy right now. Please wait a minute and try again.'
      : "We couldn't read that file automatically. Please try a clear screenshot/photo of the offer, or enter the details manually.",
  };
}

async function extractWithGemini(
  buffer: Buffer,
  mimeType: string,
  apiKey: string,
): Promise<ExtractResult> {
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.AI_MODEL?.toLowerCase().startsWith('gemini')
    ? process.env.AI_MODEL!
    : 'gemini-2.5-flash';

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: buffer.toString('base64'),
            },
          },
          { text: 'Extract the offer fields per the system schema. Return JSON only.' },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.05,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text ?? '';
  return parseJsonResult(text);
}

async function extractWithAzureOpenAI(
  buffer: Buffer,
  mimeType: string,
  endpoint: string,
  apiKey: string,
): Promise<ExtractResult> {
  const deployment =
    process.env.AZURE_OPENAI_DEPLOYMENT ?? process.env.AI_MODEL ?? 'gpt-4o-mini';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21';
  const client = new OpenAI({
    apiKey,
    baseURL: `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': apiKey },
  });
  return openAiVisionExtract(client, deployment, buffer, mimeType);
}

/** Min chars of extracted PDF text to consider it a real (non-scanned) PDF. */
const MIN_PDF_TEXT_CHARS = 40;
/** Cap the text sent to the LLM. Offer terms are always near the top; this
 *  keeps token cost bounded for long multi-page contracts. */
const MAX_PDF_TEXT_CHARS = 60_000;

/**
 * Region-independent PDF path: pull the text out of the PDF locally (unpdf,
 * no network) and send it to Azure OpenAI. Returns `null` when the PDF has no
 * extractable text (image-only / scanned) so the caller falls through to the
 * next provider (Gemini vision) or the generic "upload a screenshot" message.
 */
async function extractPdfTextThenAzure(
  buffer: Buffer,
  endpoint: string,
  apiKey: string,
): Promise<ExtractResult | null> {
  let text: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const res = await extractText(pdf, { mergePages: true });
    text = Array.isArray(res.text) ? res.text.join('\n') : res.text;
  } catch (err) {
    // Corrupt/encrypted PDF — let the chain try Gemini next.
    console.warn('[extract] pdf text extraction failed:', err);
    return null;
  }

  const trimmed = text.trim();
  if (trimmed.length < MIN_PDF_TEXT_CHARS) return null; // scanned/image-only

  return extractWithAzureOpenAIText(trimmed.slice(0, MAX_PDF_TEXT_CHARS), endpoint, apiKey);
}

async function extractWithAzureOpenAIText(
  documentText: string,
  endpoint: string,
  apiKey: string,
): Promise<ExtractResult> {
  const deployment =
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ?? process.env.AI_MODEL?.trim() ?? 'gpt-4o-mini';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() ?? '2024-10-21';
  const client = new OpenAI({
    apiKey,
    baseURL: `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': apiKey },
  });
  const completion = await client.chat.completions.create({
    model: deployment,
    temperature: 0.05,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract the offer fields per the system schema from this offer letter text. Return JSON only.\n\n--- OFFER LETTER TEXT ---\n${documentText}`,
      },
    ],
  });
  const text = completion.choices[0]?.message?.content ?? '';
  return parseJsonResult(text);
}

async function openAiVisionExtract(
  client: OpenAI,
  model: string,
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractResult> {
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.05,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the offer fields per the system schema. Return JSON only.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  });
  const text = completion.choices[0]?.message?.content ?? '';
  return parseJsonResult(text);
}

function parseJsonResult(text: string): ExtractResult {
  const cleaned = stripCodeFences(text).trim();
  if (!cleaned) {
    return { ok: false, status: 502, message: 'Empty response from AI.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      ok: false,
      status: 502,
      message: 'AI returned invalid JSON. Try a clearer screenshot or the original PDF.',
    };
  }
  return { ok: true, data: sanitize(parsed) };
}

function stripCodeFences(s: string): string {
  // Some models still wrap JSON in ```json ... ``` despite instructions.
  return s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
}

const WORK_MODES = new Set(['Remote', 'Hybrid', 'Onsite']);

function sanitize(raw: unknown): ExtractedOffer {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: ExtractedOffer = {};

  const str = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t.length > 0 && t.length < 500 ? t : undefined;
  };
  const num = (v: unknown, max = 1e12): number | undefined => {
    const n = typeof v === 'string' ? Number(v.replace(/[, _]/g, '')) : v;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return undefined;
    return n;
  };

  const companyName = str(r.companyName);
  if (companyName) out.companyName = companyName;
  const title = str(r.title);
  if (title) out.title = title;
  const level = str(r.level);
  if (level) out.level = level;
  const location = str(r.location);
  if (location) out.location = location;

  const workMode = str(r.workMode);
  if (workMode && WORK_MODES.has(workMode)) {
    out.workMode = workMode as ExtractedOffer['workMode'];
  }

  const baseSalary = num(r.baseSalary);
  if (baseSalary !== undefined) out.baseSalary = baseSalary;
  const targetBonusPct = num(r.targetBonusPct, 200);
  if (targetBonusPct !== undefined) out.targetBonusPct = targetBonusPct;
  const signOnBonus = num(r.signOnBonus);
  if (signOnBonus !== undefined) out.signOnBonus = signOnBonus;
  const equityTotal = num(r.equityTotal);
  if (equityTotal !== undefined) out.equityTotal = equityTotal;
  const equityVestingYears = num(r.equityVestingYears, 20);
  if (equityVestingYears !== undefined && equityVestingYears > 0) {
    out.equityVestingYears = equityVestingYears;
  }
  const equityCurrency = str(r.equityCurrency);
  if (equityCurrency) out.equityCurrency = equityCurrency.toUpperCase().slice(0, 8);
  const benefitsValueAnnual = num(r.benefitsValueAnnual);
  if (benefitsValueAnnual !== undefined) out.benefitsValueAnnual = benefitsValueAnnual;

  const currency = str(r.currency);
  if (currency) out.currency = currency.toUpperCase().slice(0, 8);
  const note = str(r.note);
  if (note) out.note = note;

  return out;
}

export const __test = { sanitize, parseJsonResult, stripCodeFences };
