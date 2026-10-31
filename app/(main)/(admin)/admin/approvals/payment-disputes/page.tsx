import { requireAdminPage } from "@/lib/admin-page";
import { listDisputesForAdmin } from "@/lib/services/payment-disputes";
import PaymentDisputesQueue, { type AdminPaymentDispute } from "../../PaymentDisputesQueue";

export default async function ApprovalsPaymentDisputesPage() {
  await requireAdminPage("approvals");
  const rows = await listDisputesForAdmin();
  const initial: AdminPaymentDispute[] = rows.map((d) => ({
    id: d.id,
    kind: d.kind,
    status: d.status,
    missedDeadline: d.missedDeadline,
    reason: d.reason,
    openerEvidenceUrls: d.openerEvidenceUrls,
    responderNote: d.responderNote,
    responderEvidenceUrls: d.responderEvidenceUrls,
    openedByPayer: d.openedByUserId === d.payerUserId,
    createdAt: d.createdAt.toISOString(),
    tournamentName: d.tournamentName,
    payerName: d.payer?.displayName ?? "Unknown",
    payerEmail: d.payer?.email ?? null,
    organizerName: d.organizer?.displayName ?? "Unknown",
    organizerEmail: d.organizer?.email ?? null,
    proofUrl: d.registration.paymentProofUrl,
    reference: d.registration.paymentReference,
    duplicate: d.duplicate,
    outcome: d.outcome,
    adminNote: d.adminNote,
    refundAmount: d.refundAmount ? d.refundAmount.toString() : null,
    refundCurrency: d.refundCurrency,
    refundDueAt: d.refundDueAt ? d.refundDueAt.toISOString() : null,
    refundSent: !!d.refundSentAt,
    refundContested: !!d.refundContestedAt,
    refundOverdue: d.refundOverdue,
  }));
  return <PaymentDisputesQueue initial={initial} />;
}
