// Club module service layer (Phase 2).
//
// Same split as lib/services/tournaments.ts: business rules live here once,
// and both the /api route handlers and Server Components call these.
//
// Club approval mirrors the organizer flow: a club owner registers, uploads
// proof of the registration-fee payment, and an admin approves or rejects.
// A club can be created immediately (status "pending") but nothing that
// depends on being an approved club (invites, roster) is allowed until then.

import { prisma } from "@/lib/prisma";

export interface ClubRegistrationInput {
  clubName: string;
  logoUrl?: string | null;
  feeProofUrl: string;
}

export async function getClubByUserId(userId: string) {
  return prisma.clubProfile.findUnique({ where: { userId } });
}

// The rejection reason isn't a column on ClubProfile — it lives on the
// audit log entry the admin action wrote, so we read the latest one.
export async function getLatestRejectionReason(clubId: string) {
  const log = await prisma.adminActionLog.findFirst({
    where: { targetType: "ClubProfile", targetId: clubId, action: "rejected_club" },
    orderBy: { createdAt: "desc" },
  });
  return log?.notes ?? null;
}

export async function registerClub(userId: string, input: ClubRegistrationInput) {
  return prisma.clubProfile.create({
    data: {
      userId,
      clubName: input.clubName,
      logoUrl: input.logoUrl ?? null,
      feeProofUrl: input.feeProofUrl,
      status: "pending",
    },
  });
}

export interface ClubUpdateInput {
  clubName?: string;
  logoUrl?: string | null;
  feeProofUrl?: string;
}

// Owner edits. Name/logo can change any time. A new fee proof is only
// accepted while the club isn't approved yet, and resubmitting after a
// rejection puts the club back in the pending queue.
export async function updateClub(clubId: string, input: ClubUpdateInput) {
  const club = await prisma.clubProfile.findUnique({ where: { id: clubId } });
  if (!club) return { error: "not_found" as const };

  if (input.feeProofUrl && club.status === "approved") {
    return { error: "already_approved" as const };
  }

  const resubmitting = !!input.feeProofUrl && club.status === "rejected";

  const updated = await prisma.clubProfile.update({
    where: { id: clubId },
    data: {
      ...(input.clubName !== undefined && { clubName: input.clubName }),
      ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
      ...(input.feeProofUrl && { feeProofUrl: input.feeProofUrl }),
      ...(resubmitting && { status: "pending" as const }),
    },
  });

  return { data: updated };
}

export async function listPendingClubs() {
  return prisma.clubProfile.findMany({
    where: { status: "pending" },
    include: { user: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function approveClub(clubId: string, adminId: string) {
  const club = await prisma.clubProfile.findUnique({ where: { id: clubId } });
  if (!club) return { error: "not_found" as const };

  const [updated] = await prisma.$transaction([
    prisma.clubProfile.update({
      where: { id: clubId },
      data: { status: "approved" },
    }),
    prisma.adminActionLog.create({
      data: {
        adminId,
        action: "approved_club",
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
      data: { status: "rejected" },
    }),
    prisma.adminActionLog.create({
      data: {
        adminId,
        action: "rejected_club",
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
