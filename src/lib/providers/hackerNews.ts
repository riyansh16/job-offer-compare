/**
 * Hacker News company sentiment via the free Algolia HN search API.
 * No auth required. Endpoint: https://hn.algolia.com/api/v1/search
 *
 * We search recent comments mentioning the company name, then use the
 * vader-sentiment library to score sentiment locally (no extra API calls).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vader = require('vader-sentiment') as {
  SentimentIntensityAnalyzer: { polarity_scores: (text: string) => { compound: number } };
};

export interface HnSentimentResult {
  source: 'HackerNews';
  score: number; // -1..1
  sampleSize: number;
  summary: string;
}

interface HnHit {
  comment_text?: string;
  story_text?: string;
  title?: string;
  created_at?: string;
}

const ENDPOINT = 'https://hn.algolia.com/api/v1/search_by_date';

export async function fetchHackerNewsSentiment(query: string): Promise<HnSentimentResult | null> {
  const q = encodeURIComponent(query);
  const url = `${ENDPOINT}?query=${q}&tags=comment&hitsPerPage=50`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { hits?: HnHit[] };
  const texts = (data.hits ?? [])
    .map((h) => stripHtml(h.comment_text ?? h.story_text ?? h.title ?? ''))
    .filter((t) => t.length > 30);

  if (texts.length === 0) {
    return { source: 'HackerNews', score: 0, sampleSize: 0, summary: 'No HN discussion found.' };
  }

  const scores = texts.map((t) => vader.SentimentIntensityAnalyzer.polarity_scores(t).compound);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    source: 'HackerNews',
    score: Number(avg.toFixed(3)),
    sampleSize: texts.length,
    summary: `Aggregated from ${texts.length} HN comments.`,
  };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
