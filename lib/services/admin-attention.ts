// Everything waiting on an admin, counted once. Feeds both the sidebar badge
// (the total) and the "Needs attention" cards on the dashboard (the breakdown).
// Admin-only: callers must have passed requireAdminPage() first.
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { countPendingChangeRequests } from "@/lib/services/change-requests";
import { countReportedChallenges } from "@/lib/services/challenge-moderation";
import { countOpenFlags } from "@/lib/services/challenge-integrity";
import { countOpenConsentCases } from "@/lib/services/consent-cases";
import { countOpenReports } from "@/lib/services/organizer-reports";

export const getAttentionCounts = cache(async function getAttentionCounts() {
  const [
    orgApps, legacyOrganizers, clubUpgrades, games, claims, planRequests, tierReviews,
    heldChallenges, challengeDisputes, reportedChallenges, challengeFlags, institutions,
    consentCases, changeRequests, identityChecks, playerReports,
  ] = await Promise.all([
    prisma.organizationApplication.count({ where: { status: "pending" } }),
    prisma.organizerProfile.count({ where: { user: { kycStatus: { in: ["none", "pending"] } } } }),
    prisma.clubProfile.count({ where: { upgradeStatus: "pending" } }),
    prisma.gameRequest.count({ where: { status: "pending" } }),
    prisma.clubNameClaim.count({ where: { status: "pending" } }),
    prisma.planRequest.count({ where: { status: "pending" } }),
    prisma.tournament.count({ where: { status: "draft", submittedForReview: true } }),
    prisma.challenge.count({ where: { status: "pending_review" } }),
    prisma.challengeDispute.count({ where: { status: "awaiting_admin" } }),
    countReportedChallenges(),
    countOpenFlags(),
    prisma.institution.count({ where: { verified: false } }),
    countOpenConsentCases(),
    countPendingChangeRequests(),
    prisma.identityVerification.count({ where: { status: "pending" } }),
    countOpenReports(),
  ]);

  const items = {
    planPayments: planRequests,
    organizers: orgApps + legacyOrganizers,
    clubs: clubUpgrades + claims,
    games,
    tournamentReviews: tierReviews,
    challengeReview: heldChallenges,
    challengeDisputes,
    challengeIntegrity: reportedChallenges + challengeFlags,
    consent: consentCases,
    institutions,
    changeRequests,
    identity: identityChecks,
    playerReports,
  };
  const total = Object.values(items).reduce((n, v) => n + v, 0);
  return { items, total, pendingOrgApps: orgApps };
});
