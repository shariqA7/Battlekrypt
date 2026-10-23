"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui/Panel";

interface Row {
  id: string;
  kind: string;
  details: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  tournament: string;
  tournamentStatus: string;
  paid: boolean;
  pool: string | null;
  organizer: string;
  registered: number;
  proposed: string | null;
}

const KIND_LABEL: Record<string, string> = {
  prize_pool: "Change the prize pool",
  cancel: "Cancel the event",
  conditions: "Change the entry conditions",
  other: "Something else",
};

export default function ChangeRequestsManager({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setError(null);
    const res = await fetch(`/api/admin/change-requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve, note: notes[id] ?? "" }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
    router.refresh();
  }

  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      {error && <p className="text-bk-live text-[12px] font-sans">{error}</p>}

      <div className="space-y-3">
        <h2 className="font-sans font-bold text-[14px] text-bk-heading">Pending ({pending.length})</h2>
        {pending.length === 0 && <p className="font-sans text-[13px] text-bk-muted">Nothing waiting.</p>}
        {pending.map((r) => (
          <Panel key={r.id} className="p-4">
            <p className="font-sans text-[13px] text-bk-heading font-bold">
              {KIND_LABEL[r.kind]} · {r.tournament}
            </p>
            <p className="font-sans text-[12px] text-bk-muted">
              {r.organizer} · {r.registered} registered · {r.paid ? "paid entry" : "free entry"}
              {r.pool ? ` · prize pool ${r.pool}` : ""} · {r.tournamentStatus.replace(/_/g, " ")}
            </p>
            {r.proposed && <p className="font-sans text-[12px] text-bk-gold-light mt-2 whitespace-pre-wrap">{r.proposed}</p>}
            <p className="font-sans text-[13px] text-bk-body mt-2 whitespace-pre-wrap">{r.details}</p>
            <textarea
              rows={2}
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
              placeholder="Decision note (shown to the organizer)"
              className="w-full mt-3 bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 py-1.5"
            />
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => decide(r.id, true)}
                disabled={!(notes[r.id] ?? "").trim()}
                className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
              >
                Approve &amp; apply
              </button>
              <button
                onClick={() => decide(r.id, false)}
                disabled={!(notes[r.id] ?? "").trim()}
                className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </Panel>
        ))}
      </div>

      {decided.length > 0 && (
        <div>
          <h2 className="font-sans font-bold text-[14px] text-bk-heading mb-2">Recently decided</h2>
          <ul className="space-y-1">
            {decided.slice(0, 15).map((r) => (
              <li key={r.id} className="font-sans text-[12px] text-bk-body">
                {KIND_LABEL[r.kind]} · {r.tournament} ·{" "}
                <span className={r.status === "approved" ? "text-bk-teal" : "text-bk-live"}>{r.status}</span>
                {r.adminNote ? ` — ${r.adminNote}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
