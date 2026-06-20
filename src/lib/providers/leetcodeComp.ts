/**
 * LeetCode compensation post discovery.
 *
 * Fetches links to LeetCode discussion posts that match `(company, designation,
 * yoe)`, scoped to India, filtered to compensation-only content. Returns just
 * the titles + URLs + dates — no post-body extraction (LeetCode is behind
 * Cloudflare; bodies would need a headless browser).
 *
 * See docs/LEETCODE-COMP-PROBE.md for the full design notes.
 *
 * In-memory caching: results are cached for 24h per `(company|designation|yoe)`
 * key so multiple visits to a comparison page don't re-hit LeetCode.
 */

const LC = 'https://leetcode.com/graphql/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

export interface LeetcodeCompPost {
  title: string;
  url: string;
  /** ISO date when the post was created, or null if missing. */
  createdAt: string | null;
  /** YoE parsed from the title, or null if no explicit value. */
  yoeFromTitle: number | null;
  hitCount: number | null;
}

export interface FetchCompOptions {
  company: string;
  /** Job level / title (e.g. "L4", "SDE-2", "Software Engineer 2"). Optional.
   *  Pass either a single string or an array — a post matches if it satisfies
   *  ANY of the designations (so [level, title] catches both "L5" and "Senior SWE"
   *  in titles). */
  designation?: string | string[] | null;
  /** Years of experience. Posts with explicit YoE outside ±1y are dropped. */
  yoe?: number | null;
  /** Maximum posts to return after filtering. Default 5. */
  limit?: number;
}

interface Topic {
  uuid: string;
  topicId: number | null;
  title: string;
  slug: string;
  url: string;
  createdAt?: string;
  hitCount?: number;
}

interface CacheEntry {
  fetchedAt: number;
  posts: LeetcodeCompPost[];
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

/**
 * Fetch compensation posts. Returns [] when LeetCode is unreachable or no
 * posts pass the filter funnel — never throws.
 */
export async function fetchLeetcodeComps(
  opts: FetchCompOptions,
): Promise<LeetcodeCompPost[]> {
  const company = opts.company.trim();
  if (!company) return [];
  const rawDesignations = Array.isArray(opts.designation)
    ? opts.designation
    : opts.designation
      ? [opts.designation]
      : [];
  const designations = Array.from(
    new Set(
      rawDesignations
        .map((d) => d?.trim())
        .filter((d): d is string => !!d && d.length > 0),
    ),
  );
  const yoe =
    opts.yoe != null && Number.isFinite(opts.yoe) ? Number(opts.yoe) : null;
  const limit = Math.max(1, Math.min(20, opts.limit ?? 5));

  const cacheKey = `${company.toLowerCase()}|${designations
    .map((d) => d.toLowerCase())
    .sort()
    .join(',')}|${yoe ?? ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.posts.slice(0, limit);
  }

  const TARGET_MIN = Math.min(3, limit);
  const PAGE_SIZE = 100;
  const MAX_PAGES = 5; // tighter than the CLI's 10 — server-side budget

  const all: Topic[] = [];
  const seen = new Set<string>();
  let totalNum = 0;
  let page = 0;
  let final: Topic[] = [];

  while (page < MAX_PAGES) {
    const result = await fetchPage([company], PAGE_SIZE, page * PAGE_SIZE);
    if (!result) break;
    if (page === 0) totalNum = result.totalNum;
    if (result.topics.length === 0) break;

    for (const t of result.topics) {
      if (!seen.has(t.uuid)) {
        seen.add(t.uuid);
        all.push(t);
      }
    }

    final = applyFunnel(all, company, designations, yoe);
    page++;
    if (final.length >= TARGET_MIN) break;
    if (all.length >= totalNum) break;
  }

  const posts: LeetcodeCompPost[] = final.slice(0, limit).map((t) => ({
    title: t.title,
    url: t.url,
    createdAt: t.createdAt ?? null,
    yoeFromTitle: extractYoeFromTitle(t.title),
    hitCount: t.hitCount ?? null,
  }));

  cache.set(cacheKey, { fetchedAt: Date.now(), posts });
  return posts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: GraphQL fetch
// ─────────────────────────────────────────────────────────────────────────────

interface LcEdge {
  node: {
    uuid?: unknown;
    topicId?: unknown;
    title?: unknown;
    slug?: unknown;
    createdAt?: unknown;
    hitCount?: unknown;
  };
}
interface LcResponse {
  data?: {
    ugcArticleDiscussionArticles?: {
      totalNum?: number;
      edges?: LcEdge[];
    };
  };
  errors?: unknown;
}

async function fetchPage(
  keywords: string[],
  first: number,
  skip: number,
): Promise<{ topics: Topic[]; totalNum: number } | null> {
  const query = `
    query ugcArticleDiscussionArticles(
      $orderBy: ArticleOrderByEnum
      $keywords: [String]!
      $tagSlugs: [String!]
      $skip: Int
      $first: Int
    ) {
      ugcArticleDiscussionArticles(
        orderBy: $orderBy
        keywords: $keywords
        tagSlugs: $tagSlugs
        skip: $skip
        first: $first
      ) {
        totalNum
        edges { node { uuid topicId title slug createdAt hitCount } }
      }
    }
  `;

  let res: Response;
  try {
    res = await fetch(LC, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Referer: 'https://leetcode.com/discuss/',
      },
      body: JSON.stringify({
        operationName: 'ugcArticleDiscussionArticles',
        query,
        variables: {
          orderBy: 'MOST_RECENT',
          keywords,
          tagSlugs: ['compensation'],
          skip,
          first,
        },
      }),
    });
  } catch (err) {
    console.warn('[leetcodeComp] fetch error:', err);
    return null;
  }
  if (!res.ok) {
    console.warn('[leetcodeComp] HTTP', res.status);
    return null;
  }
  let json: LcResponse;
  try {
    json = (await res.json()) as LcResponse;
  } catch {
    return null;
  }
  if (json.errors) {
    console.warn('[leetcodeComp] GraphQL errors:', JSON.stringify(json.errors));
    return null;
  }
  const block = json.data?.ugcArticleDiscussionArticles;
  if (!block) return null;

  const topics: Topic[] = (block.edges ?? []).map((e) => {
    const slug = String(e.node.slug ?? '');
    const topicId =
      typeof e.node.topicId === 'number' ? e.node.topicId : null;
    const url =
      topicId !== null
        ? `https://leetcode.com/discuss/post/${topicId}/${slug}/`
        : `https://leetcode.com/discuss/post/${slug}/`;
    return {
      uuid: String(e.node.uuid ?? ''),
      topicId,
      title: String(e.node.title ?? ''),
      slug,
      url,
      createdAt: typeof e.node.createdAt === 'string' ? e.node.createdAt : undefined,
      hitCount: typeof e.node.hitCount === 'number' ? e.node.hitCount : undefined,
    };
  });
  return { topics, totalNum: Number(block.totalNum ?? topics.length) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: filter funnel
// ─────────────────────────────────────────────────────────────────────────────

function applyFunnel(
  all: Topic[],
  company: string,
  designations: string[],
  yoe: number | null,
): Topic[] {
  // A catalog name like "Google (Alphabet)" or "Honasa (Mamaearth)" carries the
  // legal parent in parens. LeetCode titles use one brand or the other, never
  // the combined "Brand (Parent)" string, so match if the title contains EITHER
  // the outside-paren brand OR the inside-paren name.
  const candidates = companyCandidates(company);
  const afterCompany = all.filter((t) =>
    candidates.some((c) => matchesCompany(t.title, c)),
  );
  const afterDesignation =
    designations.length > 0
      ? afterCompany.filter((t) =>
          designations.some((d) => matchesDesignation(t.title, d)),
        )
      : afterCompany;
  const afterIndia = afterDesignation.filter((t) => matchesIndia(t.title));
  const afterExclude = afterIndia.filter((t) => !isExcluded(t.title));
  const afterYoe =
    yoe !== null
      ? afterExclude.filter((t) => {
          const y = extractYoeFromTitle(t.title);
          if (y === null) return true; // no explicit YoE → keep
          return Math.abs(y - yoe) <= 1;
        })
      : afterExclude;
  return afterYoe;
}

function matchesCompany(title: string, company: string): boolean {
  const t = title.toLowerCase();
  const c = company.toLowerCase();
  if (t.includes(c)) return true;
  const tokens = c.split(/\s+/).filter((x) => x.length >= 2);
  return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
}

/**
 * Split a catalog name into the brand names a LeetCode post might actually use.
 * "Google (Alphabet)" → ["Google", "Alphabet"], "Honasa (Mamaearth)" →
 * ["Honasa", "Mamaearth"]. Names without parentheses yield a single candidate.
 * Each candidate is matched independently (OR) so the legal-parent suffix the
 * catalog adds for the offer parser doesn't strand companies with zero matches.
 */
function companyCandidates(company: string): string[] {
  const candidates = new Set<string>();
  const outside = company
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (outside) candidates.add(outside);
  for (const m of company.matchAll(/\(([^)]*)\)/g)) {
    const inside = m[1].trim();
    if (inside) candidates.add(inside);
  }
  if (candidates.size === 0) candidates.add(company.trim());
  return [...candidates];
}

function matchesDesignation(title: string, designation: string): boolean {
  const t = title.toLowerCase();
  const variants = expandDesignation(designation.trim().toLowerCase());
  for (const v of variants) {
    const isCode = v.length <= 4 || /[a-z]\d|\d[a-z]|-/i.test(v);
    if (isCode) {
      const re = new RegExp(
        `(?:^|[^a-z0-9])${escapeRe(v)}(?:[^a-z0-9]|$)`,
        'i',
      );
      if (re.test(t)) return true;
    } else if (t.includes(v)) {
      return true;
    }
  }
  return false;
}

function expandDesignation(d: string): string[] {
  const out = new Set<string>([d]);

  const lvl = d.match(/^l\s*(\d{1,2})$/);
  if (lvl) {
    out.add(`l${lvl[1]}`);
    out.add(`level ${lvl[1]}`);
  }

  // A bare numeric level like "63" entered without the "L" prefix. FAANG-style
  // ladders (Microsoft L63, Google L5, Amazon-not) write it as "L<n>" in post
  // titles, and matchesDesignation treats bare "63" as a code needing a
  // non-alphanumeric boundary -- so "63" never matches "L63". Add the
  // L-prefixed and "level N" forms; the original bare number stays too.
  const bareLevel = d.match(/^(\d{1,3})$/);
  if (bareLevel) {
    out.add(`l${bareLevel[1]}`);
    out.add(`level ${bareLevel[1]}`);
  }

  const roman: Record<string, string> = { '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v' };
  const arabic: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5' };

  const addRoleNumVariants = (role: string, num: string) => {
    const numNorm = roman[num] ?? num;
    const numNumeric = arabic[num] ?? num;
    for (const n of new Set([num, numNorm, numNumeric])) {
      out.add(`${role}-${n}`);
      out.add(`${role} ${n}`);
      out.add(`${role}${n}`);
    }
  };

  const sde = d.match(/^(sde|swe|sse|ic)[-\s]?(\d|i{1,3}|iv|v)$/i);
  if (sde) {
    const role = sde[1].toLowerCase();
    const num = sde[2].toLowerCase();
    addRoleNumVariants(role, num);
    addRoleNumVariants('software engineer', num);
    addRoleNumVariants('software developer', num);
    return [...out];
  }

  const longForm = d.match(
    /^software\s+(engineer|developer)\s*[-\s]?\s*(\d|i{1,3}|iv|v)$/i,
  );
  if (longForm) {
    const num = longForm[2].toLowerCase();
    addRoleNumVariants(`software ${longForm[1].toLowerCase()}`, num);
    for (const role of ['sde', 'swe', 'sse']) addRoleNumVariants(role, num);
    return [...out];
  }

  // Ranked-but-unnumbered titles: "Senior/Staff/Principal/Lead Software
  // Engineer". LeetCode posts abbreviate these freely ("Senior SWE", "Sr SDE",
  // and -- for senior specifically -- the "SSE" code), so the verbatim
  // "senior software engineer" misses them. Emit the abbreviated spellings.
  const rankedSwe = d.match(
    /^(senior|sr|staff|principal|lead)\.?\s+software\s+(engineer|developer)$/i,
  );
  if (rankedSwe) {
    const rank = rankedSwe[1].toLowerCase();
    const isSenior = rank === 'senior' || rank === 'sr';
    const rankWords = isSenior ? ['senior', 'sr'] : [rank];
    for (const r of rankWords) {
      out.add(`${r} software engineer`);
      out.add(`${r} software developer`);
      out.add(`${r} swe`);
      out.add(`${r} sde`);
    }
    if (isSenior) out.add('sse');
    return [...out];
  }

  // Adobe-family: CS1 / CS2 / CS3 / CS4 ↔ "Computer Scientist N".
  // Posts use both spellings; we normalise to the short code AND the long form.
  const cs = d.match(/^cs[-\s]?(\d|i{1,3}|iv|v)$/i);
  if (cs) {
    const num = cs[1].toLowerCase();
    addRoleNumVariants('cs', num);
    addRoleNumVariants('computer scientist', num);
    return [...out];
  }
  const csLong = d.match(/^computer\s+scientist\s*[-\s]?\s*(\d|i{1,3}|iv|v)$/i);
  if (csLong) {
    const num = csLong[1].toLowerCase();
    addRoleNumVariants('cs', num);
    addRoleNumVariants('computer scientist', num);
    return [...out];
  }

  // Salesforce/VMware/etc. MTS ladder. Short codes (AMTS / MTS / SMTS / PMTS /
  // LMTS) ↔ "(Associate|Senior|Principal|Lead) Member of Technical Staff".
  // Treat the prefix as the rank rather than a numeric level — these companies
  // don't use numeric suffixes, so we don't try to expand "MTS-1".
  const mts = d.match(/^(a|s|p|l)?mts$/i);
  if (mts) {
    const prefix = (mts[1] ?? '').toLowerCase();
    const longRank =
      prefix === 'a' ? 'associate '
      : prefix === 's' ? 'senior '
      : prefix === 'p' ? 'principal '
      : prefix === 'l' ? 'lead '
      : '';
    out.add(`${prefix}mts`);
    out.add(`${longRank}member of technical staff`.trim());
    out.add(`${longRank}member of the technical staff`.trim());
    return [...out];
  }
  const mtsLong = d.match(
    /^(associate\s+|senior\s+|principal\s+|lead\s+)?member\s+of\s+(?:the\s+)?technical\s+staff$/i,
  );
  if (mtsLong) {
    const rank = (mtsLong[1] ?? '').trim().toLowerCase();
    const code =
      rank === 'associate' ? 'amts'
      : rank === 'senior' ? 'smts'
      : rank === 'principal' ? 'pmts'
      : rank === 'lead' ? 'lmts'
      : 'mts';
    out.add(code);
    out.add(`${rank ? rank + ' ' : ''}member of technical staff`);
    out.add(`${rank ? rank + ' ' : ''}member of the technical staff`);
    return [...out];
  }

  // Generic "Associate <role>" — common at Adobe, Microsoft, etc.
  const associate = d.match(/^(associate|junior)\s+(engineer|developer|software\s+engineer|software\s+developer)$/i);
  if (associate) {
    const role = associate[2].toLowerCase().replace(/\s+/g, ' ');
    out.add(`${associate[1].toLowerCase()} ${role}`);
    out.add(`associate ${role}`);
    out.add(`junior ${role}`);
    if (role === 'engineer' || role === 'developer') {
      out.add(`associate software ${role}`);
      out.add(`junior software ${role}`);
    }
    return [...out];
  }

  return [...out];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const INDIA_TOKENS = [
  'india', 'indian',
  'bangalore', 'bengaluru', 'blr',
  'hyderabad', 'hyd', 'pune',
  'chennai', 'madras', 'mumbai', 'bombay',
  'delhi', 'ncr', 'gurgaon', 'gurugram', 'ggn', 'noida',
  'kolkata', 'calcutta', 'ahmedabad', 'kochi', 'cochin',
  'trivandrum', 'coimbatore', 'jaipur', 'indore',
  'lpa', 'lakh', 'lakhs', 'crore', 'crores', 'inr', '₹',
];

const FOREIGN_TOKENS = [
  'usa', 'united states', 'canada', 'uk', 'england', 'britain', 'ireland',
  'germany', 'berlin', 'munich', 'switzerland', 'zurich', 'geneva',
  'netherlands', 'amsterdam', 'france', 'paris',
  'poland', 'warsaw', 'krakow', 'australia', 'sydney', 'melbourne',
  'singapore', 'dubai', 'uae', 'abu dhabi',
  'seattle', 'redmond', 'bellevue', 'bay area', 'san francisco', 'sunnyvale',
  'mountain view', 'palo alto', 'new york', 'nyc', 'boston', 'austin',
  'chicago', 'atlanta', 'durham',
  'toronto', 'vancouver', 'montreal',
  'london', 'manchester',
];

function hasToken(text: string, token: string): boolean {
  if (/^[a-z0-9 ]+$/i.test(token)) {
    const re = new RegExp(
      `(?:^|[^a-z0-9])${escapeRe(token)}(?:[^a-z0-9]|$)`,
      'i',
    );
    return re.test(text);
  }
  return text.includes(token);
}

function matchesIndia(title: string): boolean {
  const t = title.toLowerCase();
  if (INDIA_TOKENS.some((tok) => hasToken(t, tok))) return true;
  if (FOREIGN_TOKENS.some((tok) => hasToken(t, tok))) return false;
  return true; // ambiguous → keep
}

const EXCLUDE_RE =
  /\b(?:interview\s+experiences?|interview\s+process|interview\s+question|interview\s+query|interview\s+round|interview\s+timeline|hiring\s+experience|hiring\s+timeline|hiring\s+committee|hiring\s+commitee|pass\s*rate|application\s+timeline|timeline\s+only|oa\b|online\s+assessment|aa\s+round|recruiter\s+(?:gone\s+)?silent|seeking\s+advice|referral|chances?\b|asked\s+in|preparation|preparing|coding\s+round)\b/i;

function isExcluded(title: string): boolean {
  return EXCLUDE_RE.test(title);
}

function extractYoeFromTitle(title: string): number | null {
  const patterns: RegExp[] = [
    /\byoe\s*[:\-]?\s*(\d{1,2}(?:\.\d)?)/i,
    /(\d{1,2}(?:\.\d)?)\s*\+?\s*yoe\b/i,
    /(\d{1,2}(?:\.\d)?)\s*\+?\s*y(?:rs?|ears?)\b/i,
    /\bexp(?:erience)?\s*[:\-]?\s*(\d{1,2}(?:\.\d)?)/i,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 40) return n;
    }
  }
  return null;
}
