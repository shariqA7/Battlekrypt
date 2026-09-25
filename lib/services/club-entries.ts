// Club tournament entries (Phase 2 roster-lock rule).
//
// A club team or solo roster player is entered into a tournament by the
// club owner or that team's captain. This reuses registerForTournament's
// existing rules (open-registration check, duplicate check, entry fee /
// payment-proof handling) rather than duplicating them — it just resolves
// which PlayerProfiles to send and tags the resulting TeamEntry with the
// club.
//
// Roster-lock rule (spec §4): a club can add to / edit a tournament's entry
// only while that tournament is still accepting registrations. Once it's
// past that ("registration_closed", "in_progress", "completed",
// "cancelled"), the entry is frozen — only the organizer's manual-add can
// still change it (see manualAddRegistration in lib/services/tournaments.ts).
// The club's PERMANENT roster (ClubRoster/ClubTeam) is untouched by any of
// this and stays editable any time.

import { prisma } from "@/lib/prisma";
import { registerForTournament } from "@/lib/services/tournaments";

export const CLUB_ENTRY_ERRORS = {
  validation_error: { status: 400, message: "Invalid input." },
  not_found: { status: 404, message: "Not found." },
  team_not_found: { status: 404, message: "Team not found." },
  player_not_found: { status: 404, message: "Player not found." },
  not_authorized: {
    status: 403,
    message: "Only the club owner or that team's captain can do this.",
  },
  game_mismatch: { status: 400, message: "That team doesn't play this tournament's game." },
  mode_mismatch: { status: 400, message: "Solo players can't enter a team-mode tournament." },
  not_on_roster: { status: 400, message: "That player isn't on your roster for this game." },
  member_not_on_team: {
    status: 400,
    message: "Every selected player must be a current member of this team.",
  },
  too_many_members: { status: 400, message: "Too many players selected for this tournament." },
  too_few_members: { status: 400, message: "Select at least one player." },
  registration_closed: {
    status: 409,
    message: "Registration for this tournament is no longer open.",
  },
  full: { status: 409, message: "This tournament is full." },
  already_registered: { status: 409, message: "This team or player is already registered." },
  payment_proof_required: { status: 400, message: "Proof of payment is required." },
  entry_locked: {
    status: 403,
    message: "This tournament has started — the entry can no longer be changed.",
  },
  not_club_entry: { status: 400, message: "This entry isn't linked to your club." },
  forbidden: { status: 403, message: "You don't own this tournament." },
} as const;

export type ClubEntryErrorCode = keyof typeof CLUB_ENTRY_ERRORS;
type Fail = { error: ClubEntryErrorCode; message?: string };
function fail(error: ClubEntryErrorCode, message?: string): Fail {
  return { error, message };
}

// Statuses in which the club may still add to / edit its entry. Anything
// else (registration_closed, in_progress, completed, cancelled) is locked.
const ENTRY_EDITABLE_STATUSES = ["published", "registration_open"];

interface ActingClub {
  id: string;
}

// Who may act for a given ClubTeam: its club's owner, or the team's
// designated captain. Returns the club (for registerForTournament's clubId)
// or a failure.
export async function resolveTeamActor(
  userId: string,
  teamId: string
): Promise<{ club: ActingClub } | Fail> {
  const team = await prisma.clubTeam.findUnique({
    where: { id: teamId },
    include: { club: { select: { id: true, userId: true, status: true } } },
  });
  if (!team) return fail("team_not_found");
  if (team.club.status !== "approved") return fail("not_authorized");

  if (team.club.userId === userId) return { club: team.club };

  const captain = await prisma.clubRoster.findFirst({
    where: { teamId, isCaptain: true, player: { userId } },
  });
  if (captain) return { club: team.club };

  return fail("not_authorized");
}

// Who may act for a club's SOLO roster spot in a given game: only the club
// owner (a solo "team" has no captain concept — there's nothing to captain).
async function resolveClubOwner(userId: string): Promise<{ club: ActingClub } | Fail> {
  const club = await prisma.clubProfile.findUnique({ where: { userId } });
  if (!club || club.status !== "approved") return fail("not_authorized");
  return { club };
}

function memberCap(mode: "solo" | "duo" | "squad", maxTeamSize: number | null) {
  if (mode === "solo") return 1;
  if (mode === "duo") return 2;
  return maxTeamSize ?? Infinity;
}

// ------------------------------------------------------------
// Submit a new entry
// ------------------------------------------------------------

export async function submitClubTeamEntry(
  userId: string,
  tournamentId: string,
  teamId: string,
  memberPlayerIds: string[],
  opts: { paymentProofUrl?: string; customFieldResponses?: unknown } = {}
) {
  const actor = await resolveTeamActor(userId, teamId);
  if ("error" in actor) return actor;

  const [tournament, team] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId } }),
    prisma.clubTeam.findUnique({ where: { id: teamId } }),
  ]);
  if (!tournament) return fail("not_found");
  if (!team) return fail("team_not_found");
  if (team.gameId !== tournament.gameId) return fail("game_mismatch");
  if (tournament.mode === "solo") return fail("mode_mismatch");

  const ids = [...new Set(memberPlayerIds)];
  if (ids.length === 0) return fail("too_few_members");
  if (ids.length > memberCap(tournament.mode, tournament.maxTeamSize)) {
    return fail("too_many_members");
  }

  const rosterMembers = await prisma.clubRoster.findMany({ where: { teamId } });
  const rosterIds = new Set(rosterMembers.map((m) => m.playerId));
  if (!ids.every((id) => rosterIds.has(id))) return fail("member_not_on_team");

  const result = await registerForTournament({
    tournamentId,
    playerId: ids[0],
    teamMemberPlayerIds: ids.slice(1),
    teamName: team.name,
    paymentProofUrl: opts.paymentProofUrl,
    customFieldResponses: opts.customFieldResponses,
  });
  if ("error" in result) return result as { error: string };

  // registerForTournament doesn't know about clubs — tag the TeamEntry it
  // just created so it shows the club tag/logo and can be found later.
  await prisma.teamEntry.update({
    where: { id: result.data.teamEntryId! },
    data: { clubId: actor.club.id, clubTeamId: teamId },
  });

  return { data: result.data };
}

export async function submitClubSoloEntry(
  userId: string,
  tournamentId: string,
  playerId: string,
  opts: { paymentProofUrl?: string; customFieldResponses?: unknown } = {}
) {
  const actor = await resolveClubOwner(userId);
  if ("error" in actor) return actor;

  const [tournament, rosterRow] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId } }),
    prisma.clubRoster.findUnique({ where: { playerId } }),
  ]);
  if (!tournament) return fail("not_found");
  if (tournament.mode !== "solo") return fail("mode_mismatch");
  if (!rosterRow || rosterRow.clubId !== actor.club.id || rosterRow.teamId !== null) {
    return fail("not_on_roster");
  }
  if (rosterRow.gameId !== tournament.gameId) return fail("not_on_roster");

  // Solo entries have no TeamEntry to tag — nothing club-specific is stored
  // on the Registration itself. The club tag on solo entries is resolved at
  // display time from the player's current ClubRoster row.
  return registerForTournament({
    tournamentId,
    playerId,
    paymentProofUrl: opts.paymentProofUrl,
    customFieldResponses: opts.customFieldResponses,
  });
}

// ------------------------------------------------------------
// Edit an existing entry's members (pre-lock only)
// ------------------------------------------------------------

export async function updateClubTeamEntryMembers(
  userId: string,
  teamEntryId: string,
  memberPlayerIds: string[]
) {
  const entry = await prisma.teamEntry.findUnique({
    where: { id: teamEntryId },
    include: { tournament: true },
  });
  if (!entry) return fail("not_found");
  if (!entry.clubTeamId || !entry.clubId) return fail("not_club_entry");

  const actor = await resolveTeamActor(userId, entry.clubTeamId);
  if ("error" in actor) return actor;
  if (actor.club.id !== entry.clubId) return fail("not_authorized");

  if (!ENTRY_EDITABLE_STATUSES.includes(entry.tournament.status)) {
    return fail("entry_locked");
  }

  const ids = [...new Set(memberPlayerIds)];
  if (ids.length === 0) return fail("too_few_members");
  if (ids.length > memberCap(entry.tournament.mode, entry.tournament.maxTeamSize)) {
    return fail("too_many_members");
  }

  const rosterMembers = await prisma.clubRoster.findMany({ where: { teamId: entry.clubTeamId } });
  const rosterIds = new Set(rosterMembers.map((m) => m.playerId));
  if (!ids.every((id) => rosterIds.has(id))) return fail("member_not_on_team");

  await prisma.$transaction([
    prisma.teamMember.deleteMany({ where: { teamEntryId } }),
    prisma.teamMember.createMany({
      data: ids.map((playerId) => ({ teamEntryId, playerId })),
    }),
  ]);

  return { data: { teamEntryId, memberPlayerIds: ids } };
}

// ------------------------------------------------------------
// Reads
// ------------------------------------------------------------

// Powers "Register your club team" on the join page: which of the caller's
// club teams/solo roster spot are eligible for this tournament, and whether
// they already have an entry.
export async function getClubEntryOptions(userId: string, tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return null;

  const club = await prisma.clubProfile.findUnique({ where: { userId } });

  const captainTeamIds = (
    await prisma.clubRoster.findMany({
      where: { isCaptain: true, player: { userId } },
      select: { teamId: true },
    })
  )
    .map((r) => r.teamId)
    .filter((id): id is string => !!id);

  if (!club && captainTeamIds.length === 0) return null;

  const editable = ENTRY_EDITABLE_STATUSES.includes(tournament.status);

  if (tournament.mode === "solo") {
    if (!club || club.status !== "approved") return { editable, teams: [], soloEntry: null };
    const rosterRow = await prisma.clubRoster.findFirst({
      where: { clubId: club.id, gameId: tournament.gameId, teamId: null },
    });
    if (!rosterRow) return { editable, teams: [], soloEntry: null };

    const existing = await prisma.registration.findFirst({
      where: { tournamentId, playerId: rosterRow.playerId },
    });
    return {
      editable,
      teams: [],
      soloEntry: { playerId: rosterRow.playerId, alreadyRegistered: !!existing },
    };
  }

  const teamIds = new Set(captainTeamIds);
  if (club?.status === "approved") {
    (
      await prisma.clubTeam.findMany({
        where: { clubId: club.id, gameId: tournament.gameId },
        select: { id: true },
      })
    ).forEach((t) => teamIds.add(t.id));
  }

  const teams = await prisma.clubTeam.findMany({
    where: { id: { in: [...teamIds] }, gameId: tournament.gameId },
    include: { members: { include: { player: { include: { user: true } } } } },
  });

  const entries = await prisma.teamEntry.findMany({
    where: { tournamentId, clubTeamId: { in: teams.map((t) => t.id) } },
    select: { id: true, clubTeamId: true, members: { select: { playerId: true } } },
  });
  const entryByTeam = new Map(entries.map((e) => [e.clubTeamId!, e]));

  return {
    editable,
    soloEntry: null,
    teams: teams.map((t) => {
      const entry = entryByTeam.get(t.id);
      return {
        id: t.id,
        name: t.name,
        members: t.members.map((m) => ({
          id: m.playerId,
          name: m.player.user.displayName.includes("@")
            ? `${m.player.firstName ?? ""} ${m.player.lastName ?? ""}`.trim() || "Player"
            : m.player.user.displayName,
          role: m.role,
        })),
        entry: entry ? { id: entry.id, memberPlayerIds: entry.members.map((m) => m.playerId) } : null,
      };
    }),
  };
}

// ------------------------------------------------------------
// Organizer override (roster-lock's escape valve — spec §4)
//
// The organizer may add a club team or solo roster player to a tournament
// "at any point (before/during/after normal registration)", same as the
// existing manualAddRegistration for individual players. This bypasses the
// registration-window and roster-lock checks above (but not membership
// validity — the players still have to actually be on that club's roster).
// ------------------------------------------------------------

export async function manualAddClubTeamEntry(
  tournamentId: string,
  organizerId: string,
  clubTeamId: string,
  memberPlayerIds: string[],
  paymentStatus: "paid" | "waived" = "waived"
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return fail("not_found");
  if (tournament.organizerId !== organizerId) return fail("forbidden");
  if (tournament.mode === "solo") return fail("mode_mismatch");

  const team = await prisma.clubTeam.findUnique({
    where: { id: clubTeamId },
    include: { club: true },
  });
  if (!team) return fail("team_not_found");
  if (team.gameId !== tournament.gameId) return fail("game_mismatch");

  const ids = [...new Set(memberPlayerIds)];
  if (ids.length === 0) return fail("too_few_members");
  if (ids.length > memberCap(tournament.mode, tournament.maxTeamSize)) {
    return fail("too_many_members");
  }

  const rosterMembers = await prisma.clubRoster.findMany({ where: { teamId: clubTeamId } });
  const rosterIds = new Set(rosterMembers.map((m) => m.playerId));
  if (!ids.every((id) => rosterIds.has(id))) return fail("member_not_on_team");

  const alreadyIn = await prisma.registration.findFirst({
    where: { tournamentId, playerId: { in: ids } },
  });
  if (alreadyIn) return fail("already_registered");

  const registration = await prisma.$transaction(async (tx) => {
    const teamEntry = await tx.teamEntry.create({
      data: {
        tournamentId,
        name: team.name,
        clubId: team.clubId,
        clubTeamId,
        members: { create: ids.map((playerId) => ({ playerId })) },
      },
    });
    return tx.registration.create({
      data: {
        tournamentId,
        teamEntryId: teamEntry.id,
        status: "approved",
        approvedAt: new Date(),
        addedBy: "organizer",
        paymentStatus,
      },
    });
  });

  return { data: registration };
}

export async function manualAddClubSoloEntry(
  tournamentId: string,
  organizerId: string,
  playerId: string,
  paymentStatus: "paid" | "waived" = "waived"
) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return fail("not_found");
  if (tournament.organizerId !== organizerId) return fail("forbidden");
  if (tournament.mode !== "solo") return fail("mode_mismatch");

  const rosterRow = await prisma.clubRoster.findUnique({ where: { playerId } });
  if (!rosterRow || rosterRow.teamId !== null) return fail("not_on_roster");
  if (rosterRow.gameId !== tournament.gameId) return fail("not_on_roster");

  const existing = await prisma.registration.findFirst({ where: { tournamentId, playerId } });
  if (existing) return fail("already_registered");

  const registration = await prisma.registration.create({
    data: {
      tournamentId,
      playerId,
      status: "approved",
      approvedAt: new Date(),
      addedBy: "organizer",
      paymentStatus,
    },
  });

  return { data: registration };
}
