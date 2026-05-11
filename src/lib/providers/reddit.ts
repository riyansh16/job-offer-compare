/**
 * Reddit sentiment via the free OAuth API (script app, client credentials flow).
 * Searches relevant career subreddits for the company name and aggregates VADER
 * sentiment. Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET + REDDIT_USER_AGENT.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vader = require('vader-sentiment') as {
  SentimentIntensityAnalyzer: { polarity_scores: (text: string) => { compound: number } };
};

const SUBREDDITS = ['cscareerquestions', 'jobs', 'recruitinghell', 'csMajors', 'ITCareerQuestions'];

export interface RedditSentimentResult {
  source: 'Reddit';
  score: number; // -1..1
  sampleSize: number;
  summary: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const ua = process.env.REDDIT_USER_AGENT ?? 'job-offer-compare/0.1';
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'User-Agent': ua,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

export async function fetchRedditSentiment(companyName: string): Promise<RedditSentimentResult | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const ua = process.env.REDDIT_USER_AGENT ?? 'job-offer-compare/0.1';
  const query = encodeURIComponent(`"${companyName}"`);
  const subs = SUBREDDITS.join('+');
  const url = `https://oauth.reddit.com/r/${subs}/search?q=${query}&restrict_sr=true&limit=50&sort=new`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': ua },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    data?: { children?: { data?: { selftext?: string; title?: string } }[] };
  };
  const texts = (data.data?.children ?? [])
    .map((c) => `${c.data?.title ?? ''} ${c.data?.selftext ?? ''}`.trim())
    .filter((t) => t.length > 30);

  if (texts.length === 0) {
    return {
      source: 'Reddit',
      score: 0,
      sampleSize: 0,
      summary: 'No matching Reddit discussion found.',
    };
  }

  const scores = texts.map((t) => vader.SentimentIntensityAnalyzer.polarity_scores(t).compound);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    source: 'Reddit',
    score: Number(avg.toFixed(3)),
    sampleSize: texts.length,
    summary: `Aggregated from ${texts.length} posts in r/${SUBREDDITS.join(', r/')}.`,
  };
}
