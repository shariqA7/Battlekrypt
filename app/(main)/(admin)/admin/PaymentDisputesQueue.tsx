"use client";

// Admin queue for payment disputes: decide undecided cases, and follow up on ordered refunds
// that are late or contested.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import DuplicateProofBadge from "@/components/ui/DuplicateProofBadge";
import LocalDate from "@/components/ui/LocalDate";
import type { ProofMatch } from "@/lib/proof-match";
import { disputeKindLabel } from "@/lib/payment-disputes";

export interface AdminPaymentDispute {
  id: string;
  kind: "rejected_after_paying" | "no_room_details" | "event_not_held" | "wrong_amount" | "fake_proof";
  status: "awaiting_response" | "awaiting_admin" | "resolved";
  missedDeadline: boolean;
  reason: string;
  openerEvidenceUrls: string[];
  responderNote: string | null;
  responderEvidenceUrls: string[];
  openedByPayer: boolean;
  createdAt: string;
  tournamentName: string;
  payerName: string;
  payerEmail: string | null;
  organizerName: string;
  organizerEmail: string | null;
  proofUrl: string | null;
  reference: string | null;
  duplicate: ProofMatch | null;
  outcome: "for_payer" | "for_organizer" | null;
  adminNote: string | null;
  refundAmount: string | null;
  refundCurrency: string | null;
  refundDueAt: string | null;
  refundSent: boolean;
  refundContested: boolean;
  refundOverdue: boolean;
}

const Links = ({ urls, label }: { urls: string[]; label: string }) =>
  urls.length === 0 ? null : (
    <span className="mr-3">
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-bk-gold-light underline mr-2 text-[12px]">{label} {i + 1}</a>
      ))}
    </span>
  );

function Card({ d }: { d: AdminPaymentDispute }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"for_payer" | "for_organizer">("for_payer");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data?.error?.message ?? "Something went wrong.");
    router.refresh();
  }

  const undecided = d.status === "awaiting_admin";
  const canRefund = d.kind !== "fake_proof";
  return (
    <li className="bg-bk-surface border border-bk-border p-4 space-y-3">
      <div>
        <p className="font-sans font-bold text-[14px] text-bk-heading">{d.tournamentName}</p>
        <p className="font-sans text-[12px] text-bk-body">{disputeKindLabel(d.kind)}{d.missedDeadline ? " · the other side never answered" : ""}</p>
        <p className="font-sans text-[12px] text-bk-muted">
          Player {d.payerName}{d.payerEmail ? ` (${d.payerEmail})` : ""} · Organizer {d.organizerName}{d.organizerEmail ? ` (${d.organizerEmail})` : ""}
        </p>
        <p className="font-mono text-[11px] text-bk-muted"><LocalDate iso={d.createdAt} format="long" /></p>
      </div>

      <div className="border-l-2 border-bk-border pl-3">
        <p className="font-sans text-[11px] uppercase tracking-[1px] text-bk-muted">{d.openedByPayer ? "Player says" : "Organizer says"}</p>
        <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">{d.reason}</p>
        <Links urls={d.openerEvidenceUrls} label="Evidence" />
      </div>
      {d.responderNote && (
        <div className="border-l-2 border-bk-border pl-3">
          <p className="font-sans text-[11px] uppercase tracking-[1px] text-bk-muted">{d.openedByPayer ? "Organizer replied" : "Player replied"}</p>
          <p className="font-sans text-[13px] text-bk-heading whitespace-pre-wrap">{d.responderNote}</p>
          <Links urls={d.responderEvidenceUrls} label="Evidence" />
        </div>
      )}

      <p className="font-sans text-[12px]">
        {d.proofUrl && <a href={d.proofUrl} target="_blank" rel="noopener noreferrer" className="text-bk-gold-light underline mr-2">Payment proof ↗</a>}
        {d.reference && <span className="font-mono text-[11px] text-bk-heading mr-2">ID {d.reference}</span>}
        <DuplicateProofBadge match={d.duplicate} scope="admin" />
      </p>

      {undecided ? (
        <div className="space-y-2 border-t border-bk-border-soft pt-3">
          <div className="flex flex-wrap gap-2">
            <label className="font-sans text-[12px] text-bk-body"><input type="radio" className="mr-1" checked={outcome === "for_payer"} onChange={() => setOutcome("for_payer")} />For the player{canRefund ? " (orders a refund)" : ""}</label>
            <label className="font-sans text-[12px] text-bk-body"><input type="radio" className="mr-1" checked={outcome === "for_organizer"} onChange={() => setOutcome("for_organizer")} />For the organizer{d.kind === "fake_proof" ? " (rejects the entry)" : ""}</label>
          </div>
          {outcome === "for_payer" && canRefund && (
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Refund amount (blank = the full entry fee)" aria-label="Refund amount"
              className="w-full max-w-sm bg-bk-bg border border-bk-border px-3 h-[36px] font-mono text-[13px] text-bk-heading" />
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1500} placeholder="Why (both sides see this)"
            className="w-full bg-bk-bg border border-bk-border px-3 py-2 font-sans text-[13px] text-bk-heading" />
          <button type="button" disabled={busy || note.trim().length < 5} className={buttonClass("primary", "sm")}
            onClick={() => call(`/api/admin/payment-disputes/${d.id}/decide`, { outcome, note, refundAmount: outcome === "for_payer" && canRefund && amount.trim() ? amount : undefined })}>
            Decide
          </button>
        </div>
      ) : (
        <div className="space-y-2 border-t border-bk-border-soft pt-3">
          <p className="font-sans text-[13px] text-bk-body">
            Refund ordered{d.refundAmount ? `: ${d.refundAmount} ${d.refundCurrency ?? ""}` : " (full entry fee)"}, due {d.refundDueAt && <span className="font-mono"><LocalDate iso={d.refundDueAt} format="long" /></span>}.
            {d.refundContested ? " The player says it hasn't arrived." : d.refundSent ? " The organizer says it was sent." : d.refundOverdue ? " Overdue: the organizer's paid events are paused." : ""}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} className={buttonClass("outline", "sm")} onClick={() => call(`/api/admin/payment-disputes/${d.id}/refund`, { action: "mark_received" })}>Mark settled</button>
            <button type="button" disabled={busy} className={buttonClass("outline", "sm")} onClick={() => { const days = prompt("How many more days?", "5"); if (days) call(`/api/admin/payment-disputes/${d.id}/refund`, { action: "give_more_time", days }); }}>Give more time</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
    </li>
  );
}

export default function PaymentDisputesQueue({ initial }: { initial: AdminPaymentDispute[] }) {
  if (initial.length === 0) return <p className="font-sans text-[13px] text-bk-body">No payment disputes need attention.</p>;
  return <ul className="space-y-3">{initial.map((d) => <Card key={d.id} d={d} />)}</ul>;
}
