"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { formatMoney } from "@/lib/money";

interface Item {
  id: string; series: string; sessionCount: number; reference: string | null; total: number; currency: string | null;
  payer: string; payerEmail: string | null; proofRegistrationId: string | null; createdAt: string;
}

// Bookings waiting for the organizer: one payment covers several sessions, so one decision covers them all.
export default function BookingQueue({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (items.length === 0) return null;

  async function act(id: string, action: "approve" | "reject") {
    const reason = action === "reject" ? window.prompt("Why are you rejecting it? (the player will see this)") : undefined;
    if (action === "reject" && reason === null) return;
    setBusy(id); setError(null);
    const res = await fetch(`/api/organizer/scrim-series/bookings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  return (
    <section className="mb-8">
      <h2 className="font-sans font-bold text-bk-heading text-[15px] mb-3">Bookings waiting for you ({items.length})</h2>
      {error && <p className="text-bk-live text-[12px] font-sans mb-2" role="alert">{error}</p>}
      <div className="space-y-3">
        {items.map((b) => (
          <Panel key={b.id} className="p-4">
            <p className="font-sans font-bold text-bk-heading text-[14px]">{b.payer} <span className="font-normal text-bk-muted">· {b.series}</span></p>
            <p className="font-sans text-[12px] text-bk-muted mt-0.5">
              {b.sessionCount} session{b.sessionCount === 1 ? "" : "s"}
              {b.total > 0 && b.currency ? ` · check that ${formatMoney(b.total, b.currency)} arrived` : " · free"}
              {b.reference ? ` · transaction ${b.reference}` : ""}
              {b.payerEmail ? ` · ${b.payerEmail}` : ""}
            </p>
            {b.proofRegistrationId && (
              <a href={`/api/proofs/registration/${b.proofRegistrationId}`} target="_blank" rel="noopener noreferrer" className="inline-block font-sans text-[12px] text-bk-gold-light underline mt-1">View payment screenshot</a>
            )}
            <div className="flex gap-2 mt-3">
              <button disabled={busy === b.id} onClick={() => act(b.id, "approve")} className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase tracking-[0.8px] px-4 h-[34px] disabled:opacity-50">Approve all {b.sessionCount}</button>
              <button disabled={busy === b.id} onClick={() => act(b.id, "reject")} className="border border-bk-border text-bk-live font-sans text-[11px] uppercase tracking-[0.8px] px-4 h-[34px] disabled:opacity-50">Reject</button>
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}
