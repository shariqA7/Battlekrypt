"use client";

import { useState } from "react";

interface Registration {
  id: string;
  status: string;
  paymentStatus: string;
  paymentProofUrl: string | null;
  placement: number | null;
  points: number | null;
  player: { user: { displayName: string } } | null;
  teamEntry: { name: string; members: unknown[] } | null;
}

function ResultInput({
  registrationId,
  initialPlacement,
  initialPoints,
}: {
  registrationId: string;
  initialPlacement: number | null;
  initialPoints: number | null;
}) {
  const [placement, setPlacement] = useState(initialPlacement ?? "");
  const [points, setPoints] = useState(initialPoints ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/registrations/${registrationId}/result`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placement: placement === "" ? undefined : Number(placement),
        points: points === "" ? undefined : Number(points),
      }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        placeholder="Rank"
        value={placement}
        onChange={(e) => setPlacement(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-14 bg-bk-bg border border-bk-border text-bk-heading text-[11px] font-sans px-1.5 h-[26px]"
      />
      <input
        type="number"
        placeholder="Pts"
        value={points}
        onChange={(e) => setPoints(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-14 bg-bk-bg border border-bk-border text-bk-heading text-[11px] font-sans px-1.5 h-[26px]"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="border border-bk-border text-bk-body font-sans text-[10px] uppercase px-2 h-[26px] disabled:opacity-50"
      >
        {saved ? "✓" : "Save"}
      </button>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-[rgba(239,159,39,0.15)] text-[#EF9F27]",
  approved: "bg-[rgba(29,158,117,0.15)] text-[#1D9E75]",
  rejected: "bg-[rgba(239,68,68,0.15)] text-bk-live",
  disqualified: "bg-[rgba(239,68,68,0.15)] text-bk-live",
};

export default function RegistrationQueue({
  tournamentId,
  initialRegistrations,
}: {
  tournamentId: string;
  initialRegistrations: Registration[];
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [manualEmail, setManualEmail] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setManualSubmitting(true);
    setManualError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/registrations/manual-add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerEmail: manualEmail, paymentStatus: "waived" }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setManualError(error.message);
      setManualSubmitting(false);
      return;
    }

    setManualEmail("");
    setManualSubmitting(false);
    // A full reload, not router.refresh() — this component's `registrations`
    // state is a local useState seeded from initialRegistrations, which only
    // reads that prop on first mount. router.refresh() alone re-renders the
    // parent Server Component with fresh data but wouldn't actually update
    // this already-mounted component's local state.
    window.location.reload();
  }

  async function handleAction(id: string, action: "approve" | "reject" | "disqualify") {
    let body: string | undefined;
    if (action === "disqualify") {
      const reason = window.prompt("Reason for disqualification:");
      if (!reason) return;
      body = JSON.stringify({ reason });
    }

    const res = await fetch(`/api/registrations/${id}/${action}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
    });
    if (res.ok) {
      const updated = await res.json();
      setRegistrations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: updated.status } : r))
      );
    }
  }

  const manualAddForm = (
    <form onSubmit={handleManualAdd} className="flex gap-2 mb-4">
      <input
        type="email"
        required
        value={manualEmail}
        onChange={(e) => setManualEmail(e.target.value)}
        placeholder="Player's email — manually add them"
        className="flex-1 bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-3 h-[34px]"
      />
      <button
        type="submit"
        disabled={manualSubmitting}
        className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[11px] uppercase tracking-[0.5px] px-3 disabled:opacity-50"
      >
        {manualSubmitting ? "Adding..." : "Add player"}
      </button>
    </form>
  );

  if (registrations.length === 0) {
    return (
      <div>
        {manualAddForm}
        {manualError && <p className="text-bk-live text-[11px] font-sans mb-3">{manualError}</p>}
        <p className="text-bk-muted font-sans text-sm">No registrations yet.</p>
      </div>
    );
  }

  return (
    <div>
      {manualAddForm}
      {manualError && <p className="text-bk-live text-[11px] font-sans mb-3">{manualError}</p>}
      <div className="flex flex-col gap-2">
        {registrations.map((r) => {
        const name = r.teamEntry?.name ?? r.player?.user.displayName ?? "Unknown";
        return (
          <div
            key={r.id}
            className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between"
          >
            <div>
              <p className="font-sans text-bk-heading text-sm">{name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`font-sans text-[10px] uppercase tracking-[0.5px] px-1.5 py-0.5 ${STATUS_BADGE[r.status]}`}>
                  {r.status}
                </span>
                {r.paymentProofUrl && (
                  <a
                    href={r.paymentProofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bk-gold-light text-[11px] font-sans underline"
                  >
                    View payment proof
                  </a>
                )}
              </div>
            </div>
            {r.status === "pending" && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(r.id, "approve")}
                  className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(r.id, "reject")}
                  className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                >
                  Reject
                </button>
              </div>
            )}
            {r.status === "approved" && (
              <div className="flex items-center gap-3">
                <ResultInput
                  registrationId={r.id}
                  initialPlacement={r.placement}
                  initialPoints={r.points}
                />
                <button
                  onClick={() => handleAction(r.id, "disqualify")}
                  className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                >
                  Disqualify
                </button>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
