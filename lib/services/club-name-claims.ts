// "That club is using MY name." Anyone can file a claim against the club
// holding a name. If an admin upholds it: the club is disbanded, its owner is
// banned for as long as the admin chooses, and the name is held for the
// claimant until they use it.
import { prisma } from "@/lib/prisma";
import { orgNameKey } from "@/lib/org-name";
import { findClubHolding } from "@/lib/services/club-names";

export interface ClaimInput {
  clubName: string;
  explanation: string;
  evidenceUrl?: string | null;
}

export async function fileClaim(claimantId: string, input: ClaimInput) {
  const clubName = input.clubName.trim();
  const explanation = input.explanation.trim();
  const key = orgNameKey(clubName);

  if (!key || clubName.length > 60) return { error: "invalid_name" as const };
  if (explanation.length < 30 || explanation.length > 2000) {
    return { error: "invalid_explanation" as const };
  }
  if (input.evidenceUrl && !/^https?:\/\/\S+/i.test(input.evidenceUrl)) {
    return { error: "invalid_evidence" as const };
  }

  const holder = await findClubHolding(key);
  if (!holder) return { error: "no_holder" as const };
  if (holder.userId === claimantId) return { error: "own_club" as const };

  const existing = await prisma.clubNameClaim.findFirst({
    where: { claimantId, nameKey: key, status: "pending" },
  });
  if (existing) return { error: "already_filed" as const };

  const claim = await prisma.clubNameClaim.create({
    data: {
      claimantId,
      nameKey: key,
      clubName,
      clubId: holder.id,
      explanation,
      evidenceUrl: input.evidenceUrl || null,
    },
  });
  return { data: claim };
}

export async function listMyClaims(claimantId: string) {
  return prisma.clubNameClaim.findMany({
    where: { claimantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPendingClaims() {
  const claims = await prisma.clubNameClaim.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { claimant: { select: { email: true, displayName: true } } },
  });
  const clubIds = claims.map((c) => c.clubId).filter((x): x is string => !!x);
  const clubs = await prisma.clubProfile.findMany({
    where: { id: { in: clubIds } },
    include: { user: { select: { email: true, displayName: true } } },
  });
  const byId = new Map(clubs.map((c) => [c.id, c]));
  return claims.map((c) => ({ ...c, club: c.clubId ? byId.get(c.clubId) ?? null : null }));
}

export async function upholdClaim(
  id: string,
  adminId: string,
  opts: { banDays: number | null; note?: string }
) {
  const claim = await prisma.clubNameClaim.findUnique({ where: { id } });
  if (!claim) return { error: "not_found" as const };
  if (claim.status !== "pending") return { error: "not_pending" as const };
  if (opts.banDays !== null && (!Number.isInteger(opts.banDays) || opts.banDays < 1 || opts.banDays > 3650)) {
    return { error: "invalid_ban" as const };
  }

  const club = claim.clubId
    ? await prisma.clubProfile.findUnique({
        where: { id: claim.clubId },
        include: { user: { select: { id: true, isAdmin: true } } },
      })
    : null;
  if (club?.user.isAdmin) return { error: "owner_is_admin" as const };

  const now = new Date();
  const note = opts.note?.trim() || null;
  const live = club && club.status !== "disbanded";

  await prisma.$transaction(async (tx) => {
    if (club && live) {
      await tx.clubProfile.update({
        where: { id: club.id },
        data: {
          status: "disbanded",
          nameKey: null, // frees the name for the rightful owner
          disbandedAt: now,
          disbandReason: `Name claimed by its rightful owner (claim ${claim.id}).`,
        },
      });
      // Release everyone on the roster and withdraw open invites.
      await tx.clubRoster.deleteMany({ where: { clubId: club.id } });
      await tx.clubInvite.updateMany({
        where: { clubId: club.id, status: "pending" },
        data: { status: "cancelled", respondedAt: now },
      });
      await tx.accountBan.create({
        data: {
          userId: club.userId,
          reason: `Your club "${club.clubName}" was disbanded because it used a name that belongs to someone else.`,
          endsAt: opts.banDays === null ? null : new Date(now.getTime() + opts.banDays * 86_400_000),
          createdById: adminId,
        },
      });
    }
    await tx.clubNameClaim.update({
      where: { id },
      data: {
        status: "upheld",
        adminNote: note,
        banDays: opts.banDays,
        reviewedById: adminId,
        reviewedAt: now,
      },
    });
    await tx.adminActionLog.create({
      data: {
        adminId,
        action: "upheld_name_claim",
        targetType: "ClubNameClaim",
        targetId: id,
        notes: JSON.stringify({ banDays: opts.banDays, note }),
      },
    });
  });
  return { data: { id } };
}

export async function dismissClaim(id: string, adminId: string, note: string) {
  const trimmed = note.trim();
  if (!trimmed) return { error: "note_required" as const };
  const claim = await prisma.clubNameClaim.findUnique({ where: { id } });
  if (!claim) return { error: "not_found" as const };
  if (claim.status !== "pending") return { error: "not_pending" as const };

  await prisma.$transaction([
    prisma.clubNameClaim.update({
      where: { id },
      data: { status: "dismissed", adminNote: trimmed, reviewedById: adminId, reviewedAt: new Date() },
    }),
    prisma.adminActionLog.create({
      data: { adminId, action: "dismissed_name_claim", targetType: "ClubNameClaim", targetId: id, notes: trimmed },
    }),
  ]);
  return { data: { id } };
}
