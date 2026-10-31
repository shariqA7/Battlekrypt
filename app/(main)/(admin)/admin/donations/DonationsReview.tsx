"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import DuplicateProofBadge from "@/components/ui/DuplicateProofBadge";
import type { ProofMatch } from "@/lib/proof-match";

type Pending = { id: string; donor: string; email: string; verified: boolean; amount: number; currency: string; proofUrl: string; reference: string | null; message: string | null; anonymous: boolean; campaign: string | null; at: string; duplicate: ProofMatch | null };

export default function DonationsReview({ items }: { items: Pending[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    let note: string | undefined;
    if (!approve) {
      const r = prompt("Why is this donation not approved? The donor will see this.");
      if (r === null) return;
      note = r;
    } else if (!confirm("Approve this donation? It is added to the fund and recorded in Payments.")) return;
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/donations/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve, note }) });
    setBusy(null);
    if (res.ok) return router.refresh();
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  if (items.length === 0) return <p className="font-sans text-[13px] text-bk-muted">No donations are waiting for review.</p>;
  return (
    <div>
      <ul className="divide-y divide-bk-border border border-bk-border">
        {items.map((d) => (
          <li key={d.id} className="p-3 flex flex-wrap items-start gap-4">
            <a href={d.proofUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" aria-label="Open the payment screenshot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.proofUrl} alt="Payment screenshot" className="w-24 h-24 object-cover border border-bk-border" />
            </a>
            <div className="min-w-0 flex-1 font-sans text-[12px]">
              <p className="text-bk-heading font-bold text-[15px]">{formatMoney(d.amount, d.currency)} <DuplicateProofBadge match={d.duplicate} scope="admin" /></p>
              <p className="text-bk-body">
                {d.donor} <span className="text-bk-muted">· {d.email}</span>{" "}
                <span className={d.verified ? "text-bk-teal" : "text-bk-muted"}>· {d.verified ? "verified member" : "not verified"}</span>
              </p>
              <p className="text-bk-muted">{d.campaign ?? "General fund"} · {new Date(d.at).toLocaleString("en-GB")}{d.anonymous && " · anonymous"}</p>
              {d.reference && <p className="text-bk-body">Transaction ID: <span className="font-mono text-bk-heading">{d.reference}</span></p>}
              {d.message && <p className="text-bk-body mt-1">“{d.message}”</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy === d.id} onClick={() => decide(d.id, true)} className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 min-h-[36px] disabled:opacity-50">Approve</button>
              <button type="button" disabled={busy === d.id} onClick={() => decide(d.id, false)} className="border border-bk-border text-bk-heading font-sans text-[11px] tracking-[0.8px] uppercase px-4 min-h-[36px] disabled:opacity-50">Reject</button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-bk-live text-[12px] font-sans mt-2">{error}</p>}
    </div>
  );
}
