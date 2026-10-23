import { requireAdminPage } from "@/lib/admin-page";
import { listDisputesForAdmin } from "@/lib/services/challenge-fulfillment";
import { prizeLabel } from "@/lib/challenge-format";
import ChallengeDisputes from "../../ChallengeDisputes";

export default async function ApprovalsDisputesPage() {
  await requireAdminPage();
  const disputes = await listDisputesForAdmin();

  return (
    <ChallengeDisputes
      initial={disputes.map((d) => {
        const a = d.application;
        return {
          id: d.id,
          kind: d.kind,
          status: d.status as "awaiting_response" | "awaiting_admin",
          missedDeadline: d.missedDeadline,
          reason: d.reason,
          openerEvidenceUrls: d.openerEvidenceUrls,
          responderNote: d.responderNote,
          responderEvidenceUrls: d.responderEvidenceUrls,
          responseDueAt: d.responseDueAt.toISOString(),
          createdAt: d.createdAt.toISOString(),
          openedByPoster: d.openedById === a.challenge.posterUserId,
          challengeId: a.challenge.id,
          challengeTitle: a.challenge.title,
          prizeLabel: prizeLabel(a.challenge),
          posterName: a.challenge.posterName,
          posterEmail: d.posterEmail,
          challengerName: a.applicant.displayName,
          challengerEmail: a.applicant.email,
          matchId: a.matchId,
          proofUrls: a.proofUrls,
          proofNote: a.proofNote,
          receiptUrls: a.paymentReceiptUrls,
          payoutDetails: a.payoutDetails,
          paymentNote: a.paymentNote,
        };
      })}
    />
  );
}
