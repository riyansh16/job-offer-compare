import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

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
  ptoDays?: number;
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
  "ptoDays":            number,                 // total annual PTO/leave days
  "currency":           string,                 // ISO 4217 of base salary
  "note":               string                  // 1-line caveat (cliff, refresh, RSU vs option, components rolled together, etc.)
}

Rules:
- Output ONE JSON object and nothing else. No markdown.
- Only include a field if the document clearly states it. Never guess.

EQUITY / STOCK — look carefully, this is commonly missed:
- Sections titled "On-Hire Stock Award", "Stock Award", "RSU Grant", "Equity",
  "Restricted Stock Units", "Long Term Incentive", "LTI", "ESPP grant",
  "shares of [Company] common stock" all describe equity.
- If the letter says "X (USD/INR) divided by closing stock price" or "shares
  worth X", that X IS the total grant value. Use it.
- If vesting years aren't stated, assume 4 (industry standard for FAANG/MSFT)
  and put "assumed 4yr vesting" in "note".
- equityTotal = total_grant / equityVestingYears. ALWAYS annualize.
- If grant currency differs from base, set "equityCurrency" (don't convert).
- If letter mentions stock but value is missing, still set equityVestingYears
  if known, and put the description in "note".

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

  // Build the candidate provider chain. Gemini is the only provider that
  // handles PDFs natively; Azure OpenAI is images-only.
  // For Gemini we accept multiple API keys (GEMINI_API_KEY + _2.._10) so a
  // single user upload can survive per-minute rate limits or daily-quota
  // exhaustion on the primary key. Same pattern as src/lib/providers/llmRatings.ts.
  const isPdf = mimeType === 'application/pdf';
  const candidates: Array<() => Promise<ExtractResult> | null> = [];

  for (const key of collectGeminiKeys()) {
    candidates.push(() => extractWithGemini(buffer, mimeType, key));
  }

  if (!isPdf) {
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureKey = process.env.AZURE_OPENAI_API_KEY;
    if (azureEndpoint && azureKey) {
      candidates.push(() => extractWithAzureOpenAI(buffer, mimeType, azureEndpoint, azureKey));
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 503,
      message: isPdf
        ? 'PDF parsing requires GEMINI_API_KEY. Set it in your environment, or upload a screenshot/photo of the offer instead.'
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

  return {
    ok: false,
    status: allRateLimited ? 429 : 502,
    message: allRateLimited
      ? 'AI rate limit hit on every configured key. Try again in a minute, or add another GEMINI_API_KEY_2..10 to your environment.'
      : 'All configured AI providers failed. ' +
        (lastError instanceof Error ? lastError.message : 'Try again or use a different file.'),
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
  const ptoDays = num(r.ptoDays, 365);
  if (ptoDays !== undefined) out.ptoDays = Math.round(ptoDays);

  const currency = str(r.currency);
  if (currency) out.currency = currency.toUpperCase().slice(0, 8);
  const note = str(r.note);
  if (note) out.note = note;

  return out;
}

export const __test = { sanitize, parseJsonResult, stripCodeFences };
