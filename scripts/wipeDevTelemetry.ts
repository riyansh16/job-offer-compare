/**
 * Wipe dev/test telemetry from the database so production analytics start clean.
 *
 * Deletes:
 *   - User  (cascades to Account, Session, JobOffer, Compensation, Comparison,
 *            AiInsight, user-owned WeightProfile via Prisma onDelete: Cascade)
 *   - VerificationToken (no cascade — wiped explicitly)
 *
 * Preserves:
 *   - Company (293-row catalog with ratings, layoffs, stock data)
 *   - ReviewSentiment (per-company cached signals)
 *   - WeightProfile where userId IS NULL (system presets)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/wipeDevTelemetry.ts            # dry-run
 *   npx tsx --env-file=.env.local scripts/wipeDevTelemetry.ts --confirm  # do it
 *
 * IRREVERSIBLE — only run when you're sure prod has zero real users yet.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function counts() {
  const [
    users, accounts, sessions, verificationTokens,
    offers, compensations, comparisons, aiInsights,
    userWeightProfiles, presetWeightProfiles,
    companies, sentiments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.session.count(),
    prisma.verificationToken.count(),
    prisma.jobOffer.count(),
    prisma.compensation.count(),
    prisma.comparison.count(),
    prisma.aiInsight.count(),
    prisma.weightProfile.count({ where: { userId: { not: null } } }),
    prisma.weightProfile.count({ where: { userId: null } }),
    prisma.company.count(),
    prisma.reviewSentiment.count(),
  ]);
  return {
    'WIPE: User': users,
    'WIPE: Account (cascade)': accounts,
    'WIPE: Session (cascade)': sessions,
    'WIPE: VerificationToken': verificationTokens,
    'WIPE: JobOffer (cascade)': offers,
    'WIPE: Compensation (cascade)': compensations,
    'WIPE: Comparison (cascade)': comparisons,
    'WIPE: AiInsight (cascade)': aiInsights,
    'WIPE: WeightProfile user-owned (cascade)': userWeightProfiles,
    'KEEP: WeightProfile presets': presetWeightProfiles,
    'KEEP: Company': companies,
    'KEEP: ReviewSentiment': sentiments,
  };
}

function fmt(obj: Record<string, number>): string {
  const w = Math.max(...Object.keys(obj).map((k) => k.length));
  return Object.entries(obj)
    .map(([k, v]) => `  ${k.padEnd(w)}  ${v}`)
    .join('\n');
}

async function main() {
  const confirm = process.argv.includes('--confirm');

  console.log('Current row counts:');
  console.log(fmt(await counts()));

  if (!confirm) {
    console.log('\n[DRY RUN] Re-run with --confirm to actually delete.');
    return;
  }

  console.log('\n--confirm flag set. Deleting...');
  // Cascade does the heavy lifting; explicit deleteMany on VerificationToken.
  const [delTokens, delUsers] = await prisma.$transaction([
    prisma.verificationToken.deleteMany({}),
    prisma.user.deleteMany({}),
  ]);
  console.log(`  VerificationToken deleted: ${delTokens.count}`);
  console.log(`  User deleted:             ${delUsers.count} (cascades to Account/Session/JobOffer/Compensation/Comparison/AiInsight/WeightProfile)`);

  console.log('\nPost-wipe row counts:');
  console.log(fmt(await counts()));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
