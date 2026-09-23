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
  slug: string;
  name: string;
  organizer: { orgName: string };
  flags: { id: string; reason: string; createdAt: Date }[];
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
  const [flags, setFlags] = useState(initialFlags);

  async function handleResolveFlag(tournamentId: string, flagId: string) {
    const res = await fetch(`/api/admin/flags/${flagId}/resolve`, { method: "POST" });
    if (res.ok) {
      setFlags((prev) =>
        prev
          .map((t) =>
            t.id === tournamentId
              ? { ...t, flags: t.flags.filter((f) => f.id !== flagId) }
              : t
          )
          .filter((t) => t.flags.length > 0)
      );
    }
  }

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
              <div
                key={t.id}
                className="bg-bk-surface border border-bk-border p-3"
              >
                <a
                  href={`/tournaments/${t.slug}`}
                  className="font-sans text-bk-heading text-sm hover:text-bk-gold-light"
                >
                  {t.name}
                </a>
                <p className="font-sans text-bk-muted text-xs mt-0.5 mb-2">
                  by {t.organizer.orgName}
                </p>
                <div className="flex flex-col gap-1.5">
                  {t.flags.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2">
                      <span className="font-sans text-bk-body text-xs">
                        &ldquo;{f.reason}&rdquo;
                      </span>
                      <button
                        onClick={() => handleResolveFlag(t.id, f.id)}
                        className="border border-bk-border text-bk-body font-sans text-[10px] uppercase tracking-[0.5px] px-2 py-1 whitespace-nowrap"
                      >
                        Resolve
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
