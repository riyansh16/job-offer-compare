'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new Error('Not authenticated');
  return id;
}

// ---------- Offers ----------

const offerSchema = z.object({
  companyId: z.string().min(1),
  title: z.string().min(1),
  level: z.string().optional(),
  location: z.string().min(1),
  isCurrent: z.boolean().optional(),
  baseSalary: z.coerce.number().min(0),
  targetBonusPct: z.coerce.number().min(0).max(200).default(0),
  signOnBonus: z.coerce.number().min(0).default(0),
  equityTotal: z.coerce.number().min(0).default(0),
  benefitsValueAnnual: z.coerce.number().min(0).default(0),
  ptoDays: z.coerce.number().int().min(0).max(365).default(0),
  workMode: z.enum(['Remote', 'Hybrid', 'Onsite']).default('Onsite'),
  commuteCostMonthly: z.coerce.number().min(0).default(0),
  qualitativeScore: z.coerce.number().int().min(0).max(100).default(50),
  // Only collected on the current-role form. Persists to User.yearsExperience
  // on save. Empty string is normalized to undefined so the schema treats it
  // as "not provided".
  yearsExperience: z
    .preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.coerce.number().int().min(0).max(50).optional(),
    ),
});

export async function upsertOffer(id: string | null, formData: FormData) {
  const userId = await requireUserId();
  const raw = Object.fromEntries(formData.entries());
  const data = offerSchema.parse({
    ...raw,
    isCurrent: raw.isCurrent === 'on' || raw.isCurrent === 'true',
  });

  if (data.isCurrent) {
    await prisma.jobOffer.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } });
  }

  if (id) {
    const updated = await prisma.jobOffer.update({
      where: { id },
      data: {
        companyId: data.companyId,
        title: data.title,
        level: data.level,
        location: data.location,
        isCurrent: data.isCurrent ?? false,
        compensation: {
          update: {
            baseSalary: data.baseSalary,
            targetBonusPct: data.targetBonusPct,
            signOnBonus: data.signOnBonus,
            equityTotal: data.equityTotal,
            benefitsValueAnnual: data.benefitsValueAnnual,
            ptoDays: data.ptoDays,
            workMode: data.workMode,
            commuteCostMonthly: data.commuteCostMonthly,
            qualitativeScore: data.qualitativeScore,
          },
        },
      },
    });
    revalidatePath('/dashboard');
    revalidatePath(`/offers/${updated.id}`);
    await maybeUpdateYoe(userId, data);
    return updated;
  }

  const created = await prisma.jobOffer.create({
    data: {
      userId,
      companyId: data.companyId,
      title: data.title,
      level: data.level,
      location: data.location,
      isCurrent: data.isCurrent ?? false,
      compensation: {
        create: {
          baseSalary: data.baseSalary,
          targetBonusPct: data.targetBonusPct,
          signOnBonus: data.signOnBonus,
          equityTotal: data.equityTotal,
          benefitsValueAnnual: data.benefitsValueAnnual,
          ptoDays: data.ptoDays,
          workMode: data.workMode,
          commuteCostMonthly: data.commuteCostMonthly,
          qualitativeScore: data.qualitativeScore,
        },
      },
    },
  });
  await maybeUpdateYoe(userId, data);
  revalidatePath('/dashboard');
  return created;
}

/** Persist yearsExperience to the user row when the form was the current-role
 *  flavor and a value was supplied. Quietly no-ops otherwise. */
async function maybeUpdateYoe(
  userId: string,
  data: { isCurrent?: boolean; yearsExperience?: number },
) {
  if (!data.isCurrent) return;
  if (data.yearsExperience == null) return;
  await prisma.user.update({
    where: { id: userId },
    data: { yearsExperience: data.yearsExperience },
  });
}

export async function deleteOffer(id: string) {
  const userId = await requireUserId();
  await prisma.jobOffer.deleteMany({ where: { id, userId } });
  revalidatePath('/dashboard');
  revalidatePath('/current');
}

/** Promotes an offer to be the user's current/baseline role (clearing any other current). */
export async function setOfferAsCurrent(id: string) {
  const userId = await requireUserId();
  await prisma.$transaction([
    prisma.jobOffer.updateMany({ where: { userId, isCurrent: true }, data: { isCurrent: false } }),
    prisma.jobOffer.updateMany({ where: { id, userId }, data: { isCurrent: true } }),
  ]);
  revalidatePath('/dashboard');
  revalidatePath('/current');
  revalidatePath(`/offers/${id}`);
}

// ---------- Comparisons ----------

import { runComparisonForOffers } from '@/lib/engine/runner';
import { PRESET_WEIGHTS, type Weights } from '@/lib/engine';

export async function createComparison(args: {
  name: string;
  offerIds: string[];
  weights: Weights;
  equityGrowthPct: number;
  profileId?: string | null;
  /** Per-company stock-growth % override (e.g. {"cmoyo63d2..." : 12.5}). */
  growthOverridesByCompany?: Record<string, number>;
}) {
  const userId = await requireUserId();
  const result = await runComparisonForOffers(userId, args.offerIds, args.weights, {
    equityGrowthPct: args.equityGrowthPct,
    growthOverridesByCompany: args.growthOverridesByCompany,
  });
  const created = await prisma.comparison.create({
    data: {
      userId,
      name: args.name,
      profileId: args.profileId ?? null,
      offerIdsCsv: args.offerIds.join(','),
      equityGrowthPct: args.equityGrowthPct,
      snapshotJson: JSON.stringify(result),
    },
  });
  revalidatePath('/dashboard');
  redirect(`/compare/${created.id}`);
}

export async function deleteComparison(id: string) {
  const userId = await requireUserId();
  await prisma.comparison.deleteMany({ where: { id, userId } });
  revalidatePath('/dashboard');
  revalidatePath('/comparisons');
}

/**
 * Bulk-delete multiple comparisons in one round-trip. Caps the batch at 100
 * to keep the WHERE…IN clause and Prisma payload sane; the dashboard list
 * pagination is the natural ceiling on what a user can select at once anyway.
 * Scoped to the calling user — `deleteMany` silently no-ops on rows that
 * don't match `userId`, so cross-tenant IDs are safe to pass.
 */
export async function deleteComparisons(ids: string[]): Promise<{ deleted: number }> {
  const userId = await requireUserId();
  const cleaned = Array.from(new Set(ids.filter((s) => typeof s === 'string' && s.length > 0)));
  if (cleaned.length === 0) return { deleted: 0 };
  if (cleaned.length > 100) {
    throw new Error('Too many comparisons selected (max 100 at a time).');
  }
  const res = await prisma.comparison.deleteMany({
    where: { id: { in: cleaned }, userId },
  });
  revalidatePath('/dashboard');
  revalidatePath('/comparisons');
  return { deleted: res.count };
}

export async function ensurePresetWeightProfiles(userId: string) {
  // Always upsert: if the metric set changes (e.g. new review-aspect metrics),
  // existing rows would otherwise serve stale weights with missing keys.
  for (const [name, weights] of Object.entries(PRESET_WEIGHTS)) {
    const existing = await prisma.weightProfile.findFirst({
      where: { name, isPreset: true },
    });
    const payload = JSON.stringify(weights);
    if (existing) {
      if (existing.weights !== payload) {
        await prisma.weightProfile.update({ where: { id: existing.id }, data: { weights: payload } });
      }
    } else {
      await prisma.weightProfile.create({
        data: { name, isPreset: true, weights: payload, userId: null },
      });
    }
  }
  void userId;
}
