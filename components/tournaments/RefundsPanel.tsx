"use client";

// The organizer's refunds list for a paid tournament: teams that withdrew after paying, what the policy
// says about each, and the buttons to approve, decline, or mark a refund as sent. BattleKrypt never holds
// the money, so the organizer sends refunds and records them here; the player is told at each step.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import LocalDate from "@/components/ui/LocalDate";
import { toast } from "@/lib/toast";
import { describeRefundPolicy, type RefundPolicyKey } from "@/lib/seat-settings";
import { nextRefundStatus, type RefundAction, type RefundStatusKey } from "@/lib/refunds";

export interface RefundRowView {
  id: string;
  name: string;
  refundStatus: RefundStatusKey;
  statusLabel: string;
  hadSeat: boolean;
  room: string | null;
  amount: string;
  paymentReference: string | null;
  payerName: string | null;
  withdrawnAt: string;
  withdrawReason: string | null;
}

const btn = "font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-3 min-h-[44px] sm:min-h-[36px] border disabled:opacity-45";
const primary = `${btn} bg-bk-primary text-bk-on-primary border-transparent`;
const ghost = `${btn} border-bk-border text-bk-heading hover:border-bk-gold-light`;

const ORDER: RefundStatusKey[] = ["requested", "owed", "waiting_resale", "refunded", "declined", "not_applicable"];
const TONE: Record<RefundStatusKey, string> = {
  requested: "text-bk-gold-light", owed: "text-bk-live", waiting_resale: "text-bk-muted", refunded: "text-bk-teal", declined: "text-bk-muted", not_applicable: "text-bk-muted",
};

export default function RefundsPanel({ rows, policy, cutoffHours }: { rows: RefundRowView[]; policy: RefundPolicyKey; cutoffHours: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (rows.length === 0) return null;

  async function act(row: RefundRowView, action: RefundAction) {
    setBusy(`${row.id}:${action}`);
    setError(null);
    try {
      const res = await fetch(`/api/registrations/${row.id}/refund`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json?.error?.message ?? "Couldn't update that refund.");
      toast(action === "refunded" ? "Marked as refunded. The player was told." : action === "owe" ? "Refund approved. The player was told." : "Refund declined. The player was told.", "success", 4500);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.refundStatus) - ORDER.indexOf(b.refundStatus));
  const owedCount = rows.filter((r) => r.refundStatus === "owed").length;
  const askedCount = rows.filter((r) => r.refundStatus === "requested").length;

  return (
    <Panel as="section" className="mt-10 p-4">
      <p className="font-sans font-medium text-bk-heading text-sm">Refunds</p>
      <p className="font-sans text-[12px] text-bk-muted mt-1">Your policy: {describeRefundPolicy(policy, cutoffHours)}</p>
      <p className="font-sans text-[12px] text-bk-body mt-1">
        {askedCount > 0 && <><span className="text-bk-gold-light">{askedCount} waiting for your decision</span>{owedCount > 0 ? " · " : ""}</>}
        {owedCount > 0 && <span className="text-bk-live">{owedCount} to send</span>}
        {askedCount === 0 && owedCount === 0 && "Nothing is waiting on you."}
      </p>
      {error && <p className="text-bk-live text-[12px] font-sans mt-3" role="alert">{error}</p>}
      <ul className="mt-3 space-y-2">
        {sorted.map((r) => {
          const can = (a: RefundAction) => nextRefundStatus(a, r.refundStatus) !== null;
          return (
            <li key={r.id} className="border border-bk-border bg-bk-bg p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-sans font-bold text-[13px] text-bk-heading break-words min-w-0">{r.name}</span>
                <span className={`font-sans text-[11px] uppercase tracking-[0.8px] ${TONE[r.refundStatus]}`}>{r.statusLabel}</span>
              </div>
              <p className="font-sans text-[12px] text-bk-muted mt-1">
                {r.amount && <><span className="font-mono text-bk-body">{r.amount}</span> · </>}
                {r.hadSeat ? (r.room ? `${r.room} · ` : "") : "Never got a seat · "}
                withdrew <LocalDate iso={r.withdrawnAt} format="long" />
              </p>
              {(r.payerName || r.paymentReference) && (
                <p className="font-sans text-[12px] text-bk-body mt-0.5 break-words">
                  {r.payerName && <>Paid by {r.payerName}</>}{r.payerName && r.paymentReference ? " · " : ""}{r.paymentReference && <>Transaction {r.paymentReference}</>}
                </p>
              )}
              {r.withdrawReason && <p className="font-sans text-[12px] text-bk-muted mt-0.5 break-words">&ldquo;{r.withdrawReason}&rdquo;</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {can("owe") && <button type="button" className={primary} disabled={!!busy} onClick={() => act(r, "owe")}>{busy === `${r.id}:owe` ? "Saving..." : r.refundStatus === "declined" ? "Refund after all" : "Approve refund"}</button>}
                {can("refunded") && <button type="button" className={primary} disabled={!!busy} onClick={() => act(r, "refunded")}>{busy === `${r.id}:refunded` ? "Saving..." : "I sent the refund"}</button>}
                {can("decline") && <button type="button" className={ghost} disabled={!!busy} onClick={() => act(r, "decline")}>{busy === `${r.id}:decline` ? "Saving..." : "Decline"}</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
