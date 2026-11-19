// Human-readable bullet points for a plan's limits — shown on the plans
// page. Keep in sync with LIMIT_KEYS in lib/plans.ts. Flags for features
// that don't exist yet (merch store, priority registration, extended stats,
// advanced analytics, priority support, enhanced profile) are listed as
// "coming soon" rather than promised as live.

import type { PlanAudience } from "@prisma/client";

type Limits = Record<string, number | boolean | null>;

const n = (v: number | boolean | null, unit: string) =>
  v === null ? `Unlimited ${unit}` : `Up to ${v} ${unit}`;

export function describeLimits(audience: PlanAudience, l: Limits): string[] {
  const out: string[] = [];
  if (audience === "organizer") {
    const m = l as { maxTournamentsPerMonth: number | null; maxLeaguesPerMonth: number | null; maxScrimsPerMonth: number | null };
    out.push(n(m.maxTournamentsPerMonth, "tournaments per month"));
    out.push(n(m.maxLeaguesPerMonth, "leagues per month"));
    out.push(n(m.maxScrimsPerMonth, "scrims per month"));
    out.push(n(l.maxGames, "games hosted"));
    out.push(n(l.maxTemplates, "saved templates"));
    if (l.advancedAnalytics) out.push("Advanced analytics (coming soon)");
    if (l.prioritySupport) out.push("Priority support");
  } else if (audience === "club") {
    out.push(n(l.maxEntriesPerGame, "teams or solo players per game"));
    out.push(n(l.maxGames, "games"));
    out.push(`${l.maxPlayersPerTeam} players per team`);
    out.push(
      l.maxSubstitutesPerTeam ? `${l.maxSubstitutesPerTeam} substitutes per team` : "No substitutes"
    );
    if (l.canSetCoach) out.push("Coach on each team");
    if (l.merchStore) out.push("Merch store (coming soon)");
    if (l.enhancedProfile) out.push("Enhanced club profile (coming soon)");
  } else {
    if (l.priorityRegistration) out.push("Early access to tournament slots (coming soon)");
    if (l.extendedStats) out.push("Extended, exportable stats (coming soon)");
  }
  out.push(
    l.maxChallengesPerMonth === null
      ? "Post unlimited challenges"
      : `Post ${l.maxChallengesPerMonth} challenge${l.maxChallengesPerMonth === 1 ? "" : "s"} per month`
  );
  out.push(
    l.maxChallengePrizeUsd === null
      ? "No cap on challenge prize size"
      : `Challenge prizes up to $${l.maxChallengePrizeUsd}`
  );
  if (audience === "organizer") {
    const g = (l as { maxGiveawaysPerMonth: number | null }).maxGiveawaysPerMonth;
    out.push(g === null ? "Run unlimited giveaways" : `Run ${g} giveaway${g === 1 ? "" : "s"} per month`);
    const sl = l as { maxScrimSeries: number | null; maxSeriesDays: number | null; maxSlotsPerDay: number | null };
    if (sl.maxScrimSeries === null || sl.maxScrimSeries > 0) {
      out.push(sl.maxScrimSeries === null ? "Run unlimited recurring scrim series" : `Run ${sl.maxScrimSeries} recurring scrim series at once`);
      out.push(sl.maxSeriesDays === null ? "Series can run non-stop" : `Series can run up to ${sl.maxSeriesDays} days`);
    }
  }
  if (l.canJoinChallenges) out.push("Join challenges");
  return out;
}

// Applies to every paid plan.
export const PAID_PERKS = ["Ad-free browsing", "Verified badge"];
