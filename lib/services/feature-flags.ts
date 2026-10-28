// Admin on/off switches for features (Admin > Settings > Features).
//
// Principle: "off" stops NEW things from following the feature; promises that
// were already made to players are kept. A locked event stays locked, a held
// deposit stays refundable, an existing consent stays valid, existing awards
// and conditions stay in force, and challenges already running keep running.
import { prisma } from "@/lib/prisma";
import { parentalConsentEnabled } from "@/lib/consent-config";
import type { FeatureFlags } from "@/lib/feature-flags-shared";

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const s = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  return {
    deposit: s?.depositEnabled ?? false,
    organizerTrust: s?.organizerTrustEnabled ?? true,
    tournamentLock: s?.tournamentLockEnabled ?? true,
    prizeBreakdown: s?.prizeBreakdownRequired ?? true,
    specialAwards: s?.specialAwardsEnabled ?? true,
    entryConditions: s?.entryConditionsEnabled ?? true,
    challenges: s?.challengesEnabled ?? true,
    // Unset means "follow the old environment switch" so nothing changes by surprise.
    guardianConsent: s?.guardianConsentEnabled ?? parentalConsentEnabled(),
    playerReports: s?.playerReportsEnabled ?? true,
  };
}

export async function isFeatureOn(key: keyof FeatureFlags): Promise<boolean> {
  return (await getFeatureFlags())[key];
}

// Replaces the sync parentalConsentEnabled() everywhere on the server.
export async function parentalConsentOn(): Promise<boolean> {
  return isFeatureOn("guardianConsent");
}

const COLUMN: Record<keyof FeatureFlags, string> = {
  deposit: "depositEnabled",
  organizerTrust: "organizerTrustEnabled",
  tournamentLock: "tournamentLockEnabled",
  prizeBreakdown: "prizeBreakdownRequired",
  specialAwards: "specialAwardsEnabled",
  entryConditions: "entryConditionsEnabled",
  challenges: "challengesEnabled",
  guardianConsent: "guardianConsentEnabled",
  playerReports: "playerReportsEnabled",
};

export async function updateFeatureFlags(adminId: string, input: Partial<Record<keyof FeatureFlags, unknown>>) {
  const before = await getFeatureFlags();
  const data: Record<string, boolean> = {};
  const changes: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const col = COLUMN[key as keyof FeatureFlags];
    if (!col) return { error: "validation_error" as const, message: `Unknown switch: ${key}` };
    if (typeof value !== "boolean") return { error: "validation_error" as const, message: `${key} must be on or off.` };
    if (before[key as keyof FeatureFlags] !== value) {
      data[col] = value;
      changes.push(`${key}: ${before[key as keyof FeatureFlags] ? "on" : "off"} -> ${value ? "on" : "off"}`);
    }
  }
  if (changes.length === 0) return { data: await getFeatureFlags() };

  await prisma.siteSettings.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });

  // Switching the lock OFF must not release events that are locked right now:
  // mark every staked event with an active registration before it takes effect.
  if (before.tournamentLock && data.tournamentLockEnabled === false) {
    const staked = await prisma.tournament.findMany({
      where: {
        lockEnforced: false,
        OR: [{ entryType: "paid" }, { prizePoolAmount: { gt: 0 } }],
        registrations: { some: { status: { in: ["pending", "approved"] } } },
      },
      select: { id: true },
    });
    if (staked.length > 0) {
      await prisma.tournament.updateMany({ where: { id: { in: staked.map((t) => t.id) } }, data: { lockEnforced: true } });
    }
  }

  await prisma.adminActionLog.create({
    data: { adminId, action: "changed_feature_switches", targetType: "SiteSettings", targetId: "singleton", notes: changes.join("; ") },
  });
  return { data: await getFeatureFlags() };
}
