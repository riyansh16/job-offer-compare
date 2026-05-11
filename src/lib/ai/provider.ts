import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

export interface AiProvider {
  readonly model: string;
  generate(opts: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): AsyncIterable<string>;
}

class GitHubModelsProvider implements AiProvider {
  readonly model: string;
  private client: OpenAI;

  constructor(model: string, token: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey: token,
      baseURL: 'https://models.inference.ai.azure.com',
    });
  }

  async *generate(opts: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      max_tokens: opts.maxTokens ?? 700,
      temperature: opts.temperature ?? 0.4,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

class AzureOpenAiProvider implements AiProvider {
  readonly model: string;
  private client: OpenAI;

  constructor(model: string, endpoint: string, apiKey: string, apiVersion: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey,
      baseURL: `${endpoint.replace(/\/$/, '')}/openai/deployments/${model}`,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': apiKey },
    });
  }

  async *generate(opts: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      max_tokens: opts.maxTokens ?? 700,
      temperature: opts.temperature ?? 0.4,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

let cached: AiProvider | null = null;

class GeminiProvider implements AiProvider {
  readonly model: string;
  private client: GoogleGenAI;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.client = new GoogleGenAI({ apiKey });
  }

  async *generate(opts: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): AsyncIterable<string> {
    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxTokens ?? 700,
      },
    });
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }
}

/**
 * AI is enabled if AI_ENABLED=true OR if a GEMINI_API_KEY is present.
 * Gemini is the path of least friction: a single env var unlocks everything.
 */
export function isAiEnabled(): boolean {
  if (process.env.AI_ENABLED === 'true') return true;
  // Auto-enable if a Gemini key is configured (already used by the rating refresher).
  if (process.env.GEMINI_API_KEY) return true;
  return false;
}

/** Returns the configured AI provider, or null if AI is disabled / unconfigured. */
export function getAiProvider(): AiProvider | null {
  if (!isAiEnabled()) return null;
  if (cached) return cached;

  // Try the explicit AI_PROVIDER first; if its creds are missing, fall through
  // to whichever provider IS configured. Order of preference for auto-pick:
  //   1. Azure OpenAI  — fastest, no rate-limit concerns when on a paid plan
  //   2. Gemini        — free tier, but limited (20 grounded RPD)
  //   3. GitHub Models — free fallback
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  const candidates: string[] = explicit
    ? [explicit, 'azure-openai', 'gemini', 'github-models']
    : process.env.AZURE_OPENAI_API_KEY
      ? ['azure-openai', 'gemini', 'github-models']
      : process.env.GEMINI_API_KEY
        ? ['gemini', 'azure-openai', 'github-models']
        : ['github-models', 'azure-openai', 'gemini'];

  for (const provider of candidates) {
    const built = tryBuildProvider(provider);
    if (built) {
      cached = built;
      return cached;
    }
  }
  return null;
}

function tryBuildProvider(provider: string): AiProvider | null {
  // Use AI_MODEL only when it's compatible with the provider; otherwise the
  // provider's own default. Prevents "gpt-4o-mini not found" when AI_MODEL
  // was set for OpenAI/GitHub Models but Gemini is being used.
  const envModel = process.env.AI_MODEL;
  const model =
    envModel && isModelCompatible(provider, envModel)
      ? envModel
      : defaultModelFor(provider);

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GeminiProvider(model, key);
  }

  if (provider === 'azure-openai') {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const key = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? model;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21';
    if (!endpoint || !key) return null;
    return new AzureOpenAiProvider(deployment, endpoint, key, apiVersion);
  }

  if (provider === 'github-models') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return null;
    return new GitHubModelsProvider(model, token);
  }

  return null;
}

function isModelCompatible(provider: string, model: string): boolean {
  const m = model.toLowerCase();
  if (provider === 'gemini') return m.startsWith('gemini');
  // OpenAI-style models work for both github-models and azure-openai.
  if (provider === 'github-models' || provider === 'azure-openai') {
    return !m.startsWith('gemini');
  }
  return true;
}

function defaultModelFor(provider: string): string {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'azure-openai':
      return 'gpt-4o-mini';
    default:
      return 'gpt-4o-mini';
  }
}
