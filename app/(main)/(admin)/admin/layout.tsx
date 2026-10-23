import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import AdminShell from "@/components/admin/AdminShell";
import { ADMIN_SIDEBAR_COOKIE } from "@/components/admin/adminNav";
import { countPendingChangeRequests } from "@/lib/services/change-requests";
import { countReportedChallenges } from "@/lib/services/challenge-moderation";
import { countOpenFlags } from "@/lib/services/challenge-integrity";
import { countOpenConsentCases } from "@/lib/services/consent-cases";

// Shell for every /admin page: a collapsible sidebar, breadcrumbs, and a wide
// content area (see AdminShell). Each page
// still calls requireAdminPage() itself, because layouts are skipped on
// client-side navigation.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  const defaultCollapsed = (await cookies()).get(ADMIN_SIDEBAR_COOKIE)?.value === "collapsed";

  const [orgApps, legacyOrganizers, clubUpgrades, games, claims, planReqs, tierReviews, heldChallenges, challengeDisputes, reportedChallenges, challengeFlags, institutions, consentCases, changeRequests] = await Promise.all([
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
  ]);

  const pending =
    orgApps + legacyOrganizers + clubUpgrades + games + claims + tierReviews + planReqs + heldChallenges +
    challengeDisputes + reportedChallenges + challengeFlags + institutions + consentCases + changeRequests;

  return (
    <AdminShell pending={pending} defaultCollapsed={defaultCollapsed}>
      {children}
    </AdminShell>
  );
}
