import { prisma } from "@/lib/prisma";

type Result<T> = { data: T } | { error: string };

export const INSTITUTE_CHANGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const normalizeInstitutionName = (name: string) => name.trim().replace(/\s+/g, " ");

// ------------------------------------------------------------
// Institutes (run by an organization; verified once by an admin)
// ------------------------------------------------------------

export async function getInstitutionForOrganizer(organizerId: string) {
  return prisma.institution.findUnique({ where: { organizerId } });
}

// An organization registers the institute it runs. It starts unverified and
// cannot host institution-only tournaments until an admin verifies it.
export async function createInstitution(
  organizerId: string,
  rawName: string
): Promise<Result<{ id: string }>> {
  const name = normalizeInstitutionName(rawName);
  if (name.length < 2 || name.length > 120) return { error: "invalid_name" };
  if (await prisma.institution.findUnique({ where: { organizerId } })) {
    return { error: "already_has_institution" };
  }
  const clash = await prisma.institution.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) return { error: "name_taken" };
  const row = await prisma.institution.create({ data: { name, organizerId } });
  return { data: { id: row.id } };
}

// Verified institutes — what a player picks from, and what a host can invite.
export async function listVerifiedInstitutions(q?: string) {
  return prisma.institution.findMany({
    where: {
      verified: true,
      ...(q?.trim() ? { name: { contains: q.trim(), mode: "insensitive" as const } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 100,
  });
}

export async function setInstitutionVerified(
  id: string,
  adminId: string,
  verified: boolean,
  note?: string
): Promise<Result<{ verified: boolean }>> {
  const row = await prisma.institution.findUnique({ where: { id } });
  if (!row) return { error: "not_found" };
  if (row.verified === verified) return { error: verified ? "already_verified" : "not_verified" };
  const cleanNote = note?.trim() || null;
  if (!verified && !cleanNote) return { error: "note_required" };

  await prisma.$transaction([
    prisma.institution.update({
      where: { id },
      data: verified
        ? { verified: true, verifiedAt: new Date(), verifiedById: adminId }
        : { verified: false, verifiedAt: null, verifiedById: null },
    }),
    prisma.adminActionLog.create({
      data: {
        adminId,
        action: verified ? "institution_verified" : "institution_unverified",
        targetType: "Institution",
        targetId: id,
        notes: cleanNote,
      },
    }),
  ]);
  return { data: { verified } };
}

export async function listInstitutionsForAdmin() {
  return prisma.institution.findMany({
    orderBy: [{ verified: "asc" }, { createdAt: "asc" }],
    include: {
      organizer: { select: { orgName: true, user: { select: { email: true } } } },
      _count: { select: { members: true } },
    },
  });
}

export async function institutionCounts() {
  const [pending, verified] = await Promise.all([
    prisma.institution.count({ where: { verified: false } }),
    prisma.institution.count({ where: { verified: true } }),
  ]);
  return { pending, verified };
}

// ------------------------------------------------------------
// Player membership: ONE institute per player
// ------------------------------------------------------------

export async function getInstitutionForUser(userId: string) {
  return prisma.playerInstitution.findFirst({
    where: { player: { userId } },
    include: { institution: { select: { id: true, name: true, verified: true } } },
  });
}

export function institutionChangeUnlocksAt(lastChangedAt: Date) {
  return new Date(lastChangedAt.getTime() + INSTITUTE_CHANGE_DAYS * DAY_MS);
}

// Tournaments that are over don't hold a player to their institute.
const FINISHED_TOURNAMENT = ["completed", "cancelled"] as const;

// Everything that ties a player to their current institute right now: live
// tournament entries (as the registrant or on a team) and live challenge
// applications. While any exist the institute can't be changed — their
// institute approved/vouched for them and is responsible for them.
export async function countActiveEntries(playerId: string, userId: string) {
  const [tournaments, challenges] = await Promise.all([
    prisma.registration.count({
      where: {
        status: { in: ["pending", "approved"] },
        tournament: { status: { notIn: [...FINISHED_TOURNAMENT] } },
        OR: [{ playerId }, { teamEntry: { members: { some: { playerId } } } }],
      },
    }),
    prisma.challengeApplication.count({
      where: {
        applicantUserId: userId,
        status: { in: ["applied", "selected"] },
        completedAt: null,
        challenge: { status: { in: ["open", "in_progress"] } },
      },
    }),
  ]);
  // A club team's challenge application pins every player on that team's roster.
  const asTeamMember = await prisma.challengeApplication.count({
    where: {
      kind: "team",
      status: { in: ["applied", "selected"] },
      completedAt: null,
      challenge: { status: { in: ["open", "in_progress"] } },
      clubTeam: { members: { some: { playerId } } },
      applicantUserId: { not: userId },
    },
  });
  const challengesTotal = challenges + asTeamMember;
  return { tournaments, challenges: challengesTotal, total: tournaments + challengesTotal };
}

export interface SetInstitutionInput {
  institutionId: string;
  studentId: string | null;
  // The player confirmed the "you can't change this for a week" warning.
  acknowledged: boolean;
}

// Pick (or change) the player's institute. Picking the first one is free and
// instant; changing an existing one is allowed once a week and needs the
// player to acknowledge the warning first.
export async function setPlayerInstitution(
  userId: string,
  input: SetInstitutionInput,
  now = new Date()
): Promise<
  | Result<{ id: string }>
  | { error: "change_locked"; unlocksAt: Date }
  | { error: "has_active_entries"; tournaments: number; challenges: number }
> {
  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile) return { error: "no_player_profile" };

  const inst = await prisma.institution.findUnique({
    where: { id: input.institutionId },
    select: { id: true, name: true, verified: true },
  });
  if (!inst || !inst.verified) return { error: "institution_not_found" };

  const existing = await prisma.playerInstitution.findUnique({ where: { playerId: profile.id } });

  if (!existing) {
    const row = await prisma.playerInstitution.create({
      data: {
        playerId: profile.id,
        institutionId: inst.id,
        institutionName: inst.name,
        studentId: input.studentId,
        lastChangedAt: now,
      },
    });
    return { data: { id: row.id } };
  }

  // Same institute: only the optional student number can change.
  if (existing.institutionId === inst.id) {
    const row = await prisma.playerInstitution.update({
      where: { id: existing.id },
      data: { studentId: input.studentId },
    });
    return { data: { id: row.id } };
  }

  // Legacy row (free-text name, never linked to an institute): first real pick.
  if (existing.institutionId) {
    const active = await countActiveEntries(profile.id, userId);
    if (active.total > 0) {
      return { error: "has_active_entries", tournaments: active.tournaments, challenges: active.challenges };
    }
    const unlocksAt = institutionChangeUnlocksAt(existing.lastChangedAt);
    if (now < unlocksAt) return { error: "change_locked", unlocksAt };
    if (!input.acknowledged) return { error: "confirmation_required" };
  }

  const row = await prisma.playerInstitution.update({
    where: { id: existing.id },
    data: {
      institutionId: inst.id,
      institutionName: inst.name,
      studentId: input.studentId,
      lastChangedAt: now,
    },
  });
  return { data: { id: row.id } };
}

// ------------------------------------------------------------
// Which institutes may take part, and who approves whom
// ------------------------------------------------------------

// The host institute is the tournament organizer's own (if verified); extra
// institutes come from TournamentInstitution. A co-host only counts once it
// has accepted; guests are allowed outright.
export interface AudienceLink {
  institutionId: string;
  role: "cohost" | "guest";
  status: "pending" | "accepted" | "declined";
}

// Shared by tournaments and challenges: the host institute is the organizer's
// own (if verified); `links` are the extra institutes (already filtered to
// verified ones). A co-host only counts once accepted; guests outright.
export async function buildAudience(organizerId: string, links: AudienceLink[]) {
  const host = await prisma.institution.findUnique({
    where: { organizerId },
    select: { id: true, verified: true },
  });
  const hostId = host?.verified ? host.id : null;
  const cohostIds = new Set(
    links.filter((l) => l.role === "cohost" && l.status === "accepted").map((l) => l.institutionId)
  );
  const guestIds = new Set(links.filter((l) => l.role === "guest").map((l) => l.institutionId));
  const allowed = new Set<string>([...cohostIds, ...guestIds]);
  if (hostId) allowed.add(hostId);
  return { hostId, cohostIds, guestIds, allowed };
}
export type Audience = Awaited<ReturnType<typeof buildAudience>>;

async function loadAudience(tournamentId: string, organizerId: string) {
  const links = await prisma.tournamentInstitution.findMany({
    where: { tournamentId, institution: { verified: true } },
    select: { institutionId: true, role: true, status: true },
  });
  return buildAudience(organizerId, links);
}

// Every player on an entry must belong to a participating institute, and they
// must all share ONE (a team plays for a single institute).
export async function evaluateMembership(
  audience: Audience,
  playerIds: string[],
  opts: { selfPlayerId?: string; noun: "tournament" | "challenge" }
): Promise<
  | { ok: true; institutionId: string }
  | { error: "institution_required" | "institution_mixed_team"; message: string }
> {
  const ids = [...new Set(playerIds)];
  const memberships = await prisma.playerInstitution.findMany({
    where: { playerId: { in: ids } },
    select: { playerId: true, institutionId: true },
  });
  const byPlayer = new Map(memberships.map((m) => [m.playerId, m.institutionId]));
  const missing = ids.filter((id) => {
    const inst = byPlayer.get(id);
    return !inst || !audience.allowed.has(inst);
  });
  if (ids.length === 0 || missing.length > 0) {
    const selfMissing = opts.selfPlayerId ? missing.includes(opts.selfPlayerId) : true;
    return {
      error: "institution_required",
      message: selfMissing
        ? `This ${opts.noun} is only open to players from the participating institutes. Check that you've selected your institute in your profile.`
        : `Every player on the team must belong to an institute taking part in this ${opts.noun}.`,
    };
  }
  const institutes = new Set(ids.map((id) => byPlayer.get(id)));
  if (institutes.size > 1) {
    return {
      error: "institution_mixed_team",
      message: "All players in a team must belong to the same institute.",
    };
  }
  return { ok: true, institutionId: [...institutes][0] as string };
}

export type InstitutionGateResult =
  | { ok: true; institutionId: string | null; routedInstitutionId: string | null }
  | {
      error:
        | "institution_required"
        | "institution_proof_required"
        | "institution_mixed_team"
        | "institution_quota_full";
      message: string;
    };

// The one check every way of entering a tournament goes through (self
// registration, club entries, organizer manual-add). Open tournaments pass
// straight away. For institution-only ones EVERY player on the entry must
// belong to an institute that takes part (host, accepted co-host, or guest).
// On success it also says whose queue the registration belongs to: the shared
// institute of the entry if that is an accepted co-host, otherwise the host.
// `proof` is only checked when the caller is a player registering themselves
// (organizer manual-add vouches for the player, so it passes `skipProof`).
export async function checkInstitutionGate(
  tournamentId: string,
  playerIds: string[],
  opts: {
    proofPath?: string | null;
    skipProof?: boolean;
    selfPlayerId?: string;
    // Re-checking an entry that already exists (don't count it against the quota).
    excludeRegistrationId?: string;
  } = {}
): Promise<InstitutionGateResult> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      audienceScope: true,
      requireFreshInstitutionProof: true,
      organizerId: true,
      maxEntriesPerInstitute: true,
    },
  });
  if (!t || t.audienceScope !== "institution") {
    return { ok: true, institutionId: null, routedInstitutionId: null };
  }

  const audience = await loadAudience(tournamentId, t.organizerId);
  const member = await evaluateMembership(audience, playerIds, {
    selfPlayerId: opts.selfPlayerId,
    noun: "tournament",
  });
  if ("error" in member) return member;
  const institutionId = member.institutionId;

  if (t.requireFreshInstitutionProof && !opts.skipProof && !opts.proofPath) {
    return {
      error: "institution_proof_required",
      message: "This organizer needs a fresh photo of your student ID for this tournament.",
    };
  }

  // The host caps how many entries (solo players or teams) each institute may
  // send: a per-institute override, else the tournament default.
  const link = await prisma.tournamentInstitution.findUnique({
    where: { tournamentId_institutionId: { tournamentId, institutionId } },
    select: { maxEntries: true },
  });
  const limit = link?.maxEntries ?? t.maxEntriesPerInstitute ?? null;
  if (limit !== null) {
    const used = await prisma.registration.count({
      where: {
        tournamentId,
        institutionId,
        status: { in: ["pending", "approved"] },
        ...(opts.excludeRegistrationId ? { id: { not: opts.excludeRegistrationId } } : {}),
      },
    });
    if (used >= limit) {
      return {
        error: "institution_quota_full",
        message: `Your institute has used all ${limit} of its ${limit === 1 ? "entry" : "entries"} in this tournament.`,
      };
    }
  }

  const routedInstitutionId = audience.cohostIds.has(institutionId) ? institutionId : null;
  return { ok: true, institutionId, routedInstitutionId };
}

// A roster edit after registering must keep the team on its one institute.
export async function checkTeamRosterInstitution(
  tournamentId: string,
  playerIds: string[],
  entryInstitutionId: string | null
): Promise<{ ok: true } | { error: "institution_mixed_team"; message: string }> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { audienceScope: true },
  });
  if (!t || t.audienceScope !== "institution") return { ok: true };
  const memberships = await prisma.playerInstitution.findMany({
    where: { playerId: { in: playerIds } },
    select: { institutionId: true },
  });
  const all = new Set(memberships.map((m) => m.institutionId));
  const sameAsEntry = !entryInstitutionId || (all.size === 1 && all.has(entryInstitutionId));
  if (memberships.length !== playerIds.length || all.size !== 1 || !sameAsEntry) {
    return {
      error: "institution_mixed_team",
      message: "Every player on this team must belong to the team's institute.",
    };
  }
  return { ok: true };
}

// A proof path must live in the registering user's own folder of the proofs
// bucket — same rule as the ID upload in 8.1.
export function isOwnProofPath(path: unknown, userId: string): path is string {
  return typeof path === "string" && path.startsWith(`${userId}/`) && !path.includes("..");
}

// ------------------------------------------------------------
// Co-host / guest management (host only) and invitations (co-host only)
// ------------------------------------------------------------

export async function listTournamentInstitutions(tournamentId: string) {
  return prisma.tournamentInstitution.findMany({
    where: { tournamentId },
    include: { institution: { select: { id: true, name: true } } },
    orderBy: { invitedAt: "asc" },
  });
}

export async function addTournamentInstitution(
  tournamentId: string,
  organizerId: string,
  institutionId: string,
  role: "cohost" | "guest"
): Promise<Result<{ id: string }>> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { organizerId: true, audienceScope: true },
  });
  if (!t) return { error: "not_found" };
  if (t.organizerId !== organizerId) return { error: "forbidden" };
  if (t.audienceScope !== "institution") return { error: "not_institution_tournament" };

  const host = await prisma.institution.findUnique({ where: { organizerId } });
  if (!host?.verified) return { error: "host_not_verified" };
  if (host.id === institutionId) return { error: "is_host" };

  const inst = await prisma.institution.findUnique({ where: { id: institutionId } });
  if (!inst || !inst.verified) return { error: "institution_not_found" };

  const existing = await prisma.tournamentInstitution.findUnique({
    where: { tournamentId_institutionId: { tournamentId, institutionId } },
  });
  if (existing) return { error: "already_added" };

  const row = await prisma.tournamentInstitution.create({
    data: {
      tournamentId,
      institutionId,
      role,
      // Guests need nobody's say-so; co-hosts must accept the invite.
      status: role === "guest" ? "accepted" : "pending",
    },
  });
  return { data: { id: row.id } };
}

export async function removeTournamentInstitution(
  tournamentId: string,
  organizerId: string,
  institutionId: string
): Promise<Result<{ removed: true }>> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { organizerId: true },
  });
  if (!t) return { error: "not_found" };
  if (t.organizerId !== organizerId) return { error: "forbidden" };

  const link = await prisma.tournamentInstitution.findUnique({
    where: { tournamentId_institutionId: { tournamentId, institutionId } },
  });
  if (!link) return { error: "not_found" };

  // Removing an institute that already has players in the tournament would
  // strand them: only allowed while nobody active belongs to it.
  const active = await prisma.registration.count({
    where: {
      tournamentId,
      status: { in: ["pending", "approved"] },
      OR: [
        { routedInstitutionId: institutionId },
        { player: { institution: { institutionId } } },
        { teamEntry: { members: { some: { player: { institution: { institutionId } } } } } },
      ],
    },
  });
  if (active > 0) return { error: "has_registrations" };

  await prisma.tournamentInstitution.delete({ where: { id: link.id } });
  return { data: { removed: true } };
}

// The invited institute's organization accepts or declines a co-host invite.
export async function respondToCoHostInvite(
  linkId: string,
  organizerId: string,
  accept: boolean
): Promise<Result<{ status: string }>> {
  const link = await prisma.tournamentInstitution.findUnique({
    where: { id: linkId },
    include: { institution: { select: { organizerId: true } } },
  });
  if (!link) return { error: "not_found" };
  if (link.institution.organizerId !== organizerId) return { error: "forbidden" };
  if (link.role !== "cohost") return { error: "not_cohost_invite" };
  if (link.status !== "pending") return { error: "already_responded" };

  const status = accept ? "accepted" : "declined";
  await prisma.tournamentInstitution.update({
    where: { id: linkId },
    data: { status, respondedAt: new Date() },
  });
  return { data: { status } };
}

// Tournaments this organization's institute has been invited to co-host.
export async function listCoHostInvitations(organizerId: string) {
  const inst = await prisma.institution.findUnique({ where: { organizerId }, select: { id: true } });
  if (!inst) return [];
  return prisma.tournamentInstitution.findMany({
    where: { institutionId: inst.id, role: "cohost", status: { in: ["pending", "accepted"] } },
    include: {
      tournament: { select: { id: true, name: true, slug: true, status: true, organizer: { select: { orgName: true } } } },
    },
    orderBy: { invitedAt: "desc" },
  });
}

// ------------------------------------------------------------
// Who may act on a registration
// ------------------------------------------------------------

export type RegistrationActor =
  | { role: "host" }
  | { role: "cohost"; institutionId: string }
  | null;

// Host: the tournament's organizer — any registration. Co-host: an ACCEPTED
// co-host institute of this tournament — only registrations routed to its own
// institute. Everyone else: no access.
export async function getRegistrationActor(
  tournamentId: string,
  tournamentOrganizerId: string,
  organizerId: string,
  routedInstitutionId: string | null
): Promise<RegistrationActor> {
  if (tournamentOrganizerId === organizerId) return { role: "host" };
  if (!routedInstitutionId) return null;
  const link = await prisma.tournamentInstitution.findFirst({
    where: {
      tournamentId,
      institutionId: routedInstitutionId,
      role: "cohost",
      status: "accepted",
      institution: { organizerId, verified: true },
    },
    select: { institutionId: true },
  });
  return link ? { role: "cohost", institutionId: link.institutionId } : null;
}

// ------------------------------------------------------------
// Entry quotas (host only)
// ------------------------------------------------------------

// institutionId = null sets the tournament-wide default per institute (applies
// to every institute, the host's own included); otherwise it sets the override
// for one co-host/guest institute. maxEntries = null removes the cap/override.
export async function setInstitutionEntryLimit(
  tournamentId: string,
  organizerId: string,
  institutionId: string | null,
  maxEntries: number | null
): Promise<Result<{ maxEntries: number | null }>> {
  if (maxEntries !== null && (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000)) {
    return { error: "invalid_limit" };
  }
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { organizerId: true, audienceScope: true },
  });
  if (!t) return { error: "not_found" };
  if (t.organizerId !== organizerId) return { error: "forbidden" };
  if (t.audienceScope !== "institution") return { error: "not_institution_tournament" };

  if (institutionId === null) {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { maxEntriesPerInstitute: maxEntries } });
    return { data: { maxEntries } };
  }
  const link = await prisma.tournamentInstitution.findUnique({
    where: { tournamentId_institutionId: { tournamentId, institutionId } },
  });
  if (!link) return { error: "not_found" };
  await prisma.tournamentInstitution.update({ where: { id: link.id }, data: { maxEntries } });
  return { data: { maxEntries } };
}

// Live entries per institute for the host's panel.
export async function getInstitutionUsage(tournamentId: string): Promise<Record<string, number>> {
  const rows = await prisma.registration.groupBy({
    by: ["institutionId"],
    where: { tournamentId, institutionId: { not: null }, status: { in: ["pending", "approved"] } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.institutionId as string, r._count._all]));
}
