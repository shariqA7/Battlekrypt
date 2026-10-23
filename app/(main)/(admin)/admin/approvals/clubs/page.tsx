import { requireAdminPage } from "@/lib/admin-page";
import { listPendingClubs } from "@/lib/services/clubs";
import { listPendingClaims } from "@/lib/services/club-name-claims";
import { listActiveBans } from "@/lib/services/bans";
import AdminQueues from "../../AdminQueues";
import NameClaims from "../../NameClaims";

export default async function ApprovalsClubsPage() {
  await requireAdminPage();
  const [pendingClubs, nameClaims, activeBans] = await Promise.all([listPendingClubs(), listPendingClaims(), listActiveBans()]);

  return (
    <div className="space-y-10">
      <AdminQueues show={["clubs"]} initialClubs={pendingClubs} />
      <NameClaims
        initialClaims={nameClaims.map((c) => ({
          id: c.id,
          clubName: c.clubName,
          explanation: c.explanation,
          evidenceUrl: c.evidenceUrl,
          createdAt: c.createdAt.toISOString(),
          claimant: c.claimant,
          club: c.club
            ? {
                clubName: c.club.clubName,
                status: c.club.status,
                createdAt: c.club.createdAt.toISOString(),
                owner: c.club.user,
              }
            : null,
        }))}
        initialBans={activeBans.map((b) => ({
          id: b.id,
          reason: b.reason,
          endsAt: b.endsAt ? b.endsAt.toISOString() : null,
          user: b.user,
        }))}
      />
    </div>
  );
}
