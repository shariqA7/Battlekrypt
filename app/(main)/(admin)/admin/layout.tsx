import { requireAdminPage } from "@/lib/admin-page";
import { prisma } from "@/lib/prisma";
import AdminNav from "@/components/admin/AdminNav";

// Shell for every /admin page: a sidebar plus a wide content area. Each page
// still calls requireAdminPage() itself, because layouts are skipped on
// client-side navigation.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();

  const [orgApps, legacyOrganizers, clubUpgrades, games, claims, planReqs, tierReviews, heldChallenges, challengeDisputes] = await Promise.all([
    prisma.organizationApplication.count({ where: { status: "pending" } }),
    prisma.organizerProfile.count({ where: { user: { kycStatus: { in: ["none", "pending"] } } } }),
    prisma.clubProfile.count({ where: { upgradeStatus: "pending" } }),
    prisma.gameRequest.count({ where: { status: "pending" } }),
    prisma.clubNameClaim.count({ where: { status: "pending" } }),
    prisma.planRequest.count({ where: { status: "pending" } }),
    prisma.tournament.count({ where: { status: "draft", submittedForReview: true } }),
    prisma.challenge.count({ where: { status: "pending_review" } }),
    prisma.challengeDispute.count({ where: { status: "awaiting_admin" } }),
  ]);

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 grid md:grid-cols-[200px_1fr] gap-8">
      <aside>
        <p className="font-sans font-extrabold text-lg text-bk-heading mb-4">Admin</p>
        <AdminNav pending={orgApps + legacyOrganizers + clubUpgrades + games + claims + tierReviews + planReqs + heldChallenges + challengeDisputes} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
