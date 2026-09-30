"use client";

import { useState } from "react";

export interface PendingPlanRequest {
  id: string;
  audience: string;
  planName: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  proofUrl: string;
  createdAt: string | Date;
  userName: string;
  userEmail: string | null;
}

// Pending paid-plan purchases: view the payment screenshot, approve or reject.
export default function PlanRequestsQueue({ initial }: { initial: PendingPlanRequest[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject") {
    let note: string | undefined;
    if (action === "reject") {
      const entered = window.prompt("Reason for rejecting (shown to the user, optional):");
      if (entered === null) return;
      note = entered;
    }
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/plan-requests/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((r) => r.id !== id));
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Something went wrong.");
    }
    setBusy(null);
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">
        Plan requests ({items.length})
      </p>
      {error && <p className="text-bk-live text-[12px] font-sans mb-2">{error}</p>}
      {items.length === 0 ? (
        <p className="font-sans text-bk-muted text-xs">Nothing waiting.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <div key={r.id} className="bg-bk-surface border border-bk-border p-3">
              <p className="font-sans text-bk-heading text-[13px]">
                {r.userName}
                {r.userEmail && <span className="text-bk-muted"> · {r.userEmail}</span>}
              </p>
              <p className="font-sans text-bk-muted text-xs mt-0.5">
                {r.audience} · {r.planName}
                {r.priceAmount !== null && r.priceCurrency
                  ? ` · ${r.priceCurrency} ${r.priceAmount.toLocaleString("en-US")}`
                  : ""}
              </p>
              <a
                href={r.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans text-[12px] text-bk-gold-light underline"
              >
                View payment proof ↗
              </a>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => act(r.id, "approve")}
                  className="bg-white text-bk-bg font-sans font-bold text-[11px] uppercase px-3 py-1.5 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => act(r.id, "reject")}
                  className="border border-bk-border text-bk-body font-sans text-[11px] uppercase px-3 py-1.5 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
