// Club roster service (Phase 2): teams, invitations, and the rules around them.
//
// Rules implemented here (all enforced server-side, never just in the UI):
//  - A person is on AT MOST ONE club's roster, in one game (and one team, for
//    team games). ClubRoster.playerId is unique.
//  - Roster rows are created ONLY by a player accepting an invitation.
//    Accepting replaces any existing roster row in one transaction — that is
//    how a player moves between clubs.
//  - A club can't reassign a player to another game directly: it removes them
//    first, then sends a new invite (same flow).
//  - Free clubs: one entry (a team OR a solo player) per game, no substitutes,
//    no coach. Paid clubs: unlimited, plus substitutes and a coach name.
//    (Limits come from lib/club-limits.ts.)
//  - Coach is a plain name on the team (ClubTeam.coachName) — no account.

import { prisma } from "@/lib/prisma";
import type { ClubRosterRole } from "@prisma/client";
import { getClubLimits } from "@/lib/club-limits";

// ------------------------------------------------------------
// Errors
// ------------------------------------------------------------

export const CLUB_ERRORS = {
  validation_error: { status: 400, message: "Invalid input." },
  not_found: { status: 404, message: "Not found." },
  game_not_found: { status: 404, message: "Game not found." },
  player_not_found: { status: 404, message: "Player not found." },
  team_not_found: { status: 404, message: "Team not found." },
  team_game_mismatch: { status: 400, message: "That team belongs to a different game." },
  substitute_needs_team: { status: 400, message: "Substitutes can only be added to a team." },
  team_not_empty: { status: 409, message: "Remove all members from this team first." },
  duplicate_team_name: {
    status: 409,
    message: "You already have a team with that name for this game.",
  },
  team_full: { status: 409, message: "That team has no free spots for this role." },
  already_on_roster: {
    status: 409,
    message:
      "That player is already on your roster. Remove them first to change their game or team.",
  },
  invite_pending: {
    status: 409,
    message: "You already have a pending invitation to that player.",
  },
  invite_not_pending: { status: 409, message: "This invitation has already been answered." },
  invite_invalid: { status: 409, message: "This invitation is no longer valid." },
  club_not_approved: { status: 403, message: "That club is not currently active." },
  entry_limit: {
    status: 403,
    message:
      "Your plan allows one team or solo player per game. Upgrade to add more.",
  },
  paid_substitutes: {
    status: 403,
    message: "Substitutes are available on paid club plans.",
  },
  paid_coach: { status: 403, message: "Setting a coach is available on paid club plans." },
  not_in_club: { status: 404, message: "You are not on a club roster." },
  conflict: { status: 409, message: "Something changed while saving — please try again." },
} as const;

export type ClubErrorCode = keyof typeof CLUB_ERRORS;
type Fail = { error: ClubErrorCode; message?: string };

function fail(error: ClubErrorCode, message?: string): Fail {
  return { error, message };
}

function isUniqueViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// ------------------------------------------------------------
// Public-safe player info
// ------------------------------------------------------------

// Some accounts use their email as displayName (see ensure-user). Never show
// that to other users — fall back to the profile's real name.
function playerLabel(p: {
  firstName: string | null;
  lastName: string | null;
  user: { displayName: string };
}) {
  const dn = p.user.displayName;
  if (!dn.includes("@")) return dn;
  const full = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
  return full || "Player";
}

const playerInclude = {
  user: { select: { displayName: true, avatarUrl: true } },
} as const;

// ------------------------------------------------------------
// Reads
// ------------------------------------------------------------

export async function getClubRoster(clubId: string) {
  const [teams, solo] = await Promise.all([
    prisma.clubTeam.findMany({
      where: { clubId },
      include: {
        game: { select: { id: true, name: true } },
        members: {
          include: { player: { include: playerInclude } },
          orderBy: { joinedAt: "asc" },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.clubRoster.findMany({
      where: { clubId, teamId: null },
      include: { game: { select: { id: true, name: true } }, player: { include: playerInclude } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  return {
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      coachName: t.coachName,
      game: t.game,
      members: t.members.map((m) => ({
        rosterId: m.id,
        role: m.role,
        isCaptain: m.isCaptain,
        joinedAt: m.joinedAt,
        player: { id: m.playerId, name: playerLabel(m.player), avatarUrl: m.player.user.avatarUrl },
      })),
    })),
    soloPlayers: solo.map((m) => ({
      rosterId: m.id,
      game: m.game,
      joinedAt: m.joinedAt,
      player: { id: m.playerId, name: playerLabel(m.player), avatarUrl: m.player.user.avatarUrl },
    })),
  };
}

export async function listClubInvites(clubId: string) {
  const invites = await prisma.clubInvite.findMany({
    where: { clubId, status: "pending" },
    include: {
      game: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      player: { include: playerInclude },
    },
    orderBy: { createdAt: "desc" },
  });

  return invites.map((i) => ({
    id: i.id,
    role: i.role,
    createdAt: i.createdAt,
    game: i.game,
    team: i.team,
    player: { id: i.playerId, name: playerLabel(i.player), avatarUrl: i.player.user.avatarUrl },
  }));
}

// Lets a club owner find players to invite. Matches on names only (never
// email), requires 3+ characters, and returns just what's already public on
// player profile pages.
export async function searchPlayers(query: string, clubId: string) {
  const q = query.trim();
  if (q.length < 3 || q.includes("@")) return [];

  const players = await prisma.playerProfile.findMany({
    where: {
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        {
          user: {
            AND: [
              { displayName: { contains: q, mode: "insensitive" } },
              { NOT: { displayName: { contains: "@" } } },
            ],
          },
        },
      ],
    },
    include: { ...playerInclude, clubRoster: { select: { clubId: true } } },
    take: 8,
  });

  return players.map((p) => ({
    id: p.id,
    name: playerLabel(p),
    avatarUrl: p.user.avatarUrl,
    onYourRoster: p.clubRoster?.clubId === clubId,
  }));
}

// ------------------------------------------------------------
// Teams
// ------------------------------------------------------------

type ClubForLimits = { id: string; subscriptionPlanCode: string };

// "Entries" = teams + solo players a club fields in one game. Pending solo
// invites count too so a free club can't queue up several and exceed the cap.
async function countEntries(
  db: Pick<typeof prisma, "clubTeam" | "clubRoster" | "clubInvite">,
  clubId: string,
  gameId: string,
  opts: { excludePlayerId?: string } = {}
) {
  const [teams, soloRoster, soloPending] = await Promise.all([
    db.clubTeam.count({ where: { clubId, gameId } }),
    db.clubRoster.count({
      where: {
        clubId,
        gameId,
        teamId: null,
        ...(opts.excludePlayerId && { playerId: { not: opts.excludePlayerId } }),
      },
    }),
    db.clubInvite.count({
      where: { clubId, gameId, teamId: null, status: "pending" },
    }),
  ]);
  return { teams, soloRoster, soloPending };
}

function cleanName(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length >= min && v.length <= max ? v : null;
}

export async function createTeam(
  club: ClubForLimits,
  input: { gameId: string; name: string; coachName?: string | null }
) {
  const name = cleanName(input.name, 2, 40);
  if (!name) return fail("validation_error", "Team name must be 2–40 characters.");

  const coachName = input.coachName ? cleanName(input.coachName, 2, 60) : null;
  if (input.coachName && !coachName) {
    return fail("validation_error", "Coach name must be 2–60 characters.");
  }

  const limits = getClubLimits(club);
  if (coachName && !limits.canSetCoach) return fail("paid_coach");

  const game = await prisma.game.findFirst({ where: { id: input.gameId, isApproved: true } });
  if (!game) return fail("game_not_found");

  if (limits.maxEntriesPerGame !== null) {
    const c = await countEntries(prisma, club.id, game.id);
    if (c.teams + c.soloRoster + c.soloPending >= limits.maxEntriesPerGame) {
      return fail("entry_limit");
    }
  }

  try {
    const team = await prisma.clubTeam.create({
      data: { clubId: club.id, gameId: game.id, name, coachName },
    });
    return { data: team };
  } catch (e) {
    if (isUniqueViolation(e)) return fail("duplicate_team_name");
    throw e;
  }
}

export async function updateTeam(
  club: ClubForLimits,
  teamId: string,
  input: { name?: string; coachName?: string | null }
) {
  const team = await prisma.clubTeam.findUnique({ where: { id: teamId } });
  if (!team || team.clubId !== club.id) return fail("team_not_found");

  const data: { name?: string; coachName?: string | null } = {};

  if (input.name !== undefined) {
    const name = cleanName(input.name, 2, 40);
    if (!name) return fail("validation_error", "Team name must be 2–40 characters.");
    data.name = name;
  }

  if (input.coachName !== undefined) {
    // Empty string / null clears the coach (always allowed, even if the club
    // later drops to the free plan). Setting one needs a paid plan.
    if (!input.coachName) {
      data.coachName = null;
    } else {
      const coach = cleanName(input.coachName, 2, 60);
      if (!coach) return fail("validation_error", "Coach name must be 2–60 characters.");
      if (!getClubLimits(club).canSetCoach) return fail("paid_coach");
      data.coachName = coach;
    }
  }

  try {
    const updated = await prisma.clubTeam.update({ where: { id: teamId }, data });
    return { data: updated };
  } catch (e) {
    if (isUniqueViolation(e)) return fail("duplicate_team_name");
    throw e;
  }
}

export async function deleteTeam(club: ClubForLimits, teamId: string) {
  const team = await prisma.clubTeam.findUnique({
    where: { id: teamId },
    include: { _count: { select: { members: true } } },
  });
  if (!team || team.clubId !== club.id) return fail("team_not_found");
  if (team._count.members > 0) return fail("team_not_empty");

  // Cancel this team's pending invites first: otherwise the FK's SET NULL
  // would silently turn them into SOLO invites.
  await prisma.$transaction([
    prisma.clubInvite.updateMany({
      where: { teamId, status: "pending" },
      data: { status: "cancelled", respondedAt: new Date() },
    }),
    prisma.clubTeam.delete({ where: { id: teamId } }),
  ]);

  return { data: { id: teamId } };
}

// ------------------------------------------------------------
// Club-side invites and roster removal
// ------------------------------------------------------------

export async function sendInvite(
  club: ClubForLimits,
  input: {
    playerId: string;
    gameId: string;
    teamId?: string | null;
    role?: ClubRosterRole;
  }
) {
  const role: ClubRosterRole = input.role ?? "player";
  if (role !== "player" && role !== "substitute") return fail("validation_error");

  const limits = getClubLimits(club);

  const game = await prisma.game.findFirst({ where: { id: input.gameId, isApproved: true } });
  if (!game) return fail("game_not_found");

  const player = await prisma.playerProfile.findUnique({ where: { id: input.playerId } });
  if (!player) return fail("player_not_found");

  const teamId = input.teamId || null;
  let team: { id: string; clubId: string; gameId: string } | null = null;

  if (teamId) {
    team = await prisma.clubTeam.findUnique({ where: { id: teamId } });
    if (!team || team.clubId !== club.id) return fail("team_not_found");
    if (team.gameId !== game.id) return fail("team_game_mismatch");
  } else if (role === "substitute") {
    return fail("substitute_needs_team");
  }

  if (role === "substitute" && limits.maxSubstitutesPerTeam === 0) {
    return fail("paid_substitutes");
  }

  // One club per person, and a club can't move someone between its own games
  // or teams by inviting — it must remove them first.
  const current = await prisma.clubRoster.findUnique({ where: { playerId: player.id } });
  if (current?.clubId === club.id) return fail("already_on_roster");

  const dup = await prisma.clubInvite.findFirst({
    where: { clubId: club.id, playerId: player.id, status: "pending" },
  });
  if (dup) return fail("invite_pending");

  if (team) {
    const [members, pending] = await Promise.all([
      prisma.clubRoster.count({ where: { teamId: team.id, role } }),
      prisma.clubInvite.count({ where: { teamId: team.id, role, status: "pending" } }),
    ]);
    const cap = role === "player" ? limits.maxPlayersPerTeam : limits.maxSubstitutesPerTeam;
    if (members + pending >= cap) return fail("team_full");
  } else if (limits.maxEntriesPerGame !== null) {
    const c = await countEntries(prisma, club.id, game.id);
    if (c.teams + c.soloRoster + c.soloPending >= limits.maxEntriesPerGame) {
      return fail("entry_limit");
    }
  }

  const invite = await prisma.clubInvite.create({
    data: { clubId: club.id, playerId: player.id, gameId: game.id, teamId, role },
  });
  return { data: invite };
}

export async function cancelInvite(club: ClubForLimits, inviteId: string) {
  const invite = await prisma.clubInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.clubId !== club.id) return fail("not_found");
  if (invite.status !== "pending") return fail("invite_not_pending");

  const updated = await prisma.clubInvite.update({
    where: { id: inviteId },
    data: { status: "cancelled", respondedAt: new Date() },
  });
  return { data: updated };
}

export async function removeFromRoster(club: ClubForLimits, rosterId: string) {
  const row = await prisma.clubRoster.findUnique({ where: { id: rosterId } });
  if (!row || row.clubId !== club.id) return fail("not_found");

  await prisma.clubRoster.delete({ where: { id: rosterId } });
  return { data: { id: rosterId } };
}

// ------------------------------------------------------------
// Player-side: invitations, membership
// ------------------------------------------------------------

export async function listPlayerInvites(playerId: string) {
  return prisma.clubInvite.findMany({
    where: { playerId, status: "pending", club: { status: "approved" } },
    include: {
      club: { select: { id: true, clubName: true, logoUrl: true } },
      game: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPlayerMembership(playerId: string) {
  return prisma.clubRoster.findUnique({
    where: { playerId },
    include: {
      club: { select: { id: true, clubName: true, logoUrl: true } },
      game: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });
}

// Accepting is the ONLY way a roster row is created. Everything happens in
// one transaction: limits re-checked (things may have changed since the club
// sent the invite), the player's existing roster row (if any) removed —
// that's the "moved from another club" rule — the new row created, and the
// invite marked accepted.
export async function acceptInvite(playerId: string, inviteId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const invite = await tx.clubInvite.findUnique({
        where: { id: inviteId },
        include: { club: true },
      });
      if (!invite || invite.playerId !== playerId) return fail("not_found");
      if (invite.status !== "pending") return fail("invite_not_pending");
      if (invite.club.status !== "approved") return fail("club_not_approved");

      const limits = getClubLimits(invite.club);

      // A team invite whose team is gone, or a solo "substitute", is invalid.
      if (invite.teamId) {
        const team = await tx.clubTeam.findUnique({ where: { id: invite.teamId } });
        if (!team || team.gameId !== invite.gameId) return fail("invite_invalid");
      } else if (invite.role === "substitute") {
        return fail("invite_invalid");
      }

      const current = await tx.clubRoster.findUnique({ where: { playerId } });

      if (invite.role === "substitute" && limits.maxSubstitutesPerTeam === 0) {
        return fail("paid_substitutes");
      }

      if (invite.teamId) {
        const filled = await tx.clubRoster.count({
          where: { teamId: invite.teamId, role: invite.role, playerId: { not: playerId } },
        });
        const cap =
          invite.role === "player" ? limits.maxPlayersPerTeam : limits.maxSubstitutesPerTeam;
        if (filled >= cap) return fail("team_full");
      } else if (limits.maxEntriesPerGame !== null) {
        const c = await countEntries(tx, invite.clubId, invite.gameId, {
          excludePlayerId: playerId,
        });
        // Pending solo invites aren't counted here — this player's own
        // invite is one of them, and others aren't filled yet.
        if (c.teams + c.soloRoster >= limits.maxEntriesPerGame) return fail("entry_limit");
      }

      // Moving: drop the old roster row (any club, any game) first.
      if (current) await tx.clubRoster.delete({ where: { id: current.id } });

      const roster = await tx.clubRoster.create({
        data: {
          clubId: invite.clubId,
          playerId,
          gameId: invite.gameId,
          teamId: invite.teamId,
          role: invite.role,
        },
      });

      await tx.clubInvite.update({
        where: { id: invite.id },
        data: { status: "accepted", respondedAt: new Date() },
      });

      return { data: { roster, movedFromClubId: current?.clubId ?? null } };
    });
  } catch (e) {
    // Two accepts racing each other: the unique constraint on playerId is
    // the backstop that guarantees one club, one game.
    if (isUniqueViolation(e)) return fail("conflict");
    throw e;
  }
}

export async function declineInvite(playerId: string, inviteId: string) {
  const invite = await prisma.clubInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.playerId !== playerId) return fail("not_found");
  if (invite.status !== "pending") return fail("invite_not_pending");

  const updated = await prisma.clubInvite.update({
    where: { id: inviteId },
    data: { status: "declined", respondedAt: new Date() },
  });
  return { data: updated };
}

export async function leaveClub(playerId: string) {
  const row = await prisma.clubRoster.findUnique({ where: { playerId } });
  if (!row) return fail("not_in_club");
  await prisma.clubRoster.delete({ where: { id: row.id } });
  return { data: { id: row.id } };
}

// ------------------------------------------------------------
// Captains
// ------------------------------------------------------------

// A captain can submit/edit that team's tournament entries alongside the
// club owner (see lib/services/club-entries.ts). At most one captain per
// team, enforced here via a transaction rather than a DB constraint.
export async function setTeamCaptain(
  club: { id: string },
  teamId: string,
  playerId: string | null
) {
  const team = await prisma.clubTeam.findUnique({ where: { id: teamId } });
  if (!team || team.clubId !== club.id) return fail("team_not_found");

  if (playerId === null) {
    await prisma.clubRoster.updateMany({
      where: { teamId },
      data: { isCaptain: false },
    });
    return { data: { teamId, captainId: null } };
  }

  const member = await prisma.clubRoster.findUnique({ where: { playerId } });
  if (!member || member.teamId !== teamId) {
    return fail("validation_error", "That player isn't on this team.");
  }

  await prisma.$transaction([
    prisma.clubRoster.updateMany({ where: { teamId }, data: { isCaptain: false } }),
    prisma.clubRoster.update({ where: { playerId }, data: { isCaptain: true } }),
  ]);

  return { data: { teamId, captainId: playerId } };
}
