"use client";

import { useState } from "react";

interface Registration {
  id: string;
  status: string;
  paymentStatus: string;
  paymentProofUrl: string | null;
  player: { user: { displayName: string } } | null;
  teamEntry: { name: string; members: unknown[] } | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-[rgba(239,159,39,0.15)] text-[#EF9F27]",
  approved: "bg-[rgba(29,158,117,0.15)] text-[#1D9E75]",
  rejected: "bg-[rgba(239,68,68,0.15)] text-bk-live",
  disqualified: "bg-[rgba(239,68,68,0.15)] text-bk-live",
};

export default function RegistrationQueue({
  initialRegistrations,
}: {
  initialRegistrations: Registration[];
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);

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

  if (registrations.length === 0) {
    return <p className="text-bk-muted font-sans text-sm">No registrations yet.</p>;
  }

  return (
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
              <button
                onClick={() => handleAction(r.id, "disqualify")}
                className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
              >
                Disqualify
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
