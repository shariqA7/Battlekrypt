// Cheating and no-shows.
//  * A team caught cheating is disqualified. The host organizer can do it to any
//    entry; an accepted co-host institute can do it to its OWN entries.
//  * A no-show gets the penalty the ORGANIZER chose for the tournament (nothing,
//    a warning, a point deduction, or disqualification). The host may pick a
//    different one for a given case; a co-host institute cannot.
//  * Every consequence is a row in Penalty. Revoking keeps the row.
import { prisma } from "@/lib/prisma";
import type { NoShowPenalty, PenaltyCause, PenaltyKind, Prisma } from "@prisma/client";
import { getRegistrationActor } from "@/lib/services/institutions";
import { notifyPenaltyIssued, notifyPenaltyRevoked } from "@/lib/services/institution-notifications";

type Db = typeof prisma | Prisma.TransactionClient;
type Err<E extends string> = { error: E; message?: string };

const MAX_REASON = 500;
export const MAX_POINTS = 1000;

interface Ctx {
  reg: {
    id: string;
    tournamentId: string;
    status: string;
    approvedAt: Date | null;
    routedInstitutionId: string | null;
    checkInStatus: string;
    tournament: {
      id: string;
      name: string;
      status: string;
      venueType: string;
      organizerId: string;
      noShowPenalty: NoShowPenalty;
      noShowPenaltyPoints: number | null;
    };
  };
  role: "host" | "cohost";
  userId: string; // the person acting
  institutionId: string | null; // the institute they act for (host's own, or the co-host)
}

// Who is acting, and may they act on this entry? Same rule as approving.
async function resolveActor(
  registrationId: string,
  organizerId: string
): Promise<{ ctx: Ctx } | Err<"not_found" | "forbidden">> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      tournamentId: true,
      status: true,
      approvedAt: true,
      routedInstitutionId: true,
      checkInStatus: true,
      tournament: {
        select: {
          id: true,
          name: true,
          status: true,
          venueType: true,
          organizerId: true,
          noShowPenalty: true,
          noShowPenaltyPoints: true,
        },
      },
    },
  });
  if (!reg) return { error: "not_found" };
  const actor = await getRegistrationActor(
    reg.tournamentId,
    reg.tournament.organizerId,
    organizerId,
    reg.routedInstitutionId
  );
  if (!actor) return { error: "forbidden" };
  const org = await prisma.organizerProfile.findUnique({
    where: { id: organizerId },
    select: { userId: true, institution: { select: { id: true } } },
  });
  if (!org) return { error: "forbidden" };
  return {
    ctx: {
      reg,
      role: actor.role,
      userId: org.userId,
      institutionId: actor.role === "cohost" ? actor.institutionId : (org.institution?.id ?? null),
    },
  };
}

const ACTIVE = ["pending", "approved"];

// Writes the Penalty row and, for a disqualification, flips the entry's status.
async function issue(
  db: Db,
  ctx: Ctx,
  p: { kind: PenaltyKind; points?: number | null; cause: PenaltyCause; reason: string; ruleId?: string | null }
) {
  const penalty = await db.penalty.create({
    data: {
      registrationId: ctx.reg.id,
      tournamentId: ctx.reg.tournamentId,
      kind: p.kind,
      points: p.kind === "point_deduction" ? p.points : null,
      cause: p.cause,
      reason: p.reason,
      issuedByUserId: ctx.userId,
      issuedByInstitutionId: ctx.institutionId,
    },
  });
  if (p.kind === "disqualification") {
    await db.registration.update({
      where: { id: ctx.reg.id },
      data: {
        status: "disqualified",
        disqualifiedReason: p.reason,
        disqualifiedRuleId: p.ruleId ?? null,
        disqualifiedAt: new Date(),
        disqualifiedByUserId: ctx.userId,
        disqualifiedByInstitutionId: ctx.institutionId,
      },
    });
  }
  return penalty;
}

function checkReason(reason: unknown): { reason: string } | Err<"reason_required" | "reason_too_long"> {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (!r) return { error: "reason_required" };
  if (r.length > MAX_REASON) return { error: "reason_too_long" };
  return { reason: r };
}

// ------------------------------------------------------------
// Disqualify (cheating, or any serious breach)
// ------------------------------------------------------------

export async function disqualifyRegistration(
  registrationId: string,
  organizerId: string,
  reason: string,
  ruleId?: string,
  cause: PenaltyCause = "cheating"
) {
  const r = checkReason(reason);
  if ("error" in r) return r;
  const a = await resolveActor(registrationId, organizerId);
  if ("error" in a) return a;
  const { ctx } = a;
  if (ctx.reg.status === "disqualified") return { error: "already_disqualified" as const };
  if (!ACTIVE.includes(ctx.reg.status)) return { error: "not_active" as const };
  if (ctx.reg.tournament.status === "cancelled") return { error: "closed" as const };

  // A cited rule must belong to this tournament, or the audit trail could
  // point at someone else's rule.
  if (ruleId) {
    const rule = await prisma.tournamentRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.tournamentId !== ctx.reg.tournamentId) return { error: "invalid_rule" as const };
  }

  const penalty = await prisma.$transaction((tx) =>
    issue(tx, ctx, { kind: "disqualification", cause, reason: r.reason, ruleId })
  );
  await notifyPenaltyIssued(penalty.id);
  const updated = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
  return { data: updated };
}

// ------------------------------------------------------------
// No-shows: the organizer decides the penalty
// ------------------------------------------------------------

export interface NoShowOptions {
  // Host only: use a different penalty for this case than the tournament's default.
  penalty?: NoShowPenalty;
  points?: number | null;
  note?: string;
}

function resolveNoShowPenalty(
  ctx: Ctx,
  opts: NoShowOptions
): { kind: PenaltyKind | null; points: number | null } | Err<"only_organizer_chooses" | "points_required" | "points_invalid"> {
  const wantsOverride = opts.penalty !== undefined && opts.penalty !== ctx.reg.tournament.noShowPenalty;
  if (wantsOverride && ctx.role !== "host") return { error: "only_organizer_chooses" };
  const penalty = ctx.role === "host" && opts.penalty !== undefined ? opts.penalty : ctx.reg.tournament.noShowPenalty;
  if (penalty === "none") return { kind: null, points: null };
  if (penalty !== "point_deduction") return { kind: penalty, points: null };
  const points =
    ctx.role === "host" && opts.penalty === "point_deduction" && opts.points != null
      ? opts.points
      : ctx.reg.tournament.noShowPenaltyPoints;
  if (points == null) return { error: "points_required" };
  if (!Number.isInteger(points) || points < 1 || points > MAX_POINTS) return { error: "points_invalid" };
  return { kind: "point_deduction", points };
}

async function alreadyReported(db: Db, registrationId: string) {
  return (
    (await db.penalty.count({ where: { registrationId, cause: "no_show", revokedAt: null } })) > 0
  );
}

// Anyone allowed to act on the entry reports a no-show (online or on-site).
// The penalty is the organizer's, never the reporter's.
export async function reportNoShow(registrationId: string, organizerId: string, opts: NoShowOptions = {}) {
  const a = await resolveActor(registrationId, organizerId);
  if ("error" in a) return a;
  const { ctx } = a;
  if (!ACTIVE.includes(ctx.reg.status)) {
    return { error: ctx.reg.status === "disqualified" ? ("already_disqualified" as const) : ("not_active" as const) };
  }
  if (ctx.reg.tournament.status === "cancelled") return { error: "closed" as const };
  if (await alreadyReported(prisma, registrationId)) return { error: "already_reported" as const };

  const chosen = resolveNoShowPenalty(ctx, opts);
  if ("error" in chosen) return chosen;
  if (chosen.kind === null) return { error: "no_penalty_configured" as const };

  const note = typeof opts.note === "string" ? opts.note.trim().slice(0, MAX_REASON) : "";
  const reason = note ? `No-show: ${note}` : "No-show";
  const penalty = await prisma.$transaction(async (tx) => {
    const p = await issue(tx, ctx, { kind: chosen.kind!, points: chosen.points, cause: "no_show", reason });
    // On-site tournaments also keep the check-in record in step.
    if (ctx.reg.tournament.venueType === "lan") {
      await tx.registration.update({ where: { id: registrationId }, data: { checkInStatus: "no_show", checkedInAt: null } });
    }
    return p;
  });
  await notifyPenaltyIssued(penalty.id);
  return { data: penalty };
}

// Used by on-site check-in when a desk marks someone "no_show": apply the
// organizer's default penalty (nothing happens if the policy is "none").
export async function applyNoShowPolicy(registrationId: string, organizerId: string) {
  const a = await resolveActor(registrationId, organizerId);
  if ("error" in a) return a;
  const { ctx } = a;
  if (ctx.reg.tournament.noShowPenalty === "none") return { data: null };
  if (!ACTIVE.includes(ctx.reg.status)) return { data: null };
  if (await alreadyReported(prisma, registrationId)) return { data: null };
  const chosen = resolveNoShowPenalty(ctx, {});
  if ("error" in chosen || chosen.kind === null) return { data: null };
  const penalty = await prisma.$transaction((tx) =>
    issue(tx, ctx, { kind: chosen.kind!, points: chosen.points, cause: "no_show", reason: "No-show" })
  );
  await notifyPenaltyIssued(penalty.id);
  return { data: penalty };
}

// ------------------------------------------------------------
// Revoking (mistakes happen): the host any penalty, a co-host only its own
// ------------------------------------------------------------

async function revokeRows(
  db: Db,
  ctx: Ctx,
  rows: { id: string; kind: PenaltyKind }[]
) {
  if (rows.length === 0) return;
  await db.penalty.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { revokedAt: new Date(), revokedByUserId: ctx.userId },
  });
  if (rows.some((r) => r.kind === "disqualification")) {
    // Back in the tournament, unless another disqualification still stands.
    const standing = await db.penalty.count({
      where: { registrationId: ctx.reg.id, kind: "disqualification", revokedAt: null },
    });
    if (standing === 0) {
      await db.registration.update({
        where: { id: ctx.reg.id },
        data: {
          status: ctx.reg.approvedAt ? "approved" : "pending",
          disqualifiedReason: null,
          disqualifiedRuleId: null,
          disqualifiedAt: null,
          disqualifiedByUserId: null,
          disqualifiedByInstitutionId: null,
        },
      });
    }
  }
}

export async function revokePenalty(penaltyId: string, organizerId: string) {
  const p = await prisma.penalty.findUnique({ where: { id: penaltyId } });
  if (!p) return { error: "not_found" as const };
  const a = await resolveActor(p.registrationId, organizerId);
  if ("error" in a) return a;
  const { ctx } = a;
  if (p.revokedAt) return { error: "already_revoked" as const };
  if (ctx.role === "cohost" && p.issuedByInstitutionId !== ctx.institutionId) {
    return { error: "forbidden" as const };
  }
  await prisma.$transaction((tx) => revokeRows(tx, ctx, [{ id: p.id, kind: p.kind }]));
  await notifyPenaltyRevoked(p.id);
  const now = await prisma.registration.findUniqueOrThrow({ where: { id: p.registrationId }, select: { status: true } });
  return { data: { id: p.id, status: now.status } };
}

// Marking an on-site entry as present again (or clearing the mark) undoes the
// penalty that the no-show caused.
export async function revokeNoShowPenalties(registrationId: string, organizerId: string) {
  const a = await resolveActor(registrationId, organizerId);
  if ("error" in a) return a;
  const { ctx } = a;
  const rows = await prisma.penalty.findMany({
    where: {
      registrationId,
      cause: "no_show",
      revokedAt: null,
      ...(ctx.role === "cohost" ? { issuedByInstitutionId: ctx.institutionId } : {}),
    },
    select: { id: true, kind: true },
  });
  await prisma.$transaction((tx) => revokeRows(tx, ctx, rows));
  for (const r of rows) await notifyPenaltyRevoked(r.id);
  return { data: { revoked: rows.length } };
}

// ------------------------------------------------------------
// The organizer's no-show policy
// ------------------------------------------------------------

export async function setNoShowPolicy(
  tournamentId: string,
  organizerId: string,
  input: { penalty: NoShowPenalty; points?: number | null }
) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { organizerId: true } });
  if (!t) return { error: "not_found" as const };
  if (t.organizerId !== organizerId) return { error: "forbidden" as const };
  if (!["none", "warning", "point_deduction", "disqualification"].includes(input.penalty)) {
    return { error: "invalid_penalty" as const };
  }
  let points: number | null = null;
  if (input.penalty === "point_deduction") {
    if (input.points == null) return { error: "points_required" as const };
    if (!Number.isInteger(input.points) || input.points < 1 || input.points > MAX_POINTS) {
      return { error: "points_invalid" as const };
    }
    points = input.points;
  }
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { noShowPenalty: input.penalty, noShowPenaltyPoints: points },
  });
  return { data: { penalty: input.penalty, points } };
}

// ------------------------------------------------------------
// Reading
// ------------------------------------------------------------

// Standing (not revoked) penalties per entry, for the queues.
export async function listActivePenalties(registrationIds: string[]) {
  if (registrationIds.length === 0) return new Map<string, { id: string; kind: PenaltyKind; points: number | null; cause: PenaltyCause; reason: string; issuedByInstitutionId: string | null; createdAt: Date }[]>();
  const rows = await prisma.penalty.findMany({
    where: { registrationId: { in: registrationIds }, revokedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, registrationId: true, kind: true, points: true, cause: true, reason: true, issuedByInstitutionId: true, createdAt: true },
  });
  const map = new Map<string, Omit<(typeof rows)[number], "registrationId">[]>();
  for (const r of rows) {
    const { registrationId, ...rest } = r;
    map.set(registrationId, [...(map.get(registrationId) ?? []), rest]);
  }
  return map;
}
