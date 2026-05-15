import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

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
  signOnBonus?: number;
  /** Annualized vesting value (one year), not the total grant. */
  equityTotal?: number;
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
  "level":              string,                 // e.g. "L5", "Senior", "SDE II"
  "location":           string,                 // "City, State/Country" or "Remote"
  "workMode":           "Remote"|"Hybrid"|"Onsite",
  "baseSalary":         number,                 // ANNUAL base, in detected currency
  "targetBonusPct":     number,                 // % of base, e.g. 15 means 15%
  "signOnBonus":        number,                 // one-time, in detected currency
  "equityTotal":        number,                 // annualized vesting (total grant ÷ vesting years)
  "benefitsValueAnnual": number,                // optional, only if document states a $/₹ value
  "ptoDays":            number,                 // total annual PTO/leave days
  "currency":           string,                 // ISO 4217 code: "INR", "USD", "EUR", ...
  "note":               string                  // 1-line caveat (cliff, refresh, RSU vs option, etc.)
}

Rules:
- Output ONE JSON object and nothing else. No markdown.
- Only include a field if the document clearly states it. Never guess.
- For equity, if the letter shows a total grant over N years, return total/N
  in equityTotal and explain in "note" (e.g. "₹60L total over 4yr").
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
 * Prefers Gemini (handles PDF + images natively); falls back to OpenAI/Azure
 * vision for images only.
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

  // Build the candidate provider chain. Order is "tries that can handle this
  // file" first — PDFs need Gemini / Anthropic / OpenAI direct (all support
  // documents); Azure OpenAI and GitHub Models are images-only.
  const isPdf = mimeType === 'application/pdf';
  const candidates: Array<() => Promise<ExtractResult> | null> = [];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    candidates.push(() => extractWithGemini(buffer, mimeType, geminiKey));
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    candidates.push(() => extractWithAnthropic(buffer, mimeType, anthropicKey));
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    candidates.push(() => extractWithOpenAI(buffer, mimeType, openaiKey));
  }

  if (!isPdf) {
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureKey = process.env.AZURE_OPENAI_API_KEY;
    if (azureEndpoint && azureKey) {
      candidates.push(() => extractWithAzureOpenAI(buffer, mimeType, azureEndpoint, azureKey));
    }
    const ghToken = process.env.GITHUB_TOKEN;
    if (ghToken) {
      candidates.push(() => extractWithGitHubModels(buffer, mimeType, ghToken));
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 503,
      message: isPdf
        ? 'No PDF-capable AI provider configured. Set one of: GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.'
        : 'No AI provider configured. Set one of: GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, AZURE_OPENAI_*, or GITHUB_TOKEN.',
    };
  }

  let lastError: unknown = null;
  for (const tryProvider of candidates) {
    try {
      const result = await tryProvider();
      if (result) return result;
    } catch (err) {
      lastError = err;
      console.warn('[extract] provider failed, trying next:', err);
    }
  }

  return {
    ok: false,
    status: 502,
    message:
      'All configured AI providers failed. ' +
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

async function extractWithOpenAI(
  buffer: Buffer,
  mimeType: string,
  apiKey: string,
): Promise<ExtractResult> {
  const model =
    process.env.AI_MODEL && !process.env.AI_MODEL.toLowerCase().startsWith('gemini') &&
    !process.env.AI_MODEL.toLowerCase().startsWith('claude')
      ? process.env.AI_MODEL
      : 'gpt-4o-mini';
  const client = new OpenAI({ apiKey });

  // PDFs use OpenAI's "input_file" content part on the Responses API. Chat
  // completions only accept images, so we branch on mime type.
  if (mimeType === 'application/pdf') {
    const response = await client.responses.create({
      model,
      temperature: 0.05,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'offer.pdf',
              file_data: `data:application/pdf;base64,${buffer.toString('base64')}`,
            },
            {
              type: 'input_text',
              text: 'Extract the offer fields per the system schema. Return JSON only.',
            },
          ],
        },
      ],
    });
    return parseJsonResult(response.output_text ?? '');
  }

  return openAiVisionExtract(client, model, buffer, mimeType);
}

async function extractWithAnthropic(
  buffer: Buffer,
  mimeType: string,
  apiKey: string,
): Promise<ExtractResult> {
  const model =
    process.env.AI_MODEL?.toLowerCase().startsWith('claude')
      ? process.env.AI_MODEL!
      : 'claude-3-5-sonnet-latest';
  const client = new Anthropic({ apiKey });

  // Claude accepts images and PDFs as base64 source blocks. PDFs use
  // type:'document'; images use type:'image'. Both share the same
  // base64-source shape.
  const fileBlock =
    mimeType === 'application/pdf'
      ? ({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: buffer.toString('base64'),
          },
        } as const)
      : ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
            data: buffer.toString('base64'),
          },
        } as const);

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0.05,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          fileBlock,
          {
            type: 'text',
            text: 'Extract the offer fields per the system schema. Return JSON only — no markdown, no prose.',
          },
        ],
      },
    ],
  });

  // Concatenate any text blocks in the response. Claude returns an array of
  // content blocks; we only care about text ones.
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
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

async function extractWithGitHubModels(
  buffer: Buffer,
  mimeType: string,
  token: string,
): Promise<ExtractResult> {
  const model =
    process.env.AI_MODEL && !process.env.AI_MODEL.toLowerCase().startsWith('gemini')
      ? process.env.AI_MODEL
      : 'gpt-4o-mini';
  const client = new OpenAI({
    apiKey: token,
    baseURL: 'https://models.inference.ai.azure.com',
  });
  return openAiVisionExtract(client, model, buffer, mimeType);
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
