"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";

export interface ConsentCaseRow {
  id: string;
  status: "open" | "allowed" | "removed";
  childName: string;
  teamName: string | null;
  tournamentId: string;
  tournamentName: string;
  organizerName: string;
  consentNow: string | null;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
}

// A guardian withdrew permission for a child who is already playing in a RUNNING
// tournament. The entry stays until an admin decides: let them finish, or remove them.
// Tournaments that haven't started never appear here (those entries are cancelled).
export default function ConsentCases({ open, decided }: { open: ConsentCaseRow[]; decided: ConsentCaseRow[] }) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: "allow" | "remove") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/consent-cases/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error?.message ?? "Something went wrong.");
      return;
    }
    setActive(null);
    setNote("");
    router.refresh();
  }

  return (
    <section className="mb-10">
      <h2 className="font-sans font-bold text-bk-heading text-base mb-1">Guardian withdrawals mid-tournament ({open.length})</h2>
      <p className="font-sans text-[12px] text-bk-muted mb-4">
        A guardian withdrew permission for a player whose tournament is already running. Results already recorded stay either way. The player can&apos;t join anything new.
      </p>

      {open.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">Nothing waiting.</p>
      ) : (
        <ul className="space-y-3">
          {open.map((c) => (
            <li key={c.id} className="bg-bk-surface border border-bk-border p-4">
              <p className="font-sans text-[14px] text-bk-heading">
                <strong>{c.childName}</strong>
                {c.teamName && <> (team {c.teamName})</>} in{" "}
                <Link href={`/organizer/dashboard/tournaments/${c.tournamentId}`} className="text-bk-gold-light underline">{c.tournamentName}</Link>
              </p>
              <p className="font-sans text-[12px] text-bk-muted mt-0.5">
                Organizer: {c.organizerName} &middot; withdrawn {new Date(c.createdAt).toLocaleDateString()}
              </p>
              {c.consentNow === "approved" && (
                <p className="font-sans text-[12px] text-bk-teal mt-1">The guardian has approved again since, so letting them finish is probably right.</p>
              )}
              {active === c.id ? (
                <div className="mt-3 space-y-3">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Optional note. The organizer will see it."
                    className="w-full bg-bk-bg border border-bk-border px-3 py-2 font-sans text-[13px] text-bk-heading rounded-lg outline-none focus:border-bk-gold-from"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => decide(c.id, "allow")} className={buttonClass("primary", "sm", "")}>Let them finish</button>
                    <button type="button" disabled={busy} onClick={() => decide(c.id, "remove")} className={buttonClass("danger", "sm", "")}>Remove the entry</button>
                    <button type="button" disabled={busy} onClick={() => setActive(null)} className={buttonClass("outline", "sm", "")}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setActive(c.id); setError(null); }} className={buttonClass("outline", "sm", "mt-3")}>Decide</button>
              )}
              {active === c.id && error && <p className="font-sans text-[12px] text-bk-live mt-2">{error}</p>}
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <details className="mt-5">
          <summary className="font-sans text-[12px] uppercase tracking-[0.8px] text-bk-muted cursor-pointer">Recently decided ({decided.length})</summary>
          <ul className="mt-3 space-y-2">
            {decided.map((c) => (
              <li key={c.id} className="font-sans text-[12px] text-bk-body">
                {c.childName} in {c.tournamentName}: <strong>{c.status === "allowed" ? "allowed to finish" : "entry removed"}</strong>
                {c.note ? ` (${c.note})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
