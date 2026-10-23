import { requireAdminPage } from "@/lib/admin-page";
import { listFlaggedTournaments, listPendingTierReviewTournaments } from "@/lib/services/tournaments";
import AdminQueues from "../../AdminQueues";
import TierReviewQueue from "../../TierReviewQueue";

export default async function ApprovalsTournamentsPage() {
  await requireAdminPage();
  const [flaggedTournaments, pendingTierReviews] = await Promise.all([listFlaggedTournaments(), listPendingTierReviewTournaments()]);

  return (
    <div className="space-y-10">
      <TierReviewQueue
        initialTournaments={pendingTierReviews.map((t) => ({
          ...t,
          prizePoolAmount: t.prizePoolAmount?.toString() ?? null,
        }))}
      />
      <AdminQueues show={["flags"]} initialFlags={flaggedTournaments} />
    </div>
  );
}
