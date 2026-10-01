// Admin-configurable tier ladder (spec §9). Every threshold here is meant
// to be tuned post-launch, never hardcoded into gating logic — the gating
// functions in tournaments.ts always go through resolveTierSetting rather
// than reading a constant.
import { prisma } from "@/lib/prisma";
import type { CompetitiveTier, TierSettingScope, TierPublishPath } from "@prisma/client";

export interface TierSettingInput {
  tier: CompetitiveTier;
  scope: TierSettingScope;
  scopeValue?: string | null; // required for region/country, ignored for world
  minPrizePoolUsd: number;
  minRating?: number | null;
  minWins?: number | null;
  publishPath: TierPublishPath;
}

// The mandatory "world" fallback row per tier is seeded once via
// prisma/seed.ts (same place every other launch default lives), not here —
// this file only resolves/edits settings, it doesn't own their defaults.

export async function listTierSettings() {
  return prisma.competitiveTierSetting.findMany({
    orderBy: [{ tier: "asc" }, { scope: "asc" }, { scopeValue: "asc" }],
  });
}

export async function upsertTierSetting(input: TierSettingInput) {
  if (input.scope !== "world" && !input.scopeValue) {
    return { error: "scope_value_required" as const };
  }
  const scopeValue = input.scope === "world" ? null : input.scopeValue!;

  const fields = {
    minPrizePoolUsd: input.minPrizePoolUsd,
    minRating: input.minRating,
    minWins: input.minWins,
    publishPath: input.publishPath,
  };

  // Not prisma.upsert(): the world row has scopeValue = null, and Prisma
  // can't put null inside a compound-unique "where". Postgres also treats
  // NULLs as distinct in the unique index, so the database does NOT stop two
  // world rows per tier — this lookup-then-write is what keeps it to one.
  const existing = await prisma.competitiveTierSetting.findFirst({
    where: { tier: input.tier, scope: input.scope, scopeValue },
  });
  const setting = existing
    ? await prisma.competitiveTierSetting.update({ where: { id: existing.id }, data: fields })
    : await prisma.competitiveTierSetting.create({
        data: { tier: input.tier, scope: input.scope, scopeValue, ...fields },
      });
  return { data: setting };
}

export async function deleteTierSetting(id: string) {
  const setting = await prisma.competitiveTierSetting.findUnique({ where: { id } });
  if (!setting) return { error: "not_found" as const };
  // The world row is the mandatory fallback (see resolveTierSetting) — a
  // tier with no country/region overrides left would otherwise resolve to
  // nothing at all.
  if (setting.scope === "world") return { error: "cannot_delete_world" as const };

  await prisma.competitiveTierSetting.delete({ where: { id } });
  return { data: true };
}

// Country match > region match > world default (spec: "admin can also set
// it by country or region or world"). Case-insensitive since
// OrganizerProfile.country/region are free text, same as PlayerProfile's.
export async function resolveTierSetting(
  tier: CompetitiveTier,
  organizerCountry?: string | null,
  organizerRegion?: string | null
) {
  const candidates = await prisma.competitiveTierSetting.findMany({ where: { tier } });

  const findScoped = (scope: TierSettingScope, value?: string | null) =>
    value
      ? candidates.find(
          (c) => c.scope === scope && c.scopeValue?.toLowerCase() === value.toLowerCase()
        )
      : undefined;

  return (
    findScoped("country", organizerCountry) ??
    findScoped("region", organizerRegion) ??
    candidates.find((c) => c.scope === "world") ??
    null
  );
}

// National-tier entry gate (spec: "5+ S-tier wins per team/club/game").
// Computed on read from completed-tournament results rather than a stored
// counter — same pattern as Phase 4's organizer stats, so there's nothing
// to keep in sync when a result gets corrected or a tournament un-completes.
// Exactly one of playerId/clubTeamId should be set.
export async function getSTierWinCount(
  gameId: string,
  { playerId, clubTeamId }: { playerId?: string; clubTeamId?: string }
) {
  return prisma.registration.count({
    where: {
      placement: 1,
      status: "approved",
      tournament: { gameId, competitiveTier: "S", status: "completed" },
      ...(playerId ? { playerId } : {}),
      ...(clubTeamId ? { teamEntry: { clubTeamId } } : {}),
    },
  });
}

// The entry gate a tier ladder actually exists for (spec §9): can this
// player/club-team join a tournament at this competitive tier? D/C have no
// gate (rating null); B/A/S gate on rating; National gates on prior S-tier
// wins instead of rating. Applied uniformly to self-registration, club
// self-serve entry, AND organizer/club manual-add — a manual-add is an
// override for registration-window/roster-lock (spec §4), not a way to
// slip an unqualified player into a high-tier event.
export async function checkTierEntryGate(
  tournamentId: string,
  actor: { playerId?: string; clubTeamId?: string }
) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { organizer: { select: { country: true, region: true } } },
  });
  if (!tournament) return { error: "not_found" as const };
  if (tournament.competitiveTier === "none") return { ok: true as const };

  const setting = await resolveTierSetting(
    tournament.competitiveTier,
    tournament.organizer.country,
    tournament.organizer.region
  );
  // No setting resolved at all (shouldn't happen once the world rows are
  // seeded, but fail open rather than blocking every registration if it does).
  if (!setting) return { ok: true as const };

  if (tournament.competitiveTier === "National") {
    const wins = await getSTierWinCount(tournament.gameId, actor);
    if (setting.minWins != null && wins < setting.minWins) {
      return {
        error: "tier_gate" as const,
        message: `National-tier entry requires ${setting.minWins}+ S-tier wins in this game (currently ${wins}).`,
      };
    }
    return { ok: true as const };
  }

  if (setting.minRating == null) return { ok: true as const };

  const rating = actor.playerId
    ? (
        await prisma.playerGameRating.findUnique({
          where: { playerId_gameId: { playerId: actor.playerId, gameId: tournament.gameId } },
        })
      )?.rating ?? 1000 // unrated player = starting baseline, not zero
    : (
        await prisma.clubTeam.findUnique({ where: { id: actor.clubTeamId! } })
      )?.rating ?? 1000;

  if (rating < setting.minRating) {
    return {
      error: "tier_gate" as const,
      message: `${tournament.competitiveTier}-tier entry requires ${setting.minRating}+ rating in this game (currently ${rating}).`,
    };
  }
  return { ok: true as const };
}
