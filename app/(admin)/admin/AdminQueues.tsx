"use client";

import { useState } from "react";

interface PendingOrganizer {
  id: string;
  orgName: string;
  user: { displayName: string; email: string | null };
}

interface PendingGameRequest {
  id: string;
  gameName: string;
  organizer: { orgName: string };
}

interface FlaggedTournament {
  id: string;
  name: string;
  organizer: { orgName: string };
  flags: { id: string; reason: string; createdAt: String }[];
}

export default function AdminQueues({
  initialOrganizers,
  initialGameRequests,
  initialFlags,
}: {
  initialOrganizers: PendingOrganizer[];
  initialGameRequests: PendingGameRequest[];
  initialFlags: FlaggedTournament[];
}) {
  const [organizers, setOrganizers] = useState(initialOrganizers);
  const [gameRequests, setGameRequests] = useState(initialGameRequests);
  const [flags] = useState(initialFlags);

  async function handleOrganizer(id: string, action: "approve" | "reject") {
    const res = await fetch(`/api/admin/organizers/${id}/${action}`, { method: "POST" });
    if (res.ok) {
      setOrganizers((prev) => prev.filter((o) => o.id !== id));
    }
  }

  async function handleGameRequest(id: string, action: "approve" | "reject") {
    const res = await fetch(`/api/admin/game-requests/${id}/${action}`, { method: "POST" });
    if (res.ok) {
      setGameRequests((prev) => prev.filter((g) => g.id !== id));
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-3">
          Organizer approvals ({organizers.length})
        </p>
        {organizers.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">Nothing pending.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {organizers.map((o) => (
              <div
                key={o.id}
                className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-sans text-bk-heading text-sm">{o.orgName}</p>
                  <p className="font-sans text-bk-muted text-xs mt-0.5">
                    {o.user.displayName} · {o.user.email}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOrganizer(o.id, "approve")}
                    className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleOrganizer(o.id, "reject")}
                    className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-3">
          Game requests ({gameRequests.length})
        </p>
        {gameRequests.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">Nothing pending.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {gameRequests.map((g) => (
              <div
                key={g.id}
                className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-sans text-bk-heading text-sm">{g.gameName}</p>
                  <p className="font-sans text-bk-muted text-xs mt-0.5">
                    Requested by {g.organizer.orgName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleGameRequest(g.id, "approve")}
                    className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleGameRequest(g.id, "reject")}
                    className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-3">
          Flagged tournaments ({flags.length})
        </p>
        {flags.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">Nothing flagged.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {flags.map((t) => (
              <a
                key={t.id}
                href={`/tournaments/${t.id}`}
                className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between hover:border-bk-gold-light transition-colors"
              >
                <div>
                  <p className="font-sans text-bk-heading text-sm">{t.name}</p>
                  <p className="font-sans text-bk-muted text-xs mt-0.5">
                    by {t.organizer.orgName} · {t.flags.length} report
                    {t.flags.length !== 1 ? "s" : ""}: &ldquo;{t.flags[0]?.reason}&rdquo;
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
