"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";

interface Row {
  id: string;
  org: string;
  email: string;
  amount: number;
  currency: string;
  planCode: string;
  status: string;
  heldAt: string;
  eligibleAt: string | null;
  blockers: string[];
}

export default function DepositsManager({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const field = "bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 py-1.5";

  async function act(id: string, action: "refund" | "forfeit") {
    setError(null);
    const res = await fetch(`/api/admin/deposits/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, amount: amounts[id], note: notes[id] ?? "" }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  if (rows.length === 0) return <p className="font-sans text-[13px] text-bk-muted">No deposits on hold.</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-bk-live text-[12px] font-sans">{error}</p>}
      {rows.map((d) => {
        const waiting = d.eligibleAt ? new Date(d.eligibleAt) > new Date() : false;
        const canRefund = d.status === "refund_requested" && !waiting && d.blockers.length === 0;
        return (
          <Panel key={d.id} className="p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-sans text-[13px] text-bk-heading font-bold">
                  {d.org} <span className="font-normal text-bk-muted">· {d.email}</span>
                </p>
                <p className="font-sans text-[12px] text-bk-body">
                  <span className="font-mono text-bk-heading">
                    {d.amount.toLocaleString()} {d.currency}
                  </span>{" "}
                  · {d.planCode} · held since {new Date(d.heldAt).toLocaleDateString("en-GB")}
                </p>
              </div>
              <span className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-gold-light">
                {d.status === "held" ? "Held" : "Refund requested"}
              </span>
            </div>

            {d.status === "refund_requested" && (
              <div className="font-sans text-[12px] mt-2">
                <p className="text-bk-body">
                  Eligible from {d.eligibleAt ? new Date(d.eligibleAt).toLocaleDateString("en-GB") : "—"}
                  {waiting ? " (still waiting)" : ""}
                </p>
                {d.blockers.length > 0 && (
                  <ul className="text-bk-live list-disc pl-5 mt-1">
                    {d.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              <input
                type="number"
                min={0}
                value={amounts[d.id] ?? ""}
                onChange={(e) => setAmounts({ ...amounts, [d.id]: e.target.value })}
                placeholder={`Amount (default ${d.amount})`}
                className={`${field} w-44`}
              />
              <input
                value={notes[d.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })}
                placeholder="Note: transfer reference, or why forfeited"
                className={`${field} flex-1 min-w-[200px]`}
              />
            </div>
            <div className="flex gap-3 mt-2">
              {d.status === "refund_requested" && (
                <button
                  onClick={() => act(d.id, "refund")}
                  disabled={!canRefund || !(notes[d.id] ?? "").trim()}
                  className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
                >
                  Mark refunded
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm("Forfeit this deposit (or the amount entered)? The organizer is notified.")) act(d.id, "forfeit");
                }}
                disabled={!(notes[d.id] ?? "").trim()}
                className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
              >
                Forfeit
              </button>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
