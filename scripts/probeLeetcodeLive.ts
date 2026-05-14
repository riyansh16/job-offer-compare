/**
 * Live LeetCode compensation search via the new ugcArticleDiscussionArticles
 * endpoint (replaces the frozen legacy categoryTopicList).
 *
 * Filters in order: company → designation → India → comp-only → yoe (±1y).
 *
 * Usage:
 *   npx tsx scripts/probeLeetcodeLive.ts <company> [designation] [yoe] [--limit N] [--debug]
 */
export {};

const LC = 'https://leetcode.com/graphql/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

interface Topic {
  uuid: string;
  topicId: number | null;
  title: string;
  slug: string;
  url: string;
  createdAt?: string;
  hitCount?: number;
}

interface Args {
  company: string;
  designation: string | null;
  yoe: number | null;
  limit: number;
  debug: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let limit = 30;
  let debug = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit' || a === '-n') {
      limit = parseInt(argv[++i] ?? '30', 10);
    } else if (a === '--debug' || a === '-d') {
      debug = true;
    } else {
      positional.push(a);
    }
  }
  if (positional.length === 0) {
    console.error(
      'Usage: npx tsx scripts/probeLeetcodeLive.ts <company> [designation] [yoe] [--limit N] [--debug]',
    );
    process.exit(1);
  }
  const company = positional[0];
  let designation: string | null = null;
  let yoe: number | null = null;
  const isNumeric = (s: string) => /^\d+(?:\.\d+)?$/.test(s);
  if (positional[1] !== undefined) {
    if (isNumeric(positional[1])) yoe = Number(positional[1]);
    else designation = positional[1];
  }
  if (positional[2] !== undefined && yoe === null) {
    yoe = Number(positional[2]);
  }
  return { company, designation, yoe, limit, debug };
}

async function fetchLive(
  keywords: string[],
  first: number,
  skip: number,
  debug: boolean,
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
        edges {
          node {
            uuid
            topicId
            title
            slug
            createdAt
            hitCount
          }
        }
      }
    }
  `;

  const res = await fetch(LC, {
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

  if (!res.ok) {
    if (debug) console.error('[live] HTTP', res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as any;
  if (json.errors) {
    if (debug) console.error('[live] errors:', JSON.stringify(json.errors));
    return null;
  }
  const block = json?.data?.ugcArticleDiscussionArticles;
  if (!block) return null;

  const topics: Topic[] = (block.edges ?? []).map((e: any) => {
    const slug = String(e.node.slug ?? '');
    const topicId =
      typeof e.node.topicId === 'number' ? e.node.topicId : null;
    // Canonical URL: /discuss/post/<topicId>/<slug>/. LeetCode also accepts
    // the slug-only form, but the numeric form is more robust.
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
      createdAt: e.node.createdAt,
      hitCount: e.node.hitCount,
    };
  });
  return { topics, totalNum: Number(block.totalNum ?? topics.length) };
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

function matchesCompany(title: string, company: string): boolean {
  const t = title.toLowerCase();
  const c = company.toLowerCase();
  if (t.includes(c)) return true;
  const tokens = c.split(/\s+/).filter((x) => x.length >= 2);
  return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
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

  // L4 ↔ level 4
  const lvl = d.match(/^l\s*(\d{1,2})$/);
  if (lvl) {
    out.add(`l${lvl[1]}`);
    out.add(`level ${lvl[1]}`);
  }

  const roman: Record<string, string> = {
    '1': 'i',
    '2': 'ii',
    '3': 'iii',
    '4': 'iv',
    '5': 'v',
  };
  const arabic: Record<string, string> = {
    i: '1',
    ii: '2',
    iii: '3',
    iv: '4',
    v: '5',
  };

  // Helper: register every spelling we know for a given (role, num) pair.
  const addRoleNumVariants = (role: string, num: string) => {
    const numNorm = roman[num] ?? num;
    const numNumeric = arabic[num] ?? num;
    for (const n of new Set([num, numNorm, numNumeric])) {
      out.add(`${role}-${n}`);
      out.add(`${role} ${n}`);
      out.add(`${role}${n}`);
    }
  };

  // SDE-2 / SWE-2 / SSE-2 / IC-2 family.
  // All of these are also synonymous with "Software Engineer 2" and
  // "Software Developer 2" per the user's request.
  const sde = d.match(/^(sde|swe|sse|ic)[-\s]?(\d|i{1,3}|iv|v)$/i);
  if (sde) {
    const role = sde[1].toLowerCase();
    const num = sde[2].toLowerCase();
    addRoleNumVariants(role, num);
    addRoleNumVariants('software engineer', num);
    addRoleNumVariants('software developer', num);
    return [...out];
  }

  // "Software Engineer 2" / "Software Developer II" — reverse direction.
  const longForm = d.match(
    /^software\s+(engineer|developer)\s*[-\s]?\s*(\d|i{1,3}|iv|v)$/i,
  );
  if (longForm) {
    const num = longForm[2].toLowerCase();
    addRoleNumVariants(`software ${longForm[1].toLowerCase()}`, num);
    // Backfill SDE/SWE codes so titles like "Microsoft SDE2" still match.
    for (const role of ['sde', 'swe', 'sse']) addRoleNumVariants(role, num);
    return [...out];
  }

  // Adobe-family: CS1 / CS2 / CS3 / CS4 ↔ "Computer Scientist N".
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

  // Salesforce/VMware MTS ladder.
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

  // Generic "Associate <role>" / "Junior <role>".
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

// --- India / location filter --------------------------------------------
// Positive signals: explicit "India" or any common Indian metro, plus
// India-specific compensation markers (LPA, lakh, crore, ₹).
const INDIA_TOKENS = [
  'india',
  'indian',
  'bangalore',
  'bengaluru',
  'blr',
  'hyderabad',
  'hyd',
  'pune',
  'chennai',
  'madras',
  'mumbai',
  'bombay',
  'delhi',
  'ncr',
  'gurgaon',
  'gurugram',
  'ggn',
  'noida',
  'kolkata',
  'calcutta',
  'ahmedabad',
  'kochi',
  'cochin',
  'trivandrum',
  'coimbatore',
  'jaipur',
  'indore',
  'lpa',
  'lakh',
  'lakhs',
  'crore',
  'crores',
  'inr',
  '₹',
];

// Foreign-location markers. If a title clearly names a non-India location
// AND has no India signal, drop it.
const FOREIGN_TOKENS = [
  'usa',
  'united states',
  'canada',
  'uk',
  'england',
  'britain',
  'ireland',
  'germany',
  'berlin',
  'munich',
  'switzerland',
  'zurich',
  'geneva',
  'netherlands',
  'amsterdam',
  'france',
  'paris',
  'poland',
  'warsaw',
  'krakow',
  'australia',
  'sydney',
  'melbourne',
  'singapore',
  'dubai',
  'uae',
  'abu dhabi',
  'seattle',
  'redmond',
  'bellevue',
  'bay area',
  'san francisco',
  'sunnyvale',
  'mountain view',
  'palo alto',
  'new york',
  'nyc',
  'boston',
  'austin',
  'chicago',
  'atlanta',
  'durham',
  'toronto',
  'vancouver',
  'montreal',
  'london',
  'manchester',
];

function hasToken(text: string, token: string): boolean {
  // Word-boundary match for ASCII tokens; substring for symbols (e.g. ₹).
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
  const hasIndia = INDIA_TOKENS.some((tok) => hasToken(t, tok));
  if (hasIndia) return true;
  const hasForeign = FOREIGN_TOKENS.some((tok) => hasToken(t, tok));
  if (hasForeign) return false;
  // Ambiguous (no location at all). Keep — many India posts omit location.
  return true;
}

// Exclude posts that are clearly NOT compensation reports — interview
// experience write-ups, OA / online-assessment threads, generic timeline
// posts, referral asks, hiring-committee / pass-rate questions, etc.
const EXCLUDE_RE =
  /\b(?:interview\s+experience|interview\s+process|interview\s+question|interview\s+query|interview\s+round|interview\s+timeline|hiring\s+experience|hiring\s+timeline|hiring\s+committee|hiring\s+commitee|pass\s*rate|application\s+timeline|timeline\s+only|oa\b|online\s+assessment|referral|chances?\b|asked\s+in|preparation|preparing|coding\s+round)\b/i;

function isExcluded(title: string): boolean {
  return EXCLUDE_RE.test(title);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[live] company="${args.company}" designation="${args.designation ?? 'any'}" ` +
      `yoe=${args.yoe ?? 'any'} limit=${args.limit}`,
  );

  // Paginate until we have at least TARGET_MIN final results, or we hit
  // MAX_PAGES, or the server runs out. Page size is fixed at 100 (LC's
  // typical max for this op).
  const TARGET_MIN = Math.min(3, args.limit);
  const PAGE_SIZE = 100;
  const MAX_PAGES = 10;

  const all: Topic[] = [];
  const seen = new Set<string>();
  let totalNum = 0;
  let page = 0;

  // We track funnel counts incrementally so the diagnostic line still works.
  let nCompany = 0;
  let nDesignation = 0;
  let nIndia = 0;
  let nExclude = 0;
  let nYoe = 0;
  let final: Topic[] = [];

  while (page < MAX_PAGES) {
    const result = await fetchLive(
      [args.company],
      PAGE_SIZE,
      page * PAGE_SIZE,
      args.debug,
    );
    if (!result) {
      console.error('[live] fetch failed on page', page);
      break;
    }
    if (page === 0) totalNum = result.totalNum;
    if (result.topics.length === 0) break;

    for (const t of result.topics) {
      if (!seen.has(t.uuid)) {
        seen.add(t.uuid);
        all.push(t);
      }
    }

    // Re-run the funnel on the accumulated set (cheap: pure string ops).
    const afterCompany = all.filter((t) =>
      matchesCompany(t.title, args.company),
    );
    const afterDesignation = args.designation
      ? afterCompany.filter((t) =>
          matchesDesignation(t.title, args.designation!),
        )
      : afterCompany;
    const afterIndia = afterDesignation.filter((t) => matchesIndia(t.title));
    const afterExclude = afterIndia.filter((t) => !isExcluded(t.title));
    const afterYoe =
      args.yoe !== null
        ? afterExclude.filter((t) => {
            const y = extractYoeFromTitle(t.title);
            // Per spec: keep posts that don't have a YoE in their title.
            // Only drop when an explicit YoE is present and outside ±1y.
            if (y === null) return true;
            return Math.abs(y - args.yoe!) <= 1;
          })
        : afterExclude;

    nCompany = afterCompany.length;
    nDesignation = afterDesignation.length;
    nIndia = afterIndia.length;
    nExclude = afterExclude.length;
    nYoe = afterYoe.length;
    final = afterYoe;

    page++;
    if (final.length >= TARGET_MIN) break;
    if (all.length >= totalNum) break;
  }

  console.log(
    `[live] fetched ${all.length} / ${totalNum} across ${page} page(s)`,
  );

  const top = final.slice(0, args.limit);
  console.log(
    `\n=== Funnel: raw=${all.length} ` +
      `→ company=${nCompany} ` +
      `→ designation=${nDesignation} ` +
      `→ india=${nIndia} ` +
      `→ comp-only=${nExclude} ` +
      `→ yoe=${nYoe} ` +
      `→ shown=${top.length} ===\n`,
  );

  for (const t of top) {
    const y = extractYoeFromTitle(t.title);
    const meta = [
      y !== null ? `yoe=${y}` : 'yoe=?',
      t.hitCount !== undefined ? `hits=${t.hitCount}` : null,
      t.createdAt ? t.createdAt.slice(0, 10) : null,
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`- ${t.title}`);
    console.log(`  ${t.url}  [${meta}]`);
  }

  if (args.debug && top.length === 0 && all.length > 0) {
    console.log('\n[debug] sample raw titles:');
    for (const t of all.slice(0, 10)) console.log('  -', t.title);
  }
}

main().catch((err) => {
  console.error('[live] fatal:', err);
  process.exit(1);
});
