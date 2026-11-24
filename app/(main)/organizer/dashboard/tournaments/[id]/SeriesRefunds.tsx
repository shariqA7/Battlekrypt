"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { formatMoney } from "@/lib/money";

interface Item { id: string; refundStatus: string; amount: number | null; entry: string; payer: string; email: string | null; phone: string | null; reference: string | null }

// Refunds for a cancelled series session. One line per entry, owed to whoever PAID (a team's captain, a
// club owner or any member): a team is never refunded player by player. Mark each one when you've sent the
// money. When none are left, the session settles itself, so there is no second "confirm" step.
export default function SeriesRefunds({ items, waiting, currency }: { items: Item[]; waiting: number; currency: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const left = items.filter((i) => i.refundStatus === "owed").length;

  async function markRefunded(id: string) {
    setBusy(id); setError(null);
    const res = await fetch(`/api/registrations/${id}/refund`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refunded" }) });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  return (
    <Panel className="p-4 mb-6">
      <p className="font-sans font-bold text-bk-heading text-[14px] mb-1">Refunds for this cancelled session</p>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        Send each refund to the person who paid, then mark it sent. {left === 0 && waiting === 0 ? "Everything is settled." : "When the last one is marked, the session settles itself. There is nothing else to confirm."}
        {waiting > 0 && ` ${waiting} ${waiting === 1 ? "payer hasn't" : "payers haven't"} chosen yet. They have 48 hours, then they're moved to the next session.`}
      </p>
      {error && <p className="text-bk-live text-[12px] font-sans mb-2" role="alert">{error}</p>}
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-bk-border/60 pb-2">
            <div>
              <p className="font-sans text-[13px] text-bk-heading">
                Refund {r.payer || "the payer"}{r.amount !== null && currency ? `: ${formatMoney(r.amount, currency)}` : ""}
              </p>
              <p className="font-sans text-[12px] text-bk-muted">
                for {r.entry}{r.email ? ` · ${r.email}` : ""}{r.phone ? ` · ${r.phone}` : ""}{r.reference ? ` · paid with transaction ${r.reference}` : ""}
              </p>
            </div>
            {r.refundStatus === "owed"
              ? <button disabled={busy === r.id} onClick={() => markRefunded(r.id)} className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase tracking-[0.8px] px-4 h-[34px] disabled:opacity-50">Mark refunded</button>
              : <span className="font-sans text-[12px] text-bk-gold-light">{r.refundStatus === "refunded" ? "Refunded ✓" : r.refundStatus}</span>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
