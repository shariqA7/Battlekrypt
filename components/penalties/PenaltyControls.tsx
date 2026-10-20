"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export type NoShowPolicy = {
  penalty: "none" | "warning" | "point_deduction" | "disqualification";
  points: number | null;
};

export interface PenaltyRow {
  id: string;
  kind: "warning" | "point_deduction" | "disqualification";
  points: number | null;
  cause: string;
  reason: string;
  issuedByInstitutionId: string | null;
}

export const penaltyLabel = (kind: string, points?: number | null) =>
  kind === "disqualification"
    ? "Disqualification"
    : kind === "point_deduction"
      ? `${points ?? "?"} point${points === 1 ? "" : "s"} deducted`
      : kind === "warning"
        ? "Warning"
        : "None";

const inputClass =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px]";

// Cheating and no-shows on one entry. The HOST can act on any entry and choose the
// penalty for a no-show; a CO-HOST institute can act on its own entries, but the
// no-show penalty is always the organizer's.
export default function PenaltyControls({
  registrationId,
  status,
  role,
  myInstitutionId,
  policy,
  penalties,
  allowDisqualify = true,
}: {
  registrationId: string;
  status: string;
  role: "host" | "cohost";
  myInstitutionId: string | null;
  policy: NoShowPolicy;
  penalties: PenaltyRow[];
  allowDisqualify?: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"noshow" | "dq" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [penalty, setPenalty] = useState<NoShowPolicy["penalty"]>(policy.penalty === "none" ? "warning" : policy.penalty);
  const [points, setPoints] = useState(String(policy.points ?? ""));

  const active = status === "pending" || status === "approved";

  async function call(url: string, body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Something went wrong.");
      return false;
    }
    setPanel(null);
    setNote("");
    setReason("");
    router.refresh();
    return true;
  }

  return (
    <div className="mt-2 font-sans text-[12px]">
      {penalties.length > 0 && (
        <ul className="space-y-1 mb-2">
          {penalties.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <Badge tone={p.kind === "disqualification" ? "danger" : "amber"}>{penaltyLabel(p.kind, p.points)}</Badge>
              <span className="text-bk-muted break-words">{p.reason}</span>
              {(role === "host" || p.issuedByInstitutionId === myInstitutionId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Take this penalty back?")) void call(`/api/penalties/${p.id}/revoke`);
                  }}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {active && panel === null && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPanel("noshow")}>
            Report no-show
          </Button>
          {allowDisqualify && (
            <Button variant="danger" size="sm" onClick={() => setPanel("dq")}>
              Disqualify
            </Button>
          )}
        </div>
      )}

      {panel === "noshow" && (
        <div className="border border-bk-border p-3 mt-1 space-y-2">
          <p className="text-bk-heading font-bold">Report a no-show</p>
          {role === "host" ? (
            <>
              <label className="block text-[11px] tracking-[0.8px] uppercase text-bk-muted">Penalty</label>
              <select value={penalty} onChange={(e) => setPenalty(e.target.value as NoShowPolicy["penalty"])} className={inputClass}>
                <option value="warning">Warning</option>
                <option value="point_deduction">Point deduction</option>
                <option value="disqualification">Disqualification</option>
              </select>
              {penalty === "point_deduction" && (
                <input
                  inputMode="numeric"
                  value={points}
                  onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))}
                  placeholder="Points to deduct"
                  className={inputClass}
                />
              )}
              <p className="text-bk-muted">
                {policy.penalty === "none"
                  ? "You haven't set a default no-show penalty for this tournament."
                  : `Your default for this tournament: ${penaltyLabel(policy.penalty, policy.points)}.`}
              </p>
            </>
          ) : (
            <p className="text-bk-body">
              {policy.penalty === "none"
                ? "The organizer hasn't set a no-show penalty yet, so nothing can be applied. Ask them to set one."
                : `The organizer decides the penalty: ${penaltyLabel(policy.penalty, policy.points)}.`}
            </p>
          )}
          <input value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputClass} />
          {error && <p className="text-bk-live">{error}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || (role === "cohost" && policy.penalty === "none")}
              onClick={() =>
                void call(`/api/registrations/${registrationId}/no-show`, {
                  note,
                  ...(role === "host" ? { penalty, points: penalty === "point_deduction" ? Number(points) : undefined } : {}),
                })
              }
            >
              Apply penalty
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {panel === "dq" && (
        <div className="border border-bk-live p-3 mt-1 space-y-2">
          <p className="text-bk-heading font-bold">Disqualify this entry</p>
          <p className="text-bk-muted">They are removed from the tournament, and the player is told why.</p>
          <textarea
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason (required) - e.g. used an emulator"
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
          />
          {error && <p className="text-bk-live">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy || !reason.trim()} onClick={() => void call(`/api/registrations/${registrationId}/disqualify`, { reason })}>
              Confirm disqualification
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {panel === null && error && <p className="text-bk-live mt-1">{error}</p>}
    </div>
  );
}
