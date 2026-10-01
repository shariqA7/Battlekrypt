// Club module service layer (Phase 2).
//
// Same split as lib/services/tournaments.ts: business rules live here once,
// and both the /api route handlers and Server Components call these.
//
// Clubs are created instantly and for free — no admin approval. Names are
// protected (see club-names.ts) and a squatted name can be claimed back
// (club-name-claims.ts). A PAID plan is bought by uploading payment proof,
// which an admin verifies; that is the only thing admins approve for clubs.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { orgNameKey } from "@/lib/org-name";
import { isSupportedCurrency } from "@/lib/money";
import { FREE_CLUB_PLAN, PAID_CLUB_PLAN } from "@/lib/club-limits";
import { computeNewExpiry } from "@/lib/plans";
import { checkClubName, fulfillClaim, type NameCheck } from "@/lib/services/club-names";

export interface ClubRegistrationInput {
  clubName: string;
  logoUrl?: string | null;
}

export async function getClubByUserId(userId: string) {
  return prisma.clubProfile.findUnique({ where: { userId } });
}

// The rejection reason isn't a column on ClubProfile — it lives on the
// audit log entry the admin action wrote, so we read the latest one.
export async function getLatestRejectionReason(clubId: string) {
  const log = await prisma.adminActionLog.findFirst({
    where: {
      targetType: "ClubProfile",
      targetId: clubId,
      action: { in: ["rejected_club_upgrade", "rejected_club"] },
    },
    orderBy: { createdAt: "desc" },
  });
  return log?.notes ?? null;
}

export async function registerClub(userId: string, input: ClubRegistrationInput) {
  const check = await checkClubName(input.clubName, userId);
  if (!check.ok) return { error: "name_taken" as const, check };

  try {
    const fresh = {
      clubName: input.clubName,
      nameKey: orgNameKey(input.clubName),
      logoUrl: input.logoUrl ?? null,
      status: "approved" as const,
      subscriptionPlanCode: FREE_CLUB_PLAN,
      upgradeStatus: "none" as const,
      feeProofUrl: null,
      disbandedAt: null,
      disbandReason: null,
    };
    const prior = await prisma.clubProfile.findUnique({ where: { userId } });
    if (prior && prior.status !== "disbanded") return { error: "already_club" as const };

    // One club per account. After a disbandment the owner starts over on the
    // same row: old teams that never entered a tournament are removed.
    const club = prior
      ? await prisma.$transaction(async (tx) => {
          await tx.clubTeam.deleteMany({ where: { clubId: prior.id, entries: { none: {} } } });
          return tx.clubProfile.update({ where: { id: prior.id }, data: fresh });
        })
      : await prisma.clubProfile.create({ data: { userId, ...fresh } });
    await fulfillClaim(userId, orgNameKey(input.clubName));
    return { data: club };
  } catch (e) {
    // Two people registering the same name at once: the unique key decides.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        error: "name_taken" as const,
        check: {
          ok: false,
          reason: "taken_club",
          message: "A club with that name already exists. Club names can't be reused.",
          canClaim: true,
        } as NameCheck,
      };
    }
    throw e;
  }
}

export interface ClubUpdateInput {
  clubName?: string;
  logoUrl?: string | null;
  feeProofUrl?: string;
}

// Owner edits. Name/logo can change any time (the new name goes through the
// same protection rules). A fee proof requests the PAID plan: it goes to the
// admin queue, and can be resent after a rejection.
export async function updateClub(clubId: string, input: ClubUpdateInput) {
  const club = await prisma.clubProfile.findUnique({ where: { id: clubId } });
  if (!club) return { error: "not_found" as const };
  if (club.status !== "approved") return { error: "not_active" as const };

  const paidAndActive =
    club.subscriptionPlanCode === PAID_CLUB_PLAN &&
    (club.planExpiresAt === null || club.planExpiresAt > new Date());
  if (input.feeProofUrl && paidAndActive) {
    return { error: "already_paid" as const };
  }
  if (input.feeProofUrl && club.upgradeStatus === "pending") {
    return { error: "upgrade_pending" as const };
  }

  let nameKey: string | undefined;
  if (input.clubName !== undefined && orgNameKey(input.clubName) !== orgNameKey(club.clubName)) {
    const check = await checkClubName(input.clubName, club.userId);
    if (!check.ok) return { error: "name_taken" as const, check };
    nameKey = orgNameKey(input.clubName);
  }

  try {
    const updated = await prisma.clubProfile.update({
      where: { id: clubId },
      data: {
        ...(input.clubName !== undefined && { clubName: input.clubName }),
        ...(nameKey && { nameKey }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        ...(input.feeProofUrl && { feeProofUrl: input.feeProofUrl, upgradeStatus: "pending" as const }),
      },
    });
    if (nameKey) await fulfillClaim(club.userId, nameKey);
    return { data: updated };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        error: "name_taken" as const,
        check: {
          ok: false,
          reason: "taken_club",
          message: "A club with that name already exists. Club names can't be reused.",
          canClaim: true,
        } as NameCheck,
      };
    }
    throw e;
  }
}

export async function listPendingClubs() {
  return prisma.clubProfile.findMany({
    where: { upgradeStatus: "pending" },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function approveClub(
  clubId: string,
  adminId: string,
  payment?: { amount: number; currency: string; method: string; reference?: string | null }
) {
  const club = await prisma.clubProfile.findUnique({ where: { id: clubId } });
  if (!club) return { error: "not_found" as const };

  if (
    payment &&
    (!Number.isFinite(payment.amount) ||
      payment.amount <= 0 ||
      !isSupportedCurrency(payment.currency) ||
      !payment.method.trim())
  ) {
    return { error: "invalid_payment" as const };
  }

  // Same rule as plan requests: the paid plan runs for the plan's duration
  // (and extends if it's a renewal) instead of lasting forever.
  const paidPlan = await prisma.plan.findUnique({ where: { code: PAID_CLUB_PLAN } });
  const planExpiresAt = computeNewExpiry(
    { planCode: club.subscriptionPlanCode, planExpiresAt: club.planExpiresAt },
    PAID_CLUB_PLAN,
    paidPlan?.durationDays ?? 30
  );

  const [updated] = await prisma.$transaction([
    prisma.clubProfile.update({
      where: { id: clubId },
      data: { subscriptionPlanCode: PAID_CLUB_PLAN, planExpiresAt, upgradeStatus: "none" },
    }),
    ...(payment
      ? [
          prisma.paymentRecord.create({
            data: {
              userId: club.userId,
              kind: "club_upgrade" as const,
              amount: payment.amount.toFixed(2),
              currency: payment.currency,
              method: payment.method.trim().slice(0, 60),
              reference: payment.reference?.trim().slice(0, 120) || null,
              recordedById: adminId,
            },
          }),
        ]
      : []),
    prisma.adminActionLog.create({
      data: {
        adminId,
        action: "approved_club_upgrade",
        targetType: "ClubProfile",
        targetId: clubId,
      },
    }),
  ]);

  return { data: updated };
}

export async function rejectClub(clubId: string, adminId: string, reason?: string) {
  const club = await prisma.clubProfile.findUnique({ where: { id: clubId } });
  if (!club) return { error: "not_found" as const };

  const [updated] = await prisma.$transaction([
    prisma.clubProfile.update({
      where: { id: clubId },
      data: { upgradeStatus: "rejected" },
    }),
    prisma.adminActionLog.create({
      data: {
        adminId,
        action: "rejected_club_upgrade",
        targetType: "ClubProfile",
        targetId: clubId,
        notes: reason,
      },
    }),
  ]);

  return { data: updated };
}

export async function getClubPaymentInstructions() {
  const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  return settings?.clubPaymentInstructions ?? null;
}

export async function updateClubPaymentInstructions(instructions: string) {
  return prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: { clubPaymentInstructions: instructions },
    create: { id: "singleton", clubPaymentInstructions: instructions },
  });
}
