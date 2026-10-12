"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Applicant {
  id: string;
  kind: string;
  entrantName: string;
  rating: number;
  message: string | null;
  status: string;
  institutionReview?: string;
  routedInstitutionId?: string | null;
  institution?: { name: string } | null;
}

// Poster's view: tick the applicants you want (up to the slot count), review
// the choice, then confirm. Confirming accepts them and automatically rejects
// everyone else.
export default function ApplicantsPanel({
  challengeId,
  slots,
  applicants,
  canPick,
  institutional = false,
}: {
  challengeId: string;
  slots: number;
  applicants: Applicant[];
  canPick: boolean;
  // Institution-only challenge: each applicant needs their institute's approval first.
  institutional?: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // "mine" hides the applicants a co-host institute is handling.
  const [view, setView] = useState<"all" | "mine">("all");
  const shown = view === "mine" ? applicants.filter((a) => !a.routedInstitutionId) : applicants;

  async function review(id: string, approve: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/challenge-applications/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    if (!res.ok) setError((await res.json()).error.message);
    else router.refresh();
    setBusy(false);
  }

  function toggle(id: string) {
    setError(null);
    setChosen((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= slots) {
        setError(`You can pick at most ${slots}.`);
        return c;
      }
      return [...c, id];
    });
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/challenges/${challengeId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationIds: chosen, confirm: true }),
    });
    if (!res.ok) {
      setError((await res.json()).error.message);
      setConfirming(false);
    } else router.refresh();
    setBusy(false);
  }

  const picked = applicants.filter((a) => chosen.includes(a.id));

  return (
    <div className="bg-bk-surface border border-bk-border p-4">
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">
        Applicants ({applicants.length})
      </p>
      {canPick && (
        <p className="font-sans text-[12px] text-bk-muted mb-3">
          Pick up to {slots}. Everyone you don&apos;t pick is turned down automatically once you confirm.
        </p>
      )}
      {institutional && (
        <div className="flex gap-2 mb-3 font-sans text-[12px]">
          {(["all", "mine"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 border ${view === v ? "border-bk-gold-light text-bk-gold-light" : "border-bk-border text-bk-muted"}`}>
              {v === "all" ? "All requests" : "My requests"}
            </button>
          ))}
        </div>
      )}
      {applicants.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No applications yet.</p>}

      <ul className="divide-y divide-bk-border">
        {shown.map((a) => (
          <li key={a.id} className="py-3 flex gap-3">
            {canPick && (
              <input type="checkbox" checked={chosen.includes(a.id)} onChange={() => toggle(a.id)} disabled={confirming || (institutional && a.institutionReview !== "approved")} className="mt-1" aria-label={`Pick ${a.entrantName}`} />
            )}
            <div>
              <p className="font-sans text-[13px] text-bk-heading">
                {a.entrantName} {a.status === "selected" && <span className="text-bk-gold-light">· chosen</span>}
              </p>
              <p className="font-sans text-[12px] text-bk-muted">{a.kind === "team" ? "Team" : "Solo player"} · rating {a.rating}</p>
              {institutional && (
                <p className="font-sans text-[12px] text-bk-muted">
                  {a.institution?.name ?? "No institute"}
                  {a.routedInstitutionId ? " (co-host queue)" : ""} ·{" "}
                  {a.institutionReview === "approved" ? "approved by institute" : "waiting for institute approval"}
                </p>
              )}
              {institutional && a.status === "applied" && a.institutionReview === "pending" && (
                <div className="flex gap-2 mt-1">
                  <button disabled={busy} onClick={() => review(a.id, true)} className="font-sans text-[11px] border border-bk-border text-bk-heading px-2 py-1 disabled:opacity-50">Approve</button>
                  <button disabled={busy} onClick={() => review(a.id, false)} className="font-sans text-[11px] border border-bk-live text-bk-live px-2 py-1 disabled:opacity-50">Reject</button>
                </div>
              )}
              {a.message && <p className="font-sans text-[12px] text-bk-body mt-1">&ldquo;{a.message}&rdquo;</p>}
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 font-sans text-[12px] text-bk-live">{error}</p>}

      {canPick && chosen.length > 0 && !confirming && (
        <button onClick={() => setConfirming(true)} className="mt-4 bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] uppercase tracking-[0.6px] px-5 py-2.5">
          Review my pick ({chosen.length})
        </button>
      )}
      {canPick && confirming && (
        <div className="mt-4 border border-bk-gold-light/40 bg-bk-bg p-3">
          <p className="font-sans text-[13px] text-bk-heading mb-1">
            You&apos;re choosing: {picked.map((p) => p.entrantName).join(", ")}
          </p>
          <p className="font-sans text-[12px] text-bk-muted mb-3">
            The other {applicants.length - picked.length} applicant{applicants.length - picked.length === 1 ? "" : "s"} will be rejected and told. This can&apos;t be undone.
          </p>
          <div className="flex gap-3">
            <button disabled={busy} onClick={confirm} className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] uppercase px-4 py-2 disabled:opacity-50">
              {busy ? "Confirming…" : "Confirm"}
            </button>
            <button onClick={() => setConfirming(false)} className="font-sans text-[12px] text-bk-muted underline">Change my pick</button>
          </div>
        </div>
      )}
    </div>
  );
}
