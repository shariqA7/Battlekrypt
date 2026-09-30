// Plan-based gates for organizers (spec §7). Clubs' limits live in
// lib/club-limits.ts + lib/services/club-roster.ts.
//
// These only ever block CREATING more organizer-side content (tournaments,
// games hosted, templates). They never touch anything a player does —
// joining, playing, rating — per the spec's "free never gates competition"
// guardrail. Downgrading never deletes anything: existing tournaments and
// templates stay, the organizer just can't create more past the free limits.

import { prisma } from "@/lib/prisma";
import { resolvePlan } from "@/lib/plans";

export type PlanLimitCode = "tournament_limit" | "game_limit" | "template_limit";

export class PlanLimitError extends Error {
  readonly code: PlanLimitCode;
  constructor(code: PlanLimitCode, message: string) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
  }
}

type OrganizerPlanHolder = { id: string; planCode: string; planExpiresAt: Date | null };

// Start of the current calendar month, UTC. (Server-side and timezone-free
// on purpose: "per month" resets at the same instant for everyone.)
export function startOfMonthUtc(now: Date = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Throws PlanLimitError if this organizer's plan doesn't allow creating
// another tournament (this month, or in a new game).
export async function assertOrganizerCanCreateTournament(
  organizer: OrganizerPlanHolder,
  gameId: string
) {
  const { limits } = await resolvePlan("organizer", organizer);

  if (limits.maxTournamentsPerMonth !== null) {
    const thisMonth = await prisma.tournament.count({
      where: {
        organizerId: organizer.id,
        status: { not: "cancelled" },
        createdAt: { gte: startOfMonthUtc() },
      },
    });
    if (thisMonth >= limits.maxTournamentsPerMonth) {
      throw new PlanLimitError(
        "tournament_limit",
        `Your plan allows ${limits.maxTournamentsPerMonth} tournaments per month. Upgrade to host more.`
      );
    }
  }

  if (limits.maxGames !== null) {
    const rows = await prisma.tournament.findMany({
      where: { organizerId: organizer.id, status: { not: "cancelled" } },
      select: { gameId: true },
      distinct: ["gameId"],
    });
    const games = new Set(rows.map((r) => r.gameId));
    if (!games.has(gameId) && games.size >= limits.maxGames) {
      throw new PlanLimitError(
        "game_limit",
        `Your plan lets you host in ${limits.maxGames} games. Upgrade to host in more.`
      );
    }
  }
}

// Returns an error message if the organizer can't save another template,
// or null if they can.
export async function checkOrganizerCanSaveTemplate(organizer: OrganizerPlanHolder) {
  const { limits } = await resolvePlan("organizer", organizer);
  if (limits.maxTemplates === null) return null;

  const count = await prisma.tournamentTemplate.count({ where: { organizerId: organizer.id } });
  if (count >= limits.maxTemplates) {
    return `Your plan allows ${limits.maxTemplates} saved template${
      limits.maxTemplates === 1 ? "" : "s"
    }. Upgrade to save more.`;
  }
  return null;
}
