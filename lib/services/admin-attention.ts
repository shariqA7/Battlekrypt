// Everything waiting on an admin, counted once. Feeds both the sidebar badge
// (the total) and the "Needs attention" cards on the dashboard (the breakdown).
// Admin-only: callers must have passed requireAdminPage() first.
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { hasAccess, type AdminArea, type StaffContext } from "@/lib/staff-permissions";
import { countPendingChangeRequests } from "@/lib/services/change-requests";
import { countReportedChallenges } from "@/lib/services/challenge-moderation";
import { countOpenFlags } from "@/lib/services/challenge-integrity";
import { countOpenConsentCases } from "@/lib/services/consent-cases";
import { countOpenReports } from "@/lib/services/organizer-reports";
import { countDisputesForAdmin } from "@/lib/services/payment-disputes";

// Which area each queue belongs to. Staff only see (and are only counted for) the queues they can open.
const ITEM_AREAS: Record<string, AdminArea> = {
  planPayments: "payments", invoices: "payments", organizers: "approvals", identity: "approvals", clubs: "approvals", games: "approvals",
  tournamentReviews: "approvals", challengeReview: "approvals", challengeDisputes: "approvals", challengeIntegrity: "approvals",
  consent: "approvals", paymentDisputes: "approvals", institutions: "institutions", changeRequests: "change_requests", playerReports: "reports",
};

/** The attention counts with every queue this person can't open zeroed out, and the total redone. */
export function attentionForStaff<T extends Record<string, number>>(items: T, staff: StaffContext) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(items)) out[k] = ITEM_AREAS[k] && !hasAccess(staff, ITEM_AREAS[k]) ? 0 : v;
  return { items: out as T, total: Object.values(out).reduce((n, v) => n + v, 0) };
}

export const getAttentionCounts = cache(async function getAttentionCounts() {
  const [
    orgApps, legacyOrganizers, clubUpgrades, games, claims, planRequests, tierReviews,
    heldChallenges, challengeDisputes, reportedChallenges, challengeFlags, institutions,
    consentCases, changeRequests, identityChecks, playerReports, invoiceProofs, paymentDisputes,
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
    prisma.invoice.count({ where: { status: "proof_submitted" } }),
    countDisputesForAdmin(),
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
    invoices: invoiceProofs,
    paymentDisputes,
  };
  const total = Object.values(items).reduce((n, v) => n + v, 0);
  return { items, total, pendingOrgApps: orgApps };
});
