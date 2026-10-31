import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDisputeForViewer } from "@/lib/services/payment-disputes";
import { RESPONSE_HOURS, REFUND_DAYS, disputeKindLabel, disputeStateLabel } from "@/lib/payment-disputes";
import { Badge } from "@/components/ui/Badge";
import LocalDate from "@/components/ui/LocalDate";
import DisputeActions from "./DisputeActions";

function Evidence({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <p className="font-sans text-[12px] mt-1">
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-bk-gold-light underline mr-3">Evidence {i + 1}</a>
      ))}
    </p>
  );
}

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/disputes/${id}`)}`);

  const view = await getDisputeForViewer(user.id, id);
  if (!view) notFound();
  const { dispute: d, role, tournament } = view;
  const s = disputeStateLabel(d);
  const openerIsPayer = d.openedByUserId === d.payerUserId;
  const iAmResponder = (role === "payer") !== openerIsPayer;
  const refundOrdered = d.outcome === "for_payer" && !!d.refundDueAt;
  const amount = d.refundAmount ? `${d.refundAmount.toString()} ${d.refundCurrency ?? ""}`.trim() : "the full entry fee";

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="font-sans text-[11px] uppercase tracking-[1px] text-bk-muted">{role === "payer" ? "You paid" : "You're the organizer"}</p>
          <Badge tone={s.tone === "muted" ? "neutral" : s.tone} className="ml-auto">{s.label}</Badge>
        </div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">{tournament?.name ?? "Payment dispute"}</h1>
        <p className="font-sans text-bk-body text-[13px]">{disputeKindLabel(d.kind)}</p>
      </div>

      <section className="bg-bk-surface border border-bk-border p-4">
        <p className="font-sans text-[11px] uppercase tracking-[1px] text-bk-muted mb-1">{openerIsPayer ? "The player says" : "The organizer says"}</p>
        <p className="font-sans text-[14px] text-bk-heading whitespace-pre-wrap">{d.reason}</p>
        <Evidence urls={d.openerEvidenceUrls} />
      </section>

      {d.responderNote && (
        <section className="bg-bk-surface border border-bk-border p-4">
          <p className="font-sans text-[11px] uppercase tracking-[1px] text-bk-muted mb-1">{openerIsPayer ? "The organizer replied" : "The player replied"}</p>
          <p className="font-sans text-[14px] text-bk-heading whitespace-pre-wrap">{d.responderNote}</p>
          <Evidence urls={d.responderEvidenceUrls} />
        </section>
      )}

      {d.status === "awaiting_response" && (
        <p className="font-sans text-[13px] text-bk-body">
          {iAmResponder ? "Please respond" : "Waiting for the other side"} before <span className="font-mono"><LocalDate iso={d.responseDueAt.toISOString()} format="long" /></span> ({RESPONSE_HOURS}-hour window). After that an admin decides with what&apos;s there.
        </p>
      )}
      {d.status === "awaiting_admin" && <p className="font-sans text-[13px] text-bk-body">{d.missedDeadline ? "The response time ran out. " : ""}An admin is reviewing this case.</p>}

      {d.status === "resolved" && (
        <section className="bg-bk-surface border border-bk-border p-4 space-y-1">
          <p className="font-sans font-bold text-[14px] text-bk-heading">{d.outcome === "for_payer" ? "Decided for the player" : "Decided for the organizer"}</p>
          {d.adminNote && <p className="font-sans text-[13px] text-bk-body whitespace-pre-wrap">{d.adminNote}</p>}
          {refundOrdered && (
            <p className="font-sans text-[13px] text-bk-body">
              Refund ordered: <span className="font-mono">{amount}</span>, due <span className="font-mono"><LocalDate iso={d.refundDueAt!.toISOString()} format="long" /></span>.
              {view.refundOverdue && !d.refundContestedAt ? <span className="text-bk-live"> It is overdue.</span> : null}
              {d.refundContestedAt ? <span className="text-bk-live"> The player says it hasn&apos;t arrived. An admin will follow up.</span> : null}
            </p>
          )}
          {refundOrdered && role === "organizer" && !d.refundReceivedAt && <p className="font-sans text-[12px] text-bk-muted">If the refund isn&apos;t paid within {REFUND_DAYS} days, your new paid registrations are paused.</p>}
        </section>
      )}

      <DisputeActions
        disputeId={d.id}
        canRespond={d.status === "awaiting_response" && iAmResponder}
        refund={{
          canMarkSent: refundOrdered && role === "organizer" && !d.refundReceivedAt && (!d.refundSentAt || !!d.refundContestedAt),
          canConfirm: refundOrdered && role === "payer" && !d.refundReceivedAt,
          canContest: refundOrdered && role === "payer" && !!d.refundSentAt && !d.refundReceivedAt && !d.refundContestedAt,
        }}
      />
    </main>
  );
}
