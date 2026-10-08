// Institution-only challenges. Same model as institution-only tournaments:
//  - the host is an organization with a verified institute (the poster);
//  - it can add co-host institutes (approve THEIR OWN applicants) and guest
//    institutes (their players may apply, the host approves them);
//  - a team plays for ONE institute;
//  - the host caps how many applications each institute may send;
//  - the poster can only pick applicants their institute has approved.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { buildAudience, evaluateMembership } from "@/lib/services/institutions";
import { notify } from "@/lib/services/notifications";

type Db = Prisma.TransactionClient | typeof prisma;
type Result<T> = { data: T } | { error: string };

// Applications that hold an institute's place: still alive and not turned down
// by the institute. Withdrawn / not-selected / rejected ones free the slot.
const HOLDING = { status: { in: ["applied", "selected"] as ("applied" | "selected")[] }, institutionReview: { not: "rejected" as const } };

async function hostOrganizer(posterUserId: string) {
  return prisma.organizerProfile.findUnique({ where: { userId: posterUserId }, select: { id: true } });
}

export type ChallengeGateResult =
  | { ok: true; institutionId: string | null; routedInstitutionId: string | null; review: "pending" | "approved" }
  | {
      error: "institution_required" | "institution_mixed_team" | "institution_quota_full";
      message: string;
    };

// Called inside applyToChallenge (with the challenge row locked, so the quota
// count can't be raced past). Open challenges pass straight away.
export async function checkChallengeInstitutionGate(
  db: Db,
  challenge: { id: string; audienceScope: string; posterUserId: string; maxApplicationsPerInstitute: number | null },
  applicant: { userId: string; kind: "player" | "team"; clubTeamId: string | null }
): Promise<ChallengeGateResult> {
  if (challenge.audienceScope !== "institution") {
    return { ok: true, institutionId: null, routedInstitutionId: null, review: "approved" };
  }

  let playerIds: string[];
  let selfPlayerId: string | undefined;
  if (applicant.kind === "player") {
    const p = await db.playerProfile.findUnique({ where: { userId: applicant.userId }, select: { id: true } });
    playerIds = p ? [p.id] : [];
    selfPlayerId = p?.id;
  } else {
    const roster = await db.clubRoster.findMany({
      where: { teamId: applicant.clubTeamId ?? "none" },
      select: { playerId: true },
    });
    playerIds = roster.map((r) => r.playerId);
  }

  const [host, links] = await Promise.all([
    hostOrganizer(challenge.posterUserId),
    db.challengeInstitution.findMany({
      where: { challengeId: challenge.id, institution: { verified: true } },
      select: { institutionId: true, role: true, status: true, maxApplications: true },
    }),
  ]);
  // A challenge whose poster isn't an organization can't be institution-only;
  // fall through with an empty audience so nobody qualifies.
  const audience = await buildAudience(host?.id ?? "none", links);
  const member = await evaluateMembership(audience, playerIds, { selfPlayerId, noun: "challenge" });
  if ("error" in member) return member;
  const institutionId = member.institutionId;

  const limit =
    links.find((l) => l.institutionId === institutionId)?.maxApplications ??
    challenge.maxApplicationsPerInstitute ??
    null;
  if (limit !== null) {
    const used = await db.challengeApplication.count({
      where: {
        challengeId: challenge.id,
        institutionId,
        ...HOLDING,
        applicantUserId: { not: applicant.userId }, // re-applying reuses their own row
      },
    });
    if (used >= limit) {
      return {
        error: "institution_quota_full",
        message: `Your institute has used all ${limit} of its ${limit === 1 ? "application" : "applications"} for this challenge.`,
      };
    }
  }

  return {
    ok: true,
    institutionId,
    routedInstitutionId: audience.cohostIds.has(institutionId) ? institutionId : null,
    review: "pending",
  };
}

// ------------------------------------------------------------
// Host: manage co-host / guest institutes and limits
// ------------------------------------------------------------

async function ownedChallenge(challengeId: string, organizerId: string) {
  const c = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { id: true, posterUserId: true, audienceScope: true },
  });
  if (!c) return { error: "not_found" } as const;
  const org = await prisma.organizerProfile.findUnique({ where: { id: organizerId }, select: { userId: true } });
  if (!org || org.userId !== c.posterUserId) return { error: "forbidden" } as const;
  return { challenge: c } as const;
}

export async function listChallengeInstitutions(challengeId: string) {
  return prisma.challengeInstitution.findMany({
    where: { challengeId },
    include: { institution: { select: { id: true, name: true } } },
    orderBy: { invitedAt: "asc" },
  });
}

export async function addChallengeInstitution(
  challengeId: string,
  organizerId: string,
  institutionId: string,
  role: "cohost" | "guest"
): Promise<Result<{ id: string }>> {
  const owned = await ownedChallenge(challengeId, organizerId);
  if (owned.error) return { error: owned.error };
  if (owned.challenge.audienceScope !== "institution") return { error: "not_institution_challenge" };

  const host = await prisma.institution.findUnique({ where: { organizerId } });
  if (!host?.verified) return { error: "host_not_verified" };
  if (host.id === institutionId) return { error: "is_host" };
  const inst = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!inst || !inst.verified) return { error: "institution_not_found" };

  const existing = await prisma.challengeInstitution.findUnique({
    where: { challengeId_institutionId: { challengeId, institutionId } },
  });
  if (existing) return { error: "already_added" };

  const row = await prisma.challengeInstitution.create({
    data: { challengeId, institutionId, role, status: role === "guest" ? "accepted" : "pending" },
  });
  return { data: { id: row.id } };
}

export async function removeChallengeInstitution(
  challengeId: string,
  organizerId: string,
  institutionId: string
): Promise<Result<{ removed: true }>> {
  const owned = await ownedChallenge(challengeId, organizerId);
  if (owned.error) return { error: owned.error };
  const link = await prisma.challengeInstitution.findUnique({
    where: { challengeId_institutionId: { challengeId, institutionId } },
  });
  if (!link) return { error: "not_found" };

  const active = await prisma.challengeApplication.count({
    where: { challengeId, ...HOLDING, OR: [{ institutionId }, { routedInstitutionId: institutionId }] },
  });
  if (active > 0) return { error: "has_registrations" };

  await prisma.challengeInstitution.delete({ where: { id: link.id } });
  return { data: { removed: true } };
}

// institutionId = null sets the challenge-wide default per institute (all
// institutes, the host's included); otherwise the override for one institute.
export async function setChallengeInstitutionLimit(
  challengeId: string,
  organizerId: string,
  institutionId: string | null,
  max: number | null
): Promise<Result<{ maxEntries: number | null }>> {
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 1000)) return { error: "invalid_limit" };
  const owned = await ownedChallenge(challengeId, organizerId);
  if (owned.error) return { error: owned.error };
  if (owned.challenge.audienceScope !== "institution") return { error: "not_institution_challenge" };

  if (institutionId === null) {
    await prisma.challenge.update({ where: { id: challengeId }, data: { maxApplicationsPerInstitute: max } });
    return { data: { maxEntries: max } };
  }
  const link = await prisma.challengeInstitution.findUnique({
    where: { challengeId_institutionId: { challengeId, institutionId } },
  });
  if (!link) return { error: "not_found" };
  await prisma.challengeInstitution.update({ where: { id: link.id }, data: { maxApplications: max } });
  return { data: { maxEntries: max } };
}

export async function getChallengeInstitutionUsage(challengeId: string): Promise<Record<string, number>> {
  const rows = await prisma.challengeApplication.groupBy({
    by: ["institutionId"],
    where: { challengeId, institutionId: { not: null }, ...HOLDING },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.institutionId as string, r._count._all]));
}

// ------------------------------------------------------------
// Co-host invitations
// ------------------------------------------------------------

export async function respondToChallengeInvite(
  linkId: string,
  organizerId: string,
  accept: boolean
): Promise<Result<{ status: string }>> {
  const link = await prisma.challengeInstitution.findUnique({
    where: { id: linkId },
    include: { institution: { select: { organizerId: true } } },
  });
  if (!link) return { error: "not_found" };
  if (link.institution.organizerId !== organizerId) return { error: "forbidden" };
  if (link.role !== "cohost") return { error: "not_cohost_invite" };
  if (link.status !== "pending") return { error: "already_responded" };
  const status = accept ? "accepted" : "declined";
  await prisma.challengeInstitution.update({ where: { id: linkId }, data: { status, respondedAt: new Date() } });
  return { data: { status } };
}

export async function listChallengeCoHostInvitations(organizerId: string) {
  const inst = await prisma.institution.findUnique({ where: { organizerId }, select: { id: true } });
  if (!inst) return [];
  return prisma.challengeInstitution.findMany({
    where: { institutionId: inst.id, role: "cohost", status: { in: ["pending", "accepted"] } },
    include: { challenge: { select: { id: true, title: true, status: true, posterName: true } } },
    orderBy: { invitedAt: "desc" },
  });
}

// ------------------------------------------------------------
// Review queue
// ------------------------------------------------------------

type Actor = { role: "host" } | { role: "cohost"; institutionId: string } | null;

async function actorFor(
  challenge: { id: string; posterUserId: string },
  organizerId: string,
  routedInstitutionId: string | null
): Promise<Actor> {
  const org = await prisma.organizerProfile.findUnique({ where: { id: organizerId }, select: { userId: true } });
  if (!org) return null;
  if (org.userId === challenge.posterUserId) return { role: "host" };
  if (!routedInstitutionId) return null;
  const link = await prisma.challengeInstitution.findFirst({
    where: {
      challengeId: challenge.id,
      institutionId: routedInstitutionId,
      role: "cohost",
      status: "accepted",
      institution: { organizerId, verified: true },
    },
    select: { institutionId: true },
  });
  return link ? { role: "cohost", institutionId: link.institutionId } : null;
}

// Host: every application (or just its own with view "mine"). Accepted
// co-host: only applications routed to its own institute.
export async function listApplicationsForInstitute(
  challengeId: string,
  organizerId: string,
  view: "all" | "mine" = "all"
) {
  const c = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { id: true, posterUserId: true },
  });
  if (!c) return { error: "not_found" as const };
  const org = await prisma.organizerProfile.findUnique({ where: { id: organizerId }, select: { userId: true } });
  if (!org) return { error: "forbidden" as const };

  let scope: Prisma.ChallengeApplicationWhereInput = {};
  let role: "host" | "cohost" = "host";
  if (org.userId === c.posterUserId) {
    if (view === "mine") scope = { routedInstitutionId: null };
  } else {
    const link = await prisma.challengeInstitution.findFirst({
      where: { challengeId, role: "cohost", status: "accepted", institution: { organizerId, verified: true } },
      select: { institutionId: true },
    });
    if (!link) return { error: "forbidden" as const };
    role = "cohost";
    scope = { routedInstitutionId: link.institutionId };
  }

  const data = await prisma.challengeApplication.findMany({
    where: { challengeId, status: { in: ["applied", "selected"] }, ...scope },
    orderBy: [{ rating: "desc" }, { createdAt: "asc" }],
    select: {
      id: true, kind: true, entrantName: true, rating: true, message: true, status: true,
      institutionReview: true, createdAt: true,
      institution: { select: { id: true, name: true } },
    },
  });
  return { data, role };
}

// The institute vouches for (approve) or turns down (reject) an applicant.
// Rejected applicants are out (their slot frees up). Only while the challenge
// is open and the application is still waiting for a pick.
export async function reviewChallengeApplication(
  applicationId: string,
  organizerId: string,
  approve: boolean
): Promise<Result<{ institutionReview: string }>> {
  const app = await prisma.challengeApplication.findUnique({
    where: { id: applicationId },
    include: { challenge: { select: { id: true, posterUserId: true, status: true, audienceScope: true } } },
  });
  if (!app) return { error: "not_found" };
  const actor = await actorFor(app.challenge, organizerId, app.routedInstitutionId);
  if (!actor) return { error: "forbidden" };
  if (app.challenge.audienceScope !== "institution") return { error: "not_institution_challenge" };
  if (app.challenge.status !== "open" || app.status !== "applied") return { error: "not_reviewable" };

  const hostInstitute =
    actor.role === "host"
      ? await prisma.institution.findUnique({ where: { organizerId }, select: { id: true } })
      : null;
  const institutionReview = approve ? "approved" : "rejected";
  await prisma.challengeApplication.update({
    where: { id: applicationId },
    data: approve
      ? {
          institutionReview,
          approvedByInstitutionId: actor.role === "cohost" ? actor.institutionId : (hostInstitute?.id ?? null),
        }
      : { institutionReview, status: "not_selected", decidedAt: new Date() },
  });
  if (!approve) {
    // Best effort: a notification failure must never undo the decision.
    try {
      await notify(app.applicantUserId, {
        type: "challenge_not_selected",
        title: "Your institute turned down your application",
        body: "It didn't approve your application for this challenge.",
        href: `/challenges/${app.challengeId}`,
      });
    } catch (e) {
      console.error("notify failed", e);
    }
  }
  return { data: { institutionReview } };
}
