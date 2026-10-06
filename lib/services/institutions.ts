import { prisma } from "@/lib/prisma";
import type { InstitutionInput } from "@/lib/validation/institution";

type Result<T> = { data: T } | { error: string };

export async function getInstitutionForUser(userId: string) {
  return prisma.playerInstitution.findFirst({ where: { player: { userId } } });
}

// True when this player has an APPROVED institution verification. Used by
// institution-only tournaments (Phase 8.2) — one check, reused everywhere.
export async function isPlayerInstitutionVerified(playerId: string) {
  const row = await prisma.playerInstitution.findUnique({
    where: { playerId },
    select: { status: true },
  });
  return row?.status === "approved";
}

// First submission, or fixing a rejected / still-pending one. An approved
// verification is final: changing institution is an admin action for now.
export async function submitInstitution(
  userId: string,
  input: InstitutionInput
): Promise<Result<{ id: string }>> {
  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile) return { error: "no_player_profile" };

  const existing = await prisma.playerInstitution.findUnique({ where: { playerId: profile.id } });
  if (existing?.status === "approved") return { error: "already_verified" };

  const data = { ...input, status: "pending" as const, adminNote: null, reviewedById: null, reviewedAt: null };
  const row = existing
    ? await prisma.playerInstitution.update({ where: { id: existing.id }, data })
    : await prisma.playerInstitution.create({ data: { playerId: profile.id, ...data } });
  return { data: { id: row.id } };
}

export async function reviewInstitution(
  id: string,
  adminId: string,
  decision: "approve" | "reject",
  note?: string
): Promise<Result<{ status: string }>> {
  const row = await prisma.playerInstitution.findUnique({ where: { id } });
  if (!row) return { error: "not_found" };
  if (row.status !== "pending") return { error: "not_pending" };

  const cleanNote = note?.trim() || null;
  if (decision === "reject" && !cleanNote) return { error: "note_required" };

  const status = decision === "approve" ? "approved" : "rejected";
  await prisma.$transaction([
    prisma.playerInstitution.update({
      where: { id },
      data: { status, adminNote: cleanNote, reviewedById: adminId, reviewedAt: new Date() },
    }),
    prisma.adminActionLog.create({
      data: {
        adminId,
        action: `institution_${status}`,
        targetType: "PlayerInstitution",
        targetId: id,
        notes: cleanNote,
      },
    }),
  ]);
  return { data: { status } };
}

export async function listPendingInstitutions() {
  return prisma.playerInstitution.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { player: { select: { firstName: true, lastName: true, user: { select: { email: true } } } } },
  });
}

export async function institutionCounts() {
  const groups = await prisma.playerInstitution.groupBy({ by: ["status"], _count: true });
  const n = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  return { pending: n("pending"), approved: n("approved"), rejected: n("rejected") };
}

// ------------------------------------------------------------
// Institution-only tournaments (Phase 8.2)
// ------------------------------------------------------------

export type InstitutionGateResult =
  | { ok: true }
  | { error: "institution_required" | "institution_proof_required"; message: string };

// The one check every way of entering a tournament goes through (self
// registration, club entries, organizer manual-add). Open tournaments pass
// straight away. For institution-only ones EVERY player on the entry needs an
// approved verification. `proof` is only checked when the caller is a player
// registering themselves (organizer manual-add vouches for the player, so it
// passes `skipProof`).
export async function checkInstitutionGate(
  tournamentId: string,
  playerIds: string[],
  opts: { proofPath?: string | null; skipProof?: boolean; selfPlayerId?: string } = {}
): Promise<InstitutionGateResult> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { audienceScope: true, requireFreshInstitutionProof: true },
  });
  if (!t || t.audienceScope !== "institution") return { ok: true };

  const ids = [...new Set(playerIds)];
  const approved = await prisma.playerInstitution.findMany({
    where: { playerId: { in: ids }, status: "approved" },
    select: { playerId: true },
  });
  const okIds = new Set(approved.map((a) => a.playerId));
  const missing = ids.filter((id) => !okIds.has(id));
  if (missing.length > 0) {
    const selfMissing = opts.selfPlayerId ? missing.includes(opts.selfPlayerId) : true;
    return {
      error: "institution_required",
      message: selfMissing
        ? "This tournament is for verified students only. Verify your institution first."
        : "Every player on the team must have a verified institution for this tournament.",
    };
  }

  if (t.requireFreshInstitutionProof && !opts.skipProof && !opts.proofPath) {
    return {
      error: "institution_proof_required",
      message: "This organizer needs a fresh photo of your student ID for this tournament.",
    };
  }
  return { ok: true };
}

// A proof path must live in the registering user's own folder of the proofs
// bucket — same rule as the ID upload in 8.1.
export function isOwnProofPath(path: unknown, userId: string): path is string {
  return typeof path === "string" && path.startsWith(`${userId}/`) && !path.includes("..");
}
